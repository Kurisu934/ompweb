import assert from "node:assert/strict";
import childProcess from "node:child_process";
import util from "node:util";
import test from "node:test";
import { createJiti } from "jiti";

function setup(t) {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const previous = process.env.OMP_WEB_OMP_BIN;
  process.env.OMP_WEB_OMP_BIN = process.execPath;
  t.after(() => {
    if (previous === undefined) delete process.env.OMP_WEB_OMP_BIN;
    else process.env.OMP_WEB_OMP_BIN = previous;
  });
  const requests = [];
  const execute = (bin, args, options) => new Promise((resolve, reject) => {
    assert.equal(bin, process.execPath);
    assert.deepEqual(args, ["usage", "--json", "--redact"]);
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 30_000);
    requests.push({ resolve: (usedFraction) => resolve({ stdout: JSON.stringify({
      generatedAt: Date.now(), reports: [{ provider: "test", limits: [{ scope: { windowId: "5h" }, amount: { usedFraction } }] }],
    }) }), reject });
  });
  const promisify = util.promisify;
  t.mock.method(util, "promisify", (fn) => fn === childProcess.execFile ? execute : promisify(fn));
  const jiti = createJiti(import.meta.url, { moduleCache: false, tryNative: false });
  return { requests, getProviderUsage: jiti("./provider-usage.ts").getProviderUsage };
}

test("provider queries share in-flight work and cached data expires after one minute", async t => {
  const { requests, getProviderUsage } = setup(t);
  const a = getProviderUsage();
  const b = getProviderUsage({ provider: "test" });
  assert.equal(requests.length, 1);
  requests[0].resolve(0.1);
  assert.equal((await a).reports[0].fiveHour.percent, 10);
  assert.deepEqual(await a, await b);
  t.mock.timers.tick(59_999);
  assert.equal((await getProviderUsage()).reports[0].fiveHour.percent, 10);
  assert.equal(requests.length, 1);
  t.mock.timers.tick(1);
  const refreshed = getProviderUsage();
  const concurrent = getProviderUsage({ provider: "missing" });
  assert.equal(requests.length, 2);
  requests[1].resolve(0.2);
  assert.equal((await refreshed).reports[0].fiveHour.percent, 20);
  assert.deepEqual((await concurrent).reports, []);
});

test("provider failures release the shared request for a later retry", async t => {
  const { requests, getProviderUsage } = setup(t);
  const failed = getProviderUsage();
  requests[0].reject(new Error("offline"));
  await assert.rejects(failed, /offline/);
  const retried = getProviderUsage();
  assert.equal(requests.length, 2);
  requests[1].resolve(0.2);
  assert.equal((await retried).reports[0].fiveHour.percent, 20);
});

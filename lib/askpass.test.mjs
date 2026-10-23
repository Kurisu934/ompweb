import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const askpass = await jiti.import("./askpass.ts");
const { findSocketInode } = await jiti.import("./askpass-peer.ts");
const wrapper = new URL("../bin/askpass/sudo", import.meta.url).pathname;

test("the agent sudo wrapper adds -A only when the call does not pick its own auth", { skip: process.platform === "win32" }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "omp-web-sudo-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fakeSudo = join(dir, "sudo");
  writeFileSync(fakeSudo, '#!/bin/sh\nprintf "%s\\n" "$*"\n');
  chmodSync(fakeSudo, 0o755);
  const run = (...args) => execFileSync("sh", [wrapper, ...args], {
    env: { PATH: process.env.PATH, OMP_WEB_REAL_SUDO: fakeSudo, SUDO_ASKPASS: "/x/askpass" },
  }).toString().trim();

  assert.equal(run("apt-get", "update"), "-A apt-get update");
  assert.equal(run("-u", "root", "id"), "-A -u root id");
  assert.equal(run("-nu", "root", "id"), "-nu root id", "-n bundled with a value option");
  assert.equal(run("-S", "true"), "-S true");
  assert.equal(run("--non-interactive", "true"), "--non-interactive true");
  assert.equal(run("grep", "-n", "x", "f"), "-A grep -n x f", "options after the command belong to it");
  assert.equal(run("-u", "-n", "id"), "-A -u -n id", "the value of -u is not an option");
  assert.equal(run("--user", "-n", "id"), "-A --user -n id");
  assert.equal(run("--", "-n"), "-A -- -n");
  const noAskpass = execFileSync("sh", [wrapper, "true"], { env: { PATH: process.env.PATH, OMP_WEB_REAL_SUDO: fakeSudo } }).toString().trim();
  assert.equal(noAskpass, "true", "without SUDO_ASKPASS sudo runs unchanged");
});

test("finds the client socket by its ports in /proc/net/tcp", () => {
  const table = [
    "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
    "   0: 0100007F:8B2C 0100007F:9C40 01 00000000:00000000 00:00000000 00000000  1000        0 555 1 0",
    "   1: 0100007F:9C40 0100007F:8B2C 01 00000000:00000000 00:00000000 00000000  1000        0 777 1 0",
  ].join("\n");
  assert.equal(findSocketInode(table, 0x8b2c, 0x9c40), "555");
  assert.equal(findSocketInode(table, 0x9c40, 0x8b2c), "777");
  assert.equal(findSocketInode(table, 1, 2), null);
});

test("requests wait for a tab, are refused without one, and end on answer, refusal, timeout or abort", async () => {
  const identity = { sessionId: "s1", cwd: "/w" };
  const signal = () => new AbortController();

  assert.equal(await askpass.awaitAskpassAnswer(identity, "pw:", ["sudo", "-A", "x"], signal().signal), null, "nobody listening");

  const seen = [];
  const unsubscribe = askpass.subscribeAskpassRequests((list) => seen.push(list));
  // The broker's timeout is unref'd (it must not hold the server open); hold the loop here.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const answered = askpass.awaitAskpassAnswer(identity, "pw:", ["sudo", "-A", "x"], signal().signal);
    const [request] = seen.at(-1);
    assert.deepEqual(request.command, ["sudo", "-A", "x"]);
    assert.equal(JSON.stringify(seen).includes("secret"), false);
    assert.equal(askpass.answerAskpassRequest(request.id, "secret"), true);
    assert.equal(await answered, "secret");
    assert.deepEqual(seen.at(-1), [], "answered requests leave every tab");
    assert.equal(askpass.answerAskpassRequest(request.id, "again"), false, "a second answer is rejected");

    const refused = askpass.awaitAskpassAnswer(identity, "pw:", ["sudo"], signal().signal);
    askpass.answerAskpassRequest(seen.at(-1)[0].id, null);
    assert.equal(await refused, null);

    assert.equal(await askpass.awaitAskpassAnswer(identity, "pw:", ["sudo"], signal().signal, 20), null, "timeout");

    const controller = signal();
    const aborted = askpass.awaitAskpassAnswer(identity, "pw:", ["sudo"], controller.signal);
    controller.abort();
    assert.equal(await aborted, null, "the client went away");
    assert.deepEqual(seen.at(-1), []);
  } finally {
    clearInterval(keepAlive);
    unsubscribe();
  }
});

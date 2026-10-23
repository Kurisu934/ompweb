import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "omp-web-account-routing-"));
process.env.PI_CODING_AGENT_DIR = root;
const jiti = createJiti(import.meta.url);
const { buildAccountPolicies, withUserPolicies, accountRoutingSignature, setAccountDisabled, setSessionAccountPin } = await jiti.import("./account-routing.ts");
const { parseProviderAccounts } = await jiti.import("./provider-usage.ts");

test.after(() => rmSync(root, { recursive: true, force: true }));

const account = (provider, accountKey, identity) => ({ provider, accountKey, identity });
const a = account("openai-codex", "a".repeat(16), { accountId: "acc-a", email: "a@x", orgId: "org" });
const b = account("openai-codex", "b".repeat(16), { accountId: "acc-b", email: "b@x", orgId: "org" });
const solo = account("anthropic", "c".repeat(16), { email: "c@x" });

test("a pin prefers its account and puts every sibling in reserve, overriding a disable", () => {
  assert.deepEqual(buildAccountPolicies([a, b, solo], new Set([a.accountKey]), { "openai-codex": a.accountKey, anthropic: solo.accountKey }), [
    { provider: "openai-codex", account: { accountId: "acc-a" }, priority: 100 },
    { provider: "openai-codex", account: { accountId: "acc-b" }, reservePct: 100 },
  ]);
});

test("disabling reserves only that account; single-account providers are never steered", () => {
  assert.deepEqual(buildAccountPolicies([a, b], new Set([b.accountKey]), {}), [
    { provider: "openai-codex", account: { accountId: "acc-b" }, reservePct: 100 },
  ]);
  assert.deepEqual(buildAccountPolicies([solo], new Set([solo.accountKey]), {}), []);
  assert.deepEqual(buildAccountPolicies([a, b], new Set(), { "openai-codex": "f".repeat(16) }), [], "a pin to a vanished account is ignored");
});

test("matching widens to orgId when one login spans orgs, and gives up when accounts cannot be told apart", () => {
  const org1 = account("anthropic", "1".repeat(16), { email: "same@x", orgId: "o1" });
  const org2 = account("anthropic", "2".repeat(16), { email: "same@x", orgId: "o2" });
  assert.deepEqual(buildAccountPolicies([org1, org2], new Set([org2.accountKey]), {}), [
    { provider: "anthropic", account: { email: "same@x", orgId: "o2" }, reservePct: 100 },
  ]);
  const twin = account("anthropic", "3".repeat(16), { email: "same@x", orgId: "o2" });
  assert.deepEqual(buildAccountPolicies([org1, org2, twin], new Set([org2.accountKey]), {}), []);
});

test("the user's own policies survive for providers omp-web is not steering", () => {
  const ours = [{ provider: "openai-codex", account: { accountId: "acc-b" }, reservePct: 100 }];
  const user = [{ provider: "openai-codex", account: { accountId: "acc-a" }, priority: 5 }, { provider: "anthropic", account: { email: "c@x" }, priority: 1 }];
  assert.deepEqual(withUserPolicies(ours, user), [user[1], ...ours]);
});

test("usage reports become one identified account each", () => {
  const output = JSON.stringify({
    reports: [
      { provider: "google-antigravity", metadata: { email: "g@x", projectId: "p" }, limits: [] },
      { provider: "google-antigravity", metadata: { email: "g@x", projectId: "p" }, limits: [] },
      { provider: "charm-hyper", metadata: {}, limits: [] },
    ],
  });
  const accounts = parseProviderAccounts(output);
  assert.equal(accounts.length, 1);
  assert.deepEqual(accounts[0].identity, { email: "g@x", projectId: "p" });
});

test("the routing signature changes with the session's pins and any disable", () => {
  const session = "01a1352d-3518-7482-a959-2d82a9094dac";
  const initial = accountRoutingSignature(session);
  setSessionAccountPin(session, "openai-codex", a.accountKey);
  const pinned = accountRoutingSignature(session);
  assert.notEqual(pinned, initial);
  assert.equal(accountRoutingSignature(session, { "openai-codex": a.accountKey }), pinned, "a new session's pins sign like stored ones");
  setAccountDisabled(b.accountKey, true);
  assert.notEqual(accountRoutingSignature(session), pinned);
  setAccountDisabled(b.accountKey, false);
  setSessionAccountPin(session, "openai-codex", null);
  assert.equal(accountRoutingSignature(session), initial);
});

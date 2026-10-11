import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { resolveForkEntryIds } = await jiti.import("./chat-fork.ts");

const rows = (...roles) => roles.map((role) => (role === "summary" ? { role: "user", branchSummary: true } : { role }));

test("user prompts and their replies rewind to the start of their own turn", () => {
  assert.deepEqual(
    resolveForkEntryIds(rows("user", "assistant", "toolResult", "assistant", "user", "assistant"), ["u1", "a1", "t1", "a2", "u2", "a3"]),
    ["u1", "u1", undefined, "u1", "u2", "u2"],
  );
});

test("the first prompt rewinds into an empty context, including after compaction", () => {
  assert.deepEqual(resolveForkEntryIds(rows("user", "assistant"), ["u1", "a1"]), ["u1", "u1"]);
  // A compaction row renders as "custom", not a user message
  // (lib/session-reader.ts), so it can never become a branch point itself.
  assert.deepEqual(
    resolveForkEntryIds(rows("custom", "user", "assistant"), ["c0", "u1", "a1"]),
    [undefined, "u1", "u1"],
  );
});

test("branch summaries render as user rows but are never branch points", () => {
  assert.deepEqual(
    resolveForkEntryIds(rows("user", "assistant", "user", "assistant", "summary", "user", "assistant"), ["u0", "a0", "u1", "a1", "s1", "u2", "a2"]),
    ["u0", "u0", "u1", "u1", undefined, "u2", "u2"],
  );
});

test("messages with no usable user entry have no fork target", () => {
  assert.deepEqual(
    resolveForkEntryIds(rows("assistant", "toolResult", "bashExecution"), ["a0", "t0", "b0"]),
    [undefined, undefined, undefined],
  );
});

test("a prompt missing its entry ID cannot reuse the previous turn's target", () => {
  assert.deepEqual(
    resolveForkEntryIds(rows("user", "assistant", "user", "assistant", "user", "assistant"), ["u0", "a0", "u1", "a1", undefined, "a2"]),
    ["u0", "u0", "u1", "u1", undefined, undefined],
  );
});

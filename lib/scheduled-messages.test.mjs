import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(join(tmpdir(), "omp-web-scheduled-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
const subject = await createJiti(import.meta.url).import("./scheduled-messages.ts");
const storeFile = join(agentDir, "omp-web-scheduled-messages.json");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test.after(() => rmSync(agentDir, { recursive: true, force: true }));
test.beforeEach(() => {
  rmSync(storeFile, { force: true });
  globalThis.__ompScheduledMessages = undefined;
});

test("validates input, clamps past times to now and keeps the file private", () => {
  const delivered = [];
  subject.setScheduledMessageDelivery(async (entry) => { delivered.push(entry.message); });
  const now = Date.now();
  assert.throws(() => subject.scheduleMessage({ sessionId: "s", message: "  ", sendAt: now + 1000 }, now), { code: "message_required" });
  assert.throws(() => subject.scheduleMessage({ sessionId: "s", message: "hi", sendAt: "soon" }, now), { code: "invalid_send_at" });
  assert.throws(() => subject.scheduleMessage({ sessionId: "s", message: "hi", sendAt: now + subject.MAX_SCHEDULE_AHEAD_MS + 1 }, now), { code: "send_at_too_far" });
  const later = subject.scheduleMessage({ sessionId: "s", message: "later", sendAt: now + 3_600_000 }, now);
  const sooner = subject.scheduleMessage({ sessionId: "s", message: "sooner", sendAt: now + 1_800_000 }, now);
  subject.scheduleMessage({ sessionId: "other", message: "x", sendAt: now + 60_000 }, now);
  assert.deepEqual(subject.listScheduledMessages("s").map((entry) => entry.id), [sooner.id, later.id]);
  assert.equal(statSync(storeFile).mode & 0o777, 0o600);
  assert.equal(subject.cancelScheduledMessage("other-session", later.id), false, "another session cannot cancel it");
  assert.equal(subject.cancelScheduledMessage("s", later.id), true);
  assert.deepEqual(subject.listScheduledMessages("s").map((entry) => entry.id), [sooner.id]);
  assert.deepEqual(delivered, []);
});

test("fires at its time, removes the entry, and keeps a failed one until retried", async () => {
  let fail = true;
  const delivered = [];
  subject.setScheduledMessageDelivery(async (entry) => {
    if (fail) throw new Error("omp exited");
    delivered.push(entry.message);
  });
  const entry = subject.scheduleMessage({ sessionId: "s", message: "after reset", sendAt: Date.now() + 40 });
  await sleep(150);
  const [failed] = subject.listScheduledMessages("s");
  assert.equal(failed.error, "omp exited");
  await sleep(100);
  assert.deepEqual(delivered, [], "a failed message is not retried on its own");

  fail = false;
  const retried = subject.rescheduleMessage("s", entry.id, Date.now());
  assert.equal(retried.error, undefined);
  await sleep(100);
  assert.deepEqual(delivered, ["after reset"]);
  assert.deepEqual(subject.listScheduledMessages("s"), []);
});

test("a restart re-arms saved messages and sends ones that came due while down", async () => {
  const delivered = [];
  subject.setScheduledMessageDelivery(async (entry) => { delivered.push(entry.message); });
  const now = Date.now();
  writeFileSync(storeFile, JSON.stringify({ messages: [
    { id: "a", sessionId: "s", message: "overdue", sendAt: now - 3_600_000, createdAt: now - 7_200_000, advisor: false },
    { id: "b", sessionId: "s", message: "future", sendAt: now + 3_600_000, createdAt: now, advisor: false },
  ] }));
  subject.ensureScheduledMessagesArmed();
  await sleep(100);
  assert.deepEqual(delivered, ["overdue"]);
  assert.deepEqual(subject.listScheduledMessages("s").map((entry) => entry.id), ["b"]);
  subject.cancelScheduledMessage("s", "b");
});

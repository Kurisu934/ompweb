import assert from "node:assert/strict";
import test from "node:test";
import { countActiveSessionFilters, matchesSessionFilters } from "./session-filters.ts";

const now = Date.parse("2026-10-20T12:00:00Z");
const hoursAgo = (hours) => new Date(now - hours * 3_600_000).toISOString();
const ctx = { running: new Set(["run"]), unread: new Set(["unread"]), exited: new Set(["exited"]), now };
const sessions = [
  { id: "run", modified: hoursAgo(72) },      // running, file last written days ago
  { id: "unread", modified: hoursAgo(2) },
  { id: "exited", modified: hoursAgo(30) },
  { id: "idle", modified: hoursAgo(23.9) },
  { id: "old", modified: hoursAgo(24 * 8) },
];
const ids = (filters) => sessions.filter((s) => matchesSessionFilters(s, filters, ctx)).map((s) => s.id);

test("status options combine with OR and the activity window narrows them", () => {
  assert.deepEqual(ids({ statuses: [], activity: "any" }), ["run", "unread", "exited", "idle", "old"]);
  assert.deepEqual(ids({ statuses: ["running", "exited"], activity: "any" }), ["run", "exited"]);
  assert.deepEqual(ids({ statuses: ["unread", "exited"], activity: "24h" }), ["unread"]);
});

test("active-in windows count running sessions and respect the boundary", () => {
  assert.deepEqual(ids({ statuses: [], activity: "24h" }), ["run", "unread", "idle"]);
  assert.deepEqual(ids({ statuses: [], activity: "7d" }), ["run", "unread", "exited", "idle"]);
  assert.equal(matchesSessionFilters({ id: "bad", modified: "not a date" }, { statuses: [], activity: "24h" }, ctx), false);
});

test("applied-filter count drives the badge and reset state", () => {
  assert.equal(countActiveSessionFilters({ statuses: [], activity: "any" }), 0);
  assert.equal(countActiveSessionFilters({ statuses: ["running", "unread"], activity: "24h" }), 3);
});

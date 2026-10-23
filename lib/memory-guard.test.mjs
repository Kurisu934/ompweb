import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { pickVictim, MIN_VICTIM_BYTES } = await jiti.import("./memory-guard.ts");
const { parseMeminfo, parseProcStat, parseCpuTimes, descendantsOf } = await jiti.import("./system-stats.ts");
const { parseMemoryGuardSettings, DEFAULT_MEMORY_GUARD } = await jiti.import("./memory-guard-settings.ts");

const GiB = 1024 ** 3;
const proc = (pid, ppid, rssBytes, name = `p${pid}`) => ({ pid, ppid, rssBytes, name });
const session = { owner: { kind: "session", sessionId: "s", cwd: "/w" } };
const terminal = { owner: { kind: "terminal", terminalId: "t", cwd: "/w" } };

test("the victim is the largest command inside an agent or terminal tree, never the server or outside processes", () => {
  const server = 100;
  const processes = [
    proc(1, 0, 0),
    proc(server, 1, 3 * GiB, "next-server"),
    proc(200, server, 1 * GiB, "omp"), // session root
    proc(201, 200, 50 * 1024 * 1024, "bash"), // below the floor
    proc(202, 201, 6 * GiB, "rustc"), // grandchild: the hog
    proc(300, server, 20 * 1024 * 1024, "bash"), // terminal shell
    proc(301, 300, 4 * GiB, "python"),
    proc(400, 1, 30 * GiB, "firefox"), // not ours
  ];
  const roots = new Map([[200, session], [300, terminal]]);
  assert.deepEqual(pickVictim(processes, roots, server), { process: processes[4], rootPid: 200 });
  // The server never qualifies, even if it is somehow inside a tree.
  assert.equal(pickVictim([proc(200, 1, GiB), proc(100, 200, 9 * GiB)], new Map([[200, session]]), 100)?.process.pid, 200);
});

test("with no sizeable command, an omp process itself is next, but never a terminal shell", () => {
  const processes = [proc(200, 1, 2 * GiB, "omp"), proc(201, 200, MIN_VICTIM_BYTES - 1), proc(300, 1, 2 * GiB, "bash")];
  assert.equal(pickVictim(processes, new Map([[200, session], [300, terminal]]), 100)?.process.pid, 200);
  assert.equal(pickVictim(processes, new Map([[300, terminal]]), 100), null);
});

test("descendants are owned by their nearest listed root and cycles cannot loop", () => {
  const owner = descendantsOf([proc(2, 1, 0), proc(3, 2, 0), proc(4, 3, 0), proc(1, 4, 0)], [1]);
  assert.deepEqual([...owner.entries()].sort(), [[1, 1], [2, 1], [3, 1], [4, 1]]);
});

test("/proc parsers read the fields the guard relies on", () => {
  assert.deepEqual(parseMeminfo("MemTotal:       64000 kB\nMemFree: 1 kB\nMemAvailable:   16000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n"), {
    totalBytes: 64000 * 1024, availableBytes: 16000 * 1024, swapTotalBytes: 0, swapFreeBytes: 0,
  });
  assert.equal(parseMeminfo("MemTotal: 1 kB\n"), null);
  // comm with spaces and parentheses; rss is field 24.
  const stat = "4242 (my (odd) cmd) S 17 4242 4242 0 -1 4194560 1 0 0 0 0 0 0 0 20 0 1 0 100 123456 2560 18446744073709551615";
  assert.deepEqual(parseProcStat(stat, 4096), { pid: 4242, ppid: 17, rssBytes: 2560 * 4096, name: "my (odd) cmd" });
  assert.deepEqual(parseCpuTimes("cpu  10 0 10 70 10 0 0 0 0 0\ncpu0 1 1 1 1"), { busy: 20, total: 100 });
});

test("guard settings are clamped and the warning line stays above the kill line", () => {
  assert.deepEqual(parseMemoryGuardSettings({ enabled: false, killBelowPercent: 99, warnBelowPercent: 1 }), { enabled: false, killBelowPercent: 30, warnBelowPercent: 31 });
  assert.deepEqual(parseMemoryGuardSettings({ killBelowPercent: "x" }), DEFAULT_MEMORY_GUARD);
  assert.deepEqual(parseMemoryGuardSettings({ warnBelowPercent: 20 }, { enabled: true, killBelowPercent: 8, warnBelowPercent: 15 }), { enabled: true, killBelowPercent: 8, warnBelowPercent: 20 });
});

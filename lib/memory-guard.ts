import { cpus } from "os";
import { getAgentProcesses, type AgentProcess } from "./rpc-manager";
import { getTerminalProcesses, noticeTerminal } from "./terminal-manager";
import {
  descendantsOf,
  readCommandLine,
  readCpuTimes,
  readLoadAverage,
  readMemory,
  readProcesses,
  type CpuTimes,
  type MemoryStats,
  type ProcessInfo,
} from "./system-stats";
import { formatBytes, type GuardEvent, type MonitoredProcess, type OwnerUsage, type ProcessOwner, type SystemSnapshot } from "./system-monitor-types";
import { loadWebServerSettings } from "./web-settings";

/**
 * Memory guard: an earlyoom for agent work. Polls /proc/meminfo; when
 * available memory falls below the configured share it stops the largest
 * process an agent session or integrated terminal started (SIGTERM, then
 * SIGKILL if it lingers or memory is critical), before the kernel OOM killer
 * can pick something worse such as the omp-web server. The session is told
 * in the chat and, mid-run, the agent gets a steering message.
 *
 * Only descendants of omp processes and terminal shells are candidates; an
 * omp process itself only when none of its commands is big enough to matter.
 * The server, the user's desktop and other programs are never touched.
 */

const POLL_MS = 500;
/** A SIGTERMed victim gets this long to exit before SIGKILL. */
const TERM_GRACE_MS = 1500;
/** Smaller processes are not worth killing: they cannot be what is eating memory. */
export const MIN_VICTIM_BYTES = 64 * 1024 * 1024;
const MAX_EVENTS = 30;

interface GuardState {
  timer: ReturnType<typeof setInterval> | null;
  events: GuardEvent[];
  /** Victim signaled with SIGTERM and not yet confirmed gone. */
  pending: { pid: number; at: number } | null;
  lastCpu: CpuTimes | null;
}

declare global {
  var __ompWebMemoryGuard: GuardState | undefined;
}

function state(): GuardState {
  globalThis.__ompWebMemoryGuard ??= { timer: null, events: [], pending: null, lastCpu: null };
  return globalThis.__ompWebMemoryGuard;
}

interface Root {
  owner: ProcessOwner;
  agent?: AgentProcess;
}

function currentRoots(): Map<number, Root> {
  const roots = new Map<number, Root>();
  for (const agent of getAgentProcesses()) {
    if (agent.wrapper.isAttached) continue;
    roots.set(agent.pid, {
      owner: { kind: "session", sessionId: agent.sessionId, ...(agent.sessionName ? { sessionName: agent.sessionName } : {}), cwd: agent.cwd },
      agent,
    });
  }
  for (const terminal of getTerminalProcesses()) {
    if ("isAttached" in terminal && terminal.isAttached) continue;
    roots.set(terminal.pid, { owner: { kind: "terminal", terminalId: terminal.id, cwd: terminal.cwd } });
  }
  return roots;
}

/**
 * The process to stop: the largest descendant of a root (a command an agent
 * or terminal runs); failing that, the largest omp process itself. Never
 * `selfPid` (the omp-web server) and never anything outside the trees.
 */
export function pickVictim(
  processes: ProcessInfo[],
  roots: ReadonlyMap<number, { owner: ProcessOwner }>,
  selfPid: number,
): { process: ProcessInfo; rootPid: number } | null {
  const owner = descendantsOf(processes, roots.keys());
  let best: { process: ProcessInfo; rootPid: number } | null = null;
  for (const process of processes) {
    const rootPid = owner.get(process.pid);
    if (rootPid === undefined || process.pid === selfPid || process.rssBytes < MIN_VICTIM_BYTES) continue;
    if (!best || process.rssBytes > best.process.rssBytes) best = { process, rootPid };
  }
  if (best) return best;
  for (const process of processes) {
    const root = roots.get(process.pid);
    if (!root || root.owner.kind !== "session" || process.pid === selfPid || process.rssBytes < MIN_VICTIM_BYTES) continue;
    if (!best || process.rssBytes > best.process.rssBytes) best = { process, rootPid: process.pid };
  }
  return best;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function describe(process: ProcessInfo): MonitoredProcess {
  return { pid: process.pid, name: process.name, command: readCommandLine(process.pid) || process.name, rssBytes: process.rssBytes };
}

function notify(event: GuardEvent, agent: AgentProcess | undefined): void {
  const what = `\`${event.process.command.slice(0, 160)}\` (pid ${event.process.pid}, ${formatBytes(event.process.rssBytes)})`;
  const memory = `${formatBytes(event.availableBytes)} of ${formatBytes(event.totalBytes)} available`;
  const cause = event.reason === "manual"
    ? "The user stopped it from the omp-web System dashboard."
    : `System memory fell below omp-web's safety line (${memory}), so omp-web's memory guard stopped it before the system could run out and kill something worse.`;
  if (event.owner.kind === "terminal") {
    noticeTerminal(event.owner.terminalId, `[omp-web] ${event.reason === "manual" ? "Stopped" : "Memory guard stopped"} ${what}${event.reason === "manual" ? "" : ` — ${memory}`}`);
    return;
  }
  const userNotice = `${event.reason === "manual" ? "Stopped" : "Memory guard stopped"} ${what}. ${event.reason === "manual" ? "" : `System memory was low (${memory}). `}The agent has been told.`;
  const agentNote = event.reason === "manual"
    ? `[omp-web] The user stopped process ${what} that your command started. Do not restart it unless the user asks.`
    : `[omp-web memory guard] Process ${what} that your command started was killed. ${cause} Do not rerun it unchanged: first reduce its memory use (lower parallelism such as -j/--jobs/workers, process the data in smaller batches, stream instead of loading everything at once), or ask the user how to proceed.`;
  agent?.wrapper.memoryGuardKilled(userNotice, agentNote);
}

function signal(victim: { process: ProcessInfo; rootPid: number }, root: Root, sig: "SIGTERM" | "SIGKILL", reason: GuardEvent["reason"], memory: MemoryStats | null): GuardEvent | null {
  // Read the command line first: it is gone once the process exits.
  const described = describe(victim.process);
  try {
    process.kill(victim.process.pid, sig);
  } catch {
    return null;
  }
  const event: GuardEvent = {
    at: Date.now(),
    reason,
    signal: sig,
    process: described,
    owner: root.owner,
    availableBytes: memory?.availableBytes ?? 0,
    totalBytes: memory?.totalBytes ?? 0,
  };
  const events = state().events;
  events.unshift(event);
  events.length = Math.min(events.length, MAX_EVENTS);
  notify(event, root.agent);
  return event;
}

function tick(): void {
  const settings = loadWebServerSettings().memoryGuard;
  if (!settings.enabled) return;
  const memory = readMemory();
  if (!memory || memory.totalBytes === 0) return;
  const availablePercent = (memory.availableBytes / memory.totalBytes) * 100;
  const guard = state();
  if (guard.pending) {
    if (!alive(guard.pending.pid)) {
      guard.pending = null;
    } else if (Date.now() - guard.pending.at >= TERM_GRACE_MS || availablePercent < settings.killBelowPercent / 2) {
      try { process.kill(guard.pending.pid, "SIGKILL"); } catch { /* exited */ }
      guard.pending = null;
      return;
    } else {
      return;
    }
  }
  if (availablePercent >= settings.killBelowPercent) return;
  const roots = currentRoots();
  if (roots.size === 0) return;
  const victim = pickVictim(readProcesses(), roots, process.pid);
  if (!victim) return;
  const root = roots.get(victim.rootPid)!;
  // Below half the line there is no time for a graceful exit.
  const critical = availablePercent < settings.killBelowPercent / 2;
  const event = signal(victim, root, critical ? "SIGKILL" : "SIGTERM", "low-memory", memory);
  if (event) guard.pending = { pid: victim.process.pid, at: Date.now() };
}

/** Start polling (idempotent; survives hot reload through globalThis). Linux only. */
export function startMemoryGuard(): void {
  if (process.platform !== "linux") return;
  const guard = state();
  if (guard.timer) return;
  guard.timer = setInterval(() => {
    try {
      tick();
    } catch {
      // A failed sample must never take the server down.
    }
  }, POLL_MS);
  guard.timer.unref?.();
}

export class ProcessNotManagedError extends Error {
  constructor() {
    super("Only processes started by an agent session or a terminal can be stopped here");
  }
}

/** Dashboard "stop" button: SIGTERM a process inside an agent/terminal tree. */
export function stopManagedProcess(pid: number): GuardEvent {
  const roots = currentRoots();
  const processes = readProcesses();
  const owner = descendantsOf(processes, roots.keys());
  const process_ = processes.find((entry) => entry.pid === pid);
  const rootPid = owner.get(pid) ?? (roots.get(pid)?.owner.kind === "session" ? pid : undefined);
  if (!process_ || rootPid === undefined || pid === process.pid) throw new ProcessNotManagedError();
  const event = signal({ process: process_, rootPid }, roots.get(rootPid)!, "SIGTERM", "manual", readMemory());
  if (!event) throw new ProcessNotManagedError();
  return event;
}

const TOP_PER_OWNER = 6;

export function getSystemSnapshot(): SystemSnapshot {
  const guard = state();
  const settings = loadWebServerSettings().memoryGuard;
  const supported = process.platform === "linux";
  const cpu = supported ? readCpuTimes() : null;
  let cpuPercent: number | null = null;
  if (cpu && guard.lastCpu && cpu.total > guard.lastCpu.total) {
    cpuPercent = Math.max(0, Math.min(100, ((cpu.busy - guard.lastCpu.busy) / (cpu.total - guard.lastCpu.total)) * 100));
  }
  if (cpu) guard.lastCpu = cpu;

  const owners: OwnerUsage[] = [];
  if (supported) {
    const roots = currentRoots();
    const processes = readProcesses();
    const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
    const owner = descendantsOf(processes, roots.keys());
    for (const [rootPid, root] of roots) {
      const rootProcess = byPid.get(rootPid);
      if (!rootProcess) continue;
      const descendants = processes.filter((entry) => owner.get(entry.pid) === rootPid);
      descendants.sort((a, b) => b.rssBytes - a.rssBytes);
      owners.push({
        owner: root.owner,
        rootPid,
        rootRssBytes: rootProcess.rssBytes,
        totalRssBytes: descendants.reduce((sum, entry) => sum + entry.rssBytes, rootProcess.rssBytes),
        processCount: descendants.length + 1,
        top: descendants.slice(0, TOP_PER_OWNER).filter((entry) => entry.rssBytes > 0).map(describe),
      });
    }
    owners.sort((a, b) => b.totalRssBytes - a.totalRssBytes);
  }

  return {
    supported,
    memory: supported ? readMemory() : null,
    cpuPercent,
    cpuCount: cpus().length,
    loadAverage: supported ? readLoadAverage() : null,
    serverRssBytes: process.memoryUsage().rss,
    owners,
    guard: settings,
    events: guard.events,
  };
}

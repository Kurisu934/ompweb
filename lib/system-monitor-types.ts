import type { MemoryGuardSettings } from "./memory-guard-settings";

/** Client-safe shapes for /api/system (System dashboard + memory guard). */

export interface MonitoredProcess {
  pid: number;
  name: string;
  command: string;
  rssBytes: number;
}

/** What started a process: an agent session or an integrated terminal. */
export type ProcessOwner =
  | { kind: "session"; sessionId: string; sessionName?: string; cwd: string }
  | { kind: "terminal"; terminalId: string; cwd: string };

export interface OwnerUsage {
  owner: ProcessOwner;
  /** omp itself / the terminal's shell. */
  rootPid: number;
  rootRssBytes: number;
  /** Root plus every descendant. */
  totalRssBytes: number;
  processCount: number;
  /** Largest descendants (the commands it runs), biggest first. */
  top: MonitoredProcess[];
}

export interface GuardEvent {
  at: number;
  reason: "low-memory" | "manual";
  signal: "SIGTERM" | "SIGKILL";
  process: MonitoredProcess;
  owner: ProcessOwner;
  availableBytes: number;
  totalBytes: number;
}

export interface SystemSnapshot {
  supported: boolean;
  memory: { totalBytes: number; availableBytes: number; swapTotalBytes: number; swapFreeBytes: number } | null;
  /** 0–100 over the time since the previous snapshot; null on the first one. */
  cpuPercent: number | null;
  cpuCount: number;
  loadAverage: [number, number, number] | null;
  /** The omp-web server process itself. */
  serverRssBytes: number;
  owners: OwnerUsage[];
  guard: MemoryGuardSettings;
  events: GuardEvent[];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

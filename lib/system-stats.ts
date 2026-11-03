import { readdirSync, readFileSync, writeFileSync } from "fs";

/**
 * Linux /proc readers for the memory guard and the System dashboard. Every
 * reader returns null/[] off Linux or when /proc is unreadable.
 */

export interface MemoryStats {
  totalBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  rssBytes: number;
  /** Short name (comm). */
  name: string;
}

export interface CpuTimes {
  busy: number;
  total: number;
}

/** Parse /proc/meminfo (values in kB). */
export function parseMeminfo(text: string): MemoryStats | null {
  const kb = (key: string) => {
    const match = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, "m"));
    return match ? Number(match[1]) * 1024 : undefined;
  };
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  if (total === undefined || available === undefined) return null;
  return { totalBytes: total, availableBytes: available, swapTotalBytes: kb("SwapTotal") ?? 0, swapFreeBytes: kb("SwapFree") ?? 0 };
}

export function readMemory(): MemoryStats | null {
  try {
    return parseMeminfo(readFileSync("/proc/meminfo", "utf8"));
  } catch {
    return null;
  }
}

/** Parse the aggregate `cpu` line of /proc/stat. */
export function parseCpuTimes(text: string): CpuTimes | null {
  const line = text.split("\n").find((entry) => entry.startsWith("cpu "));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) return null;
  const idle = values[3] + (values[4] ?? 0);
  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
  return { busy: total - idle, total };
}

export function readCpuTimes(): CpuTimes | null {
  try {
    return parseCpuTimes(readFileSync("/proc/stat", "utf8"));
  } catch {
    return null;
  }
}

export function readLoadAverage(): [number, number, number] | null {
  try {
    const [one, five, fifteen] = readFileSync("/proc/loadavg", "utf8").split(" ").map(Number);
    return [one, five, fifteen].every(Number.isFinite) ? [one, five, fifteen] : null;
  } catch {
    return null;
  }
}

/**
 * One /proc/<pid>/stat line → pid, ppid, rss (pages) and comm. comm is
 * parenthesized and may itself contain spaces or parentheses, so fields are
 * read after the LAST ")".
 */
export function parseProcStat(text: string, pageSize: number): ProcessInfo | null {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open < 0 || close < open) return null;
  const pid = Number(text.slice(0, open).trim());
  const fields = text.slice(close + 2).split(" ");
  // fields[0] = state (field 3), so field N is fields[N - 3].
  const ppid = Number(fields[1]);
  const rssPages = Number(fields[21]);
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isFinite(rssPages)) return null;
  return { pid, ppid, rssBytes: rssPages * pageSize, name: text.slice(open + 1, close) };
}

const PAGE_SIZE = 4096;

/** Every process this user can see. Kernel threads (rss 0, ppid 2) included; callers filter by tree. */
export function readProcesses(): ProcessInfo[] {
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return [];
  }
  const processes: ProcessInfo[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const info = parseProcStat(readFileSync(`/proc/${entry}/stat`, "utf8"), PAGE_SIZE);
      if (info) processes.push(info);
    } catch {
      // exited while scanning
    }
  }
  return processes;
}

/** The command line, shortened for display; empty when unreadable. */
export function readCommandLine(pid: number, maxLength = 300): string {
  try {
    const text = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0+$/, "").replace(/\0/g, " ");
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  } catch {
    return "";
  }
}

/** All descendants of each root (roots excluded), by parent links. */
export function descendantsOf(processes: ProcessInfo[], roots: Iterable<number>): Map<number, number> {
  const children = new Map<number, ProcessInfo[]>();
  for (const process of processes) children.set(process.ppid, [...(children.get(process.ppid) ?? []), process]);
  /** descendant pid → the root it belongs to */
  const owner = new Map<number, number>();
  for (const root of roots) {
    const stack = [...(children.get(root) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (owner.has(next.pid)) continue;
      owner.set(next.pid, root);
      stack.push(...(children.get(next.pid) ?? []));
    }
  }
  return owner;
}

/** Raise a process's OOM-killer preference (unprivileged processes may only raise it). Children inherit it. */
export function preferForOomKill(pid: number, score = 800): void {
  if (process.platform !== "linux") return;
  try {
    writeFileSync(`/proc/${pid}/oom_score_adj`, String(score));
  } catch {
    // exited already, or a lower value is not ours to set
  }
}

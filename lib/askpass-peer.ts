import { readdirSync, readFileSync, readlinkSync } from "fs";
import path from "path";

/**
 * Linux-only checks that an askpass request really comes from our askpass
 * client started by sudo, so an agent cannot just call the endpoint itself to
 * phish a password into its own output. All facts come from /proc:
 *   - the TCP connection → the client process (socket inode → owning pid);
 *   - the client is `node <askpass-client.cjs> <prompt>` with no NODE_OPTIONS;
 *   - its parent runs as root (euid 0) and is named sudo (only the setuid
 *     sudo binary can be that), whose command line is what the user approves;
 *   - its stdout is an anonymous pipe no other process of ours holds, i.e.
 *     the answer can only flow back into sudo.
 * A same-user agent that works hard enough (racing on that pipe, editing the
 * client file) can still get around this; it raises the bar, nothing more.
 */
export interface VerifiedAskpassPeer {
  clientPid: number;
  sudoPid: number;
  /** sudo's argv, e.g. ["sudo", "-A", "apt-get", "update"]. */
  sudoCommand: string[];
}

export class AskpassPeerError extends Error {}

/** Parse /proc/net/tcp(6) for the inode of the socket local:port → remote:port. */
export function findSocketInode(table: string, localPort: number, remotePort: number): string | null {
  for (const line of table.split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10) continue;
    const local = Number.parseInt(fields[1].split(":")[1] ?? "", 16);
    const remote = Number.parseInt(fields[2].split(":")[1] ?? "", 16);
    if (local === localPort && remote === remotePort && fields[9] !== "0") return fields[9];
  }
  return null;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function statusField(status: string, name: string): string[] {
  const line = status.split("\n").find((entry) => entry.startsWith(`${name}:`));
  return line ? line.slice(name.length + 1).trim().split(/\s+/) : [];
}

/** Every fd target ("socket:[123]", "pipe:[456]", …) → pids holding it, over the processes we may read. */
function scanFdTargets(procRoot: string): Map<string, number[]> {
  const holders = new Map<string, number[]>();
  for (const entry of readdirSync(procRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    let fds: string[];
    try {
      fds = readdirSync(path.join(procRoot, entry, "fd"));
    } catch {
      continue; // another user's process, or it already exited
    }
    for (const fd of fds) {
      let target: string;
      try {
        target = readlinkSync(path.join(procRoot, entry, "fd", fd));
      } catch {
        continue;
      }
      if (!target.startsWith("socket:[") && !target.startsWith("pipe:[")) continue;
      const pids = holders.get(target) ?? [];
      if (!pids.includes(Number(entry))) pids.push(Number(entry));
      holders.set(target, pids);
    }
  }
  return holders;
}

export function verifyAskpassPeer(options: {
  /** Client's source port of the TCP connection. */
  clientPort: number;
  serverPort: number;
  nodePath: string;
  clientScript: string;
  procRoot?: string;
}): VerifiedAskpassPeer {
  const procRoot = options.procRoot ?? "/proc";
  const table = `${readText(path.join(procRoot, "net/tcp")) ?? ""}\n${readText(path.join(procRoot, "net/tcp6")) ?? ""}`;
  const inode = findSocketInode(table, options.clientPort, options.serverPort);
  if (!inode) throw new AskpassPeerError("connection not found");

  const holders = scanFdTargets(procRoot);
  const owners = holders.get(`socket:[${inode}]`) ?? [];
  if (owners.length !== 1) throw new AskpassPeerError("connection owner not found");
  const clientPid = owners[0];
  const proc = (pid: number, file: string) => path.join(procRoot, String(pid), file);

  const argv = (readText(proc(clientPid, "cmdline")) ?? "").split("\0").filter((arg, index, all) => arg !== "" || index < all.length - 1);
  let exe = "";
  try { exe = readlinkSync(proc(clientPid, "exe")); } catch {}
  if (exe !== options.nodePath || argv.length !== 3 || argv[1] !== options.clientScript) {
    throw new AskpassPeerError("not the omp-web askpass client");
  }
  const environ = (readText(proc(clientPid, "environ")) ?? "").split("\0");
  if (environ.some((entry) => entry.startsWith("NODE_OPTIONS=") && entry.length > "NODE_OPTIONS=".length)) {
    throw new AskpassPeerError("client runs with NODE_OPTIONS");
  }

  const sudoPid = Number(statusField(readText(proc(clientPid, "status")) ?? "", "PPid")[0]);
  const sudoStatus = readText(proc(sudoPid, "status")) ?? "";
  const sudoName = statusField(sudoStatus, "Name")[0];
  const sudoEuid = statusField(sudoStatus, "Uid")[1];
  if (!sudoPid || sudoName !== "sudo" || sudoEuid !== "0") throw new AskpassPeerError("client was not started by sudo");
  const sudoCommand = (readText(proc(sudoPid, "cmdline")) ?? "").split("\0").filter(Boolean);

  let stdout = "";
  try { stdout = readlinkSync(proc(clientPid, "fd/1")); } catch {}
  if (!stdout.startsWith("pipe:[")) throw new AskpassPeerError("client output is not a pipe to sudo");
  const others = (holders.get(stdout) ?? []).filter((pid) => pid !== clientPid);
  if (others.length > 0) throw new AskpassPeerError("another process can read the client's output");

  return { clientPid, sudoPid, sudoCommand };
}

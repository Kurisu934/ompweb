import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { encodeRpcCommand, type RpcFrameRecord, type RpcProtocolVersion } from "./rpc-frame";
import {
  RpcCommandError,
  RpcCommandTimeoutError,
  type RpcFrame,
  type RpcResponseFrame,
  type RpcTransport,
} from "./rpc-process";

export const LOCAL_BRIDGE_VERSION = 1;
export const MAX_BRIDGE_LINE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_BRIDGE_COMMAND_TIMEOUT_MS = 60_000;

export interface LocalSessionMetadata {
  version: 1;
  pid: number;
  sessionId: string;
  sessionFile: string;
  socketPath: string;
  token: string;
}

export type BridgeExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
};

/** Directory for shared local bridge metadata files (${PI_CODING_AGENT_DIR||~/.omp/agent}/local-sessions). */
export function getLocalSessionsDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".omp", "agent");
  return join(agentDir, "local-sessions");
}

/** Canonical path resolution for session files across platforms and symlinks. */
export function canonicalSessionPath(sessionFile: string): string {
  try {
    return realpathSync.native(sessionFile);
  } catch {
    try {
      return realpathSync(sessionFile);
    } catch {
      return resolve(sessionFile);
    }
  }
}

/** Compute sha256 of canonical sessionFile path. */
export function getSessionFileHash(sessionFile: string): string {
  return createHash("sha256").update(canonicalSessionPath(sessionFile)).digest("hex");
}

/** Full path to local session metadata file. */
export function getSessionMetadataPath(sessionFile: string): string {
  return join(getLocalSessionsDir(), `${getSessionFileHash(sessionFile)}.json`);
}

/** Check if process PID is currently alive on the host. */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 1 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export type ReadMetadataResult =
  | { status: "none" }
  | { status: "stale"; pid: number; path: string }
  | { status: "invalid"; error: string; pid?: number; path: string }
  | { status: "live"; metadata: LocalSessionMetadata; path: string };

/** Read and strictly validate local bridge metadata for a session file. */
export function readSessionMetadata(sessionFile: string): ReadMetadataResult {
  const metaDir = getLocalSessionsDir();
  const metaPath = getSessionMetadataPath(sessionFile);
  if (!existsSync(metaPath)) {
    return { status: "none" };
  }

  // 1. UID and permission security check on POSIX before reading token
  if (process.platform !== "win32" && typeof process.getuid === "function") {
    const currentUid = process.getuid();
    try {
      const dirStat = statSync(metaDir);
      if (dirStat.uid !== currentUid) {
        return { status: "invalid", error: `Local sessions dir UID mismatch: expected ${currentUid}, got ${dirStat.uid}`, path: metaPath };
      }
      if ((dirStat.mode & 0o002) !== 0) {
        return { status: "invalid", error: "Local sessions dir is world-writable", path: metaPath };
      }
    } catch (err: unknown) {
      return { status: "invalid", error: `Cannot stat local sessions dir: ${(err as Error)?.message || err}`, path: metaPath };
    }

    try {
      const fileStat = statSync(metaPath);
      if (fileStat.uid !== currentUid) {
        return { status: "invalid", error: `Metadata file UID mismatch: expected ${currentUid}, got ${fileStat.uid}`, path: metaPath };
      }
      if ((fileStat.mode & 0o077) !== 0) {
        return { status: "invalid", error: "Metadata file has unsafe permissions (group/world accessible)", path: metaPath };
      }
    } catch (err: unknown) {
      return { status: "invalid", error: `Cannot stat metadata file: ${(err as Error)?.message || err}`, path: metaPath };
    }
  }

  // 2. Read file (exists, so failure MUST be invalid and fail closed)
  let raw: string;
  try {
    raw = readFileSync(metaPath, "utf8");
  } catch (err: unknown) {
    return { status: "invalid", error: `Failed to read existing metadata file: ${(err as Error)?.message || err}`, path: metaPath };
  }

  // 3. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", error: "Malformed JSON in session metadata", path: metaPath };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid", error: "Metadata is not a JSON object", path: metaPath };
  }
  const m = parsed as Partial<LocalSessionMetadata>;

  // 4. Validate pid (must be integer > 1; pid <= 1 is invalid, not stale)
  if (typeof m.pid !== "number" || !Number.isInteger(m.pid) || m.pid <= 1) {
    return { status: "invalid", error: "Invalid pid in metadata (must be integer > 1)", path: metaPath };
  }

  // 5. Validate sessionFile (must be non-empty string and canonically match requested file)
  if (typeof m.sessionFile !== "string" || !m.sessionFile.trim()) {
    return { status: "invalid", error: "Missing or invalid sessionFile in metadata", pid: m.pid, path: metaPath };
  }
  const metaFileCanonical = canonicalSessionPath(m.sessionFile);
  const reqFileCanonical = canonicalSessionPath(sessionFile);
  if (metaFileCanonical !== reqFileCanonical) {
    return {
      status: "invalid",
      error: `Metadata sessionFile mismatch: expected ${reqFileCanonical}, got ${metaFileCanonical}`,
      pid: m.pid,
      path: metaPath,
    };
  }

  // 6. Check if pid is alive
  if (!isProcessAlive(m.pid)) {
    return { status: "stale", pid: m.pid, path: metaPath };
  }

  // 7. Validate version, socketPath, token, sessionId
  if (m.version !== 1) {
    return { status: "invalid", error: `Unsupported metadata version: ${m.version}`, pid: m.pid, path: metaPath };
  }
  if (typeof m.socketPath !== "string" || !m.socketPath.trim()) {
    return { status: "invalid", error: "Missing or non-string socketPath in metadata", pid: m.pid, path: metaPath };
  }
  if (typeof m.token !== "string" || !m.token.trim()) {
    return { status: "invalid", error: "Missing or non-string token in metadata", pid: m.pid, path: metaPath };
  }
  if (typeof m.sessionId !== "string" || !m.sessionId.trim()) {
    return { status: "invalid", error: "Missing or non-string sessionId in metadata", pid: m.pid, path: metaPath };
  }

  // 8. Validate socket file itself before returning live
  if (process.platform !== "win32") {
    try {
      const sockStat = statSync(m.socketPath);
      if (!sockStat.isSocket()) {
        return { status: "invalid", error: `socketPath is not a socket: ${m.socketPath}`, pid: m.pid, path: metaPath };
      }
      if (typeof process.getuid === "function" && sockStat.uid !== process.getuid()) {
        return { status: "invalid", error: `Socket file UID mismatch: expected ${process.getuid()}, got ${sockStat.uid}`, pid: m.pid, path: metaPath };
      }
      if ((sockStat.mode & 0o077) !== 0) {
        return { status: "invalid", error: "Socket file has unsafe permissions (group/world accessible)", pid: m.pid, path: metaPath };
      }
    } catch (err: unknown) {
      return { status: "invalid", error: `Cannot stat socketPath: ${(err as Error)?.message || err}`, pid: m.pid, path: metaPath };
    }
  }

  return {
    status: "live",
    metadata: {
      version: 1,
      pid: m.pid,
      sessionId: m.sessionId,
      sessionFile: m.sessionFile,
      socketPath: m.socketPath,
      token: m.token,
    },
    path: metaPath,
  };
}

/** Directory for legacy Telegram bridge state, matching omp-telegram access.ts stateDir(). */
export function getTelegramStateDir(): string {
  return process.env.OMP_TELEGRAM_STATE_DIR ?? join(homedir(), ".omp", "agent", "telegram");
}

export interface LegacyTgOwnerCheck {
  active: boolean;
  pid?: number;
  name?: string;
  chatId?: string;
}

/** Check if session is owned by an active Telegram bridge process under the legacy plugin (lacking bridge metadata). */
export function checkLegacyTgOwner(sessionFile: string, sessionId?: string): LegacyTgOwnerCheck {
  const tgDir = getTelegramStateDir();
  const absFile = canonicalSessionPath(sessionFile);

  const matchesEntry = (entry: unknown): boolean => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const e = entry as { pid?: unknown; sessionFile?: unknown; sessionId?: unknown };
    if (typeof e.pid !== "number" || !isProcessAlive(e.pid)) return false;
    if (sessionId && e.sessionId === sessionId) return true;
    if (typeof e.sessionFile === "string" && canonicalSessionPath(e.sessionFile) === absFile) return true;
    return false;
  };

  // 1. Check threads.json
  const threadsPath = join(tgDir, "threads.json");
  if (existsSync(threadsPath)) {
    try {
      const data = JSON.parse(readFileSync(threadsPath, "utf8"));
      if (data && typeof data.threads === "object" && data.threads !== null) {
        for (const thread of Object.values(data.threads)) {
          if (matchesEntry(thread)) {
            const e = thread as { pid: number; name?: string };
            return { active: true, pid: e.pid, name: e.name, chatId: data.chatId };
          }
        }
      }
    } catch {}
  }

  // 2. Check dm-owner.json
  const dmOwnerPath = join(tgDir, "dm-owner.json");
  if (existsSync(dmOwnerPath)) {
    try {
      const data = JSON.parse(readFileSync(dmOwnerPath, "utf8"));
      if (matchesEntry(data)) {
        const e = data as { pid: number; name?: string };
        return { active: true, pid: e.pid, name: e.name };
      }
    } catch {}
  }

  return { active: false };
}

/** Cross-process shared wake reservation lock coordinating with TG wakeBoundSession to prevent double-spawns. */
export function acquireSharedWakeLock(
  sessionFile: string,
  pid = process.pid,
): { ok: true; release: () => void } | { ok: false; holder?: number } {
  const tgDir = getTelegramStateDir();
  const lockDir = join(tgDir, "wake-locks");
  try {
    mkdirSync(lockDir, { recursive: true, mode: 0o700 });
  } catch {}
  const safeKey = createHash("sha256").update(canonicalSessionPath(sessionFile)).digest("hex");
  const lockFile = join(lockDir, `${safeKey}.lock`);

  if (existsSync(lockFile)) {
    try {
      const raw = readFileSync(lockFile, "utf8").trim();
      const holder = parseInt(raw, 10);
      if (Number.isFinite(holder) && holder > 1 && isProcessAlive(holder) && holder !== pid) {
        return { ok: false, holder };
      }
      unlinkSync(lockFile);
    } catch {}
  }

  const tmpLock = join(lockDir, `${safeKey}.tmp.${pid}.${Date.now()}`);
  try {
    writeFileSync(tmpLock, String(pid), { mode: 0o600 });
    linkSync(tmpLock, lockFile);
    unlinkSync(tmpLock);
    return {
      ok: true,
      release: () => {
        try {
          const cur = readFileSync(lockFile, "utf8").trim();
          if (parseInt(cur, 10) === pid) {
            unlinkSync(lockFile);
          }
        } catch {}
      },
    };
  } catch {
    try { unlinkSync(tmpLock); } catch {}
    let holder: number | undefined;
    try {
      holder = parseInt(readFileSync(lockFile, "utf8").trim(), 10);
    } catch {}
    return { ok: false, holder };
  }
}

interface PendingCommand {
  command: string;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export interface LocalBridgeClientOptions {
  onExit?: (info: BridgeExitInfo) => void;
}

/** Client for communicating with an active owner's Unix domain socket. */
export class LocalBridgeClient implements RpcTransport {
  readonly socketPath: string;
  readonly metadata: LocalSessionMetadata;
  private socket: Socket;
  private rl: Interface;
  private closed = false;
  private nextId = 1;
  private readonly pending = new Map<string, PendingCommand>();
  private readonly frameListeners = new Set<(frame: RpcFrame) => void>();
  private readonly earlyFrames: RpcFrame[] = [];
  private readyPromise: Promise<RpcFrame>;
  private readyResolved = false;
  private readonly onExit?: (info: BridgeExitInfo) => void;

  private constructor(socket: Socket, metadata: LocalSessionMetadata, onExit?: (info: BridgeExitInfo) => void) {
    this.socket = socket;
    this.socketPath = metadata.socketPath;
    this.metadata = metadata;
    this.onExit = onExit;

    let resolveReady!: (frame: RpcFrame) => void;
    let rejectReady!: (error: Error) => void;
    this.readyPromise = new Promise<RpcFrame>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    this.rl = createInterface({ input: socket });

    let firstLine = true;
    this.rl.on("line", (line) => {
      if (line.length > MAX_BRIDGE_LINE_BYTES) return;
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const frame = parsed as RpcFrameRecord;
      if (typeof frame.type !== "string") return;

      if (firstLine) {
        firstLine = false;
        if (frame.type === "ready") {
          this.readyResolved = true;
          resolveReady(frame);
          return;
        }
        // Strict handshake rejection: no fake ready fallback!
        const errMsg = typeof frame.error === "string" ? frame.error : `Bridge handshake failed: expected ready frame, got ${frame.type}`;
        rejectReady(new Error(errMsg));
        this.dispose().catch(() => {});
        return;
      }

      if (frame.type === "response") {
        this.handleResponse(frame as unknown as RpcResponseFrame);
      } else {
        if (this.frameListeners.size === 0) {
          this.earlyFrames.push(frame);
        } else {
          for (const listener of this.frameListeners) {
            try {
              listener(frame);
            } catch {}
          }
        }
      }
    });

    const handleCloseOrError = (err?: Error) => {
      if (this.closed) return;
      this.closed = true;
      if (!this.readyResolved) {
        rejectReady(err || new Error("Bridge connection closed before ready"));
      }
      const closeErr = err || new Error("Bridge connection closed");
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        try { entry.reject(closeErr); } catch {}
      }
      this.pending.clear();
      try { this.rl.close(); } catch {}
      // Notify rpc-manager so SSE terminates busy / streaming state
      try {
        this.onExit?.({
          code: null,
          signal: null,
          stderrTail: err?.message ? `bridge socket error: ${err.message}` : "bridge socket closed",
        });
      } catch {}
    };

    this.socket.on("error", handleCloseOrError);
    this.socket.on("close", () => handleCloseOrError());
  }

  /** Connect to Unix socket, complete {type:'attach'} handshake, and return ready client. */
  static async connect(
    metadata: LocalSessionMetadata,
    timeoutMs = 10_000,
    options?: LocalBridgeClientOptions,
  ): Promise<LocalBridgeClient> {
    return new Promise<LocalBridgeClient>((resolve, reject) => {
      let settled = false;
      let client: LocalBridgeClient | null = null;
      let socket: Socket | null = null;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (client) {
          client.dispose().catch(() => {});
        } else if (socket) {
          try { socket.destroy(); } catch {}
        }
        reject(err);
      };

      const timer = setTimeout(() => {
        fail(new Error(`Connecting to local bridge socket timed out after ${timeoutMs}ms: ${metadata.socketPath}`));
      }, timeoutMs);
      timer.unref?.();

      try {
        socket = createConnection(metadata.socketPath, () => {
          if (settled) {
            try { socket?.destroy(); } catch {}
            return;
          }
          try {
            client = new LocalBridgeClient(socket!, metadata, options?.onExit);
            const handshake = JSON.stringify({
              type: "attach",
              token: metadata.token,
              sessionFile: metadata.sessionFile,
            }) + "\n";
            socket!.write(handshake, (writeErr) => {
              if (writeErr) {
                fail(writeErr instanceof Error ? writeErr : new Error(String(writeErr)));
                return;
              }
              client!.waitReady(timeoutMs)
                .then(() => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timer);
                  resolve(client!);
                })
                .catch((readyErr) => {
                  fail(readyErr instanceof Error ? readyErr : new Error(String(readyErr)));
                });
            });
          } catch (err: unknown) {
            fail(err instanceof Error ? err : new Error(String(err)));
          }
        });

        socket.on("error", (err) => {
          fail(err instanceof Error ? err : new Error(String(err)));
        });
      } catch (err: unknown) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  get isAlive(): boolean {
    return !this.closed && !this.socket.destroyed;
  }

  waitReady(timeoutMs = 60_000): Promise<RpcFrame> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Bridge ready timeout after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
      this.readyPromise.finally(() => clearTimeout(timer)).catch(() => {});
    });
    return Promise.race([this.readyPromise, timeout]);
  }

  async negotiateProtocol(_ready: RpcFrame): Promise<RpcProtocolVersion> {
    return 1;
  }

  onFrame(listener: (frame: RpcFrame) => void): () => void {
    this.frameListeners.add(listener);
    if (this.earlyFrames.length > 0) {
      const queued = [...this.earlyFrames];
      this.earlyFrames.length = 0;
      for (const frame of queued) {
        try {
          listener(frame);
        } catch {}
      }
    }
    return () => this.frameListeners.delete(listener);
  }

  sendCommand<T = unknown>(command: { type: string; [key: string]: unknown }, timeoutMs?: number): Promise<T> {
    if (this.closed || this.socket.destroyed) {
      return Promise.reject(new Error("Local bridge is not connected"));
    }
    const id = `b${this.nextId++}`;
    const effectiveTimeout = timeoutMs !== undefined && timeoutMs > 0 ? timeoutMs : DEFAULT_BRIDGE_COMMAND_TIMEOUT_MS;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingCommand = {
        command: command.type,
        resolve: resolve as (data: unknown) => void,
        reject,
      };
      entry.timer = setTimeout(() => {
        if (this.pending.get(id) === entry) {
          this.pending.delete(id);
          reject(new RpcCommandTimeoutError(command.type, effectiveTimeout));
        }
      }, effectiveTimeout);
      entry.timer.unref?.();
      this.pending.set(id, entry);

      let line: string;
      try {
        line = encodeRpcCommand({ ...command, id });
      } catch (err: unknown) {
        this.pending.delete(id);
        clearTimeout(entry.timer);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.socket.write(line, (error) => {
        if (error) {
          const p = this.pending.get(id);
          if (p) {
            this.pending.delete(id);
            clearTimeout(p.timer);
            reject(error);
          }
        }
      });
    });
  }

  sendFrame(frame: { type: string; [key: string]: unknown }): void {
    if (this.closed || this.socket.destroyed) return;
    try {
      const line = encodeRpcCommand(frame);
      this.socket.write(line);
    } catch {}
  }

  private handleResponse(response: RpcResponseFrame): void {
    const id = response.id;
    const entry = id ? this.pending.get(id) : undefined;
    if (!entry || !id) {
      for (const listener of this.frameListeners) {
        try {
          listener(response as unknown as RpcFrame);
        } catch {}
      }
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (response.success) {
      entry.resolve(response.data);
    } else {
      entry.reject(new RpcCommandError(response.command, response.error ?? "RPC command failed", response.code));
    }
  }

  /** Close the socket connection and cleanly reject pending commands. Does NOT kill the remote owner process. */
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const disposeErr = new Error("Local bridge client was disposed");
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      try { entry.reject(disposeErr); } catch {}
    }
    this.pending.clear();
    try {
      this.socket.end();
      this.socket.destroy();
    } catch {}
    try {
      this.rl.close();
    } catch {}
  }
}

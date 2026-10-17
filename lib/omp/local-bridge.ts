import { existsSync, readFileSync, statSync } from "node:fs";
import * as fsRuntime from "node:fs";
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { encodeRpcCommand, type RpcFrameRecord, type RpcProtocolVersion } from "./rpc-frame";
import {
  RpcCommandError,
  RpcCommandTimeoutError,
  type RpcFrame,
  type RpcResponseFrame,
  type RpcTransport,
} from "./rpc-process";
import {
  DESKTOP_BRIDGE_PROTOCOL, canonicalSessionPath, getDesktopSessionsDir, getSessionMetadataPath,
  isProcessAlive, type DesktopSessionMetadata,
} from "./desktop-protocol";

export const MAX_BRIDGE_LINE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_BRIDGE_COMMAND_TIMEOUT_MS = 60_000;

// Resolve user-session directories at runtime, not during Next's file tracing.
const readDirectorySyncRuntime = Reflect.get(fsRuntime, "readdirSync") as typeof fsRuntime.readdirSync;

export type LocalSessionMetadata = DesktopSessionMetadata;

export type BridgeExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
};

const getLocalSessionsDir = getDesktopSessionsDir;

export type ReadMetadataResult =
  | { status: "none" }
  | { status: "stale"; pid: number; path: string }
  | { status: "invalid"; error: string; pid?: number; path: string }
  | { status: "live"; metadata: LocalSessionMetadata; path: string };

/** Read and strictly validate local bridge metadata for a session file. */
export function readSessionMetadata(sessionFile: string): ReadMetadataResult {
  return readMetadataFile(getSessionMetadataPath(sessionFile), sessionFile);
}

/** Enumerate only authenticated, live owners; never wake an inactive session. */
export function listLiveSessionMetadata(): LocalSessionMetadata[] {
  const dir = getLocalSessionsDir();
  let names: string[];
  try {
    names = readDirectorySyncRuntime(dir);
  } catch {
    return [];
  }
  const owners: LocalSessionMetadata[] = [];
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const result = readMetadataFile(join(dir, name));
    if (result.status === "live") owners.push(result.metadata);
  }
  return owners;
}

function readMetadataFile(metaPath: string, sessionFile?: string): ReadMetadataResult {
  const metaDir = getLocalSessionsDir();
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

  // 5. Bind sessionFile to its metadata filename and, when supplied, requested file.
  if (typeof m.sessionFile !== "string" || !m.sessionFile.trim()) {
    return { status: "invalid", error: "Missing or invalid sessionFile in metadata", pid: m.pid, path: metaPath };
  }
  const metaFileCanonical = canonicalSessionPath(m.sessionFile);
  const reqFileCanonical = sessionFile === undefined ? metaFileCanonical : canonicalSessionPath(sessionFile);
  if (metaFileCanonical !== reqFileCanonical || metaPath !== getSessionMetadataPath(m.sessionFile)) {
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

  // 7. Bind metadata to this integration, not another local socket protocol.
  if (m.version !== 1 || m.protocol !== DESKTOP_BRIDGE_PROTOCOL) {
    return { status: "invalid", error: "Unsupported desktop bridge protocol", pid: m.pid, path: metaPath };
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
      protocol: DESKTOP_BRIDGE_PROTOCOL,
      pid: m.pid,
      sessionId: m.sessionId,
      sessionFile: m.sessionFile,
      socketPath: m.socketPath,
      token: m.token,
    },
    path: metaPath,
  };
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
        if (frame.type === "ready" && frame.protocol === DESKTOP_BRIDGE_PROTOCOL
          && frame.pid === metadata.pid && frame.sessionId === metadata.sessionId && frame.sessionFile === metadata.sessionFile) {
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
              protocol: DESKTOP_BRIDGE_PROTOCOL,
              sessionId: metadata.sessionId,
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

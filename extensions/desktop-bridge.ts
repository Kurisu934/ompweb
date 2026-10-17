import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, linkSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  DESKTOP_BRIDGE_PROTOCOL, canonicalSessionPath, getDesktopSessionsDir,
  getSessionFileHash, getSessionMetadataPath, isProcessAlive, type DesktopSessionMetadata,
} from "../lib/omp/desktop-protocol";
import { validateNativeAskAnswers } from "../lib/omp/native-ask";
import type { RpcAskDialogAnswer, RpcAskDialogQuestion } from "../lib/pi-types";

type Frame = Record<string, unknown>;
type NativeAskAnswer = RpcAskDialogAnswer & { question: string; options: string[]; multi: boolean; timedOut?: boolean };
type AskResult = { kind: "submit"; results: NativeAskAnswer[] } | { kind: "chat" };
type DialogOptions = { signal?: AbortSignal; timeout?: number; [key: string]: unknown };
type AskDialog = (questions: RpcAskDialogQuestion[], options?: DialogOptions) => Promise<AskResult | undefined>;
interface Context {
  mode: string;
  agent: { kind: string };
  ui: { askDialog?: AskDialog };
  sessionManager: {
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getEntries(): unknown[];
    getLeafId(): string | null;
    getUsageStatistics(): Record<string, number>;
  };
  model?: unknown;
  isIdle(): boolean;
  abort(): void;
  hasPendingMessages(): boolean;
  getContextUsage(): unknown;
  getSystemPrompt(): string[];
}
interface ExtensionAPI {
  on(event: string, handler: (event: Frame, context: Context) => void | Promise<void>): void;
  pi: { buildSessionContext(entries: unknown[], leafId?: string | null): { messages: Frame[] } };
  sendUserMessage(content: unknown, options?: { deliverAs: "steer" | "followUp" }): void;
  getCommands(): unknown[];
  getThinkingLevel(): string | undefined;
  getSessionName(): string | undefined;
  logger: { warn(message: string): void };
}
interface PendingAsk {
  frame: Frame;
  questions: RpcAskDialogQuestion[];
  settle(result: AskResult | undefined): void;
}

/** Runs inside the original desktop process; never owns or rewrites its journal. */
class DesktopBridge {
  private readonly clients = new Set<Socket>();
  private readonly connections = new Set<Socket>();
  private readonly pending = new Map<string, PendingAsk>();
  private server?: Server;
  private metadata?: DesktopSessionMetadata;
  private metadataPath = "";
  private context: Context;
  private compacting = false;
  private updating?: Promise<void>;

  constructor(private readonly api: ExtensionAPI, context: Context) { this.context = context; }

  async update(context: Context): Promise<void> {
    while (this.updating) await this.updating;
    const operation = this.updateOwner(context);
    this.updating = operation;
    try { await operation; }
    finally { if (this.updating === operation) this.updating = undefined; }
  }

  private async updateOwner(context: Context): Promise<void> {
    this.context = context;
    const file = context.sessionManager.getSessionFile();
    if (!file) return;
    const sessionFile = canonicalSessionPath(file);
    const sessionId = context.sessionManager.getSessionId();
    if (this.metadata?.sessionFile === sessionFile && this.metadata.sessionId === sessionId) return;
    this.dispose();
    const dir = getDesktopSessionsDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const directory = lstatSync(dir);
    if (!directory.isDirectory() || (typeof process.getuid === "function" && directory.uid !== process.getuid())) throw new Error("Desktop metadata directory must be owned by the current user");
    chmodSync(dir, 0o700);
    const token = randomBytes(32).toString("hex");
    const hash = getSessionFileHash(sessionFile);
    const uid = typeof process.getuid === "function" ? process.getuid() : "user";
    const socketDir = join(tmpdir(), `omp-web-desktop-${uid}`);
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    const sockets = lstatSync(socketDir);
    if (!sockets.isDirectory() || (typeof process.getuid === "function" && sockets.uid !== process.getuid())) throw new Error("Desktop socket directory must be owned by the current user");
    chmodSync(socketDir, 0o700);
    const socketPath = process.platform === "win32"
      ? `\\\\.\\pipe\\omp-web-desktop-${hash.slice(0, 16)}-${token.slice(0, 12)}`
      : join(socketDir, `${process.pid}-${token.slice(0, 12)}.sock`);
    const metadata: DesktopSessionMetadata = { version: 1, protocol: DESKTOP_BRIDGE_PROTOCOL, pid: process.pid, sessionId, sessionFile, socketPath, token };
    const metadataPath = getSessionMetadataPath(sessionFile);
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    try {
      const listening = Promise.withResolvers<void>();
      server.once("error", listening.reject);
      server.listen(socketPath, () => { server.removeListener("error", listening.reject); listening.resolve(); });
      await listening.promise;
      server.on("error", (error) => this.api.logger.warn(`Desktop bridge: ${error.message}`));
      if (process.platform !== "win32") chmodSync(socketPath, 0o600);
      // Link publishes a complete, private record atomically; never overwrite a live owner.
      const temporary = `${metadataPath}.${token}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(metadata), { mode: 0o600, flag: "wx" });
        try { linkSync(temporary, metadataPath); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const previous = JSON.parse(readFileSync(metadataPath, "utf8")) as DesktopSessionMetadata;
          if (isProcessAlive(previous.pid)) throw new Error(`Session already has a desktop bridge owner (PID ${previous.pid})`);
          unlinkSync(metadataPath);
          linkSync(temporary, metadataPath);
        }
      } finally { try { unlinkSync(temporary); } catch { /* unpublished/removed */ } }
      this.metadata = metadata;
      this.metadataPath = metadataPath;
    } catch (error) {
      server.close();
      if (process.platform !== "win32") { try { unlinkSync(socketPath); } catch { /* not listening */ } }
      this.server = undefined;
      throw error;
    }
  }

  private accept(socket: Socket): void {
    this.connections.add(socket);
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    let authenticated = false;
    const timeout = setTimeout(() => socket.destroy(), 5_000);
    timeout.unref();
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      clearTimeout(timeout);
      this.clients.delete(socket);
      this.connections.delete(socket);
    });
    socket.on("data", (chunk) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > (authenticated ? 16 * 1024 * 1024 : 8 * 1024)) { socket.destroy(); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let frame: Frame;
        try {
          const parsed: unknown = JSON.parse(line);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
          frame = parsed as Frame;
        } catch { socket.destroy(); return; }
        if (!authenticated) {
          const owner = this.metadata;
          const token = typeof frame.token === "string" ? Buffer.from(frame.token) : Buffer.alloc(0);
          const expected = Buffer.from(owner?.token ?? "");
          if (!owner || frame.type !== "attach" || frame.protocol !== DESKTOP_BRIDGE_PROTOCOL
            || frame.sessionId !== owner.sessionId || frame.sessionFile !== owner.sessionFile
            || token.length !== expected.length || !timingSafeEqual(token, expected)) {
            socket.destroy(); return;
          }
          authenticated = true;
          clearTimeout(timeout);
          this.clients.add(socket);
          this.send(socket, { type: "ready", protocol: DESKTOP_BRIDGE_PROTOCOL, pid: process.pid, sessionId: owner.sessionId, sessionFile: owner.sessionFile });
          for (const ask of this.pending.values()) this.send(socket, ask.frame);
        } else {
          this.command(socket, frame);
        }
      }
    });
  }

  private send(socket: Socket, frame: Frame): void {
    if (socket.destroyed) return;
    if (socket.writableLength > 4 * 1024 * 1024) { socket.destroy(); return; }
    socket.write(`${JSON.stringify(frame)}\n`);
  }

  broadcast(frame: Frame): void {
    for (const client of this.clients) this.send(client, frame);
  }

  event(frame: Frame): void {
    if (frame.type === "auto_compaction_start" || frame.type === "session_before_compact" || frame.type === "session.compacting") this.compacting = true;
    if (frame.type === "auto_compaction_end" || frame.type === "session_compact") this.compacting = false;
    this.broadcast(frame);
  }

  private messages(): Frame[] {
    return this.api.pi.buildSessionContext(this.context.sessionManager.getEntries(), this.context.sessionManager.getLeafId()).messages;
  }

  private command(socket: Socket, frame: Frame): void {
    const type = frame.type;
    let data: unknown;
    try {
      switch (type) {
        case "get_state":
          data = {
            sessionId: this.context.sessionManager.getSessionId(), sessionFile: this.context.sessionManager.getSessionFile(),
            sessionName: this.api.getSessionName(), isStreaming: !this.context.isIdle(), isCompacting: this.compacting,
            messageCount: this.messages().length, model: this.context.model, thinkingLevel: this.api.getThinkingLevel(),
            contextUsage: this.context.getContextUsage(), systemPrompt: this.context.getSystemPrompt(),
            queuedMessageCount: this.context.hasPendingMessages() ? 1 : 0,
          };
          break;
        case "get_messages": data = { messages: this.messages() }; break;
        case "get_commands":
        case "get_available_commands": data = { commands: this.api.getCommands() }; break;
        case "get_session_stats": {
          const messages = this.messages();
          const usage = this.context.sessionManager.getUsageStatistics();
          data = {
            sessionId: this.context.sessionManager.getSessionId(), sessionFile: this.context.sessionManager.getSessionFile(),
            totalMessages: messages.length, userMessages: messages.filter((message) => message.role === "user").length,
            assistantMessages: messages.filter((message) => message.role === "assistant").length,
            toolResults: messages.filter((message) => message.role === "toolResult").length,
            toolCalls: messages.reduce((count, message) => count + (Array.isArray(message.content) ? message.content.filter((part: Frame) => part.type === "toolCall").length : 0), 0),
            tokens: { input: usage.input ?? 0, output: usage.output ?? 0, cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0, total: usage.totalTokens ?? 0 },
            cost: usage.cost ?? 0, contextUsage: this.context.getContextUsage(),
          };
          break;
        }
        case "set_subagent_subscription":
        case "set_ask_dialog": break; // Already broadcast; does not modify the desktop UI.
        case "prompt":
        case "steer":
        case "follow_up": {
          if (typeof frame.message !== "string") throw new Error("Message must be a string");
          if (/^\s*[!/]/.test(frame.message)) throw new Error("Desktop attach accepts conversation input only; run shell/slash commands in the original terminal");
          const deliverAs = type === "steer" || frame.streamingBehavior === "steer" ? "steer"
            : type === "follow_up" || frame.streamingBehavior === "followUp" ? "followUp" : undefined;
          if (!this.context.isIdle() && !deliverAs) throw new Error("Desktop session is busy; choose Steer or Queue, or stop it first");
          const images = Array.isArray(frame.images) ? frame.images : [];
          const content = images.length ? [{ type: "text", text: frame.message }, ...images.map((image: Frame) => ({ type: "image", data: image.data, mimeType: image.mimeType }))] : frame.message;
          this.api.sendUserMessage(content, deliverAs ? { deliverAs } : undefined);
          break;
        }
        case "abort":
          for (const ask of this.pending.values()) ask.settle(undefined);
          this.context.abort();
          break;
        case "extension_ui_response": {
          const target = typeof frame.targetId === "string" ? frame.targetId : "";
          const ask = this.pending.get(target);
          if (!ask) throw new Error("Question has already been settled");
          const answers = frame.cancelled === true ? undefined : validateNativeAskAnswers(ask.questions, frame.answers);
          ask.settle(answers ? {
            kind: "submit",
            results: answers.map((answer, index) => ({
              ...answer, question: ask.questions[index].question,
              options: ask.questions[index].options.map((option) => option.label),
              multi: ask.questions[index].multi === true, timedOut: false,
            })),
          } : undefined);
          break;
        }
        default: throw new Error(`Command '${String(type)}' is not supported by desktop attach; use the original terminal`);
      }
      this.send(socket, { type: "response", id: frame.id, command: type, success: true, data });
    } catch (error) {
      this.send(socket, { type: "response", id: frame.id, command: type, success: false, code: "attached_session_unsupported", error: error instanceof Error ? error.message : String(error) });
    }
  }

  ask(original: AskDialog, questions: RpcAskDialogQuestion[], options?: DialogOptions): Promise<AskResult | undefined> {
    if (options?.signal?.aborted) return Promise.resolve(undefined);
    const id = `desktop-ask:${randomUUID()}`;
    const local = new AbortController();
    const { promise, resolve, reject } = Promise.withResolvers<AskResult | undefined>();
    let settled = false;
    const cleanup = () => {
      this.pending.delete(id);
      options?.signal?.removeEventListener("abort", onAbort);
      this.broadcast({ type: "extension_ui_request", id: `cancel:${id}`, method: "cancel", targetId: id });
      local.abort();
    };
    const settle = (result: AskResult | undefined) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onAbort = () => settle(undefined);
    const frame: Frame = { type: "extension_ui_request", id, method: "ask", questions };
    this.pending.set(id, { frame, questions, settle });
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    this.broadcast(frame);
    // The original native dialog owns local interaction and native timeout policy.
    // Aborting its private signal closes only this losing dialog, not the turn.
    void Promise.resolve().then(() => original(questions, { ...options, signal: local.signal })).then((result) => {
      if (settled) return;
      settle(result);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    return promise;
  }

  dispose(): void {
    for (const ask of this.pending.values()) ask.settle(undefined);
    for (const socket of this.connections) socket.destroy();
    this.connections.clear();
    this.clients.clear();
    this.server?.close();
    this.server = undefined;
    const metadata = this.metadata;
    this.metadata = undefined;
    if (!metadata) return;
    try {
      const owner = JSON.parse(readFileSync(this.metadataPath, "utf8")) as DesktopSessionMetadata;
      if (owner.pid === process.pid && owner.token === metadata.token) unlinkSync(this.metadataPath);
    } catch { /* another owner or already removed */ }
    if (process.platform !== "win32") { try { unlinkSync(metadata.socketPath); } catch { /* already closed */ } }
  }
}

/** Load with `omp -e /path/to/ompweb/extensions/desktop-bridge.ts`. */
export default function desktopBridgeExtension(api: ExtensionAPI): void {
  let bridge: DesktopBridge | undefined;
  let restore: (() => void) | undefined;
  const install = async (_event: Frame, context: Context) => {
    if (context.mode !== "tui" || context.agent.kind !== "main") return;
    bridge ??= new DesktopBridge(api, context);
    await bridge.update(context);
    if (restore) return;
    // OMP scopes ctx.ui through a Proxy. Inspecting its own descriptor retrieves
    // the native function, not the session_start handler's signal-bound facade.
    const descriptor = Object.getOwnPropertyDescriptor(context.ui, "askDialog");
    if (typeof descriptor?.value !== "function") throw new Error("Desktop bridge requires OMP's native structured Ask dialog");
    const original = descriptor.value as AskDialog;
    const wrapped: AskDialog = (questions, options) => bridge!.ask(original, questions, options);
    Object.defineProperty(context.ui, "askDialog", { ...descriptor, value: wrapped });
    restore = () => {
      if (Object.getOwnPropertyDescriptor(context.ui, "askDialog")?.value === wrapped) Object.defineProperty(context.ui, "askDialog", descriptor);
    };
  };
  for (const event of ["session_start", "session_switch", "session_branch"]) api.on(event, install);
  for (const event of [
    "agent_start", "agent_end", "turn_start", "turn_end", "message_start", "message_update", "message_end",
    "tool_execution_start", "tool_execution_update", "tool_execution_end", "auto_compaction_start", "auto_compaction_end",
    "auto_retry_start", "auto_retry_end", "session_before_compact", "session.compacting", "session_compact",
    "session_settled", "subagent_start", "subagent_progress", "subagent_end", "notice",
  ]) api.on(event, async (frame, context) => {
    if (!bridge) return;
    await bridge.update(context);
    bridge.event(frame);
  });
  api.on("session_shutdown", () => {
    restore?.();
    restore = undefined;
    bridge?.dispose();
    bridge = undefined;
  });
}

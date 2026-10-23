import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { getAgentDir } from "./omp/paths";
import { deliverScheduledMessage } from "./rpc-manager";
import { isRecord } from "./type-guards";

/**
 * Messages the user asked to send to a session at a later time (e.g. right
 * after a provider quota resets). They live on the server, not in the tab, so
 * they fire with the browser closed; the list is persisted in the agent dir
 * and re-armed on startup, so a restart does not drop them. A message whose
 * time passed while omp-web was down is sent as soon as it starts again.
 */
export interface ScheduledMessage {
  id: string;
  sessionId: string;
  message: string;
  /** Epoch ms. */
  sendAt: number;
  createdAt: number;
  /** Spawn the session's omp with --advisor if it has to be started. */
  advisor: boolean;
  /** Set when delivery failed; the entry stays until retried or cancelled. */
  error?: string;
}

/** Longest allowed delay; also bounds how stale a schedule can get. */
export const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SCHEDULED_MESSAGE_CHARS = 100_000;
// setTimeout overflows above 2^31-1 ms (~24.8 days): longer waits re-arm in steps.
const MAX_TIMER_MS = 2_147_483_647;

type Deliver = (entry: ScheduledMessage) => Promise<void>;

interface SchedulerState {
  timers: Map<string, NodeJS.Timeout>;
  armed: boolean;
}

declare global {
  var __ompScheduledMessages: SchedulerState | undefined;
}

// On globalThis so timers survive Next.js hot-reload and every route bundle
// shares one scheduler.
function state(): SchedulerState {
  globalThis.__ompScheduledMessages ??= { timers: new Map(), armed: false };
  return globalThis.__ompScheduledMessages;
}

function storePath(): string {
  return resolve(getAgentDir(), "omp-web-scheduled-messages.json");
}

function parseEntry(raw: unknown): ScheduledMessage | null {
  if (!isRecord(raw)) return null;
  const { id, sessionId, message, sendAt, createdAt, advisor, error } = raw;
  if (typeof id !== "string" || typeof sessionId !== "string" || typeof message !== "string") return null;
  if (typeof sendAt !== "number" || !Number.isFinite(sendAt)) return null;
  return {
    id,
    sessionId,
    message,
    sendAt,
    createdAt: typeof createdAt === "number" ? createdAt : sendAt,
    advisor: advisor === true,
    ...(typeof error === "string" ? { error } : {}),
  };
}

export function loadScheduledMessages(): ScheduledMessage[] {
  try {
    const path = storePath();
    if (!existsSync(path)) return [];
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const list = isRecord(raw) && Array.isArray(raw.messages) ? raw.messages : [];
    return list.map(parseEntry).filter((entry): entry is ScheduledMessage => entry !== null);
  } catch {
    return [];
  }
}

function saveScheduledMessages(messages: ScheduledMessage[]): void {
  const path = storePath();
  if (messages.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  // Message text is private: owner-only, like the rest of the agent dir.
  writeFileSync(temp, `${JSON.stringify({ messages }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

function updateEntry(id: string, change: (entry: ScheduledMessage) => ScheduledMessage | null): ScheduledMessage | null {
  let result: ScheduledMessage | null = null;
  const next = loadScheduledMessages().flatMap((entry) => {
    if (entry.id !== id) return [entry];
    result = change(entry);
    return result ? [result] : [];
  });
  saveScheduledMessages(next);
  return result;
}

async function defaultDeliver(entry: ScheduledMessage): Promise<void> {
  await deliverScheduledMessage(entry.sessionId, entry.message, entry.advisor);
}

let deliver: Deliver = defaultDeliver;

/** Test seam: replace the delivery to the omp session. */
export function setScheduledMessageDelivery(next: Deliver | null): void {
  deliver = next ?? defaultDeliver;
}

async function fire(id: string): Promise<void> {
  state().timers.delete(id);
  const entry = loadScheduledMessages().find((item) => item.id === id);
  if (!entry || entry.error) return;
  if (entry.sendAt > Date.now()) {
    arm(entry);
    return;
  }
  try {
    await deliver(entry);
    updateEntry(id, () => null);
    console.log(`[omp-web] sent scheduled message ${id} to session ${entry.sessionId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateEntry(id, (current) => ({ ...current, error: message }));
    console.warn(`[omp-web] scheduled message ${id} failed: ${message}`);
  }
}

function arm(entry: ScheduledMessage): void {
  const { timers } = state();
  clearTimeout(timers.get(entry.id));
  if (entry.error) {
    timers.delete(entry.id);
    return;
  }
  const delay = Math.min(MAX_TIMER_MS, Math.max(0, entry.sendAt - Date.now()));
  const timer = setTimeout(() => { void fire(entry.id); }, delay);
  // Pending messages must not keep a shutting-down server alive.
  timer.unref?.();
  timers.set(entry.id, timer);
}

/** Arm every persisted message once per process (startup and first API use). */
export function ensureScheduledMessagesArmed(): void {
  const current = state();
  if (current.armed) return;
  current.armed = true;
  for (const entry of loadScheduledMessages()) arm(entry);
}

export function listScheduledMessages(sessionId: string): ScheduledMessage[] {
  ensureScheduledMessagesArmed();
  return loadScheduledMessages()
    .filter((entry) => entry.sessionId === sessionId)
    .sort((a, b) => a.sendAt - b.sendAt);
}

export class ScheduleValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function validateSendAt(sendAt: unknown, now: number): number {
  if (typeof sendAt !== "number" || !Number.isFinite(sendAt)) {
    throw new ScheduleValidationError("sendAt must be a timestamp in milliseconds", "invalid_send_at");
  }
  if (sendAt > now + MAX_SCHEDULE_AHEAD_MS) {
    throw new ScheduleValidationError("Messages can be scheduled at most 30 days ahead", "send_at_too_far");
  }
  // A time already past means "now" (e.g. a reset that just happened).
  return Math.max(sendAt, now);
}

export function scheduleMessage(input: { sessionId: string; message: unknown; sendAt: unknown; advisor?: unknown }, now = Date.now()): ScheduledMessage {
  ensureScheduledMessagesArmed();
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw new ScheduleValidationError("Message is required", "message_required");
  if (message.length > MAX_SCHEDULED_MESSAGE_CHARS) {
    throw new ScheduleValidationError("Message is too long to schedule", "message_too_long");
  }
  const entry: ScheduledMessage = {
    id: randomUUID(),
    sessionId: input.sessionId,
    message,
    sendAt: validateSendAt(input.sendAt, now),
    createdAt: now,
    advisor: input.advisor === true,
  };
  saveScheduledMessages([...loadScheduledMessages(), entry]);
  arm(entry);
  return entry;
}

/** Change the time (also how "send now" and "retry" work: both clear an error). */
export function rescheduleMessage(sessionId: string, id: string, sendAt: unknown, now = Date.now()): ScheduledMessage | null {
  ensureScheduledMessagesArmed();
  const when = validateSendAt(sendAt, now);
  const entry = updateEntry(id, (current) => current.sessionId === sessionId
    ? { id: current.id, sessionId: current.sessionId, message: current.message, createdAt: current.createdAt, advisor: current.advisor, sendAt: when }
    : current);
  if (!entry || entry.sessionId !== sessionId) return null;
  arm(entry);
  return entry;
}

export function cancelScheduledMessage(sessionId: string, id: string): boolean {
  ensureScheduledMessagesArmed();
  let removed = false;
  updateEntry(id, (current) => {
    if (current.sessionId !== sessionId) return current;
    removed = true;
    return null;
  });
  if (removed) {
    clearTimeout(state().timers.get(id));
    state().timers.delete(id);
  }
  return removed;
}

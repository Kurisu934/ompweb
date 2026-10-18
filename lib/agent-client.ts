// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

import { formatApiError } from "@/lib/i18n/api-error";

export class AgentCommandError extends Error {
  readonly kind: "refusal" | "unknown";
  readonly code?: string;
  readonly status?: number;
  readonly payload?: unknown;

  constructor(
    message: string,
    options: { kind: "refusal" | "unknown"; code?: string; status?: number; payload?: unknown },
  ) {
    super(message);
    this.name = "AgentCommandError";
    this.kind = options.kind;
    this.code = options.code;
    this.status = options.status;
    this.payload = options.payload;
  }
}

export class AgentCommandRefusalError extends AgentCommandError {
  constructor(message: string, options?: { code?: string; status?: number; payload?: unknown }) {
    super(message, { kind: "refusal", ...options });
    this.name = "AgentCommandRefusalError";
  }
}

export class AgentCommandUnknownError extends AgentCommandError {
  constructor(message: string, options?: { code?: string; status?: number; payload?: unknown }) {
    super(message, { kind: "unknown", ...options });
    this.name = "AgentCommandUnknownError";
  }
}

export function isAgentCommandRefusal(error: unknown): error is AgentCommandRefusalError {
  return error instanceof AgentCommandRefusalError || (error instanceof AgentCommandError && error.kind === "refusal");
}

export function isAgentCommandUnknown(error: unknown): error is AgentCommandUnknownError {
  return error instanceof AgentCommandUnknownError || (error instanceof AgentCommandError && error.kind === "unknown");
}

// Sessions whose per-chat advisor toggle is on: their lazily spawned omp
// process must start with --advisor. Keyed by session id because the spawn
// decision happens inside the route, which only sees id + query string.
const advisorSpawnSessions = new Set<string>();

export function setSessionAdvisorSpawn(sessionId: string, enabled: boolean) {
  if (enabled) advisorSpawnSessions.add(sessionId);
  else advisorSpawnSessions.delete(sessionId);
}

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<T> {
  const query = advisorSpawnSessions.has(sessionId) ? "?advisor=1" : "";
  let res: Response;
  try {
    res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AgentCommandUnknownError(message || "Network request failed");
  }

  let jsonParsed = false;
  let body: {
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
  } = {};

  try {
    if (typeof res.json === "function") {
      body = (await res.json()) ?? {};
      jsonParsed = true;
    } else if (typeof res.text === "function") {
      const raw = await res.text();
      if (raw) {
        body = JSON.parse(raw);
        jsonParsed = true;
      }
    }
  } catch {
    jsonParsed = false;
  }

  // Must be a valid JSON object envelope
  if (!jsonParsed || typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AgentCommandUnknownError(
      res.ok ? "Malformed response from server" : `HTTP ${res.status}`,
      { status: res.status },
    );
  }

  // 5xx errors, timeouts, or gateway failures indicate delivery state is unknown
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    const message = body.error || (body.code ? formatApiError(body) : `HTTP ${res.status}`);
    throw new AgentCommandUnknownError(message, { code: body.code, status: res.status, payload: body });
  }

  // Handle errors
  if (!res.ok || body.error || body.success === false) {
    const errorMsg = typeof body.error === "string" && body.error.trim().length > 0 ? body.error : undefined;
    const isTimeout = /timeout/i.test(errorMsg ?? "") || /timeout/i.test(body.code ?? "");
    if (isTimeout) {
      throw new AgentCommandUnknownError(errorMsg ?? "Command timed out", { code: body.code, status: res.status, payload: body });
    }

    // Conservative check: confirmed refusal requires structured error or code on 4xx (or explicit error with 200)
    if (errorMsg || body.code) {
      const message = errorMsg || body.code ? formatApiError(body) : `HTTP ${res.status}`;
      throw new AgentCommandRefusalError(message, { code: body.code, status: res.status, payload: body });
    }

    // Missing structured refusal details -> unknown
    throw new AgentCommandUnknownError(`HTTP ${res.status}`, { status: res.status, payload: body });
  }

  // Confirmed success requires success: true
  if (body.success !== true) {
    throw new AgentCommandUnknownError("Malformed response envelope from server", { status: res.status, payload: body });
  }

  return body.data as T;
}

/**
 * "Needs you" items: everything an agent is blocked on until the user acts.
 * Session items come from omp's pending dialogs (select/confirm/input/editor/
 * ask/open_url), tracked per session by rpc-manager and broadcast on the
 * running-sessions SSE; sudo password requests come from lib/askpass.ts.
 * Client-safe: no Node imports.
 */

export type AttentionKind = "select" | "confirm" | "input" | "editor" | "ask" | "open_url" | "password";

export interface AttentionItem {
  /** Unique across kinds: the dialog/askpass request id. */
  id: string;
  kind: AttentionKind;
  sessionId: string;
  sessionName?: string;
  cwd: string;
  /** What is being asked, already shortened for a one-line list. */
  title: string;
  createdAt: number;
}

const TITLE_MAX = 120;

function shorten(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

const DIALOG_KINDS = new Set<AttentionKind>(["select", "confirm", "input", "editor", "ask", "open_url"]);

/** The one-line question of a pending omp dialog, or null for a non-blocking frame. */
export function dialogAttention(event: Record<string, unknown>): { kind: AttentionKind; title: string } | null {
  const kind = event.method as AttentionKind;
  if (!DIALOG_KINDS.has(kind)) return null;
  let title = "";
  if (kind === "ask" && Array.isArray(event.questions)) {
    const first = event.questions[0] as { question?: unknown; header?: unknown } | undefined;
    const text = typeof first?.question === "string" ? first.question : typeof first?.header === "string" ? first.header : "";
    const more = event.questions.length - 1;
    title = more > 0 ? `${text} (+${more})` : text;
  } else if (kind === "open_url" && typeof event.url === "string") {
    title = event.url;
  } else if (typeof event.title === "string") {
    title = event.title;
  }
  return { kind, title: shorten(title) };
}

/** Oldest first, so the list reads in the order the agents started waiting. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

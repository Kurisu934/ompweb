/**
 * Sidebar session filters (Workspaces header → Filter menu). Pure so the
 * client sidebar and tests share one definition.
 *
 * Status options combine with OR (a session matching any selected status
 * passes); the activity window then narrows that set (AND).
 */

export type SessionStatusFilter = "running" | "unread" | "exited";
export type SessionActivityWindow = "any" | "24h" | "7d";

export interface SessionFilters {
  statuses: readonly SessionStatusFilter[];
  activity: SessionActivityWindow;
}

export const SESSION_STATUS_FILTERS: readonly SessionStatusFilter[] = ["running", "unread", "exited"];
export const SESSION_ACTIVITY_WINDOWS: readonly SessionActivityWindow[] = ["any", "24h", "7d"];
export const DEFAULT_SESSION_FILTERS: SessionFilters = { statuses: [], activity: "any" };

const ACTIVITY_WINDOW_MS: Record<Exclude<SessionActivityWindow, "any">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

/** Live state the session list itself does not carry. */
export interface SessionFilterContext {
  running: ReadonlySet<string>;
  unread: ReadonlySet<string>;
  exited: ReadonlySet<string>;
  now: number;
}

export function countActiveSessionFilters(filters: SessionFilters): number {
  return filters.statuses.length + (filters.activity === "any" ? 0 : 1);
}

export function sessionHasStatus(id: string, status: SessionStatusFilter, ctx: SessionFilterContext): boolean {
  return status === "running" ? ctx.running.has(id) : status === "unread" ? ctx.unread.has(id) : ctx.exited.has(id);
}

/** A running session counts as active now even if its file was last written earlier. */
export function sessionActiveWithin(session: { id: string; modified: string }, window: SessionActivityWindow, ctx: SessionFilterContext): boolean {
  if (window === "any" || ctx.running.has(session.id)) return true;
  const modified = Date.parse(session.modified);
  return Number.isFinite(modified) && ctx.now - modified <= ACTIVITY_WINDOW_MS[window];
}

export function matchesSessionFilters(session: { id: string; modified: string }, filters: SessionFilters, ctx: SessionFilterContext): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.some((status) => sessionHasStatus(session.id, status, ctx))) return false;
  return sessionActiveWithin(session, filters.activity, ctx);
}

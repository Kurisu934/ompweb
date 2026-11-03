import { comparableProjectPath } from "./comparable-path";
import type { ManagedProject, SessionInfo } from "./types";
import { workspaceKeyOf } from "./workspace-memory";

// ============================================================================
// Pure ordering/grouping helpers shared between the sidebar and unit tests.
// All keys are canonical projectRoot paths (worktrees collapse into their main
// repo via resolveProject), so worktree sessions group under their project.
//
// The project list is ordered by when each project was added (addedAt desc =
// most recently added first), NOT by session activity: activity changes on
// every session refresh (agent runs, message edits, unread transitions) and
// would make project rows jump around constantly. Registration order is
// stable — it only changes when the user explicitly adds a project.
// Session-discovered projects (no addedAt) follow the registered ones in
// path order, which is also stable. Pinned projects always form a leading
// section; every rule above applies within each section.
// ============================================================================

/** Sort projects pinned-first, then by manual sortOrder, then most-recently-
 *  added (addedAt desc), then by path for a deterministic order. Projects
 *  without addedAt (session-discovered) always sort below registered ones.
 *  The order never depends on session activity, so project rows stay put
 *  while sessions refresh. */
export function sortManagedProjects(projects: ManagedProject[]): ManagedProject[] {
  return [...projects].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const aManual = a.sortOrder !== undefined;
    const bManual = b.sortOrder !== undefined;
    if (aManual !== bManual) return aManual ? -1 : 1;
    if (aManual && bManual && a.sortOrder !== b.sortOrder) return a.sortOrder! - b.sortOrder!;
    const aHas = a.addedAt !== undefined;
    const bHas = b.addedAt !== undefined;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas) {
      const byAdded = b.addedAt!.localeCompare(a.addedAt!);
      if (byAdded !== 0) return byAdded;
    }
    return a.path.localeCompare(b.path);
  });
}

/** Where a dragged project lands: next to another row, or appended to a
 *  section (pinning appends to the end of the pinned section, unpinning puts
 *  the project at the top of the unpinned one). */
export type ProjectDropTarget =
  | { path: string; position: "before" | "after" }
  | { pinned: boolean };

/** Move one project within a pinned-first ordered list. The moved project
 *  adopts its destination's section (dropping next to a pinned row pins it).
 *  Returns the full new order, or null when nothing would change. */
export function moveManagedProject(
  ordered: ManagedProject[],
  sourcePath: string,
  target: ProjectDropTarget,
): ManagedProject[] | null {
  const from = ordered.findIndex((project) => project.path === sourcePath);
  if (from < 0) return null;
  const source = ordered[from]!;
  const rest = ordered.filter((_, index) => index !== from);
  let index: number;
  let pinned: boolean;
  if ("path" in target) {
    if (target.path === sourcePath) return null;
    const targetIndex = rest.findIndex((project) => project.path === target.path);
    if (targetIndex < 0) return null;
    pinned = Boolean(rest[targetIndex]!.pinned);
    index = target.position === "before" ? targetIndex : targetIndex + 1;
  } else {
    pinned = target.pinned;
    index = rest.filter((project) => project.pinned).length;
  }
  const moved: ManagedProject = { ...source, pinned: pinned || undefined };
  rest.splice(index, 0, moved);
  const unchanged = Boolean(source.pinned) === pinned && rest.every((project, i) => project.path === ordered[i]!.path);
  return unchanged ? null : rest;
}

/** Keyboard/menu reorder: swap with the neighbor in the same section.
 *  Returns null at a section boundary (moving never changes pinned state). */
export function shiftManagedProject(ordered: ManagedProject[], path: string, delta: -1 | 1): ManagedProject[] | null {
  const index = ordered.findIndex((project) => project.path === path);
  const neighbor = index < 0 ? undefined : ordered[index + delta];
  if (!neighbor || Boolean(neighbor.pinned) !== Boolean(ordered[index]!.pinned)) return null;
  return moveManagedProject(ordered, path, { path: neighbor.path, position: delta < 0 ? "before" : "after" });
}
/** Running/unread/exit session counts per project, for the activity indicators
 *  on project rows. Keys are the case-folded comparable form of the projectRoot
 *  so casing-only differences (Windows/NTFS) still resolve — callers must
 *  look up with comparableProjectPath(project.path). */
export function projectActivityCounts(
  sessions: SessionInfo[],
  runningIds: Iterable<string>,
  unreadIds: Iterable<string>,
  exitedIds: Iterable<string> = [],
): Map<string, { running: number; unread: number; exited: number }> {
  const running = new Set(runningIds);
  const unread = new Set(unreadIds);
  const exited = new Set(exitedIds);
  const result = new Map<string, { running: number; unread: number; exited: number }>();
  for (const session of sessions) {
    const key = workspaceKeyOf(session);
    if (!key) continue;
    const folded = comparableProjectPath(session.projectKey ?? key);
    const current = result.get(folded) ?? { running: 0, unread: 0, exited: 0 };
    if (running.has(session.id)) current.running += 1;
    if (unread.has(session.id)) current.unread += 1;
    if (exited.has(session.id)) current.exited += 1;
    result.set(folded, current);
  }
  return result;
}

/** Group sessions under their project. Every project in `projects` gets an
 *  entry (possibly empty) so empty managed projects render their empty state.
 *  Buckets are keyed by the exact project path for callers; sessions are
 *  matched through a case-folded lookup (Windows/NTFS is case-insensitive and
 *  session-file cwds can carry different casing than the registered path), so
 *  casing-only differences land in the right bucket instead of silently
 *  dropping the session from the sidebar. */
export function groupSessionsByProject(
  projects: ManagedProject[],
  sessions: SessionInfo[],
): Map<string, SessionInfo[]> {
  const grouped = new Map<string, SessionInfo[]>();
  const bucketByKey = new Map<string, SessionInfo[]>();
  for (const project of projects) {
    const bucket: SessionInfo[] = [];
    grouped.set(project.path, bucket);
    bucketByKey.set(comparableProjectPath(project.path), bucket);
  }
  for (const session of sessions) {
    const key = workspaceKeyOf(session);
    if (!key) continue;
    // workspaceKeyOf already prefers projectKey, so this IS the session's
    // key; bucketByKey covers every registered project under its case-folded
    // path, and an exact-case fallback here could only hit when the folded
    // lookup already did — otherwise it silently dropped the session.
    const bucket = bucketByKey.get(comparableProjectPath(key));
    if (bucket) bucket.push(session);
  }
  return grouped;
}

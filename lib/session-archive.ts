import { archiveSessionFileWithArtifacts } from "./omp/session-files";
import { clearExitedRpcSession, getRpcSession } from "./rpc-manager";
import { invalidateSessionListCache, invalidateSessionPathCache, listAllSessions } from "./session-reader";

/** Archived sessions are moved by leaf first: a parent with live children would
 * leave them pointing at a path that no longer exists, flattening the tree. */
export async function sessionHasChildren(sessionId: string): Promise<boolean> {
  return (await listAllSessions()).some((session) => session.parentSessionId === sessionId);
}

/** Stop the live child, then archive the native OMP JSONL and its sibling
 * artifacts using OMP's gc layout. Returns the archive path. */
export async function archiveSession(sessionId: string, filePath: string): Promise<string> {
  // OMP owns writes while a child is live; wait for its final flush before
  // moving the file so the archive contains the complete native transcript.
  await getRpcSession(sessionId)?.destroyAndWait();
  const archivedPath = archiveSessionFileWithArtifacts(filePath);
  clearExitedRpcSession(sessionId);
  invalidateSessionPathCache(sessionId);
  // The file is gone: full flush is correct (drops its caches + refreshes list).
  invalidateSessionListCache();
  return archivedPath;
}

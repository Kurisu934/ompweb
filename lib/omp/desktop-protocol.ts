import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

/** Deliberately disjoint from all other OMP integrations, including Telegram. */
export const DESKTOP_BRIDGE_PROTOCOL = "omp-web-desktop/v1";
export interface DesktopSessionMetadata {
  version: 1;
  protocol: typeof DESKTOP_BRIDGE_PROTOCOL;
  pid: number;
  sessionId: string;
  sessionFile: string;
  socketPath: string;
  token: string;
}
export function getDesktopSessionsDir(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".omp", "agent"), "web-desktop-sessions");
}
export function canonicalSessionPath(file: string): string {
  try { return realpathSync.native(file); } catch { return resolve(file); }
}
export function getSessionFileHash(file: string): string {
  return createHash("sha256").update(canonicalSessionPath(file)).digest("hex");
}
export function getSessionMetadataPath(file: string): string {
  return join(getDesktopSessionsDir(), `${getSessionFileHash(file)}.json`);
}
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

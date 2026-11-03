import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { getAgentDir } from "./omp/paths";
import { isRecord } from "./type-guards";
import { DEFAULT_MEMORY_GUARD, parseMemoryGuardSettings, type MemoryGuardSettings } from "./memory-guard-settings";

/** omp-web's own server-side settings (omp's config.yml stays omp's). */
export interface WebServerSettings {
  /** Resume sessions that were mid-run when omp-web stopped. */
  autoResumeSessions: boolean;
  /**
   * Environment variables merged into the `omp` child process (issue #104).
   * Stored as a validated record; lib/omp/agent-env.ts owns the policy and
   * re-checks every name before handing it to a spawn.
   */
  agentEnv: Record<string, string>;
  /** Directory picker shortcuts (jump targets), in the user's order. */
  favoriteDirectories: string[];
  /** Kills runaway agent/terminal commands before the system runs out of memory. */
  memoryGuard: MemoryGuardSettings;
}

const DEFAULTS: WebServerSettings = {
  autoResumeSessions: false,
  agentEnv: {},
  favoriteDirectories: [],
  memoryGuard: DEFAULT_MEMORY_GUARD,
};

export const MAX_FAVORITE_DIRECTORIES = 50;
const MAX_FAVORITE_PATH_LENGTH = 4096;

/** Validated, de-duplicated favorite directory list, or null when malformed.
 * Paths are only stored here; browsing them still goes through the
 * directory picker's own access rules. */
export function parseFavoriteDirectories(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_FAVORITE_DIRECTORIES) return null;
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") return null;
    const path = entry.trim();
    if (!path || path.length > MAX_FAVORITE_PATH_LENGTH || path.includes("\0")) return null;
    seen.add(path);
  }
  return [...seen];
}

/** String-valued entries only — the allow-list lives in lib/omp/agent-env.ts. */
function readAgentEnvRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries: Array<[string, string]> = [];
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "string") entries.push([name, entry]);
  }
  return Object.fromEntries(entries);
}

function settingsPath(): string {
  return resolve(getAgentDir(), "omp-web-settings.json");
}

declare global {
  // Shared across module instances (instrumentation and route bundles).
  var __ompWebSettingsCache: { path: string; settings: WebServerSettings } | undefined;
}

export function loadWebServerSettings(): WebServerSettings {
  const path = settingsPath();
  const cached = globalThis.__ompWebSettingsCache;
  if (cached?.path === path) return cached.settings;
  let settings = DEFAULTS;
  try {
    if (existsSync(path)) {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (isRecord(raw)) {
        settings = {
          autoResumeSessions: raw.autoResumeSessions === true,
          agentEnv: readAgentEnvRecord(raw.agentEnv),
          favoriteDirectories: parseFavoriteDirectories(raw.favoriteDirectories) ?? [],
          memoryGuard: parseMemoryGuardSettings(raw.memoryGuard),
        };
      }
    }
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  globalThis.__ompWebSettingsCache = { path, settings };
  return settings;
}

/** Atomic write (temp file + rename), like the project registry. */
export function saveWebServerSettings(patch: Partial<WebServerSettings>): WebServerSettings {
  const path = settingsPath();
  const settings = { ...loadWebServerSettings(), ...patch };
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  } finally {
    try {
      if (existsSync(temp)) rmSync(temp);
    } catch {
      // ignore cleanup failures
    }
  }
  globalThis.__ompWebSettingsCache = { path, settings };
  return settings;
}

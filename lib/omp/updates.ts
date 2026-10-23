import { execFile } from "child_process";
import { resolveOmpBin, wrapWindowsScript } from "./omp-cli";

export interface OmpUpdateStatus {
  currentVersion: string | null;
  availableVersion: string | null;
  updateAvailable: boolean;
  updateCommand: string;
}

// omp gives up on the npm registry after 30s and prints why; outlast that so
// a slow registry or proxy surfaces omp's own reason instead of a bare kill.
export const OMP_UPDATE_CHECK_TIMEOUT_MS = 45_000;
export const OMP_UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

/** Run a raw `omp update [args]` subcommand. Install durability
 * (lease/status/retry) lives in lib/self-update.ts. */
export function runOmpUpdate(args: string[], timeoutMs = OMP_UPDATE_CHECK_TIMEOUT_MS): Promise<string> {
  const bin = resolveOmpBin();
  if (!bin) return Promise.reject(new Error("omp binary not found. Install oh-my-pi or set OMP_WEB_OMP_BIN."));
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const target = wrapWindowsScript(bin, ["update", ...args]);
  execFile(target.file, target.args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    windowsHide: true,
  }, (error, stdout, stderr) => {
    if (error) {
      const detail = (stderr || stdout).trim();
      const reason = detail || (error.killed ? `omp update timed out after ${Math.round(timeoutMs / 1000)}s` : error.message);
      reject(new Error(reason.slice(-1000)));
    }
    else resolve(`${stdout}\n${stderr}`.trim());
  });
  return promise;
}

export function parseOmpUpdateStatus(output: string): OmpUpdateStatus {
  const currentVersion = output.match(/^Current version:\s*(\S+)/mi)?.[1] ?? null;
  const availableVersion = output.match(/^New version available:\s*(\S+)/mi)?.[1] ?? null;
  return {
    currentVersion,
    availableVersion,
    updateAvailable: availableVersion !== null,
    updateCommand: "omp update",
  };
}

export function createCachedOmpUpdateCheck(
  run: () => Promise<string> = () => runOmpUpdate(["--check"]),
  now: () => number = () => Date.now(),
) {
  let cached: { checkedAt: number; status: OmpUpdateStatus } | null = null;
  let inFlight: Promise<OmpUpdateStatus> | null = null;

  return async (force = false): Promise<OmpUpdateStatus> => {
    const currentTime = now();
    if (!force && cached && currentTime - cached.checkedAt < OMP_UPDATE_CHECK_TTL_MS) {
      return cached.status;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = (async () => {
      try {
        const output = await run();
        const status = parseOmpUpdateStatus(output);
        cached = { checkedAt: now(), status };
        return status;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };
}

const defaultCachedOmpUpdateCheck = createCachedOmpUpdateCheck();

/** The OMP runtime is updated independently of omp-web: `OMP_WEB_DISABLE_AUTOUPDATE` covers only omp-web itself. */
export async function checkOmpUpdate(force = false): Promise<OmpUpdateStatus> {
  return defaultCachedOmpUpdateCheck(force);
}


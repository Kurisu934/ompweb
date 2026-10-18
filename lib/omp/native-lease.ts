import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSessionPath } from "./desktop-protocol";
import { getOmpVersion } from "./omp-cli";

const currentDir = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

function resolveHelperScriptPath(): string | null {
  const candidates = [
    ...(process.env.OMP_WEB_PACKAGE_DIR ? [join(process.env.OMP_WEB_PACKAGE_DIR, "lib", "omp", "native-lease-helper.mjs")] : []),
    join(process.cwd(), "lib", "omp", "native-lease-helper.mjs"),
    join(currentDir, "native-lease-helper.mjs"),
    join(currentDir, "..", "..", "..", "lib", "omp", "native-lease-helper.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export type NativeLeaseCheckResult =
  | { active: true; error?: string }
  | { active: false; error?: never };

/**
 * Authoritatively check if an active native process currently holds the OS lease
 * for this session, using a bounded helper subprocess that invokes the platform's
 * FileLock primitive.
 *
 * Fails closed (active: true) if inspection fails or times out.
 *
 * NOTE ON TOCTOU:
 * Preflight inspection verifies whether an active owner currently holds the lease.
 * However, native OMP claims its session lease only upon its first write (not at spawn).
 * Therefore, a small window exists between this preflight check and the child's first write
 * where an external process could claim the lease, causing native OMP to fork on collision.
 * Eliminating that window entirely requires core OMP runtime changes.
 */
export async function inspectNativeSessionLease(
  sessionId: string,
  ompVersion?: string,
  env?: Record<string, string | undefined>,
): Promise<NativeLeaseCheckResult> {
  if (!sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    return { active: true, error: "Invalid session ID for native lease inspection" };
  }

  const rawVersion = ompVersion ?? (await getOmpVersion()) ?? undefined;
  const version = rawVersion ? (/(\d+\.\d+\.\d+)/.exec(rawVersion)?.[1] ?? rawVersion.replace(/^omp\/|^v/i, "").trim()) : undefined;
  const helperPath = resolveHelperScriptPath();
  if (!helperPath) {
    return { active: true, error: "Cannot locate native-lease-helper.mjs in package or server paths" };
  }

  const effectiveEnv = { ...process.env, ...env };

  return new Promise<NativeLeaseCheckResult>((resolve) => {
    const args = [helperPath, sessionId, ...(version ? [version] : [])];
    execFile(
      process.execPath,
      args,
      { timeout: 3000, env: effectiveEnv },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || error.message || "").trim();
          return resolve({ active: true, error: detail || "Native lease inspection helper failed" });
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as { acquired?: boolean; active?: boolean };
          if (typeof parsed.active === "boolean") {
            return resolve({ active: parsed.active });
          }
          return resolve({ active: true, error: "Unexpected native lease helper output" });
        } catch (parseErr) {
          return resolve({ active: true, error: `Invalid JSON from native lease helper: ${(parseErr as Error).message}` });
        }
      },
    );
  });
}

export type WebReservationResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; holder?: number; error?: string };

/**
 * Cross-process reservation lock coordinating multiple Web processes to prevent concurrent
 * double-resumes of the same session file.
 * Uses an OS FileLock held by a bounded helper with an open stdin pipe.
 * The OS automatically cleans up the lock if the holding process crashes or exits.
 */
export async function acquireWebResumeReservation(
  sessionFileOrId: string,
  ompVersion?: string,
  env?: Record<string, string | undefined>,
): Promise<WebReservationResult> {
  const helperPath = resolveHelperScriptPath();
  if (!helperPath) {
    return { ok: false, error: "Cannot locate native-lease-helper.mjs in package or server paths" };
  }

  const canonicalTarget = canonicalSessionPath(sessionFileOrId);
  const safeKey = createHash("sha256").update(canonicalTarget).digest("hex").slice(0, 32);

  const rawVersion = ompVersion ?? (await getOmpVersion()) ?? undefined;
  const version = rawVersion ? (/(\d+\.\d+\.\d+)/.exec(rawVersion)?.[1] ?? rawVersion.replace(/^omp\/|^v/i, "").trim()) : undefined;
  const effectiveEnv = { ...process.env, ...env };

  return new Promise<WebReservationResult>((resolve) => {
    let settled = false;
    const args = [helperPath, "--reserve", safeKey, ...(version ? [version] : [])];
    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: effectiveEnv,
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.stdin.end(); child.kill(); } catch {}
        resolve({ ok: false, error: "Reservation helper handshake timed out" });
      }
    }, 3000);

    const finish = (result: WebReservationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString("utf8");
      const newlineIdx = stdoutData.indexOf("\n");
      if (newlineIdx !== -1 && !settled) {
        const line = stdoutData.slice(0, newlineIdx).trim();
        try {
          const parsed = JSON.parse(line) as { acquired?: boolean; active?: boolean };
          if (parsed.acquired === true) {
            return finish({
              ok: true,
              release: async () => {
                try {
                  child.stdin.end();
                  child.kill();
                  await new Promise<void>((r) => {
                    child.once("exit", () => r());
                    setTimeout(r, 500);
                  });
                } catch {}
              },
            });
          }
          try { child.stdin.end(); child.kill(); } catch {}
          return finish({ ok: false, error: "Reservation is held by another process" });
        } catch (parseErr) {
          try { child.stdin.end(); child.kill(); } catch {}
          return finish({ ok: false, error: `Invalid reservation response: ${(parseErr as Error).message}` });
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString("utf8");
    });

    child.once("error", (err) => {
      finish({ ok: false, error: err.message });
    });

    child.once("exit", (code) => {
      finish({ ok: false, error: stderrData.trim() || `Reservation helper exited with code ${code}` });
    });
  });
}

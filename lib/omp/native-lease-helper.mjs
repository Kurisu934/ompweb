import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import cp from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function getOmpVersionFromBinary(env) {
  const override = env.OMP_WEB_OMP_BIN;
  let bin = override && fs.existsSync(override) ? override : null;
  if (!bin) {
    const binName = process.platform === "win32" ? "omp.exe" : "omp";
    const dirs = [
      ...(env.PATH ?? "").split(path.delimiter),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(os.homedir(), ".bun", "bin"),
      path.join(os.homedir(), ".local", "bin"),
    ];
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = path.join(dir, binName);
      if (fs.existsSync(candidate)) {
        bin = candidate;
        break;
      }
    }
  }
  if (!bin) return null;
  try {
    const raw = cp.execFileSync(bin, ["--version"], { timeout: 3000, encoding: "utf8", windowsHide: true, env });
    const match = /(\d+\.\d+\.\d+)/.exec(raw);
    return match ? match[1] : raw.replace(/^omp\/|^v/i, "").trim();
  } catch {
    return null;
  }
}

function resolveNativesDir(env) {
  const custom = env.PI_NATIVES_DIR?.trim();
  if (custom) {
    let dir = custom;
    if (dir === "~") dir = os.homedir();
    else if (dir.startsWith("~/") || dir.startsWith("~\\")) dir = path.join(os.homedir(), dir.slice(2));
    if (path.isAbsolute(dir)) return path.normalize(dir);
  }
  const xdgDataHome = env.XDG_DATA_HOME;
  if (xdgDataHome) {
    const xdgDir = path.join(xdgDataHome, "omp", "natives");
    if (fs.existsSync(xdgDir)) return xdgDir;
  }
  return path.join(os.homedir(), ".omp", "natives");
}

function resolvePinnedAddon(pinnedVersion, env) {
  const rawVersion = pinnedVersion || getOmpVersionFromBinary(env);
  const version = rawVersion ? (/(\d+\.\d+\.\d+)/.exec(rawVersion)?.[1] ?? rawVersion.replace(/^omp\/|^v/i, "").trim()) : null;
  if (!version) {
    throw new Error("Unable to determine installed OMP runtime version for native addon pinning");
  }

  const nativesDir = resolveNativesDir(env);
  const versionDir = path.join(nativesDir, version);
  if (!fs.existsSync(versionDir) || !fs.statSync(versionDir).isDirectory()) {
    throw new Error(`Natives directory for version ${version} not found at ${versionDir}`);
  }

  const platformTag = `${process.platform}-${process.arch}`;
  let variant = null;
  if (process.arch === "x64") {
    const override = env.PI_NATIVE_VARIANT || env.__PI_NATIVE_VARIANT_CACHE;
    if (override === "modern" || override === "baseline") {
      variant = override;
    } else if (process.platform === "linux") {
      try {
        const cpuInfo = fs.readFileSync("/proc/cpuinfo", "utf8");
        variant = /\bavx2\b/i.test(cpuInfo) ? "modern" : "baseline";
      } catch {
        variant = "baseline";
      }
    } else if (process.platform === "darwin") {
      try {
        const features = cp.execFileSync("/usr/sbin/sysctl", ["-n", "machdep.cpu.leaf7_features"], { encoding: "utf8" });
        variant = /\bAVX2\b/i.test(features) ? "modern" : "baseline";
      } catch {
        variant = "baseline";
      }
    } else {
      variant = "baseline";
    }
  }

  const filenames = [];
  if (process.arch === "x64" && variant === "modern") {
    filenames.push(`pi_natives.${platformTag}-modern.node`, `pi_natives.${platformTag}-baseline.node`);
  } else if (process.arch === "x64" && variant === "baseline") {
    filenames.push(`pi_natives.${platformTag}-baseline.node`);
  } else {
    filenames.push(`pi_natives.${platformTag}.node`);
  }

  for (const filename of filenames) {
    const candidate = path.join(versionDir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No compatible native addon found in ${versionDir} (expected ${filenames.join(" or ")})`);
}

// Keep this literal: native getBaseConfigRoot joins HOME and PI_CONFIG_DIR;
// it does not expand '~', trim the value, or treat it as an absolute root.
function getBaseConfigRoot(env) {
  return path.join(os.homedir(), env.PI_CONFIG_DIR || ".omp");
}

/** Mirroring exact packages/utils/src/dirs.ts baseRootSubdir resolution (lines 394-426, 1117) */
function resolveSessionOwnersDir(env) {
  if (env.PI_TEST_SESSION_OWNERS_DIR) {
    return path.resolve(env.PI_TEST_SESSION_OWNERS_DIR);
  }
  const isXdgPlatform = ["linux", "darwin", "android"].includes(process.platform);
  const baseConfigRoot = getBaseConfigRoot(env);

  let baseStateDir = baseConfigRoot;
  if (isXdgPlatform && env.XDG_STATE_HOME) {
    const appRoot = path.join(env.XDG_STATE_HOME, "omp");
    try {
      if (fs.existsSync(appRoot)) {
        baseStateDir = appRoot;
      }
    } catch {}
  }
  return path.resolve(baseStateDir, "run", "session-owners");
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const mode = args[0] === "--reserve" ? "reserve" : "check";
  const targetId = args[0] === "--reserve" ? args[1] : args[0];
  const pinnedVersion = args[0] === "--reserve" ? args[2] : args[1];

  if (!targetId) {
    process.stderr.write("target identifier required\n");
    process.exit(2);
  }

  let addonPath;
  try {
    addonPath = resolvePinnedAddon(pinnedVersion, process.env);
  } catch (err) {
    process.stderr.write(`failed to resolve pinned native addon: ${err?.message || String(err)}\n`);
    process.exit(4);
  }

  let addon;
  try {
    addon = require(addonPath);
  } catch (err) {
    process.stderr.write(`failed to load native addon (${addonPath}): ${err?.message || String(err)}\n`);
    process.exit(5);
  }

  if (!addon.FileLock || typeof addon.FileLock.tryAcquire !== "function") {
    process.stderr.write(`FileLock not available on native addon (${addonPath})\n`);
    process.exit(6);
  }

  const ownersDir = resolveSessionOwnersDir(process.env);
  const lockFilename = mode === "reserve" ? `web-resume-${targetId}.lock` : `${targetId}.lock`;
  const lockPath = path.resolve(ownersDir, lockFilename);

  try {
    const handle = addon.FileLock.tryAcquire(lockPath);
    if (!handle || !handle.acquired) {
      process.stdout.write(JSON.stringify({ acquired: false, active: true }) + "\n");
      process.exit(0);
    }

    if (mode === "check") {
      handle.release();
      process.stdout.write(JSON.stringify({ acquired: true, active: false }) + "\n");
      process.exit(0);
    }

    // Reservation mode: hold OS lock while stdin remains open
    process.stdout.write(JSON.stringify({ acquired: true, active: false }) + "\n");
    process.stdin.resume();
    const cleanup = () => {
      try { handle.release(); } catch {}
      process.exit(0);
    };
    process.stdin.on("end", cleanup);
    process.stdin.on("close", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  } catch (err) {
    process.stderr.write(`FileLock.tryAcquire failed on ${lockPath}: ${err?.message || String(err)}\n`);
    process.exit(7);
  }
}

main();

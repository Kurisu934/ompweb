import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse } from "yaml";
import { getSettingsPath } from "./paths";
import { isRecord } from "../type-guards";

/**
 * omp settings omp-web enables by default (bin/omp-web-defaults.yml), passed
 * to session children as a `--config` overlay. omp ranks overlays above the
 * user's and the project's config.yml, so the overlay is only added while
 * neither of those sets the key; an explicit choice there (including the
 * Settings toggle) always wins. Today the only default is generate_image.
 */
const DEFAULT_KEY = ["generate_image", "enabled"] as const;

function setsDefaultKey(file: string): boolean {
  try {
    if (!existsSync(file)) return false;
    const data: unknown = parse(readFileSync(file, "utf8"));
    const section = isRecord(data) ? data[DEFAULT_KEY[0]] : undefined;
    return isRecord(section) && section[DEFAULT_KEY[1]] !== undefined;
  } catch {
    // Unreadable or invalid YAML: omp reports it; do not layer a default over it.
    return true;
  }
}

/** `--config <defaults>` for a session spawned in `cwd`, or nothing when the user decided. */
export function ompWebDefaultConfigArgs(cwd: string, packageRoot = process.cwd()): string[] {
  if (setsDefaultKey(getSettingsPath()) || setsDefaultKey(path.join(cwd, ".omp", "config.yml"))) return [];
  return ["--config", path.join(packageRoot, "bin", "omp-web-defaults.yml")];
}

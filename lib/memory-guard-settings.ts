import { isRecord } from "./type-guards";

/** Memory guard settings (lib/memory-guard.ts), stored in omp-web-settings.json. Client-safe. */
export interface MemoryGuardSettings {
  enabled: boolean;
  /** Kill the largest agent/terminal command when available memory drops below this share of RAM. */
  killBelowPercent: number;
  /** The dashboard turns amber below this share. */
  warnBelowPercent: number;
}

export const DEFAULT_MEMORY_GUARD: MemoryGuardSettings = { enabled: true, killBelowPercent: 6, warnBelowPercent: 15 };
export const KILL_PERCENT_RANGE = { min: 2, max: 30 } as const;
export const WARN_PERCENT_RANGE = { min: 3, max: 60 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Valid settings from stored/requested data; missing or bad fields keep `base`. */
export function parseMemoryGuardSettings(raw: unknown, base: MemoryGuardSettings = DEFAULT_MEMORY_GUARD): MemoryGuardSettings {
  if (!isRecord(raw)) return base;
  const number = (value: unknown, fallback: number, range: { min: number; max: number }) =>
    typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value * 10) / 10, range.min, range.max) : fallback;
  const killBelowPercent = number(raw.killBelowPercent, base.killBelowPercent, KILL_PERCENT_RANGE);
  const warnBelowPercent = number(raw.warnBelowPercent, base.warnBelowPercent, WARN_PERCENT_RANGE);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    killBelowPercent,
    // The warning band always sits above the kill line.
    warnBelowPercent: Math.max(warnBelowPercent, killBelowPercent + 1),
  };
}

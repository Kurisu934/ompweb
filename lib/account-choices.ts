import type { ProviderUsageReport } from "./provider-usage-types";

/** provider id → `ProviderUsageReport.accountKey`. Mirrors `AccountPins` in lib/account-routing.ts. */
export type AccountPins = Record<string, string>;

export interface AccountRoutingView {
  disabled: string[];
  pins: AccountPins;
  serving: AccountPins;
}

export interface AccountChoice {
  provider: string;
  accountKey: string;
  /** Alias, else the redacted label; undefined when omp reported neither. */
  name?: string;
  plan?: string;
  /** Highest used share across the account's windows/pools, 0–100. */
  usedPercent?: number;
}

function usedPercent(report: ProviderUsageReport): number | undefined {
  const values = [report.fiveHour?.percent, report.sevenDay?.percent, report.monthly?.percent, report.credits?.percent]
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.max(...values) : undefined;
}

/** One choice per account, grouped by provider in report order (pools of one account merge). */
export function groupAccountChoices(reports: ProviderUsageReport[]): Map<string, AccountChoice[]> {
  const byKey = new Map<string, AccountChoice>();
  for (const report of reports) {
    const used = usedPercent(report);
    const existing = byKey.get(report.accountKey);
    if (existing) {
      if (used !== undefined) existing.usedPercent = Math.max(existing.usedPercent ?? 0, used);
      continue;
    }
    byKey.set(report.accountKey, {
      provider: report.provider,
      accountKey: report.accountKey,
      name: report.accountAlias ?? report.accountLabel,
      ...(report.plan ? { plan: report.plan } : {}),
      ...(used !== undefined ? { usedPercent: used } : {}),
    });
  }
  const groups = new Map<string, AccountChoice[]>();
  for (const choice of byKey.values()) groups.set(choice.provider, [...(groups.get(choice.provider) ?? []), choice]);
  return groups;
}

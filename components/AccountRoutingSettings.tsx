"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { Check } from "@/components/ui/field";
import { groupAccountChoices, type AccountChoice, type AccountRoutingView } from "@/lib/account-choices";
import type { ProviderUsageSnapshot } from "@/lib/provider-usage-types";
import { ProviderIcon } from "./ModelsConfig-panels";
import { usageTone } from "./AppShell-provider-usage";

/**
 * Settings → Connected accounts: temporarily disable one of a provider's
 * accounts (omp then skips it while another account has quota). Only
 * providers with several accounts are listed — with one there is nothing to
 * rotate to.
 */
export function AccountRoutingSettings() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Array<[string, AccountChoice[]]> | null>(null);
  const [disabled, setDisabled] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [usageResponse, routingResponse] = await Promise.all([
          fetch("/api/provider-usage", { cache: "no-store", signal: controller.signal }),
          fetch("/api/account-routing", { cache: "no-store", signal: controller.signal }),
        ]);
        const snapshot = usageResponse.ok ? await usageResponse.json() as ProviderUsageSnapshot : null;
        const routing = routingResponse.ok ? await routingResponse.json() as AccountRoutingView : null;
        if (controller.signal.aborted) return;
        setGroups(snapshot ? [...groupAccountChoices(snapshot.reports)].filter(([, choices]) => choices.length > 1) : []);
        setDisabled(routing?.disabled ?? []);
      } catch {
        if (!controller.signal.aborted) setGroups([]);
      }
    })();
    return () => controller.abort();
  }, []);

  const toggle = async (accountKey: string, next: boolean) => {
    const previous = disabled;
    setDisabled(next ? [...previous, accountKey] : previous.filter((key) => key !== accountKey));
    try {
      const response = await fetch("/api/account-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey, disabled: next }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setDisabled((await response.json() as { disabled: string[] }).disabled);
    } catch (error) {
      setDisabled(previous);
      toast.error(t("accountRouting.saveFailed"), error instanceof Error ? error.message : String(error));
    }
  };

  if (groups === null || groups.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="settings-group-label" style={{ padding: "8px 2px 2px" }}>{t("accountRouting.title")}</div>
      <p style={{ margin: 0, padding: "0 2px", fontSize: "var(--text-body)", color: "var(--text-muted)", lineHeight: 1.5 }}>{t("accountRouting.desc")}</p>
      {groups.map(([provider, choices]) => (
        <div key={provider} className="provider-grid-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-md-strong)", fontWeight: 700, color: "var(--text)" }}>
            <ProviderIcon id={provider} size={18} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{provider}</span>
          </div>
          {choices.map((choice, index) => {
            const isDisabled = disabled.includes(choice.accountKey);
            return (
              <div key={choice.accountKey} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid var(--border)", opacity: isDisabled ? 0.65 : 1 }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {choice.name ?? t("appShell.account", { number: index + 1 })}
                  </span>
                  {choice.plan && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>{choice.plan}</span>}
                </div>
                {choice.usedPercent !== undefined && (
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: usageTone(Math.round(choice.usedPercent)) }}>
                    {Math.round(choice.usedPercent)}%
                  </span>
                )}
                <Check label={t("accountRouting.disable")} checked={isDisabled} onChange={(next) => void toggle(choice.accountKey, next)} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

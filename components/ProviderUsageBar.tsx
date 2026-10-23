"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Gauge, Pencil, RotateCcw, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/field";
import { formatUsageReset, usageTone, useProviderUsage } from "./AppShell-provider-usage";
import { PROVIDER_ACCOUNT_ALIAS_MAX_LENGTH } from "@/lib/provider-usage-types";
import type { ProviderCreditBalance, ProviderResets, ProviderUsageReport, ProviderUsageWindow } from "@/lib/provider-usage-types";

interface WindowDef {
  short: string;
  pick: (report: ProviderUsageReport) => ProviderUsageWindow | undefined;
}

const WINDOWS: WindowDef[] = [
  { short: "5H", pick: (r) => r.fiveHour },
  { short: "7D", pick: (r) => r.sevenDay },
  { short: "30D", pick: (r) => r.monthly },
];

const COLLAPSED_STORAGE_KEY = "omp-web:provider-usage-collapsed";

function worstWindow(report: ProviderUsageReport): { short: string; window: ProviderUsageWindow } | null {
  let best: { short: string; window: ProviderUsageWindow } | null = null;
  for (const def of WINDOWS) {
    const window = def.pick(report);
    if (window && (best === null || window.percent > best.window.percent)) {
      best = { short: def.short, window };
    }
  }
  if (report.credits && (!best || report.credits.percent > best.window.percent)) {
    best = { short: report.credits.limitSource === "fallback" ? "HC*" : "HC", window: report.credits };
  }
  return best;
}

export function CreditBalanceDetails({ credits, t }: {
  credits: ProviderCreditBalance;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
      <span>{t("providerUsage.creditBalance", { value: credits.remaining })}</span>
      <span>{t(credits.limitSource === "fallback" ? "providerUsage.creditLimitFallback" : "providerUsage.creditLimit", { value: credits.limit })}</span>
      <span>{t(credits.limitSource === "fallback" ? "providerUsage.creditReferenceUsed" : "providerUsage.creditUsed", { percent: Number(credits.percent.toFixed(1)) })}</span>
      {credits.limitSource === "fallback" && <span style={{ color: "var(--text-dim)" }}>{t("providerUsage.creditCaveat")}</span>}
    </div>
  );
}

function DetailMeter({ short, window, t }: {
  short: string;
  window: ProviderUsageWindow;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const pct = Math.round(window.percent);
  const tone = usageTone(pct);
  const rawReset = window.resetMinutes ?? window.resetHours;
  const reset = rawReset !== undefined
    ? formatUsageReset(rawReset, window.resetMinutes !== undefined ? "minutes" : "hours")
    : null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.04em", width: 22, flexShrink: 0 }}>{short}</span>
      <span style={{ flex: 1, minWidth: 0, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, background: tone, borderRadius: 2 }} />
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {pct}%
      </span>
      {reset && (
        <span style={{ fontSize: 9, color: "var(--text-dim)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {t("providerUsage.resets", { value: reset })}
        </span>
      )}
    </span>
  );
}

const aliasIconButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  flexShrink: 0,
  padding: 0,
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
} as const;

// Names an account so several logins of one provider are told apart. Saved
// server-side (omp-web-settings.json) so every browser sees the same names.
function AccountAliasEditor({ accountKey, alias, original, onSaved, t }: {
  accountKey: string;
  alias: string | undefined;
  original: string;
  onSaved: (accountKey: string, alias: string | null) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (draft === null || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/provider-usage/aliases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey, alias: draft }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved = await response.json() as { alias: string | null };
      onSaved(accountKey, saved.alias);
      setDraft(null);
    } catch {
      toast.error(t("providerUsage.aliasSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (draft === null) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 10, color: "var(--text-dim)", minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setDraft(alias ?? "")}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 10, fontFamily: "inherit", flexShrink: 0 }}
        >
          <Pencil size={10} strokeWidth={2} aria-hidden="true" />
          {t(alias ? "providerUsage.aliasEdit" : "providerUsage.aliasSet")}
        </button>
        {alias && (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {t("providerUsage.aliasOriginal", { label: original })}
          </span>
        )}
      </span>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}
    >
      <input
        autoFocus
        value={draft}
        maxLength={PROVIDER_ACCOUNT_ALIAS_MAX_LENGTH}
        disabled={saving}
        placeholder={t("providerUsage.aliasPlaceholder")}
        aria-label={t("providerUsage.aliasSet")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: 22,
          boxSizing: "border-box",
          padding: "0 6px",
          fontSize: 11,
          fontFamily: "inherit",
          color: "var(--text)",
          background: "var(--bg)",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          outline: "none",
        }}
      />
      <button type="submit" disabled={saving} aria-label={t("providerUsage.aliasSave")} title={t("providerUsage.aliasSave")} style={aliasIconButtonStyle}>
        <Check size={12} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" disabled={saving} onClick={() => setDraft(null)} aria-label={t("providerUsage.aliasCancel")} title={t("providerUsage.aliasCancel")} style={aliasIconButtonStyle}>
        <X size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </form>
  );
}

const RESET_REASON_KEYS: Record<string, string> = {
  not_at_wall: "providerUsage.resetReasonNotAtWall",
  cooldown: "providerUsage.resetReasonCooldown",
  ineligible: "providerUsage.resetReasonIneligible",
};

// Saved Codex / Claude rate-limit resets: how many, when they expire, and a
// button that spends one through `omp usage reset` after a confirmation.
function ResetCredits({ resets, accountKey, account, now, locale, onSpent, t }: {
  resets: ProviderResets;
  accountKey: string;
  account: string;
  /** Snapshot time; expiries are shown relative to it. */
  now: number | null;
  locale: string;
  onSpent: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [spending, setSpending] = useState(false);
  const formatTime = (ms: number) => new Date(ms).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const expiries = resets.credits.flatMap((credit) =>
    (credit.status ?? "available") === "available" && credit.expiresAt !== undefined && (now === null || credit.expiresAt > now) ? [credit.expiresAt] : [],
  ).sort((a, b) => a - b);
  // A cooldown without an end time reads as an unknown reason.
  const reasonKey = resets.reason && !(resets.reason === "cooldown" && resets.cooldownUntil === undefined) ? RESET_REASON_KEYS[resets.reason] : undefined;
  // Known reasons explain an empty count too (Claude offers none below its limit).
  const reason = resets.spendable || !resets.reason
    ? null
    : reasonKey
      ? t(reasonKey, { time: resets.cooldownUntil !== undefined ? formatTime(resets.cooldownUntil) : "" })
      : resets.available > 0 ? t("providerUsage.resetReasonOther", { reason: resets.reason }) : null;

  const spend = async () => {
    setSpending(true);
    try {
      const response = await fetch("/api/provider-usage/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey }),
      });
      const data = await response.json().catch(() => null) as { ok?: unknown; message?: unknown; error?: unknown } | null;
      if (!response.ok || typeof data?.ok !== "boolean") {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${response.status}`);
      }
      const message = typeof data.message === "string" ? data.message : undefined;
      if (data.ok) toast.success(t("providerUsage.resetApplied"), message);
      else toast.error(t("providerUsage.resetNotApplied"), message);
    } catch (error) {
      toast.error(t("providerUsage.resetRequestFailed"), error instanceof Error ? error.message : undefined);
    } finally {
      setSpending(false);
      onSpent();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--text-muted)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
        <RotateCcw size={10} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0, color: resets.available > 0 ? "var(--accent)" : "var(--text-dim)" }} />
        <span style={{ flex: 1, minWidth: 0, color: resets.available > 0 ? "var(--text)" : "var(--text-dim)" }}>
          {resets.available > 0 ? t("providerUsage.resetsAvailable", { count: resets.available }) : t("providerUsage.resetsNone")}
        </span>
        {resets.available > 0 && (
          <button
            type="button"
            disabled={!resets.spendable || spending}
            onClick={() => setConfirming(true)}
            title={reason ?? undefined}
            style={{
              flexShrink: 0,
              height: 20,
              padding: "0 7px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg)",
              color: resets.spendable && !spending ? "var(--accent)" : "var(--text-dim)",
              cursor: resets.spendable && !spending ? "pointer" : "default",
              fontSize: 10,
              fontFamily: "inherit",
              fontWeight: 600,
            }}
          >
            {spending ? t("providerUsage.resetUsing") : t("providerUsage.resetUse")}
          </button>
        )}
      </span>
      {expiries.map((expiresAt, index) => (
        <span key={`${expiresAt}-${index}`} style={{ paddingLeft: 16, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
          {now !== null
            ? t("providerUsage.resetExpiresIn", { value: formatUsageReset(Math.max(0, Math.round((expiresAt - now) / 3_600_000)), "hours"), time: formatTime(expiresAt) })
            : t("providerUsage.resetExpiresAt", { time: formatTime(expiresAt) })}
        </span>
      ))}
      {reason && <span style={{ paddingLeft: 16, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{reason}</span>}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={<span style={{ overflowWrap: "anywhere" }}>{t("providerUsage.resetConfirmTitle", { account })}</span>}
        description={t("providerUsage.resetConfirmBody")}
        confirmLabel={t("providerUsage.resetConfirm")}
        cancelLabel={t("providerUsage.aliasCancel")}
        busy={spending}
        onConfirm={() => {
          setConfirming(false);
          void spend();
        }}
      />
    </div>
  );
}

// Compact provider rate-limit block pinned above Settings in the sidebar: one
// slim row per account (worst window only), click to expand the full detail.
export function ProviderUsageBar() {
  const { t, locale } = useI18n();
  const { snapshot, loading, error, refresh } = useProviderUsage("");
  const reports = snapshot?.reports ?? [];
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Aliases saved from this panel, shown until the next snapshot carries them.
  const [aliasOverrides, setAliasOverrides] = useState<Record<string, string | null>>({});
  // The first render must match the server, where localStorage is unavailable,
  // so start collapsed and apply the stored preference after mounting.
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    try {
      // No stored choice yet → stay hidden; an explicit expand persists.
      if (window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "false") setCollapsed(false);
    } catch {
      // Storage unavailable: keep the collapsed default.
    }
  }, []);

  let worst: { percent: number; window: string } | null = null;
  for (const report of reports) {
    const best = worstWindow(report);
    if (best && (worst === null || best.window.percent > worst.percent)) {
      worst = { percent: Math.round(best.window.percent), window: best.short };
    }
  }

  return (
    <section
      className="provider-usage-panel wallpaper-surface"
      aria-label={t("appShell.sectionProviderUsage")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 8px 6px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-panel)",
        flexShrink: 0,
        minHeight: 0,
        maxHeight: "32vh",
        overflowY: "auto",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => {
          const next = !v;
          try {
            window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
          } catch {
            // The preference still applies for this page load.
          }
          return next;
        })}
        aria-expanded={!collapsed}
        title={t("appShell.sectionProviderUsage")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          boxSizing: "border-box",
          padding: "0 4px",
          minWidth: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <ChevronRight
          size={11}
          strokeWidth={2}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--text-dim)",
            transform: collapsed ? "none" : "rotate(90deg)",
            transition: "transform var(--dur-med) var(--ease-out-warm)",
          }}
        />
        <span aria-hidden="true" style={{ display: "flex", color: "var(--accent)", flexShrink: 0 }}>
          <Gauge size={13} strokeWidth={2} aria-hidden="true" />
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("appShell.sectionProviderUsage")}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--font-mono)", color: worst ? usageTone(worst.percent) : "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
          {loading && reports.length === 0
            ? t("appShell.providerUsageLoading")
            : error
              ? t("appShell.providerUsageUnavailable")
              : worst
                ? t("providerUsage.highest", { percent: worst.percent, window: worst.window })
                : t("appShell.providerUsageNoData")}
        </span>
      </button>
      {!collapsed && reports.map((report, index) => {
        const original = report.accountLabel ?? t("appShell.account", { number: report.accountIndex ?? index + 1 });
        const alias = report.accountKey in aliasOverrides ? aliasOverrides[report.accountKey] ?? undefined : report.accountAlias;
        const account = alias ?? original;
        const rowLabel = report.pool ? `${report.pool} · ${account}` : account;
        const key = `${report.provider}:${report.accountKey}:${report.modelId ?? "all"}:${report.pool ?? ""}:${index}`;
        const best = worstWindow(report);
        const expanded = expandedKey === key;
        const pct = best ? Math.round(best.window.percent) : 0;
        const tone = usageTone(pct);
        return (
          <div key={key} className="provider-usage-account" style={{ borderRadius: "var(--radius-control)", background: expanded ? "var(--bg-subtle)" : "transparent" }}>
            <button
              type="button"
              onClick={() => setExpandedKey((prev) => (prev === key ? null : key))}
              aria-expanded={expanded}
              title={alias ? `${rowLabel} (${original})` : rowLabel}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                boxSizing: "border-box",
                padding: "5px 6px 4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                minWidth: 0,
              }}
            >
              <ChevronRight
                size={11}
                strokeWidth={2}
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  color: "var(--text-dim)",
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform var(--dur-med) var(--ease-out-warm)",
                }}
              />
              <span className="provider-usage-name wallpaper-inset" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 10, color: "var(--text)", background: "var(--bg)", border: "1px solid var(--border)", padding: "0 5px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.7 }}>
                {report.provider}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                {rowLabel}
              </span>
              {(report.resets?.available ?? 0) > 0 && (
                <span
                  title={t("providerUsage.resetsAvailable", { count: report.resets!.available })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}
                >
                  <RotateCcw size={10} strokeWidth={2.2} aria-hidden="true" />
                  {report.resets!.available}
                </span>
              )}
              {report.noLimits ? (
                <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>∞</span>
              ) : report.credits ? (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                  title={t("providerUsage.creditBalance", { value: report.credits.remaining })}>
                  {report.credits.remaining}/{report.credits.limit}{report.credits.limitSource === "fallback" ? "*" : ""}
                </span>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {pct}%
                </span>
              )}
            </button>
            {!report.noLimits && (
              <div style={{ height: 3, margin: "0 6px 0 23px", borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, background: tone, borderRadius: 2 }} />
              </div>
            )}
            {expanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 8px 7px 23px", fontFamily: "var(--font-mono)" }}>
                {report.credits && <CreditBalanceDetails credits={report.credits} t={t} />}
                {!report.noLimits && WINDOWS.map((def) => {
                  const window = def.pick(report);
                  return window ? <DetailMeter key={def.short} short={def.short} window={window} t={t} /> : null;
                })}
                {report.resets && (
                  <ResetCredits
                    resets={report.resets}
                    accountKey={report.accountKey}
                    account={`${report.provider} · ${account}`}
                    now={snapshot?.generatedAt ?? null}
                    locale={locale}
                    onSpent={refresh}
                    t={t}
                  />
                )}
                <AccountAliasEditor
                  accountKey={report.accountKey}
                  alias={alias}
                  original={original}
                  onSaved={(accountKey, saved) => setAliasOverrides((previous) => ({ ...previous, [accountKey]: saved }))}
                  t={t}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

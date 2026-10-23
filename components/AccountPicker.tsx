"use client";

import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { groupAccountChoices, type AccountChoice, type AccountPins, type AccountRoutingView } from "@/lib/account-choices";
import type { ProviderUsageSnapshot } from "@/lib/provider-usage-types";
import { usageTone } from "./AppShell-provider-usage";

interface Props {
  /** Live session; null for a new chat, whose choice rides on its first spawn. */
  sessionId: string | null;
  provider: string;
  modelId: string;
  /** New-chat choice, owned by useAgentSession until the session exists. */
  pendingPins: AccountPins;
  onPendingPinsChange: (pins: AccountPins) => void;
}

const EMPTY_ROUTING: AccountRoutingView = { disabled: [], pins: {}, serving: {} };

function CheckMark() {
  return <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>;
}

/**
 * Composer chip choosing which of a provider's accounts serves this chat.
 * "Auto" leaves the choice to omp (remaining quota); a chosen account is
 * applied by omp-web through omp's account policies from the next message.
 * Hidden unless the current model's provider has several accounts.
 */
export const AccountPicker = memo(function AccountPicker({ sessionId, provider, modelId, pendingPins, onPendingPinsChange }: Props) {
  const { t } = useI18n();
  const [choices, setChoices] = useState<AccountChoice[]>([]);
  const [routing, setRouting] = useState<AccountRoutingView>(EMPTY_ROUTING);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const query = new URLSearchParams({ provider, model: modelId });
      const [usageResponse, routingResponse] = await Promise.all([
        fetch(`/api/provider-usage?${query}`, { cache: "no-store", signal }),
        fetch(`/api/account-routing${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`, { cache: "no-store", signal }),
      ]);
      const snapshot = usageResponse.ok ? await usageResponse.json() as ProviderUsageSnapshot : null;
      const view = routingResponse.ok ? await routingResponse.json() as AccountRoutingView : EMPTY_ROUTING;
      if (signal?.aborted) return;
      setChoices(snapshot ? groupAccountChoices(snapshot.reports).get(provider) ?? [] : []);
      setRouting(view);
    } catch {
      // Unavailable usage: keep the last list (or none, hiding the chip).
    }
  }, [provider, modelId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (choices.length < 2) return null;

  const pins = sessionId ? routing.pins : pendingPins;
  const selected = choices.find((choice) => choice.accountKey === pins[provider]);
  const serving = choices.find((choice) => choice.accountKey === routing.serving[provider]);
  const nameOf = (choice: AccountChoice) => choice.name ?? t("appShell.account", { number: choices.indexOf(choice) + 1 });
  const buttonLabel = selected ? nameOf(selected) : t("accountPicker.auto");

  const choose = async (accountKey: string | null) => {
    setOpen(false);
    if (accountKey === (selected?.accountKey ?? null)) return;
    const next = { ...pins };
    if (accountKey) next[provider] = accountKey;
    else delete next[provider];
    if (!sessionId) {
      onPendingPinsChange(next);
      return;
    }
    setRouting((current) => ({ ...current, pins: next }));
    try {
      const response = await fetch("/api/account-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, provider, accountKey }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { pins: AccountPins };
      setRouting((current) => ({ ...current, pins: data.pins }));
    } catch (error) {
      setRouting((current) => ({ ...current, pins }));
      toast.error(t("accountPicker.saveFailed"), error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div ref={wrapRef} className="composer-account-control" style={{ position: "relative", minWidth: 0 }}>
      <button
        type="button"
        className="wallpaper-inset"
        onClick={() => { if (!open) void refresh(); setOpen((value) => !value); }}
        title={t("accountPicker.title", { account: buttonLabel })}
        aria-label={`${t("accountPicker.label")}: ${buttonLabel}`}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          height: "var(--control-height-sm)", maxWidth: 160, padding: "0 6px",
          background: open ? "var(--bg-hover)" : selected ? "var(--bg-selected)" : "none",
          border: "none", borderRadius: 7, cursor: "pointer", fontSize: "var(--text-sm)",
          color: selected ? "var(--accent)" : "var(--text-muted)",
          transition: "background var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)",
        }}
      >
        <UserRound size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonLabel}</span>
        <ChevronDown size={12} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out-warm)" }} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("accountPicker.label")}
          className="picker-panel"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}
          style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 100, width: 250, maxWidth: "calc(100vw - 32px)" }}
        >
          <div className="picker-panel-header">
            <UserRound size={12} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
            <span className="picker-panel-title">{t("accountPicker.label")}</span>
            <span className="picker-panel-count">{choices.length}</span>
          </div>
          <div className="picker-thinking-cards">
            <button type="button" className="picker-thinking-card" role="menuitemradio" aria-checked={!selected} data-active={!selected} onClick={() => void choose(null)}>
              <span className="picker-check">{!selected && <CheckMark />}</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span>{t("accountPicker.auto")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {serving ? t("accountPicker.serving", { account: nameOf(serving) }) : t("accountPicker.autoDesc")}
                </span>
              </span>
            </button>
            {choices.map((choice) => {
              const active = choice === selected;
              const disabled = routing.disabled.includes(choice.accountKey);
              return (
                <button key={choice.accountKey} type="button" className="picker-thinking-card" role="menuitemradio" aria-checked={active} data-active={active} onClick={() => void choose(choice.accountKey)}>
                  <span className="picker-check">{active && <CheckMark />}</span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(choice)}</span>
                    {(choice.plan || disabled) && (
                      <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-dim)" }}>
                        {[choice.plan, disabled ? t("accountPicker.disabledTag") : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {choice.usedPercent !== undefined && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: usageTone(Math.round(choice.usedPercent)), flexShrink: 0 }}>
                      {Math.round(choice.usedPercent)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="picker-panel-footer">
            <span>{t("accountPicker.appliesNext")}</span>
          </div>
        </div>
      )}
    </div>
  );
});

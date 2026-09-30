import { useState, useEffect } from "react";
import type { ProviderUsageReport, ProviderUsageSnapshot } from "@/lib/provider-usage-types";

export function formatUsageReset(value: number, unit: "minutes" | "hours"): string {
  if (unit === "minutes") {
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (value < 24) return `${value}h`;
  const days = Math.floor(value / 24);
  const hours = value % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function usageTone(percent: number): string {
  if (percent >= 80) return "var(--status-error)";
  if (percent >= 50) return "var(--status-warning)";
  return "var(--text-muted)";
}

export function formatProviderUsageReport(report: ProviderUsageReport, noLimitsLabel: string): string {
  if (report.noLimits) return noLimitsLabel;
  const parts: string[] = [];
  if (report.tier) parts.push(report.tier);
  if (report.credits) {
    const { remaining, limit, limitSource } = report.credits;
    parts.push(`${remaining}/${limit} credits remaining${limitSource === "fallback" ? " (estimated limit)" : ""}`);
  }
  if (report.fiveHour) {
    const reset = report.fiveHour.resetMinutes === undefined
      ? ""
      : ` (${formatUsageReset(report.fiveHour.resetMinutes, "minutes")})`;
    parts.push(`5h ${Math.round(report.fiveHour.percent)}%${reset}`);
  }
  if (report.sevenDay) {
    const reset = report.sevenDay.resetHours === undefined
      ? ""
      : ` (${formatUsageReset(report.sevenDay.resetHours, "hours")})`;
    parts.push(`7d ${Math.round(report.sevenDay.percent)}%${reset}`);
  }
  if (report.monthly) {
    const reset = report.monthly.resetHours === undefined
      ? ""
      : ` (${formatUsageReset(report.monthly.resetHours, "hours")})`;
    parts.push(`mo ${Math.floor(report.monthly.percent)}%${reset}`);
  }
  return parts.join(" · ");
}

export type ProviderUsageState = {
  snapshot: ProviderUsageSnapshot | null;
  loading: boolean;
  error: boolean;
};

export function useProviderUsage(query: string | null, refreshMs = 60_000): ProviderUsageState {
  const [state, setState] = useState<ProviderUsageState>({ snapshot: null, loading: false, error: false });
  useEffect(() => {
    if (query === null) {
      setState({ snapshot: null, loading: false, error: false });
      return;
    }
    const polling = Number.isFinite(refreshMs) && refreshMs > 0;
    let disposed = false;
    let inFlight = false;
    let nextRefreshAt = 0;
    let controller: AbortController | undefined;
    let refreshTimer: number | undefined;
    let requestTimer: number | undefined;
    const canLoad = () => document.visibilityState !== "hidden" && navigator.onLine !== false;
    const clearRefreshTimer = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    };
    const schedule = () => {
      clearRefreshTimer();
      if (disposed || inFlight || !polling || !canLoad()) return;
      refreshTimer = window.setTimeout(() => void load(), Math.max(0, nextRefreshAt - Date.now()));
    };
    setState({ snapshot: null, loading: true, error: false });
    const load = async () => {
      if (disposed || inFlight || !canLoad()) return;
      clearRefreshTimer();
      inFlight = true;
      const request = new AbortController();
      controller = request;
      requestTimer = window.setTimeout(() => request.abort(), 35_000);
      try {
        const response = await fetch(`/api/provider-usage${query ? `?${query}` : ""}`, { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.json() as ProviderUsageSnapshot;
        if (!disposed && !request.signal.aborted) setState({ snapshot, loading: false, error: false });
      } catch {
        if (!disposed) setState((previous) => ({ ...previous, loading: false, error: true }));
      } finally {
        window.clearTimeout(requestTimer);
        inFlight = false;
        // Count from completion so slow requests neither overlap nor race the server cache TTL.
        nextRefreshAt = polling ? Date.now() + refreshMs : Infinity;
        schedule();
      }
    };
    const resume = () => {
      if (!canLoad()) clearRefreshTimer();
      else if (Date.now() >= nextRefreshAt) void load();
      else schedule();
    };
    void load();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      disposed = true;
      controller?.abort();
      clearRefreshTimer();
      window.clearTimeout(requestTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [query, refreshMs]);
  return state;
}

import { useState, useEffect, useRef, useCallback } from "react";
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
  if (report.pool) parts.push(report.pool);
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

export function useProviderUsage(query: string | null, refreshMs = 60_000): ProviderUsageState & { refresh: () => Promise<boolean> } {
  const [state, setState] = useState<ProviderUsageState>({ snapshot: null, loading: false, error: false });
  const refreshRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    if (query === null) {
      setState({ snapshot: null, loading: false, error: false });
      return;
    }
    const polling = Number.isFinite(refreshMs) && refreshMs > 0;
    let disposed = false;
    let inFlight = false;
    // Asked for while a request runs: that answer may predate the change.
    let forceRefreshPending = false;
    let refreshWaiters: Array<(success: boolean) => void> = [];
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
    const load = async (force = false) => {
      if (disposed || inFlight || !canLoad()) return;
      clearRefreshTimer();
      inFlight = true;
      if (force) forceRefreshPending = false;
      const waiters = force ? refreshWaiters.splice(0) : [];
      let succeeded = false;
      const request = new AbortController();
      controller = request;
      requestTimer = window.setTimeout(() => request.abort(), 35_000);
      if (force) setState((previous) => ({ ...previous, loading: true, error: false }));
      const params = new URLSearchParams(query ?? "");
      if (force) params.set("refresh", "true");
      const queryString = params.toString();
      try {
        const response = await fetch(`/api/provider-usage${queryString ? `?${queryString}` : ""}`, {
          signal: request.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.json() as ProviderUsageSnapshot;
        if (!disposed && !request.signal.aborted) {
          setState({ snapshot, loading: false, error: false });
          succeeded = true;
        }
      } catch {
        if (!disposed) setState((previous) => ({ ...previous, loading: false, error: true }));
      } finally {
        window.clearTimeout(requestTimer);
        inFlight = false;
        for (const resolve of waiters) resolve(succeeded);
        // Count from completion so slow requests neither overlap nor race the server cache TTL.
        nextRefreshAt = forceRefreshPending ? Date.now() : polling ? Date.now() + refreshMs : Infinity;
        if (forceRefreshPending && canLoad()) void load(true);
        else schedule();
      }
    };
    const resume = () => {
      if (!canLoad()) clearRefreshTimer();
      else if (forceRefreshPending || Date.now() >= nextRefreshAt) void load(forceRefreshPending);
      else schedule();
    };
    void load();
    refreshRef.current = () => {
      const { promise, resolve } = Promise.withResolvers<boolean>();
      refreshWaiters.push(resolve);
      forceRefreshPending = true;
      if (!inFlight) void load(true);
      return promise;
    };
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
      for (const resolve of refreshWaiters) resolve(false);
      refreshWaiters = [];
      refreshRef.current = () => Promise.resolve(false);
    };
  }, [query, refreshMs]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { ...state, refresh };
}

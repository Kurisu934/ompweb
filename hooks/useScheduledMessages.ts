"use client";

import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/i18n/api-error";
import type { ScheduledMessage } from "@/lib/scheduled-messages";
import { toast } from "@/components/ui/toast";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok || body.error) throw new Error(formatApiError({ ...body, error: body.error ?? `HTTP ${response.status}` }));
  return body;
}

export interface ScheduledMessagesApi {
  messages: ScheduledMessage[];
  /** Resolves true once the server stored it. */
  schedule: (message: string, sendAt: number) => Promise<boolean>;
  cancel: (messageId: string) => void;
  /** Send now; also retries a failed message. */
  sendNow: (messageId: string) => void;
}

/** Server-side scheduled messages for one session (app/api/sessions/[id]/scheduled). */
export function useScheduledMessages(sessionId: string | null, advisor: boolean): ScheduledMessagesApi {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const base = sessionId ? `/api/sessions/${encodeURIComponent(sessionId)}/scheduled` : null;

  const refresh = useCallback(async () => {
    if (!base) return;
    try {
      setMessages((await request<{ messages: ScheduledMessage[] }>(base)).messages);
    } catch {
      // Keep the last known list; the next refresh retries.
    }
  }, [base]);

  useEffect(() => {
    setMessages([]);
    void refresh();
  }, [refresh]);

  // The server sends on its own; re-read just after the next one is due so the
  // panel drops it (or shows its error).
  const nextDue = messages.reduce<number | null>((soonest, entry) => (
    entry.error || (soonest !== null && soonest <= entry.sendAt) ? soonest : entry.sendAt
  ), null);
  useEffect(() => {
    if (nextDue === null) return;
    const timer = setTimeout(() => { void refresh(); }, Math.min(2_147_483_647, Math.max(0, nextDue - Date.now()) + 2_000));
    return () => clearTimeout(timer);
  }, [nextDue, refresh]);

  const schedule = useCallback(async (message: string, sendAt: number) => {
    if (!base) return false;
    try {
      await request(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sendAt, advisor }),
      });
      await refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [base, advisor, refresh]);

  const cancel = useCallback((messageId: string) => {
    if (!base) return;
    setMessages((current) => current.filter((entry) => entry.id !== messageId));
    void request(`${base}?messageId=${encodeURIComponent(messageId)}`, { method: "DELETE" })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => { void refresh(); });
  }, [base, refresh]);

  const sendNow = useCallback((messageId: string) => {
    if (!base) return;
    void request(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, sendAt: Date.now() }),
    })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => { setTimeout(() => { void refresh(); }, 1_500); });
  }, [base, refresh]);

  return { messages, schedule, cancel, sendNow };
}

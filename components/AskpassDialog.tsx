"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useI18n } from "@/lib/i18n";
import { formatApiError } from "@/lib/i18n/api-error";
import type { AskpassRequestInfo } from "@/lib/askpass";

async function answer(id: string, body: { password: string } | { cancel: true }): Promise<string | null> {
  try {
    const response = await fetch("/api/askpass/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (response.ok) return null;
    return formatApiError(await response.json().catch(() => null));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Password dialog for sudo in agent commands (lib/askpass.ts). Every open tab
 * listens; the first answer wins and the request disappears everywhere. The
 * password is sent once to the server for sudo and dropped from page state.
 * `requests` comes from useAskpassRequests (AppShell also lists them as
 * attention items).
 */
export function AskpassDialog({ requests }: { requests: AskpassRequestInfo[] }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const current = requests[0] ?? null;

  // A new request starts clean.
  const currentId = current?.id ?? null;
  useEffect(() => {
    setPassword("");
    setError(null);
  }, [currentId]);

  // Nudge through the OS when the tab is in the background (same tag: shown once).
  const currentCommand = current?.command.join(" ") ?? null;
  useEffect(() => {
    if (!currentId || currentCommand === null || !document.hidden) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(t("askpass.notificationTitle"), { body: currentCommand, tag: `askpass-${currentId}` });
  }, [currentId, currentCommand, t]);

  useEffect(() => {
    if (!currentId) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [currentId]);

  if (!current) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    const failure = await answer(current.id, { password });
    setPassword("");
    setBusy(false);
    if (failure) setError(failure);
  };
  const refuse = async () => {
    if (busy) return;
    setBusy(true);
    setPassword("");
    const failure = await answer(current.id, { cancel: true });
    setBusy(false);
    if (failure) setError(failure);
  };
  const secondsLeft = Math.max(0, Math.round((current.expiresAt - now) / 1000));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void refuse(); }}>
      <DialogContent ariaLabel={t("askpass.title")} className="askpass-dialog" style={{ width: 460 }}>
        <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KeyRound size={18} aria-hidden="true" />
          {t("askpass.title")}
        </DialogTitle>
        <p className="askpass-session">
          {current.sessionName || t("askpass.untitledSession")}
          <span>{current.cwd}</span>
        </p>
        <div className="askpass-label">{t("askpass.command")}</div>
        <pre className="askpass-command">{current.command.join(" ")}</pre>
        <form onSubmit={(event) => void submit(event)}>
          <label className="askpass-label" htmlFor="askpass-password">{current.prompt.trim() || t("askpass.password")}</label>
          <input
            id="askpass-password"
            className="askpass-input"
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(null); }}
            autoComplete="off"
            autoFocus
            disabled={busy}
          />
          {error && <p role="alert" className="askpass-error">{error}</p>}
          <p className="askpass-note">
            {t("askpass.note")}
            {" "}
            {t("askpass.expiresIn", { seconds: secondsLeft })}
            {requests.length > 1 && <> {t("askpass.morePending", { count: requests.length - 1 })}</>}
          </p>
          <div className="askpass-actions">
            <button type="button" onClick={() => void refuse()} disabled={busy}>{t("askpass.refuse")}</button>
            <button type="submit" className="askpass-submit" disabled={busy || !password}>{t("askpass.submit")}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

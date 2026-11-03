"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sameMemoFields, validMemo, type Memo, type MemoFields } from "@/lib/memos";

const DRAFT_KEY = "omp-web:memo-draft:v1";
class MemoRequestError extends Error {
  constructor(public code: string) { super(code); }
}
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new MemoRequestError(data.code || "save_failed");
  return data;
}
export function useMemos(open: boolean) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [draft, setDraft] = useState<Memo | null>(null);
  const [phase, setPhase] = useState<"saved" | "unsaved" | "saving" | "error" | "conflict">("saved");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupFailed, setBackupFailed] = useState(false);
  const current = useRef<Memo | null>(null), base = useRef<Memo | null>(null);
  const flight = useRef<Promise<boolean> | null>(null), blocked = useRef(false), action = useRef(false), sequence = useRef(0);
  const dirty = useCallback(() => !!current.current && !!base.current && !sameMemoFields(current.current, base.current), []);
  const backup = useCallback(() => {
    try {
      if (current.current && base.current && (dirty() || blocked.current)) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: current.current, base: base.current }));
      else sessionStorage.removeItem(DRAFT_KEY);
      setBackupFailed(false);
    } catch { setBackupFailed(true); }
  }, [dirty]);
  const adopt = useCallback((memo: Memo | null) => {
    current.current = memo; base.current = memo; blocked.current = false;
    setDraft(memo); setPhase("saved"); setError(""); backup();
  }, [backup]);
  const failed = useCallback((e: unknown) => {
    const code = e instanceof MemoRequestError ? e.code : "save_failed";
    blocked.current = true; setError(code); setPhase(code === "conflict" || code === "missing" ? "conflict" : "error"); backup();
  }, [backup]);

  const flush = useCallback((): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (blocked.current) return Promise.resolve(false);
    const save = async () => {
      try {
        // Serialize saves and re-read the draft after every response so a slow
        // request cannot overwrite text typed while it was in flight.
        while (current.current && base.current && dirty()) {
          setPhase("saving");
          const sent = current.current;
          const data = await request(`/api/memos/${sent.id}`, "PUT", { ...sent, revision: base.current.revision });
          if (!validMemo(data.memo)) throw new Error("Invalid memo response");
          const saved: Memo = data.memo;
          base.current = saved;
          current.current = { ...current.current, revision: saved.revision, updatedAt: saved.updatedAt };
          setDraft(current.current); setMemos(items => items.map(m => m.id === saved.id ? saved : m)); backup();
        }
        setPhase("saved"); setError(""); return true;
      } catch (e) { failed(e); return false; }
    };
    const task = save().finally(() => { flight.current = null; });
    flight.current = task; return task;
  }, [backup, dirty, failed]);

  const load = useCallback(async (discard = false) => {
    const seq = ++sequence.current, previousBase = base.current; setLoading(true);
    try {
      const data = await request("/api/memos");
      if (!Array.isArray(data.memos) || !data.memos.every(validMemo)) throw new Error("Invalid memo list");
      if (seq !== sequence.current) return;
      const items: Memo[] = data.memos;
      setMemos(previous => items.map(m => previous.find(local => local.id === m.id && local.revision > m.revision) ?? m));
      if (discard) { adopt(items.find(m => m.id === current.current?.id) ?? items[0] ?? null); return; }
      if (!current.current) {
        let cached;
        try { cached = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* Invalid local draft. */ }
        if (validMemo(cached?.draft) && validMemo(cached?.base) && cached.draft.id === cached.base.id) {
          const remote = items.find(m => m.id === cached.draft.id);
          if (remote && sameMemoFields(remote, cached.draft)) { adopt(remote); return; }
          current.current = cached.draft; base.current = cached.base; setDraft(cached.draft);
          if (!remote || remote.revision !== cached.base.revision) failed(new MemoRequestError(remote ? "conflict" : "missing"));
          else { blocked.current = false; setPhase("unsaved"); setError(""); }
          return;
        }
      }
      if (base.current === previousBase && !dirty() && !flight.current && !blocked.current) adopt(items.find(m => m.id === current.current?.id) ?? items[0] ?? null);
      if (!blocked.current) setError("");
    } catch (e) { setError(e instanceof MemoRequestError ? e.code : "load_failed"); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [adopt, dirty, failed]);

  useEffect(() => {
    if (!open) return;
    void load();
    const focus = () => { if (!action.current && !flight.current && !dirty() && !blocked.current) void load(); };
    window.addEventListener("focus", focus);
    // This counter invalidates pending fetches, not a DOM-ref cleanup target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { sequence.current++; window.removeEventListener("focus", focus); };
  }, [open, load, dirty]);
  useEffect(() => {
    if (!draft || !dirty() || blocked.current) return;
    const timer = setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
  }, [draft, dirty, flush]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty()) { backup(); event.preventDefault(); event.returnValue = ""; } };
    const hidden = () => { if (document.hidden) void flush(); };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("visibilitychange", hidden); };
  }, [backup, dirty, flush]);

  const edit = (patch: Partial<MemoFields>) => {
    if (!current.current || action.current) return;
    current.current = { ...current.current, ...patch }; setDraft(current.current);
    if (!blocked.current) setPhase("unsaved"); backup();
  };
  async function perform(fn: () => Promise<void>) {
    if (action.current || loading) return;
    action.current = true; sequence.current++; setBusy(true);
    try { await fn(); } catch (e) {
      if (dirty() || e instanceof MemoRequestError && ["conflict", "missing"].includes(e.code)) failed(e);
      else setError(e instanceof MemoRequestError ? e.code : "save_failed");
    }
    finally { action.current = false; setBusy(false); }
  }
  const select = (memo: Memo) => perform(async () => { if (memo.id !== current.current?.id && await flush()) adopt(memo); });
  const create = (copy = false) => perform(async () => {
    if (copy) { if (flight.current) await flight.current; }
    else if (!await flush()) return;
    const source = copy && current.current ? current.current : { title: "", content: "", pinned: false };
    const data = await request("/api/memos", "POST", { title: source.title, content: source.content, pinned: source.pinned });
    if (!validMemo(data.memo)) throw new Error("Invalid memo response");
    setMemos(items => [data.memo, ...items]); adopt(data.memo);
  });
  const remove = () => perform(async () => {
    if (!await flush() || !current.current) return;
    const id = current.current.id;
    await request(`/api/memos/${id}`, "DELETE", { revision: base.current!.revision });
    const rest = memos.filter(m => m.id !== id); setMemos(rest); adopt(rest[0] ?? null);
  });
  const retry = async () => { blocked.current = false; if (await flush()) await load(); };
  const refresh = async () => { if (await flush()) await load(); };
  return { memos, draft, phase, error, loading, busy, backupFailed, edit, select, create, remove, retry, refresh, flush, loadLatest: () => load(true) };
}

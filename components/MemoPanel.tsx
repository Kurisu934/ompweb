"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Download, Eye, FileText, Loader2, Pin, Plus, RefreshCw, Search, SquarePen, StickyNote, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, Tooltip } from "./ui/primitives";
import { MarkdownBody } from "./MarkdownBody";
import { useMemos } from "@/hooks/useMemos";
import { useI18n } from "@/lib/i18n";
import { MAX_MEMO_CONTENT, MAX_MEMO_TITLE, MEMOS_OPEN_EVENT, sortMemos } from "@/lib/memos";
import { matchesShortcut } from "@/lib/keyboard-shortcuts";
import "./memos.css";

const MODE_STORAGE_KEY = "omp-web:memo-mode";

function loadPreview(id: string): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(`${MODE_STORAGE_KEY}:${id}`) === "preview"; }
  catch { return false; }
}

export function MemoPanel() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [previewById, setPreviewById] = useState<Record<string, boolean>>({});
  const [mobileList, setMobileList] = useState(true), [confirmDelete, setConfirmDelete] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);
  const notes = useMemos(open);
  const memoId = notes.draft?.id;
  const preview = memoId ? (previewById[memoId] ?? loadPreview(memoId)) : false;
  function setPreview(next: boolean) {
    if (!memoId) return;
    setPreviewById(current => ({ ...current, [memoId]: next }));
    try { window.localStorage.setItem(`${MODE_STORAGE_KEY}:${memoId}`, next ? "preview" : "edit"); }
    catch { /* Keep each memo's selection usable when browser storage is unavailable. */ }
  }
  const { flush } = notes;
  const close = useCallback(() => { isOpen.current = false; void flush(); setOpen(false); setConfirmDelete(false); }, [flush]);
  useEffect(() => {
    const show = () => {
      if (!isOpen.current && !document.activeElement?.closest(".memo-dialog")) lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      isOpen.current = true; setOpen(true);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (matchesShortcut("toggleMemos", event)) {
        // Preserve IME and other modal workflows; also works from the chat editor.
        if (!isOpen.current && document.querySelector('[role="dialog"]:not(.memo-dialog):not(.toast-card), [role="alertdialog"]')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (isOpen.current) close(); else show();
      } else if (isOpen.current && event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (confirmDelete) setConfirmDelete(false); else close();
      }
    };
    window.addEventListener(MEMOS_OPEN_EVENT, show);
    window.addEventListener("keydown", keydown, true);
    return () => { window.removeEventListener(MEMOS_OPEN_EVENT, show); window.removeEventListener("keydown", keydown, true); };
  }, [close, confirmDelete]);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => { if (lastFocus.current?.isConnected) lastFocus.current.focus(); lastFocus.current = null; }, 0);
    return () => clearTimeout(timer);
  }, [open]);
  const list = sortMemos(notes.memos.map(m => notes.draft?.id === m.id ? notes.draft : m)).filter(m => `${m.title}\n${m.content}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const disabled = notes.busy || notes.loading;
  const message = (code: string) => { const key = `memos.error.${code}`; return t(key) === key ? t("memos.error.save_failed") : t(key); };
  const button = (label: string, icon: React.ReactElement, action: () => void, unavailable = false, pressed?: boolean) =>
    <Tooltip content={label}><button type="button" className="memo-icon ui-focus-ring" aria-label={label} disabled={unavailable} aria-pressed={pressed} onClick={action}>{icon}</button></Tooltip>;
  function download() {
    if (!notes.draft) return;
    const blob = new Blob([`${notes.draft.title ? `# ${notes.draft.title}\n\n` : ""}${notes.draft.content}`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${(notes.draft.title || "memo").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80)}.md`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
    <DialogContent className="memo-dialog" ariaLabel={t("memos.title")} style={{ width: "min(960px, calc(100vw - 24px))", maxWidth: "calc(100vw - 24px)", height: "min(720px, 86dvh)", maxHeight: "86dvh", padding: 0, overflow: "hidden", borderRadius: 8 }}>
      <header className="memo-header"><StickyNote size={18} /><DialogTitle style={{ fontFamily: "inherit", fontSize: 16, margin: 0, flex: 1 }}>{t("memos.title")}</DialogTitle>{button(t("memos.close"), <X size={18} />, close)}</header>
      {notes.error && <div className="memo-alert" role="alert"><span>{message(notes.error)}</span><div className="memo-alert-actions">
        {notes.phase === "conflict" ? <>
          <button type="button" disabled={disabled} onClick={() => void notes.create(true)}>{t("memos.saveCopy")}</button>
          <button type="button" disabled={disabled} onClick={() => { if (window.confirm(t("memos.confirmLatest"))) void notes.loadLatest(); }}>{t("memos.useLatest")}</button>
        </> : <button type="button" disabled={disabled} onClick={() => void notes.retry()}>{t("memos.retry")}</button>}
      </div></div>}
      {notes.backupFailed && <div className="memo-alert" role="alert">{t("memos.backupFailed")}</div>}
      <div className="memo-layout" data-mobile-list={mobileList}>
        <aside className="memo-sidebar" aria-label={t("memos.list")}>
          <div className="memo-list-toolbar">
            <label className="memo-search"><Search size={15} /><input type="search" aria-label={t("memos.search")} placeholder={t("memos.search")} value={search} onChange={e => setSearch(e.target.value)} /></label>
            {button(t("memos.new"), <Plus size={18} />, () => { setSearch(""); setConfirmDelete(false); void notes.create().then(() => setMobileList(false)); }, disabled)}
            {button(t("memos.refresh"), <RefreshCw size={15} />, () => void notes.refresh(), disabled)}
          </div>
          <div className="memo-list" aria-busy={notes.loading}>
            {notes.loading && !notes.memos.length ? <p className="memo-empty">{t("memos.loading")}</p> : list.length ? list.map(m => <button className="memo-list-item" type="button" key={m.id} disabled={disabled} aria-current={notes.draft?.id === m.id ? "true" : undefined} onClick={() => { setConfirmDelete(false); void notes.select(m).then(() => setMobileList(false)); }}>
              <span className="memo-list-title">{m.pinned && <Pin size={12} />}<strong>{m.title.trim() || t("memos.untitled")}</strong></span>
              <span className="memo-snippet">{m.content.replace(/\s+/g, " ").slice(0, 110) || t("memos.emptyNote")}</span>
              <time dateTime={m.updatedAt}>{new Date(m.updatedAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</time>
            </button>) : <p className="memo-empty">{t(search ? "memos.noResults" : "memos.empty")}</p>}
          </div>
          <footer className="memo-list-footer">{notes.memos.length} {t("memos.count")}</footer>
        </aside>
        <section className="memo-editor" aria-label={t("memos.editor")}>
          <div className="memo-editor-toolbar">
            <span className="memo-back">{button(t("memos.back"), <ArrowLeft size={17} />, () => setMobileList(true))}</span>
            <div className="memo-modes" role="group" aria-label={t("memos.mode")}>
              {button(t("memos.edit"), <SquarePen size={16} />, () => setPreview(false), !notes.draft, !preview)}
              {button(t("memos.preview"), <Eye size={16} />, () => setPreview(true), !notes.draft, preview)}
            </div>
            <span className="memo-toolbar-spacer" />
            {button(t(notes.draft?.pinned ? "memos.unpin" : "memos.pin"), <Pin size={16} />, () => notes.edit({ pinned: !notes.draft?.pinned }), disabled || !notes.draft, !!notes.draft?.pinned)}
            {button(t("memos.download"), <Download size={16} />, download, !notes.draft)}
            {button(t("memos.delete"), <Trash2 size={16} />, () => setConfirmDelete(true), disabled || !notes.draft)}
          </div>
          {confirmDelete && <div className="memo-alert" role="alert"><span>{t("memos.confirmDelete")}</span><div className="memo-alert-actions"><button type="button" disabled={disabled} onClick={() => { void notes.remove().then(() => setConfirmDelete(false)); }}>{t("memos.delete")}</button><button type="button" onClick={() => setConfirmDelete(false)}>{t("memos.cancel")}</button></div></div>}
          {notes.draft ? <>
            <input className="memo-title-input" aria-label={t("memos.noteTitle")} placeholder={t("memos.untitled")} maxLength={MAX_MEMO_TITLE} value={notes.draft.title} disabled={disabled} onChange={e => notes.edit({ title: e.target.value })} />
            {preview ? <div className="memo-preview" data-selection-scope="memo"><MarkdownBody>{notes.draft.content}</MarkdownBody></div>
              : <textarea className="memo-content" aria-label={t("memos.content")} placeholder={t("memos.content")} maxLength={MAX_MEMO_CONTENT} value={notes.draft.content} disabled={disabled} onChange={e => notes.edit({ content: e.target.value })} />}
            <footer className="memo-editor-footer"><span role="status">{notes.phase === "saving" ? <Loader2 className="memo-spin" size={13} /> : notes.phase === "saved" ? <Check size={13} /> : null}{t(`memos.${notes.phase}`)}</span><span>{notes.draft.content.length.toLocaleString(locale)} / {MAX_MEMO_CONTENT.toLocaleString(locale)}</span></footer>
          </> : <div className="memo-editor-empty"><FileText size={28} /><p>{t("memos.empty")}</p><button type="button" disabled={disabled} onClick={() => { void notes.create().then(() => setMobileList(false)); }}><Plus size={16} />{t("memos.new")}</button></div>}
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}

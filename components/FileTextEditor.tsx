"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { encodeFilePathForApi } from "@/lib/file-paths";
import type { FileEditorStatus } from "@/lib/file-editing";
import { useI18n } from "@/lib/i18n";
import { formatApiError } from "@/lib/i18n/api-error";
import { Alert, ConfirmDialog } from "./ui/field";

interface Snapshot { content: string; revision: string }
interface Props {
  filePath: string;
  onClose: () => void;
  onStateChange?: (filePath: string, status: FileEditorStatus) => void;
  onSaved?: () => void;
}

export function FileTextEditor({ filePath, onClose, onStateChange, onSaved }: Props) {
  const { t } = useI18n();
  const [base, setBase] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
  const [reload, setReload] = useState(0);
  const url = `/api/files/${encodeFilePathForApi(filePath)}?type=edit`;
  const dirty = base !== null && draft !== base.content;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setError(formatApiError(data)); return; }
        setBase(data);
        setDraft(data.content);
        setError(null);
        setConflict(false);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(String(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, reload]);

  useEffect(() => {
    onStateChange?.(filePath, saving ? "saving" : dirty ? "dirty" : "clean");
  }, [filePath, onStateChange, dirty, saving]);
  useEffect(() => () => onStateChange?.(filePath, "clean"), [filePath, onStateChange]);

  const save = useCallback(async () => {
    if (!base || !dirty || loading || savingRef.current || conflict) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, revision: base.revision }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data));
        setConflict(response.status === 409);
        return;
      }
      setBase(data);
      setDraft(data.content);
      onSaved?.();
    } catch (failure) { setError(String(failure)); }
    finally { savingRef.current = false; setSaving(false); }
  }, [base, dirty, loading, conflict, draft, url, onSaved]);

  const requestDiscard = (action: "close" | "reload") => {
    if (savingRef.current) return;
    if (dirty) setDiscard(action);
    else if (action === "close") onClose();
    else setReload((value) => value + 1);
  };

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div className="file-viewer-toolbar" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 8, borderBottom: "1px solid var(--border)" }}>
        <button className="file-edit-action" disabled={saving} onClick={() => requestDiscard("close")}><ArrowLeft size={14} /> {t("fileEditing.preview")}</button>
        <span title={filePath} style={{ flex: 1, minWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 11 }}>{filePath}</span>
        <span role="status" style={{ fontSize: 11, color: dirty ? "var(--status-warning)" : "var(--text-muted)" }}>{t(saving ? "fileEditing.saving" : dirty ? "fileEditing.unsaved" : "fileEditing.saved")}</span>
        <button className="file-edit-action" disabled={loading || saving} onClick={() => requestDiscard("reload")}><RefreshCw size={14} /> {t("fileEditing.reload")}</button>
        <button className="file-edit-action" disabled={!dirty || saving || loading || conflict} onClick={() => void save()}><Save size={14} /> {t("fileEditing.save")}</button>
      </div>
      {error && <Alert variant="error" description={error} />}
      {conflict && <Alert variant="warning" description={t("fileEditing.conflictHelp")} />}
      {loading && <div role="status" style={{ padding: 12 }}>{t("fileViewer.loading")}</div>}
      {base && <textarea
        aria-label={t("fileEditing.content", { path: filePath })}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={saving || loading}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        style={{ flex: 1, minHeight: 0, width: "100%", resize: "none", padding: 16, boxSizing: "border-box", border: "none", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, tabSize: 2 }}
      />}
      <ConfirmDialog open={discard !== null} onOpenChange={(open) => { if (!open) setDiscard(null); }}
        title={t("fileEditing.discardTitle")} description={t("fileEditing.discardDescription")}
        confirmLabel={t("fileEditing.discard")} cancelLabel={t("fileEditing.cancel")} danger
        onConfirm={() => { const action = discard; setDiscard(null); if (action === "close") onClose(); else setReload((value) => value + 1); }} />
    </div>
  );
}

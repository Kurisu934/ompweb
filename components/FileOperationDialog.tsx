"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { Alert, Field, TextInput } from "./ui/field";
import { encodeFilePathForApi, getFileDirectory, joinFilePath } from "@/lib/file-paths";
import { useI18n } from "@/lib/i18n";
import { formatApiError } from "@/lib/i18n/api-error";

export type FileOperationKind = "create-file" | "create-directory" | "rename" | "delete";
export interface FileOperationRequest {
  kind: FileOperationKind | "actions";
  path: string;
  name?: string;
  isDir?: boolean;
}

interface Props {
  request: FileOperationRequest;
  onClose: () => void;
  onBeforeMutation?: (paths: string[]) => boolean;
  onComplete: (kind: FileOperationKind, path?: string) => void;
}

export function FileOperationDialog({ request, onClose, onBeforeMutation, onComplete }: Props) {
  const { t } = useI18n();
  const [kind, setKind] = useState(request.kind);
  const [name, setName] = useState(request.kind === "rename" ? request.name ?? "" : "");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (kind === "actions" || busyRef.current) return;
    const destination = kind === "delete" ? request.path : joinFilePath(kind === "rename" ? getFileDirectory(request.path) : request.path, name);
    if (onBeforeMutation && !onBeforeMutation(kind === "rename" ? [request.path, destination] : [destination])) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/files/${encodeFilePathForApi(request.path)}`, {
        method: kind === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(kind !== "delete" ? { body: JSON.stringify({ action: kind, name }) } : {}),
      });
      const data = await response.json();
      if (!response.ok) { setError(formatApiError(data)); return; }
      onComplete(kind, data.path);
    } catch (failure) { setError(String(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const actions: FileOperationKind[] = [...(request.isDir ? ["create-file", "create-directory"] as const : []), "rename", "delete"];
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busyRef.current) onClose(); }}>
      <DialogContent ariaLabel={t(`fileEditing.${kind}`)} style={{ width: 440, maxWidth: "92vw", padding: 22 }}>
        <DialogTitle>{t(`fileEditing.${kind}`)}</DialogTitle>
        <p style={{ fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{request.path}</p>
        {kind === "actions" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actions.map((action) => <button key={action} className="file-edit-action" style={{ minHeight: 36, color: action === "delete" ? "var(--status-error)" : "var(--text)" }} onClick={() => { setKind(action); setName(action === "rename" ? request.name ?? "" : ""); }}>{t(`fileEditing.${action}`)}</button>)}
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void submit(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {kind === "delete" ? <Alert variant="warning" description={t("fileEditing.deleteWarning")} /> : (
              <Field label={t("fileEditing.name")}><TextInput value={name} onChange={setName} disabled={busy} /></Field>
            )}
            {error && <Alert variant="error" description={error} />}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="file-edit-action" disabled={busy} onClick={onClose}>{t("fileEditing.cancel")}</button>
              <button type="submit" className="file-edit-action" disabled={busy || (kind !== "delete" && !name)} style={{ minHeight: 36, color: kind === "delete" ? "var(--status-error)" : "var(--accent)" }}>{t(`fileEditing.${kind}`)}</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

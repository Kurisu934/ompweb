"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FileText, Save, Trash2 } from "lucide-react";
import { Alert, ConfirmDialog, Field, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import {
  MAX_AGENT_INSTRUCTION_LENGTH, parseAgentInstructionTarget, resolveAgentInstructions, sameInstructionTarget,
  type AgentInstructionRule, type AgentInstructionTarget,
} from "@/lib/agent-instructions";

type Draft = { scope: AgentInstructionTarget["scope"]; provider: string; modelId: string; text: string };
type ModelChoice = { provider: string; id: string; name: string };
const emptyDraft: Draft = { scope: "global", provider: "", modelId: "", text: "" };
const controlStyle: CSSProperties = { width: "100%", minWidth: 0, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg)", color: "var(--text)", fontSize: 13 };
const buttonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg-panel)", color: "var(--text)", cursor: "pointer", fontSize: 12 };
function targetKey(target: AgentInstructionTarget): string {
  return JSON.stringify([target.scope, target.scope !== "global" ? target.provider : "", target.scope === "model" ? target.modelId : ""]);
}
function toDraft(rule: AgentInstructionRule): Draft {
  return { scope: rule.scope, provider: rule.scope !== "global" ? rule.provider : "", modelId: rule.scope === "model" ? rule.modelId : "", text: rule.text };
}

export function AgentInstructionsConfig() {
  const { t } = useI18n();
  const [rules, setRules] = useState<AgentInstructionRule[]>([]);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("new");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent-instructions", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.statusText);
      if (controller.signal.aborted) return;
      const loaded: AgentInstructionRule[] = data.rules;
      setRules(loaded);
      const initial = loaded.find((rule) => rule.scope === "global") ?? loaded[0];
      const initialDraft = initial ? toDraft(initial) : emptyDraft;
      setSelection(initial ? targetKey(initial) : "new");
      setDraft(initialDraft);
      setBaseline(initialDraft);
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(String(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/models", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || data.modelError) throw new Error(data.error || data.modelError);
      if (controller.signal.aborted) return;
      setModels(data.modelList ?? []);
      setConnectedProviders((data.connectedProviders ?? []).map((provider: { id: string }) => provider.id));
    }).catch(() => { if (!controller.signal.aborted) setCatalogFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, []);

  const selected = rules.find((rule) => targetKey(rule) === selection);
  const dirty = draft.scope !== baseline.scope || draft.provider !== baseline.provider || draft.modelId !== baseline.modelId || draft.text !== baseline.text;
  let target: AgentInstructionTarget | null = null;
  try { target = parseAgentInstructionTarget(draft); } catch { /* Incomplete provider/model fields. */ }
  const duplicate = selection === "new" && target !== null && rules.some((rule) => sameInstructionTarget(rule, target!));
  const effective = target ? resolveAgentInstructions(rules, target.scope !== "global" ? target.provider : undefined, target.scope === "model" ? target.modelId : undefined) : undefined;
  const providers = [...new Set([...connectedProviders, ...models.map((model) => model.provider)])].sort();
  const modelIds = [...new Set(models.filter((model) => model.provider === draft.provider).map((model) => model.id))].sort();
  const disabled = loading || busy || !!loadError;
  const label = (rule: AgentInstructionTarget) => rule.scope === "global" ? t("agentInstructions.global")
    : rule.scope === "provider" ? `${t("agentInstructions.provider")} · ${rule.provider}`
    : `${t("agentInstructions.model")} · ${rule.provider} / ${rule.modelId}`;

  function choose(key: string) {
    const rule = rules.find((item) => targetKey(item) === key);
    const next = rule ? toDraft(rule) : { ...emptyDraft, scope: rules.some((item) => item.scope === "global") ? "provider" as const : "global" as const };
    setSelection(rule ? targetKey(rule) : "new");
    setDraft(next);
    setBaseline(next);
    setSwitchTo(null);
  }
  async function persist(remove = false) {
    if (!target || (remove && !selected)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/agent-instructions", {
        method: remove ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? selected : { ...target, text: draft.text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("agentInstructions.saveFailed"));
      const nextRules: AgentInstructionRule[] = data.rules;
      setRules(nextRules);
      const next = remove ? nextRules.find((rule) => rule.scope === "global") ?? nextRules[0]
        : nextRules.find((rule) => sameInstructionTarget(rule, target!));
      const nextDraft = next ? toDraft(next) : emptyDraft;
      setSelection(next ? targetKey(next) : "new");
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setConfirmDelete(false);
      toast.success(t(remove ? "agentInstructions.deleted" : "agentInstructions.saved"));
    } catch (error) { toast.error(String(error)); }
    finally { setBusy(false); }
  }

  return (
    <section className="wallpaper-inset" aria-label={t("agentInstructions.title")} data-setting-id="agent-instructions" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-card)", background: "var(--bg-panel)", minWidth: 0 }}>
      <div>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 15, color: "var(--text)" }}><FileText size={17} aria-hidden="true" />{t("agentInstructions.title")}</h3>
        <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>{t("agentInstructions.description")}</p>
      </div>
      {loading && <span role="status">{t("agentInstructions.loading")}</span>}
      {loadError && <><Alert variant="error" title={t("agentInstructions.loadFailed")} description={loadError} /><button className="agent-config-action wallpaper-inset" type="button" style={buttonStyle} onClick={() => { setLoadError(""); setLoading(true); setReload((value) => value + 1); }}>{t("agentInstructions.retry")}</button></>}
      <Field label={t("agentInstructions.rules")}>
        <Select
          className="agent-config-action wallpaper-inset"
          value={selection}
          disabled={disabled}
          style={controlStyle}
          onChange={(nextValue) => dirty ? setSwitchTo(nextValue) : choose(nextValue)}
          options={[
            ...rules.map((rule) => ({ value: targetKey(rule), label: label(rule) })),
            { value: "new", label: t("agentInstructions.newRule") },
          ]}
        />
      </Field>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Field label={t("agentInstructions.scope")} style={{ flex: "1 1 140px" }}>
          <Select
            className="agent-config-action wallpaper-inset"
            style={controlStyle}
            value={draft.scope}
            disabled={disabled || !!selected}
            onChange={(nextValue) => setDraft({ ...draft, scope: nextValue as Draft["scope"] })}
            options={[
              ...(["global", "provider", "model"] as const).map((scope) => ({ value: scope, label: t(`agentInstructions.${scope}`) })),
            ]}
          />
        </Field>
        {draft.scope !== "global" && <Field label={t("agentInstructions.providerId")} style={{ flex: "2 1 180px" }}>
          <Select
            className="agent-config-action wallpaper-inset"
            style={controlStyle}
            value={draft.provider}
            disabled={disabled || !!selected || catalogLoading || providers.length === 0}
            onChange={(nextValue) => setDraft({ ...draft, provider: nextValue, modelId: "" })}
            options={[
              { value: "", label: t(catalogLoading ? "agentInstructions.loadingCatalog" : providers.length ? "agentInstructions.selectProvider" : "agentInstructions.noProviders"), disabled: true },
              ...(selected && draft.provider && !providers.includes(draft.provider) ? [{ value: draft.provider, label: draft.provider, disabled: true }] : []),
              ...providers.map((provider) => ({ value: provider, label: provider })),
            ]}
          />
        </Field>}
        {draft.scope === "model" && <Field label={t("agentInstructions.modelId")} style={{ flex: "2 1 180px" }}>
          <Select
            className="agent-config-action wallpaper-inset"
            style={controlStyle}
            value={draft.modelId}
            disabled={disabled || !!selected || catalogLoading || !draft.provider || modelIds.length === 0}
            onChange={(nextValue) => setDraft({ ...draft, modelId: nextValue })}
            options={[
              { value: "", label: t(catalogLoading ? "agentInstructions.loadingCatalog" : !draft.provider ? "agentInstructions.selectProvider" : modelIds.length ? "agentInstructions.selectModel" : "agentInstructions.noModels"), disabled: true },
              ...(selected && draft.modelId && !modelIds.includes(draft.modelId) ? [{ value: draft.modelId, label: draft.modelId, disabled: true }] : []),
              ...modelIds.map((modelId) => {
              const name = models.find((model) => model.provider === draft.provider && model.id === modelId)?.name;
              return ({ value: modelId, label: name && name !== modelId ? `${name} (${modelId})` : modelId });
            }),
            ]}
          />
        </Field>}
      </div>
      {draft.scope !== "global" && <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>{t(catalogFailed ? "agentInstructions.catalogFailed" : "agentInstructions.idsHint")}</p>}
      {duplicate && <Alert variant="warning" description={t("agentInstructions.duplicate")} />}
      <Field label={t("agentInstructions.prompt")} hint={t("agentInstructions.emptyHint")}>
        <textarea className="wallpaper-inset" style={{ ...controlStyle, minHeight: 180, resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.6 }} value={draft.text} disabled={disabled} maxLength={MAX_AGENT_INSTRUCTION_LENGTH} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="agent-config-action wallpaper-inset" type="button" style={{ ...buttonStyle, color: "var(--accent-strong)", borderColor: "var(--accent-strong)", opacity: disabled || !target || duplicate || (!!selected && !dirty) ? 0.5 : 1 }} disabled={disabled || !target || duplicate || (!!selected && !dirty)} onClick={() => void persist()}><Save size={14} aria-hidden="true" />{t(busy ? "agentInstructions.saving" : "agentInstructions.save")}</button>
        <button className="agent-config-action wallpaper-inset" type="button" style={{ ...buttonStyle, opacity: disabled || !dirty ? 0.5 : 1 }} disabled={disabled || !dirty} onClick={() => setDraft(baseline)}>{t("agentInstructions.cancel")}</button>
        {selected && <button className="agent-config-action wallpaper-inset" type="button" style={buttonStyle} disabled={disabled} onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden="true" />{t("agentInstructions.delete")}</button>}
        <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11 }}>{draft.text.length} / {MAX_AGENT_INSTRUCTION_LENGTH}</span>
      </div>
      <details style={{ fontSize: 12, color: "var(--text-muted)" }}>
        <summary style={{ cursor: "pointer", overflowWrap: "anywhere" }}>{t("agentInstructions.effective")} {effective ? label(effective) : t("agentInstructions.none")}</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto", fontFamily: "var(--font-mono)", color: "var(--text)" }}>{effective?.text || t("agentInstructions.noAppend")}</pre>
      </details>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: "var(--text-muted)" }}>{t("agentInstructions.applies")}</p>
      <ConfirmDialog open={switchTo !== null} onOpenChange={(open) => { if (!open) setSwitchTo(null); }} title={t("agentInstructions.discardTitle")} description={t("agentInstructions.discardDescription")} confirmLabel={t("agentInstructions.discard")} cancelLabel={t("agentInstructions.cancel")} onConfirm={() => { if (switchTo !== null) choose(switchTo); }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("agentInstructions.delete")} description={t("agentInstructions.deleteDescription")} confirmLabel={t("agentInstructions.delete")} cancelLabel={t("agentInstructions.cancel")} danger busy={busy} onConfirm={() => void persist(true)} />
    </section>
  );
}

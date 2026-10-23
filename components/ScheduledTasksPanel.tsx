"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Copy, MessageSquare, Pencil, Play, Plus, RefreshCw, SquarePlus, Trash2, X } from "lucide-react";
import { Alert, Autocomplete, Check, ConfirmDialog, Field, NumInput, Select, TextInput } from "@/components/ui/field";
import { Dialog, DialogContent, DialogTitle, Tooltip } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { formatApiError } from "@/lib/i18n/api-error";
import { MIN_INTERVAL_MINUTES, type ScheduleRepeat } from "@/lib/schedule-recurrence";
import type { ScheduledTaskRunView, ScheduledTaskView } from "@/lib/scheduled-tasks";
import { SCHEDULED_TASKS_OPEN_EVENT } from "@/lib/scheduled-tasks-ui";
import { selectableThinkingLevels } from "@/lib/thinking-levels";
import type { SessionInfo } from "@/lib/types";
import "./scheduled-tasks.css";

type T = (key: string, vars?: Record<string, string | number>) => string;

interface CatalogModel { id: string; name?: string; provider: string; thinkingLevels?: string[] }

const RECENT_RUNS = 10;
const MAX_SESSION_CHOICES = 300;

async function request<R>(url: string, init?: RequestInit): Promise<R> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({})) as R & { error?: string; code?: string };
  if (!response.ok || body.error) throw new Error(formatApiError({ ...body, error: body.error ?? `HTTP ${response.status}` }));
  return body;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function formatAt(at: number, locale: string): string {
  return new Date(at).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Short weekday names, index 0 = Sunday (2026-10-18 is a Sunday). */
function weekdayNames(locale: string): string[] {
  return Array.from({ length: 7 }, (_, day) => new Date(2026, 9, 18 + day).toLocaleDateString(locale, { weekday: "short" }));
}

function describeRepeat(repeat: ScheduleRepeat, t: T, locale: string): string {
  switch (repeat.kind) {
    case "once": return t("scheduledTasks.repeatOnceAt", { time: formatAt(repeat.at, locale) });
    case "interval": {
      const interval = repeat.minutes % 60 === 0
        ? t("scheduledTasks.hours", { count: repeat.minutes / 60 })
        : t("scheduledTasks.minutes", { count: repeat.minutes });
      return t("scheduledTasks.repeatEvery", { interval });
    }
    case "daily": return t("scheduledTasks.repeatDailyAt", { time: repeat.time });
    case "weekly": {
      const names = weekdayNames(locale);
      return t("scheduledTasks.repeatWeeklyAt", { days: repeat.days.map((day) => names[day]).join(", "), time: repeat.time });
    }
    case "webhook": return t("scheduledTasks.repeatWebhook");
  }
}

function nextRunText(task: ScheduledTaskView, t: T, locale: string): string {
  if (!task.enabled) return t("scheduledTasks.paused");
  if (task.repeat.kind === "webhook") return t("scheduledTasks.waitingForWebhook");
  if (task.nextRunAt === null) return t("scheduledTasks.noNextRun");
  return t("scheduledTasks.nextRun", { time: formatAt(task.nextRunAt, locale) });
}

function runLabel(run: ScheduledTaskRunView, t: T): string {
  if (run.running) return t("scheduledTasks.runRunning");
  if (run.status === "skipped") return t("scheduledTasks.runSkipped");
  if (run.status === "failed") return t("scheduledTasks.runFailed");
  return run.timedOut ? t("scheduledTasks.runTimedOut") : t("scheduledTasks.runStarted");
}

function sessionLabel(session: SessionInfo): string {
  const title = session.name?.trim() || session.firstMessage.replace(/\s+/g, " ").trim() || session.id;
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}

/** The workspace a session belongs to (worktrees group under their repo). */
function sessionWorkspace(session: SessionInfo): string {
  return session.projectRoot ?? session.cwd;
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** `<input type="datetime-local">` value in local time. */
function toLocalInput(at: number): string {
  return new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface Draft {
  target: "new" | "session";
  /** Workspace whose sessions the session picker lists. */
  sessionWorkspace: string;
  sessionId: string;
  name: string;
  cwd: string;
  message: string;
  kind: ScheduleRepeat["kind"];
  onceAt: string;
  intervalValue: string;
  intervalUnit: "minutes" | "hours";
  time: string;
  days: number[];
  model: string;
  thinkingLevel: string;
  advisor: boolean;
  keepRuns: string;
  maxRunMinutes: string;
  enabled: boolean;
  webhookIncludeBody: boolean;
}

function draftFor(task: ScheduledTaskView | null, defaults: { cwd: string; sessionId: string | null }, sessions: SessionInfo[]): Draft {
  const repeat = task?.repeat;
  const intervalMinutes = repeat?.kind === "interval" ? repeat.minutes : 60;
  const sessionId = task?.targetSessionId ?? defaults.sessionId ?? "";
  const session = sessions.find((entry) => entry.id === sessionId);
  return {
    target: task ? (task.targetSessionId ? "session" : "new") : "new",
    sessionWorkspace: session ? sessionWorkspace(session) : task?.targetSessionId ? task.cwd : defaults.cwd,
    sessionId,
    name: task?.name ?? "",
    cwd: task && !task.targetSessionId ? task.cwd : defaults.cwd,
    message: task?.message ?? "",
    kind: repeat?.kind ?? "daily",
    onceAt: toLocalInput(repeat?.kind === "once" ? repeat.at : Date.now() + 3_600_000),
    intervalValue: String(intervalMinutes % 60 === 0 ? intervalMinutes / 60 : intervalMinutes),
    intervalUnit: intervalMinutes % 60 === 0 ? "hours" : "minutes",
    time: repeat?.kind === "daily" || repeat?.kind === "weekly" ? repeat.time : "09:00",
    days: repeat?.kind === "weekly" ? repeat.days : [1, 2, 3, 4, 5],
    model: task?.provider && task.modelId ? `${task.provider}/${task.modelId}` : "",
    thinkingLevel: task?.thinkingLevel ?? "",
    advisor: task?.advisor ?? false,
    keepRuns: String(task?.keepRuns ?? 10),
    maxRunMinutes: String(task?.maxRunMinutes ?? 60),
    enabled: task?.enabled ?? true,
    webhookIncludeBody: task?.webhookIncludeBody ?? false,
  };
}

/** The request body for a draft, or a localized error. */
function draftToInput(draft: Draft, t: T): Record<string, unknown> | string {
  let repeat: ScheduleRepeat;
  if (draft.kind === "once") {
    const at = new Date(draft.onceAt).getTime();
    if (!Number.isFinite(at)) return t("scheduledTasks.errorTime");
    repeat = { kind: "once", at };
  } else if (draft.kind === "interval") {
    const minutes = Number(draft.intervalValue) * (draft.intervalUnit === "hours" ? 60 : 1);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES) return t("scheduledTasks.errorInterval", { min: MIN_INTERVAL_MINUTES });
    repeat = { kind: "interval", minutes };
  } else if (draft.kind === "daily") {
    repeat = { kind: "daily", time: draft.time };
  } else if (draft.kind === "weekly") {
    if (draft.days.length === 0) return t("scheduledTasks.errorDays");
    repeat = { kind: "weekly", days: draft.days, time: draft.time };
  } else {
    repeat = { kind: "webhook" };
  }
  const common = { name: draft.name, message: draft.message, repeat, enabled: draft.enabled, advisor: draft.advisor, webhookIncludeBody: draft.webhookIncludeBody };
  if (draft.target === "session") {
    if (!draft.sessionId) return t("scheduledTasks.errorSession");
    return { ...common, targetSessionId: draft.sessionId };
  }
  // Provider ids carry no "/", model ids may.
  const slash = draft.model.indexOf("/");
  return {
    ...common,
    cwd: draft.cwd,
    ...(slash > 0 ? { provider: draft.model.slice(0, slash), modelId: draft.model.slice(slash + 1) } : {}),
    ...(draft.thinkingLevel ? { thinkingLevel: draft.thinkingLevel } : {}),
    keepRuns: Number(draft.keepRuns),
    maxRunMinutes: Number(draft.maxRunMinutes),
  };
}

function TaskEditor({ task, defaults, sessions, onCancel, onSaved }: {
  task: ScheduledTaskView | null;
  defaults: { cwd: string; sessionId: string | null };
  sessions: SessionInfo[];
  onCancel: () => void;
  onSaved: (task: ScheduledTaskView) => void;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState(() => draftFor(task, defaults, sessions));
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };

  useEffect(() => {
    void request<{ modelList?: CatalogModel[] }>("/api/models").then((body) => setModels(body.modelList ?? []), () => {});
    void request<{ projects?: { path: string; hidden?: boolean }[] }>("/api/projects")
      .then((body) => setProjects((body.projects ?? []).filter((project) => !project.hidden).map((project) => project.path)), () => {});
  }, []);

  const selectedModel = models.find((entry) => `${entry.provider}/${entry.id}` === draft.model);
  const thinkingLevels = selectableThinkingLevels(selectedModel?.thinkingLevels ?? null);
  const names = weekdayNames(locale);
  // Sessions arrive newest first, so workspaces are ordered by latest activity.
  const workspaces = useMemo(() => [...new Set(sessions.map(sessionWorkspace))], [sessions]);
  const workspaceSessions = useMemo(
    () => sessions.filter((session) => sessionWorkspace(session) === draft.sessionWorkspace).slice(0, MAX_SESSION_CHOICES),
    [sessions, draft.sessionWorkspace],
  );

  const save = async () => {
    const input = draftToInput(draft, t);
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setSaving(true);
    try {
      const body = await request<{ task: ScheduledTaskView }>(
        task ? `/api/scheduled-tasks/${encodeURIComponent(task.id)}` : "/api/scheduled-tasks",
        jsonInit(task ? "PATCH" : "POST", input),
      );
      onSaved(body.task);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sched-form">
      <h3 className="sched-detail-title">{task ? t("scheduledTasks.editTitle") : t("scheduledTasks.newTitle")}</h3>
      <Field label={t("scheduledTasks.name")} required>
        <TextInput value={draft.name} onChange={(name) => update({ name })} placeholder={t("scheduledTasks.namePlaceholder")} />
      </Field>
      <div role="radiogroup" aria-label={t("scheduledTasks.target")} className="sched-target">
        {(["new", "session"] as const).map((target) => (
          <label key={target} className="sched-target-option" data-selected={draft.target === target}>
            <input type="radio" name="sched-target" checked={draft.target === target} onChange={() => update({ target })} />
            {target === "new" ? <SquarePlus size={15} aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}
            <span>
              <strong>{t(target === "new" ? "scheduledTasks.targetNew" : "scheduledTasks.targetSession")}</strong>
              <small>{t(target === "new" ? "scheduledTasks.targetNewHint" : "scheduledTasks.targetSessionHint")}</small>
            </span>
          </label>
        ))}
      </div>
      {draft.target === "session" ? (
        <div className="sched-row">
          <Field label={t("scheduledTasks.workspace")} style={{ flex: 1, minWidth: 160 }} required>
            <Select
              className="sched-input"
              value={draft.sessionWorkspace}
              onChange={(nextValue) => {
                const workspace = nextValue;
                // Keep the session only if it belongs to the new workspace.
                const keep = sessions.some((session) => session.id === draft.sessionId && sessionWorkspace(session) === workspace);
                update({ sessionWorkspace: workspace, sessionId: keep ? draft.sessionId : "" });
              }}
              options={[
                { value: "", label: t("scheduledTasks.pickWorkspace") },
                ...(draft.sessionWorkspace && !workspaces.includes(draft.sessionWorkspace) ? [{ value: draft.sessionWorkspace, label: folderName(draft.sessionWorkspace) }] : []),
                ...workspaces.map((workspace) => (
                ({ value: workspace, label: workspaces.some((other) => other !== workspace && folderName(other) === folderName(workspace)) ? `${folderName(workspace)} — ${workspace}` : folderName(workspace), title: workspace })
              )),
              ]}
            />
          </Field>
          <Field label={t("scheduledTasks.session")} style={{ flex: 2, minWidth: 200 }} required>
            <Select
              className="sched-input"
              value={draft.sessionId}
              disabled={!draft.sessionWorkspace}
              onChange={(nextValue) => update({ sessionId: nextValue })}
              options={[
                { value: "", label: t(workspaceSessions.length ? "scheduledTasks.pickSession" : "scheduledTasks.noSessionsInWorkspace") },
                ...(draft.sessionId && !workspaceSessions.some((session) => session.id === draft.sessionId) ? [{ value: draft.sessionId, label: draft.sessionId }] : []),
                ...workspaceSessions.map((session) => (
                ({ value: session.id, label: session.worktreeBranch ? `${sessionLabel(session)} — ${session.worktreeBranch}` : sessionLabel(session) })
              )),
              ]}
            />
          </Field>
        </div>
      ) : (
        <Field label={t("scheduledTasks.workspace")} hint={t("scheduledTasks.workspaceHint")} required>
          <Autocomplete className="sched-input sched-mono" options={projects} value={draft.cwd} onChange={(cwd) => update({ cwd })} spellCheck={false} />
        </Field>
      )}
      <Field label={t("scheduledTasks.prompt")} required>
        <textarea className="sched-input" value={draft.message} onChange={(event) => update({ message: event.target.value })} rows={5} placeholder={t("scheduledTasks.promptPlaceholder")} />
      </Field>
      <div className="sched-row">
        <Field label={t("scheduledTasks.repeat")} style={{ flex: 1 }}>
          <Select
            className="sched-input"
            value={draft.kind}
            onChange={(nextValue) => update({ kind: nextValue as Draft["kind"] })}
            options={[
              { value: "daily", label: t("scheduledTasks.kindDaily") },
              { value: "weekly", label: t("scheduledTasks.kindWeekly") },
              { value: "interval", label: t("scheduledTasks.kindInterval") },
              { value: "once", label: t("scheduledTasks.kindOnce") },
              { value: "webhook", label: t("scheduledTasks.kindWebhook") },
            ]}
          />
        </Field>
        {draft.kind === "once" && (
          <Field label={t("scheduledTasks.runAt")} style={{ flex: 1 }}>
            <input className="sched-input" type="datetime-local" value={draft.onceAt} onChange={(event) => update({ onceAt: event.target.value })} />
          </Field>
        )}
        {draft.kind === "interval" && (
          <>
            <Field label={t("scheduledTasks.every")} style={{ width: 90 }}>
              <NumInput value={draft.intervalValue} onChange={(intervalValue) => update({ intervalValue })} />
            </Field>
            <Field label={t("scheduledTasks.unit")} style={{ width: 110 }}>
              <Select
                className="sched-input"
                value={draft.intervalUnit}
                onChange={(nextValue) => update({ intervalUnit: nextValue as Draft["intervalUnit"] })}
                options={[
                  { value: "minutes", label: t("scheduledTasks.unitMinutes") },
                  { value: "hours", label: t("scheduledTasks.unitHours") },
                ]}
              />
            </Field>
          </>
        )}
        {(draft.kind === "daily" || draft.kind === "weekly") && (
          <Field label={t("scheduledTasks.time")} style={{ width: 130 }}>
            <input className="sched-input" type="time" value={draft.time} onChange={(event) => update({ time: event.target.value })} />
          </Field>
        )}
      </div>
      {draft.kind === "weekly" && (
        <div role="group" aria-label={t("scheduledTasks.days")} className="sched-days">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <Check
              key={day}
              label={names[day]}
              checked={draft.days.includes(day)}
              onChange={(checked) => update({ days: checked ? [...draft.days, day].sort((a, b) => a - b) : draft.days.filter((value) => value !== day) })}
            />
          ))}
        </div>
      )}
      {draft.kind === "webhook" && (
        <div className="sched-note">
          <p>{t(task?.webhookToken ? "scheduledTasks.webhookEditHint" : "scheduledTasks.webhookNewHint")}</p>
          <Check label={t("scheduledTasks.webhookIncludeBody")} checked={draft.webhookIncludeBody} onChange={(webhookIncludeBody) => update({ webhookIncludeBody })} />
        </div>
      )}
      {draft.target === "new" && (
        <>
          <div className="sched-row">
            <Field label={t("scheduledTasks.model")} style={{ flex: 2 }}>
              <Select
                className="sched-input"
                value={draft.model}
                onChange={(nextValue) => update({ model: nextValue, thinkingLevel: "" })}
                options={[
                  { value: "", label: t("scheduledTasks.defaultModel") },
                  ...(draft.model && !selectedModel ? [{ value: draft.model, label: draft.model }] : []),
                  ...models.map((entry) => (
                  ({ value: `${entry.provider}/${entry.id}`, label: `${entry.provider} / ${entry.name ?? entry.id}` })
                )),
                ]}
              />
            </Field>
            <Field label={t("scheduledTasks.thinking")} style={{ flex: 1 }}>
              <Select
                className="sched-input"
                value={draft.thinkingLevel}
                onChange={(nextValue) => update({ thinkingLevel: nextValue })}
                options={[
                  { value: "", label: t("scheduledTasks.defaultThinking") },
                  ...thinkingLevels.map((level) => ({ value: level, label: level })),
                ]}
              />
            </Field>
          </div>
          <div className="sched-row">
            <Field label={t("scheduledTasks.keepRuns")} hint={t("scheduledTasks.keepRunsHint")} style={{ flex: 1 }}>
              <NumInput value={draft.keepRuns} onChange={(keepRuns) => update({ keepRuns })} />
            </Field>
            <Field label={t("scheduledTasks.maxRun")} hint={t("scheduledTasks.maxRunHint")} style={{ flex: 1 }}>
              <NumInput value={draft.maxRunMinutes} onChange={(maxRunMinutes) => update({ maxRunMinutes })} />
            </Field>
          </div>
        </>
      )}
      <div className="sched-days">
        <Check label={t("scheduledTasks.enabled")} checked={draft.enabled} onChange={(enabled) => update({ enabled })} />
        <Check label={t("scheduledTasks.advisor")} checked={draft.advisor} onChange={(advisor) => update({ advisor })} />
      </div>
      {error && <Alert variant="error" description={error} />}
      <div className="sched-actions sched-actions-end">
        <button type="button" className="sched-button ui-focus-ring" onClick={onCancel}>{t("scheduledTasks.cancel")}</button>
        <button type="button" className="sched-button sched-primary ui-focus-ring" onClick={() => void save()} disabled={saving}>{t("scheduledTasks.save")}</button>
      </div>
    </div>
  );
}

function WebhookInfo({ url, includeBody, onRegenerate }: { url: string; includeBody: boolean; onRegenerate: () => void }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const curl = includeBody
    ? `curl -X POST -H 'Content-Type: application/json' -d '{"example":true}' '${url}'`
    : `curl -X POST '${url}'`;
  const copy = (text: string) => {
    void copyText(text).then(() => toast.success(t("scheduledTasks.copied")), () => toast.error(t("scheduledTasks.copyFailed")));
  };
  return (
    <section className="sched-webhook" aria-label={t("scheduledTasks.webhookUrl")}>
      <div className="sched-runs-title">{t("scheduledTasks.webhookUrl")}</div>
      <div className="sched-webhook-row">
        <code className="sched-webhook-url">{url}</code>
        <button type="button" className="sched-button ui-focus-ring" onClick={() => copy(url)}><Copy size={13} aria-hidden="true" />{t("scheduledTasks.copy")}</button>
      </div>
      <div className="sched-webhook-row">
        <code className="sched-webhook-url sched-dim">{curl}</code>
        <button type="button" className="sched-button ui-focus-ring" onClick={() => copy(curl)}><Copy size={13} aria-hidden="true" />curl</button>
      </div>
      <p className="sched-dim">{t(includeBody ? "scheduledTasks.webhookUsageBody" : "scheduledTasks.webhookUsage")}</p>
      <div className="sched-actions">
        <button type="button" className="sched-button ui-focus-ring" onClick={() => setConfirming(true)}><RefreshCw size={13} aria-hidden="true" />{t("scheduledTasks.webhookRegenerate")}</button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("scheduledTasks.webhookRegenerate")}
        description={t("scheduledTasks.webhookRegenerateConfirm")}
        confirmLabel={t("scheduledTasks.webhookRegenerate")}
        cancelLabel={t("scheduledTasks.cancel")}
        danger
        onConfirm={() => { setConfirming(false); onRegenerate(); }}
      />
    </section>
  );
}

function TaskDetail({ task, session, onEdit, onDelete, onChanged, onOpenSession }: {
  task: ScheduledTaskView;
  session: SessionInfo | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
  onOpenSession: (sessionId: string, cwd: string) => void;
}) {
  const { t, locale } = useI18n();

  const act = async (body: unknown, success?: string) => {
    try {
      await request(`/api/scheduled-tasks/${encodeURIComponent(task.id)}`, jsonInit("PATCH", body));
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    await onChanged();
    // A manual run starts in the background; pick up its record shortly.
    setTimeout(() => { void onChanged(); }, 3_000);
  };

  const recent = task.runs.slice(-RECENT_RUNS).reverse();
  return (
    <div className="sched-detail">
      <h3 className="sched-detail-title">{task.name}</h3>
      <dl className="sched-facts">
        <dt>{t("scheduledTasks.target")}</dt>
        <dd>
          {task.targetSessionId ? (
            <button type="button" className="sched-link ui-focus-ring" onClick={() => onOpenSession(task.targetSessionId!, task.cwd)}>
              <MessageSquare size={13} aria-hidden="true" />
              {session ? sessionLabel(session) : t("scheduledTasks.sessionMissing")}
            </button>
          ) : (
            <span className="sched-mono" title={task.cwd}><SquarePlus size={13} aria-hidden="true" /> {t("scheduledTasks.targetNewIn", { cwd: task.cwd })}</span>
          )}
        </dd>
        <dt>{t("scheduledTasks.repeat")}</dt>
        <dd>{describeRepeat(task.repeat, t, locale)} · {nextRunText(task, t, locale)}</dd>
        {task.createdByAgent && (
          <>
            <dt>{t("scheduledTasks.origin")}</dt>
            <dd>
              {t(task.oneShot ? "scheduledTasks.agentCreatedOneShot" : "scheduledTasks.agentCreated")}
              {task.expiresAt !== undefined && ` · ${t("scheduledTasks.expiresAt", { time: formatAt(task.expiresAt, locale) })}`}
            </dd>
          </>
        )}
        {!task.targetSessionId && (task.provider || task.thinkingLevel) && (
          <>
            <dt>{t("scheduledTasks.model")}</dt>
            <dd>{[task.provider && task.modelId ? `${task.provider}/${task.modelId}` : null, task.thinkingLevel].filter(Boolean).join(" · ")}</dd>
          </>
        )}
      </dl>
      <pre className="sched-prompt">{task.message}</pre>
      {task.repeat.kind === "webhook" && task.webhookToken && (
        <WebhookInfo
          url={`${window.location.origin}/api/hooks/${task.webhookToken}`}
          includeBody={task.webhookIncludeBody}
          onRegenerate={() => void act({ action: "regenerate-webhook" }, t("scheduledTasks.webhookRegenerated"))}
        />
      )}
      <div className="sched-actions">
        <button type="button" className="sched-button ui-focus-ring" onClick={() => void act({ action: "run" }, t("scheduledTasks.runStartedToast"))}>
          <Play size={13} aria-hidden="true" />{t("scheduledTasks.runNow")}
        </button>
        <button type="button" className="sched-button ui-focus-ring" onClick={onEdit}>
          <Pencil size={13} aria-hidden="true" />{t("scheduledTasks.edit")}
        </button>
        <button type="button" className="sched-button sched-danger ui-focus-ring" onClick={onDelete}>
          <Trash2 size={13} aria-hidden="true" />{t("scheduledTasks.delete")}
        </button>
        <span className="sched-spacer" />
        <Check label={t("scheduledTasks.enabled")} checked={task.enabled} onChange={(enabled) => void act({ enabled })} />
      </div>
      <section aria-label={t("scheduledTasks.recentRuns")} className="sched-runs">
        <div className="sched-runs-title">{t("scheduledTasks.recentRuns")}</div>
        {recent.length === 0 ? <p className="sched-empty">{t("scheduledTasks.noRuns")}</p> : (
          <ul>
            {recent.map((run) => {
              const openable = Boolean(run.sessionId && !run.archived && run.status === "started");
              const content = (
                <>
                  <time>{formatAt(run.startedAt, locale)}</time>
                  <span data-status={run.running ? "running" : run.status}>{runLabel(run, t)}</span>
                  {run.trigger && <span className="sched-dim">{t(run.trigger === "webhook" ? "scheduledTasks.triggerWebhook" : "scheduledTasks.triggerManual")}</span>}
                  {run.archived && <span className="sched-dim">{t("scheduledTasks.archived")}</span>}
                  {run.error && <span className="sched-dim sched-ellipsis" title={run.error}>{run.error}</span>}
                </>
              );
              return (
                <li key={`${run.startedAt}-${run.status}`}>
                  {openable ? (
                    <button type="button" className="sched-run ui-focus-ring" title={t("scheduledTasks.openRun")} onClick={() => onOpenSession(run.sessionId!, task.cwd)}>{content}</button>
                  ) : <div className="sched-run">{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Scheduled tasks window (sidebar header button): list on the left, the
 * selected task or the editor on the right, like the memo window. */
export function ScheduledTasksPanel({ currentSessionId, currentCwd, onOpenSession }: {
  /** The open chat, offered as the default target of a new session task. */
  currentSessionId: string | null;
  currentCwd: string | null;
  onOpenSession: (sessionId: string, cwd: string) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<ScheduledTaskView[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [deleting, setDeleting] = useState<ScheduledTaskView | null>(null);
  const [mobileList, setMobileList] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setTasks((await request<{ tasks: ScheduledTaskView[] }>("/api/scheduled-tasks")).tasks);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SCHEDULED_TASKS_OPEN_EVENT, show);
    return () => window.removeEventListener(SCHEDULED_TASKS_OPEN_EVENT, show);
  }, []);

  // Runs start on the server; poll while open so runs and states show up.
  useEffect(() => {
    if (!open) return;
    void refresh();
    void request<{ sessions: SessionInfo[] }>("/api/sessions").then((body) => {
      setSessions([...body.sessions].sort((a, b) => b.modified.localeCompare(a.modified)));
    }, () => {});
    const timer = setInterval(() => { void refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [open, refresh]);

  const sorted = useMemo(() => [...(tasks ?? [])].sort((a, b) => (
    Number(b.enabled) - Number(a.enabled) || (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity) || a.name.localeCompare(b.name)
  )), [tasks]);
  const selected = sorted.find((task) => task.id === selectedId) ?? (editing === "new" ? undefined : sorted[0]);
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const remove = async (task: ScheduledTaskView) => {
    try {
      await request(`/api/scheduled-tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      if (selectedId === task.id) setSelectedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    setDeleting(null);
    await refresh();
  };

  const openSession = (sessionId: string, cwd: string) => {
    close();
    onOpenSession(sessionId, cwd);
  };

  const iconButton = (label: string, icon: React.ReactElement, action: () => void) => (
    <Tooltip content={label}><button type="button" className="sched-icon ui-focus-ring" aria-label={label} onClick={action}>{icon}</button></Tooltip>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sched-dialog" ariaLabel={t("scheduledTasks.title")} style={{ width: "min(980px, calc(100vw - 24px))", maxWidth: "calc(100vw - 24px)", height: "min(720px, 86dvh)", maxHeight: "86dvh", padding: 0, overflow: "hidden", borderRadius: 8 }}>
        <header className="sched-header">
          <CalendarClock size={18} aria-hidden="true" />
          <DialogTitle style={{ fontFamily: "inherit", fontSize: 16, margin: 0, flex: 1 }}>{t("scheduledTasks.title")}</DialogTitle>
          {iconButton(t("scheduledTasks.close"), <X size={18} />, close)}
        </header>
        {loadError && <div className="sched-alert" role="alert">{loadError}</div>}
        <div className="sched-layout" data-mobile-list={mobileList}>
          <aside className="sched-sidebar" aria-label={t("scheduledTasks.list")}>
            <div className="sched-list-toolbar">
              <button type="button" className="sched-button sched-primary ui-focus-ring" onClick={() => { setEditing("new"); setMobileList(false); }}>
                <Plus size={14} aria-hidden="true" />{t("scheduledTasks.add")}
              </button>
            </div>
            <div className="sched-list">
              {tasks === null ? <p className="sched-empty">{t("scheduledTasks.loading")}</p> : sorted.length === 0 ? (
                <p className="sched-empty">{t("scheduledTasks.empty")}</p>
              ) : sorted.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className="sched-list-item ui-focus-ring"
                  aria-current={editing !== "new" && selected?.id === task.id}
                  data-paused={!task.enabled}
                  onClick={() => { setSelectedId(task.id); setEditing(null); setMobileList(false); }}
                >
                  <span className="sched-list-title">
                    {task.targetSessionId ? <MessageSquare size={12} aria-hidden="true" /> : <SquarePlus size={12} aria-hidden="true" />}
                    <strong>{task.name}</strong>
                    {task.runs.some((run) => run.running) && <span className="sched-running-dot" aria-label={t("scheduledTasks.runRunning")} />}
                    {task.createdByAgent && <span className="sched-badge">{t("scheduledTasks.agentBadge")}</span>}
                  </span>
                  <span className="sched-snippet">{describeRepeat(task.repeat, t, locale)}</span>
                  <span className="sched-snippet">{nextRunText(task, t, locale)}</span>
                </button>
              ))}
            </div>
            <footer className="sched-list-footer">{t("scheduledTasks.footer")}</footer>
          </aside>
          <section className="sched-main" aria-label={t("scheduledTasks.details")}>
            <div className="sched-back">{iconButton(t("scheduledTasks.back"), <ArrowLeft size={17} />, () => { setMobileList(true); setEditing(null); })}</div>
            {editing ? (
              <TaskEditor
                key={editing === "new" ? "new" : selected?.id}
                task={editing === "edit" ? selected ?? null : null}
                defaults={{ cwd: currentCwd ?? "", sessionId: currentSessionId }}
                sessions={sessions}
                onCancel={() => setEditing(null)}
                onSaved={(task) => { setEditing(null); setSelectedId(task.id); void refresh(); }}
              />
            ) : selected ? (
              <TaskDetail
                task={selected}
                session={selected.targetSessionId ? sessionsById.get(selected.targetSessionId) : undefined}
                onEdit={() => setEditing("edit")}
                onDelete={() => setDeleting(selected)}
                onChanged={refresh}
                onOpenSession={openSession}
              />
            ) : (
              <div className="sched-placeholder">
                <CalendarClock size={28} aria-hidden="true" />
                <p>{t("scheduledTasks.intro")}</p>
                <button type="button" className="sched-button ui-focus-ring" onClick={() => { setEditing("new"); setMobileList(false); }}>
                  <Plus size={14} aria-hidden="true" />{t("scheduledTasks.add")}
                </button>
              </div>
            )}
          </section>
        </div>
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(next) => { if (!next) setDeleting(null); }}
          title={t("scheduledTasks.deleteTitle")}
          description={t(deleting?.targetSessionId ? "scheduledTasks.deleteSessionDescription" : "scheduledTasks.deleteDescription", { name: deleting?.name ?? "" })}
          confirmLabel={t("scheduledTasks.delete")}
          cancelLabel={t("scheduledTasks.cancel")}
          danger
          onConfirm={() => { if (deleting) void remove(deleting); }}
        />
      </DialogContent>
    </Dialog>
  );
}

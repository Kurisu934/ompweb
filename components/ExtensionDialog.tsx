"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { SendHorizontal } from "lucide-react";
import type { ExtensionUiRequest } from "@/lib/types";
import type { RpcAskDialogAnswer } from "@/lib/pi-types";
import { useI18n } from "@/lib/i18n";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useTouchTargets } from "@/hooks/useTouchTargets";
import { matchMobileViewport } from "@/hooks/useIsMobile";
import {
  parseAskProtocol,
  serializeAskAnswers,
  type AskAnswerResult,
} from "@/lib/omp/ask-protocol";
import {
  ExtensionAskForm,
  isAskQuestionAnswered,
  type QuestionAnswerState,
} from "./ExtensionAskForm";

export type ExtensionDialogRequest = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" | "ask" }
>;

export type ExtensionDialogResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true }
  | { answers: RpcAskDialogAnswer[] };

type AskDraft = { selected: string[]; other: string };
const EMPTY_ASK_DRAFT: AskDraft = { selected: [], other: "" };

// Keyboard-aware panel height. The on-screen keyboard shrinks the visible
// area, so a panel sized against the layout viewport alone keeps its footer
// (Cancel / Submit) below the keyboard. `dvh` follows the layout viewport —
// the placeholder cap — which older mobile browsers shrink for the keyboard
// too, so this is a backstop rather than a duplicate.
const DEFAULT_PANEL_MAX_HEIGHT = "min(420px, 60dvh)";
// Room the browser chrome and the keyboard accessory bar need above the panel.
const VIEWPORT_BLEED = 12;
// How much shorter the visual viewport must be before we call it a keyboard.
const KEYBOARD_INSET = 120;
// Some mobile browsers open the keyboard without resizing anything we can
// observe; a slow re-check costs nothing while a question is on screen.
const KEYBOARD_POLL_MS = 400;

function readPanelMaxHeight(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const visual = window.visualViewport?.height;
  const height = typeof visual === "number" && visual > 0
    ? Math.min(visual, window.innerHeight)
    : window.innerHeight;
  return height > 0 ? Math.max(180, Math.round(height - VIEWPORT_BLEED)) : undefined;
}

function subscribeViewport(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const viewport = window.visualViewport;
  // Feature-detect the methods too: Safari 13 shipped a bare `visualViewport`.
  if (typeof viewport?.addEventListener !== "function") return () => {};
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function useViewportMaxHeight(): number | undefined {
  return useSyncExternalStore(subscribeViewport, readPanelMaxHeight, () => undefined);
}

/**
 * Two signals, because neither alone is enough: `visualViewport` shrinking is
 * the real keyboard (fingerprint-free), and a coarse pointer means the tap
 * that focused a field will raise one even before the browser has repainted.
 * A slow re-check covers mobile browsers that resize nothing on focus.
 */
function useMobileInputOpen(panelRef: RefObject<HTMLDivElement | null>, attached: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!attached) {
      setOpen(false);
      return;
    }
    let focused = false;
    const update = () => {
      const visual = window.visualViewport?.height;
      const keyboardOpen = typeof visual === "number" && visual > 0 && visual < window.innerHeight - KEYBOARD_INSET;
      const isOpen = focused && (keyboardOpen || touchPointer());
      setOpen((current) => (current === isOpen ? current : isOpen));
    };
    const onFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      focused = Boolean(panel && event.target instanceof Node && panel.contains(event.target));
      update();
    };
    const onFocusOut = (event: FocusEvent) => {
      const panel = panelRef.current;
      const next = event.relatedTarget;
      focused = Boolean(next instanceof Node && panel && panel.contains(next));
      update();
    };
    update();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const poll = setInterval(update, KEYBOARD_POLL_MS);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      clearInterval(poll);
    };
  }, [attached, panelRef]);
  return open;
}

/**
 * Whether a composer-attached request should leave focus alone. Touch input
 * means the browser would raise the on-screen keyboard and yank the panel the
 * user has not read yet into view, so the request waits for a tap. The mobile
 * breakpoint covers where pointer media queries do not answer (older mobile
 * browsers, jsdom, a desktop browser's touch emulation); a narrow *desktop*
 * window is deferred too, which is the deliberate trade for never raising a
 * phone keyboard. Exported for the regression tests (#235).
 */
export function shouldDeferAttachedFocus(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return touchPointer() || matchMobileViewport();
}

/** The primary pointer is a finger: `(pointer: fine)` is the repo's test for a
 * mouse/trackpad, the same one `lib/composer-prefs.ts` uses for word
 * completion, so an unanswerable media query never counts as touch. */
function touchPointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(pointer: fine)").matches;
}

/** Corner control so a typed answer can be submitted without dismissing the
 * keyboard to reach the footer behind it. */
function inlineSubmitStyle(disabled: boolean, touchTarget: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 9px",
    minWidth: touchTarget ? 44 : undefined,
    minHeight: touchTarget ? 44 : undefined,
    borderRadius: 7,
    border: `1px solid ${disabled ? "var(--border)" : "var(--accent-strong)"}`,
    background: disabled ? "var(--bg-subtle)" : "var(--accent-strong)",
    color: disabled ? "var(--text-dim)" : "var(--on-accent)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
    flexShrink: 0,
  };
}

/** Single-select questions start on their recommended option. */
function initialAskDrafts(request: ExtensionDialogRequest): AskDraft[] {
  if (request.method !== "ask") return [];
  return request.questions.map((question) => {
    const recommended = question.multi || question.recommended === undefined ? undefined : question.options[question.recommended];
    return { selected: recommended ? [recommended.label] : [], other: "" };
  });
}

/**
 * Overlay dialog for `select` / `confirm` / `input` / `editor` / `ask` extension UI
 * requests. Polished UX:
 *   - entrance animation (fade backdrop + scale-in panel)
 *   - focus trap: focus moves into the dialog on open and is returned to the
 *     opener on close; Tab/Shift-Tab wrap inside (via useModalDialog)
 *   - Escape closes as "cancelled" (document-level, top-of-stack only)
 *   - backdrop click closes as "cancelled"
 * Logic and i18n keys are unchanged from the in-ChatWindow original.
 */
export function ExtensionDialog({
  request,
  onRespond,
  attached = false,
}: {
  request: ExtensionDialogRequest;
  onRespond: (
    request: ExtensionDialogRequest,
    response: ExtensionDialogResponse,
  ) => void | Promise<unknown>;
  /** Render as a composer panel instead of a full-chat overlay. */
  attached?: boolean;
}) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState(request.method === "editor" ? request.prefill ?? "" : "");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const requestIdRef = useRef(request.id);
  const [askDrafts, setAskDrafts] = useState(() => initialAskDrafts(request));
  const viewportMaxHeight = useViewportMaxHeight();
  const { touchTargets } = useTouchTargets();

  const askResult = useMemo(() => {
    if (request.method !== "input") return { isAsk: false as const };
    return parseAskProtocol(request.placeholder);
  }, [request]);

  const [askAnswers, setAskAnswers] = useState<Record<string, QuestionAnswerState>>(() => {
    if (request.method === "input") {
      const parsed = parseAskProtocol(request.placeholder);
      if (parsed.isAsk && parsed.valid) {
        const initial: Record<string, QuestionAnswerState> = {};
        for (const q of parsed.payload.questions) {
          initial[q.id] = {
            selectedOptions: [],
            customInput: "",
            isCustomActive: false,
          };
        }
        return initial;
      }
    }
    return {};
  });

  useEffect(() => {
    // SSE reconnects replay the same request as a fresh object, not a new question.
    if (requestIdRef.current === request.id) return;
    requestIdRef.current = request.id;
    setSubmitting(false);
    setValue(request.method === "editor" ? request.prefill ?? "" : "");
    setSelectedOption(null);
    setAskDrafts(initialAskDrafts(request));
    if (request.method === "input") {
      const parsed = parseAskProtocol(request.placeholder);
      if (parsed.isAsk && parsed.valid) {
        const initial: Record<string, QuestionAnswerState> = {};
        for (const q of parsed.payload.questions) {
          initial[q.id] = {
            selectedOptions: [],
            customInput: "",
            isCustomActive: false,
          };
        }
        setAskAnswers(initial);
      } else {
        setAskAnswers({});
      }
    } else {
      setAskAnswers({});
    }
  }, [request]);

  const askDraftAt = (index: number) => askDrafts[index] ?? EMPTY_ASK_DRAFT;

  // Multi-select may stay empty; single-select needs a choice or an answer.
  const canSubmitNativeAsk = request.method === "ask" && request.questions.every((question, index) =>
    question.multi || askDraftAt(index).selected.length > 0 || askDraftAt(index).other.trim() !== ""
  );

  const canSubmitTelegramAsk = askResult.isAsk && askResult.valid && askResult.payload.questions.every((q) =>
    isAskQuestionAnswered(q, askAnswers[q.id])
  );

  const canSubmit = submitting ? false : (
    request.method === "ask"
      ? canSubmitNativeAsk
      : askResult.isAsk
        ? canSubmitTelegramAsk
        : request.method === "select"
          ? selectedOption !== null
          : true
  );

  const title = request.method === "ask" ? t("chatWindow.askTitle") : request.title;

  const sendResponse = (response: ExtensionDialogResponse) => {
    if (submitting) return;
    setSubmitting(true);
    void Promise.resolve(onRespond(request, response)).then(
      (sent) => {
        if (sent === false) setSubmitting(false);
      },
      () => setSubmitting(false),
    );
  };

  const cancel = () => sendResponse({ cancelled: true });

  // useModalDialog gives us: focus-in on open, focus-restore on close,
  // document-level Escape (top-of-stack), and Tab wrapping inside the panel.
  const panelRef = useModalDialog<HTMLDivElement>({
    onClose: cancel,
    // A composer-attached request is a regular in-flow panel, not a modal.
    active: !attached,
  });
  const keyboardOpen = useMobileInputOpen(panelRef, attached);
  // While the keyboard is up the panel fills the visible area instead of the
  // taller layout-viewport cap, so the footer with Cancel / Submit stays in
  // reach (#236).
  const attachedMaxHeight = keyboardOpen && viewportMaxHeight !== undefined
    ? `${viewportMaxHeight}px`
    : DEFAULT_PANEL_MAX_HEIGHT;

  useEffect(() => {
    if (!attached) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      // A tap on the composer, not a programmatic focus, opens the keyboard:
      // the request waits to be read on touch devices (#235).
      if (shouldDeferAttachedFocus()) return;
      // The frame runs after paint, by which time the user may already have
      // focused something inside the panel. Never yank focus back.
      if (panel.contains(document.activeElement)) return;
      // Never land on a radio or checkbox: a stray Space on a focused radio
      // selects that option, which silently overwrites what the user typed in
      // "Other". Prefer the first text entry, then any button.
      const target = panel.querySelector<HTMLElement>(
        "input:not([type=radio]):not([type=checkbox]), textarea, button:not([disabled])",
      );
      (target ?? panel).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [attached, panelRef, request.id]);

  const submitAskAnswers = () => {
    if (!askResult.isAsk || !askResult.valid || !canSubmitTelegramAsk || submitting) return;
    const results: AskAnswerResult[] = askResult.payload.questions.map((q) => {
      const state = askAnswers[q.id] ?? {
        selectedOptions: [],
        customInput: "",
        isCustomActive: false,
      };
      const hasCustom =
        (q.options.length === 0 || state.isCustomActive) &&
        state.customInput.trim().length > 0;
      return {
        id: q.id,
        question: q.question,
        selectedOptions: q.options.length === 0
          ? []
          : (q.multi ? state.selectedOptions : (hasCustom ? [] : state.selectedOptions)),
        ...(hasCustom ? { customInput: state.customInput.trim() } : {}),
      };
    });
    sendResponse({ value: serializeAskAnswers(results) });
  };

  const submitValue = () => {
    if (submitting) return;
    if (request.method === "confirm") {
      sendResponse({ confirmed: true });
    } else if (request.method === "select") {
      if (selectedOption) sendResponse({ value: selectedOption });
    } else if (request.method === "ask") {
      if (!canSubmitNativeAsk) return;
      sendResponse({
        answers: request.questions.map((question, index) => {
          const draft = askDraftAt(index);
          const customInput = draft.other.trim();
          return {
            id: question.id,
            selectedOptions: question.options.map((option) => option.label).filter((label) => draft.selected.includes(label)),
            ...(customInput ? { customInput } : {}),
          };
        }),
      });
    } else if (askResult.isAsk) {
      if (askResult.valid) submitAskAnswers();
    } else {
      sendResponse({ value });
    }
  };

  return (
    <div
      className={attached ? undefined : "animate-fade-in"}
      onMouseDown={attached ? undefined : (event) => {
        // Close when the pointer goes down on the backdrop itself (not when
        // the press starts inside the panel and is dragged out).
        if (event.target === event.currentTarget) cancel();
      }}
      style={attached ? { width: "100%", flexShrink: 0 } : {
        position: "absolute",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "var(--overlay-backdrop)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={attached ? undefined : "true"}
        aria-label={title}
        tabIndex={-1}
        className={attached ? undefined : "animate-scale-in"}
        style={{
          width: attached ? "100%" : "min(560px, 100%)",
          boxSizing: "border-box",
          // Grid/flex children below must be able to shrink: a min-content
          // question or option is wider than a phone, and without this the
          // panel grows past its composer column and gets clipped (#234).
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: attached ? "var(--radius-card)" : "var(--radius-modal)",
          background: "var(--bg)",
          boxShadow: attached ? "var(--shadow-card)" : "var(--shadow-modal)",
          overflow: "hidden",
          outline: "none",
          maxHeight: attached ? attachedMaxHeight : "100%",
        }}
      >
        <div className="extension-dialog-content" style={{ minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", overflowWrap: "anywhere" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 650, whiteSpace: "pre-wrap" }}>{title}</div>
          <div style={{ marginTop: 3, color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{t("chatWindow.extensionRequest")}</div>
        </div>

        <div style={{ padding: 14 }}>
          {request.method === "confirm" && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{request.message}</div>
          )}
          {request.method === "select" && (
            <div style={{ display: "grid", gap: 8 }}>
              {request.options.map((option) => {
                const selected = selectedOption === option;
                return (
                  <button
                    key={option}
                    disabled={submitting}
                    onClick={() => attached ? setSelectedOption(option) : sendResponse({ value: option })}
                    aria-pressed={attached ? selected : undefined}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))" : "var(--bg-panel)",
                      color: "var(--text)",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.65 : 1,
                      textAlign: "left",
                      fontSize: 12.5,
                      fontFamily: "inherit",
                      transition: attached ? undefined : "background-color var(--dur-fast) var(--ease-out-warm), border-color var(--dur-fast) var(--ease-out-warm)",
                    }}
                    onMouseEnter={attached || submitting ? undefined : (e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={attached || submitting ? undefined : (e) => { e.currentTarget.style.background = "var(--bg-panel)"; }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
          {request.method === "input" && (
            askResult.isAsk ? (
              askResult.valid ? (
                <ExtensionAskForm
                  questions={askResult.payload.questions}
                  answers={askAnswers}
                  onAnswerChange={(questionId, update) => {
                    setAskAnswers((prev) => ({
                      ...prev,
                      [questionId]: {
                        ...(prev[questionId] ?? {
                          selectedOptions: [],
                          customInput: "",
                          isCustomActive: false,
                        }),
                        ...update,
                      },
                    }));
                  }}
                  onSubmit={submitValue}
                  attached={attached}
                  disabled={submitting}
                />
              ) : (
                <div
                  role="alert"
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in srgb, var(--error, #ef4444) 30%, var(--border))",
                    background: "color-mix(in srgb, var(--error, #ef4444) 8%, var(--bg-panel))",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ color: "var(--error, #ef4444)", fontSize: 13, fontWeight: 650 }}>
                    {t("chatWindow.ask.errorTitle")}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
                    {t("chatWindow.ask.errorMessage")}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text-dim)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {askResult.error}
                  </div>
                </div>
              )
            ) : (
              <input
                autoFocus
                disabled={submitting}
                aria-label={request.title || request.placeholder || "Input value"}
                value={value}
                placeholder={request.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitValue();
                }}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  color: "var(--text)",
                  outline: "none",
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: submitting ? "not-allowed" : "text",
                  opacity: submitting ? 0.65 : 1,
                }}
              />
            )
          )}
          {request.method === "editor" && (
            <textarea
              autoFocus
              disabled={submitting}
              aria-label={request.title || "Input value"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitValue();
              }}
              style={{
                width: "100%",
                height: "min(220px, 30dvh)",
                minHeight: 80,
                padding: 10,
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                resize: "vertical",
                fontSize: request.promptStyle ? "var(--chat-font-size)" : 13,
                lineHeight: 1.55,
                fontFamily: request.promptStyle ? "inherit" : "var(--font-mono)",
                cursor: submitting ? "not-allowed" : "text",
                opacity: submitting ? 0.65 : 1,
              }}
            />
          )}
          {request.method === "ask" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
              {request.questions.map((question, index) => {
                const draft = askDraftAt(index);
                return (
                  <fieldset key={question.id} style={{ margin: 0, padding: 0, border: "none", minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
                    <legend style={{ padding: 0, marginBottom: 8, color: "var(--text)", fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
                      {question.header && (
                        <span style={{ display: "inline-block", marginRight: 6, padding: "0 7px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}>
                          {question.header}
                        </span>
                      )}
                      <span style={{ whiteSpace: "pre-wrap" }}>{question.question}</span>
                    </legend>
                    {question.options.map((option, optionIndex) => {
                      const checked = draft.selected.includes(option.label);
                      return (
                        <label
                          key={option.label}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            minWidth: 0,
                            padding: "8px 10px",
                            borderRadius: 7,
                            border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                            background: checked ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))" : "var(--bg-panel)",
                            color: "var(--text)",
                            cursor: submitting ? "not-allowed" : "pointer",
                            opacity: submitting ? 0.65 : 1,
                            fontSize: 13,
                          }}
                        >
                          <input
                            type={question.multi ? "checkbox" : "radio"}
                            name={`ask-${request.id}-${index}`}
                            checked={checked}
                            disabled={submitting}
                            onChange={() => setAskDrafts((drafts) => drafts.map((current, i) => i !== index ? current : question.multi
                              ? { ...current, selected: current.selected.includes(option.label) ? current.selected.filter((label) => label !== option.label) : [...current.selected, option.label] }
                              : { selected: [option.label], other: "" }))}
                            style={{ margin: "2px 0 0", accentColor: "var(--accent-strong)" }}
                          />
                          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                            {option.label}
                            {optionIndex === question.recommended && (
                              <span style={{ marginLeft: 6, color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>{t("chatWindow.askRecommended")}</span>
                            )}
                            {option.description && (
                              <span style={{ display: "block", marginTop: 2, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{option.description}</span>
                            )}
                            {option.preview && (
                              <span style={{ display: "block", marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "var(--tool-bg)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{option.preview}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <textarea
                        aria-label={t("chatWindow.askOther")}
                        placeholder={t("chatWindow.askOther")}
                        value={draft.other}
                        disabled={submitting}
                        rows={2}
                        onChange={(e) => {
                          const other = e.target.value;
                          setAskDrafts((drafts) => drafts.map((current, i) => i === index ? { selected: question.multi ? current.selected : [], other } : current));
                        }}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitValue();
                        }}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          minWidth: 0,
                          padding: "8px 10px",
                          borderRadius: 7,
                          border: "1px solid var(--border)",
                          background: "var(--bg-panel)",
                          color: "var(--text)",
                          outline: "none",
                          resize: "vertical",
                          fontSize: "var(--chat-font-size)",
                          lineHeight: 1.55,
                          fontFamily: "inherit",
                          cursor: submitting ? "not-allowed" : "text",
                          opacity: submitting ? 0.65 : 1,
                        }}
                      />
                      {keyboardOpen && (
                        <button
                          type="button"
                          onClick={submitValue}
                          disabled={!canSubmit || submitting}
                          title={t("chatWindow.askSubmitAnswer")}
                          aria-label={t("chatWindow.askSubmitAnswer")}
                          className="extension-dialog-send"
                          style={inlineSubmitStyle(!canSubmit || submitting, touchTargets === "accessible")}
                        >
                          <SendHorizontal size={15} strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>
        </div>

        <div className="extension-dialog-footer" style={{ display: "flex", flexShrink: 0, justifyContent: "flex-end", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <button
            onClick={cancel}
            disabled={submitting}
            style={{
              padding: "6px 10px",
              minHeight: touchTargets === "accessible" ? 44 : undefined,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-muted)",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.65 : 1,
              transition: "background-color var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)",
            }}
            onMouseEnter={submitting ? undefined : (e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={submitting ? undefined : (e) => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {t("chatWindow.cancel")}
          </button>
          {askResult.isAsk ? (
            askResult.valid ? (
              <button
                onClick={submitValue}
                disabled={!canSubmit || submitting}
                style={{
                  padding: "6px 10px",
                  minHeight: touchTargets === "accessible" ? 44 : undefined,
                  borderRadius: 6,
                  border: `1px solid ${canSubmit && !submitting ? "var(--accent-strong)" : "var(--border)"}`,
                  background: canSubmit && !submitting ? "var(--accent-strong)" : "var(--bg-subtle)",
                  color: canSubmit && !submitting ? "var(--on-accent)" : "var(--text-dim)",
                  cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                  opacity: canSubmit && !submitting ? 1 : 0.65,
                  transition: "background-color var(--dur-fast) var(--ease-out-warm)",
                }}
                onMouseEnter={canSubmit && !submitting ? (e) => { e.currentTarget.style.filter = "brightness(1.12)"; } : undefined}
                onMouseLeave={canSubmit && !submitting ? (e) => { e.currentTarget.style.filter = "none"; } : undefined}
                title={canSubmit ? undefined : t("chatWindow.ask.requiredHint")}
              >
                {t("chatWindow.submit")}
              </button>
            ) : null
          ) : request.method === "confirm" ? (
            <button
              onClick={submitValue}
              disabled={submitting}
              style={{
                padding: "6px 10px",
                minHeight: touchTargets === "accessible" ? 44 : undefined,
                borderRadius: 6,
                border: "1px solid var(--accent-strong)",
                background: "var(--accent-strong)",
                color: "var(--on-accent)",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.65 : 1,
                transition: "background-color var(--dur-fast) var(--ease-out-warm)",
              }}
              onMouseEnter={submitting ? undefined : (e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
              onMouseLeave={submitting ? undefined : (e) => { e.currentTarget.style.filter = "none"; }}
            >
              {t("chatWindow.confirm")}
            </button>
          ) : (request.method === "select" && attached) || request.method === "ask" ? (
            <button
              onClick={submitValue}
              disabled={!canSubmit}
              style={{
                padding: "6px 10px",
                minHeight: touchTargets === "accessible" ? 44 : undefined,
                borderRadius: 6,
                border: "1px solid var(--accent-strong)",
                background: canSubmit ? "var(--accent-strong)" : "var(--bg-subtle)",
                color: canSubmit ? "var(--on-accent)" : "var(--text-dim)",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.65,
              }}
            >
              {request.method === "ask" ? t("chatWindow.submit") : t("chatWindow.next")}
            </button>
          ) : request.method !== "select" ? (
            <button
              onClick={submitValue}
              disabled={submitting}
              style={{
                padding: "6px 10px",
                minHeight: touchTargets === "accessible" ? 44 : undefined,
                borderRadius: 6,
                border: "1px solid var(--accent-strong)",
                background: "var(--accent-strong)",
                color: "var(--on-accent)",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.65 : 1,
                transition: "background-color var(--dur-fast) var(--ease-out-warm)",
              }}
              onMouseEnter={submitting ? undefined : (e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
              onMouseLeave={submitting ? undefined : (e) => { e.currentTarget.style.filter = "none"; }}
            >
              {t("chatWindow.submit")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

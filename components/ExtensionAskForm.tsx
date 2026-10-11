"use client";

import { useId } from "react";
import type { AskQuestion } from "@/lib/omp/ask-protocol";
import { useI18n } from "@/lib/i18n";

export interface QuestionAnswerState {
  selectedOptions: string[];
  customInput: string;
  isCustomActive: boolean;
}

export interface ExtensionAskFormProps {
  questions: AskQuestion[];
  answers: Record<string, QuestionAnswerState>;
  onAnswerChange: (
    questionId: string,
    update: Partial<QuestionAnswerState>
  ) => void;
  onSubmit: () => void;
  attached?: boolean;
  disabled?: boolean;
}

/**
 * Checks whether a single Ask question has been adequately answered.
 * - For choice questions (options.length > 0): at least one option selected,
 *   or custom answer active with non-empty input.
 * - For free-text questions (options.length === 0): non-empty customInput.
 */
export function isAskQuestionAnswered(
  question: AskQuestion,
  state?: QuestionAnswerState
): boolean {
  if (!state) return false;
  if (question.options.length === 0) {
    return state.customInput.trim().length > 0;
  }
  if (state.isCustomActive && state.customInput.trim().length === 0) {
    return false;
  }
  const hasSelectedOptions = state.selectedOptions.length > 0;
  const hasCustomInput =
    state.isCustomActive && state.customInput.trim().length > 0;
  return hasSelectedOptions || hasCustomInput;
}

export function ExtensionAskForm({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  attached = false,
  disabled = false,
}: ExtensionAskFormProps) {
  const { t } = useI18n();
  const formId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {questions.map((q, qIndex) => {
        const qState: QuestionAnswerState = answers[q.id] ?? {
          selectedOptions: [],
          customInput: "",
          isCustomActive: false,
        };
        const hasOptions = q.options.length > 0;
        const isMulti = q.multi === true;
        const qTitleId = `${formId}-q-${qIndex}-title`;
        const isAnswered = isAskQuestionAnswered(q, qState);

        return (
          <fieldset
            key={q.id}
            role="group"
            aria-labelledby={qTitleId}
            style={{
              margin: 0,
              padding: 0,
              border: "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingBottom: qIndex < questions.length - 1 ? 16 : 0,
              borderBottom:
                qIndex < questions.length - 1
                  ? "1px solid var(--border)"
                  : "none",
            }}
          >
            {/* Header: counter + question text */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {questions.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.4px",
                    }}
                  >
                    {t("chatWindow.ask.questionProgress", {
                      current: qIndex + 1,
                      total: questions.length,
                    })}
                  </span>
                  {isAnswered && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-dim)",
                      }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                </div>
              )}
              <div
                id={qTitleId}
                style={{
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 650,
                  lineHeight: 1.5,
                }}
              >
                {q.question}
              </div>
              {hasOptions && isMulti && (
                <div
                  style={{
                    color: "var(--text-dim)",
                    fontSize: 11,
                  }}
                >
                  {t("chatWindow.ask.multiHint")}
                </div>
              )}
            </div>

            {/* Predefined options list */}
            {hasOptions ? (
              <div
                role={isMulti ? undefined : "radiogroup"}
                aria-labelledby={qTitleId}
                style={{ display: "grid", gap: 6 }}
              >
                {q.options.map((opt, optIndex) => {
                  const isSelected = qState.selectedOptions.includes(opt.label);
                  const isRecommended = q.recommended === optIndex;

                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={disabled}
                      role={isMulti ? "checkbox" : "radio"}
                      aria-checked={isSelected}
                      onClick={() => {
                        if (disabled) return;
                        if (isMulti) {
                          const next = isSelected
                            ? qState.selectedOptions.filter((o) => o !== opt.label)
                            : [...qState.selectedOptions, opt.label];
                          onAnswerChange(q.id, { selectedOptions: next });
                        } else {
                          onAnswerChange(q.id, {
                            selectedOptions: [opt.label],
                            isCustomActive: false,
                          });
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 7,
                        border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                        background: isSelected
                          ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))"
                          : "var(--bg-panel)",
                        color: "var(--text)",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.65 : 1,
                        textAlign: "left",
                        fontSize: 13,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        transition: attached
                          ? undefined
                          : "background-color var(--dur-fast) var(--ease-out-warm), border-color var(--dur-fast) var(--ease-out-warm)",
                      }}
                      onMouseEnter={
                        attached || disabled
                          ? undefined
                          : (e) => {
                              if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                            }
                      }
                      onMouseLeave={
                        attached || disabled
                          ? undefined
                          : (e) => {
                              if (!isSelected) e.currentTarget.style.background = "var(--bg-panel)";
                            }
                      }
                    >
                      {/* Checkbox / Radio visual marker */}
                      <span
                        aria-hidden="true"
                        style={{
                          width: 16,
                          height: 16,
                          marginTop: 1,
                          flexShrink: 0,
                          borderRadius: isMulti ? 4 : "50%",
                          border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                          background: isSelected ? "var(--accent)" : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isSelected && (
                          isMulti ? (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path
                                d="M1 4L3.5 6.5L9 1"
                                stroke="var(--on-accent, #ffffff)"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--on-accent, #ffffff)",
                              }}
                            />
                          )
                        )}
                      </span>

                      {/* Option text & optional description */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: isSelected ? 600 : 450, wordBreak: "break-word" }}>
                            {opt.label}
                          </span>
                          {isRecommended && (
                            <span
                              style={{
                                marginLeft: "auto",
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                                color: "var(--accent)",
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.4px",
                                flexShrink: 0,
                              }}
                            >
                              {t("chatWindow.ask.recommended")}
                            </span>
                          )}
                        </div>
                        {opt.description && (
                          <div
                            style={{
                              marginTop: 2,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.4,
                              wordBreak: "break-word",
                            }}
                          >
                            {opt.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Custom alternative answer ("Other") */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    disabled={disabled}
                    role={isMulti ? "checkbox" : "radio"}
                    aria-checked={qState.isCustomActive}
                    onClick={() => {
                      if (disabled) return;
                      if (isMulti) {
                        onAnswerChange(q.id, {
                          isCustomActive: !qState.isCustomActive,
                        });
                      } else {
                        onAnswerChange(q.id, {
                          isCustomActive: true,
                          selectedOptions: [],
                        });
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 7,
                      border: `1px solid ${qState.isCustomActive ? "var(--accent)" : "var(--border)"}`,
                      background: qState.isCustomActive
                        ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))"
                        : "var(--bg-panel)",
                      color: "var(--text)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.65 : 1,
                      textAlign: "left",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: attached
                        ? undefined
                        : "background-color var(--dur-fast) var(--ease-out-warm), border-color var(--dur-fast) var(--ease-out-warm)",
                    }}
                    onMouseEnter={
                      attached || disabled
                        ? undefined
                        : (e) => {
                            if (!qState.isCustomActive) e.currentTarget.style.background = "var(--bg-hover)";
                          }
                    }
                    onMouseLeave={
                      attached || disabled
                        ? undefined
                        : (e) => {
                            if (!qState.isCustomActive) e.currentTarget.style.background = "var(--bg-panel)";
                          }
                    }
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        borderRadius: isMulti ? 4 : "50%",
                        border: `1.5px solid ${qState.isCustomActive ? "var(--accent)" : "var(--border)"}`,
                        background: qState.isCustomActive ? "var(--accent)" : "transparent",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {qState.isCustomActive && (
                        isMulti ? (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="var(--on-accent, #ffffff)"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "var(--on-accent, #ffffff)",
                            }}
                          />
                        )
                      )}
                    </span>
                    <span style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 12.5 }}>
                      {t("chatWindow.ask.customOption")}
                    </span>
                  </button>

                  {/* Input field for custom answer */}
                  {qState.isCustomActive && (
                    <input
                      autoFocus
                      disabled={disabled}
                      type="text"
                      value={qState.customInput}
                      placeholder={t("chatWindow.ask.customPlaceholder")}
                      aria-label={`${q.question} - ${t("chatWindow.ask.customPlaceholder")}`}
                      onChange={(e) =>
                        onAnswerChange(q.id, {
                          customInput: e.target.value,
                          isCustomActive: true,
                          selectedOptions: isMulti ? qState.selectedOptions : [],
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onSubmit();
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                        outline: "none",
                        fontSize: 13,
                        cursor: disabled ? "not-allowed" : "text",
                        opacity: disabled ? 0.65 : 1,
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Free-text question input */
              <input
                autoFocus={qIndex === 0}
                disabled={disabled}
                type="text"
                value={qState.customInput}
                placeholder={t("chatWindow.ask.textPlaceholder")}
                aria-label={q.question}
                onChange={(e) =>
                  onAnswerChange(q.id, {
                    customInput: e.target.value,
                    selectedOptions: [],
                    isCustomActive: true,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  color: "var(--text)",
                  outline: "none",
                  fontSize: 13,
                  cursor: disabled ? "not-allowed" : "text",
                  opacity: disabled ? 0.65 : 1,
                }}
              />
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

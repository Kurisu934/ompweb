import type { RpcAskDialogAnswer, RpcAskDialogQuestion } from "../pi-types";

/** Validate before claiming a question: malformed answers must not dismiss it. */
export function validateNativeAskAnswers(questions: RpcAskDialogQuestion[], value: unknown): RpcAskDialogAnswer[] {
  if (!Array.isArray(value) || value.length !== questions.length) throw new Error("Answer every question in order");
  return questions.map((question, index) => {
    const answer = value[index];
    if (!answer || typeof answer !== "object" || answer.id !== question.id
      || !Array.isArray(answer.selectedOptions)
      || answer.selectedOptions.some((option: unknown) => typeof option !== "string" || !question.options.some((item) => item.label === option))
      || new Set(answer.selectedOptions).size !== answer.selectedOptions.length
      || (!question.multi && answer.selectedOptions.length > 1)
      || (answer.customInput !== undefined && typeof answer.customInput !== "string")) {
      throw new Error(`Invalid answer for question ${question.id}`);
    }
    const customInput = answer.customInput?.trim();
    if (!question.multi && answer.selectedOptions.length > 0 && customInput) throw new Error(`Choose one answer for question ${question.id}`);
    if (!question.multi && answer.selectedOptions.length === 0 && !customInput) throw new Error(`Answer question ${question.id}`);
    return { id: question.id, selectedOptions: [...answer.selectedOptions], ...(customInput ? { customInput } : {}) };
  });
}

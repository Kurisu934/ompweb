/**
 * Structured Ask protocol for omp-web and plugin coordination.
 * Protocol prefix: "omp-web:ask:v1:"
 */

export const ASK_PROTOCOL_PREFIX = "omp-web:ask:v1:";

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  question: string;
  options: AskOption[];
  multi?: boolean;
  recommended?: number;
}

export interface AskPayload {
  questions: AskQuestion[];
}

export interface AskAnswerResult {
  id: string;
  question: string;
  selectedOptions: string[];
  customInput?: string;
  note?: string;
}

export interface AskAnswerEnvelope {
  kind: "answers";
  results: AskAnswerResult[];
}

export type ParseAskResult =
  | { isAsk: false }
  | { isAsk: true; valid: true; payload: AskPayload }
  | { isAsk: true; valid: false; error: string };

/**
 * Validates and extracts structured questions from an input method placeholder.
 * Returns { isAsk: false } if the placeholder does not match the exact prefix.
 * Returns { isAsk: true, valid: false, error } if the payload is malformed or corrupted.
 * Returns { isAsk: true, valid: true, payload } for valid 1-5 question forms.
 */
export function parseAskProtocol(placeholder: unknown): ParseAskResult {
  if (typeof placeholder !== "string" || !placeholder.startsWith(ASK_PROTOCOL_PREFIX)) {
    return { isAsk: false };
  }
  const raw = placeholder.slice(ASK_PROTOCOL_PREFIX.length);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { isAsk: true, valid: false, error: "Ask payload must be a JSON object" };
    }
    if (!Array.isArray(data.questions)) {
      return { isAsk: true, valid: false, error: "Ask payload is missing 'questions' array" };
    }
    const questions: AskQuestion[] = [];
    if (data.questions.length < 1 || data.questions.length > 5) {
      return { isAsk: true, valid: false, error: "Ask payload must contain 1-5 questions" };
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      if (!q || typeof q !== "object" || Array.isArray(q)) {
        return { isAsk: true, valid: false, error: `Question #${i + 1} must be an object` };
      }
      if (typeof q.id !== "string" || !q.id.trim()) {
        return { isAsk: true, valid: false, error: `Question #${i + 1} has empty or non-string 'id'` };
      }
      if (seenIds.has(q.id)) {
        return { isAsk: true, valid: false, error: `Duplicate question id '${q.id}'` };
      }
      seenIds.add(q.id);
      if (typeof q.question !== "string" || !q.question.trim()) {
        return { isAsk: true, valid: false, error: `Question #${i + 1} has empty or non-string 'question'` };
      }
      const rawOptions = q.options ?? [];
      if (!Array.isArray(rawOptions)) {
        return { isAsk: true, valid: false, error: `Question #${i + 1} 'options' must be an array` };
      }
      if (rawOptions.length === 1 || rawOptions.length > 8) {
        return { isAsk: true, valid: false, error: `Question #${i + 1} must contain 2-8 choices or no choices` };
      }
      const options: AskOption[] = [];
      const seenLabels = new Set<string>();
      for (let j = 0; j < rawOptions.length; j++) {
        const opt = rawOptions[j];
        if (!opt || typeof opt !== "object" || Array.isArray(opt)) {
          return { isAsk: true, valid: false, error: `Question #${i + 1} option #${j + 1} must be an object` };
        }
        if (typeof opt.label !== "string" || !opt.label.trim()) {
          return { isAsk: true, valid: false, error: `Question #${i + 1} option #${j + 1} 'label' must be a non-empty string` };
        }
        if (seenLabels.has(opt.label)) {
          return { isAsk: true, valid: false, error: `Question #${i + 1} contains duplicate option '${opt.label}'` };
        }
        seenLabels.add(opt.label);
        if (opt.description !== undefined && opt.description !== null && typeof opt.description !== "string") {
          return { isAsk: true, valid: false, error: `Question #${i + 1} option #${j + 1} 'description' must be a string` };
        }
        options.push({
          label: opt.label,
          ...(opt.description ? { description: String(opt.description).trim() } : {}),
        });
      }
      if (q.multi !== undefined && typeof q.multi !== "boolean") {
        return { isAsk: true, valid: false, error: `Question #${i + 1} 'multi' must be a boolean` };
      }
      let recommended: number | undefined;
      if (
        typeof q.recommended === "number" &&
        Number.isInteger(q.recommended) &&
        q.recommended >= 0 &&
        q.recommended < options.length
      ) {
        recommended = q.recommended;
      }
      questions.push({
        id: q.id,
        question: q.question,
        options,
        ...(q.multi !== undefined ? { multi: q.multi } : {}),
        ...(recommended !== undefined ? { recommended } : {}),
      });
    }
    return { isAsk: true, valid: true, payload: { questions } };
  } catch (err) {
    return {
      isAsk: true,
      valid: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Serializes answer results into contract JSON string.
 */
export function serializeAskAnswers(results: AskAnswerResult[]): string {
  const envelope: AskAnswerEnvelope = {
    kind: "answers",
    results,
  };
  return JSON.stringify(envelope);
}

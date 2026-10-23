import type { AgentMessage } from "./types";

const RATE_PREFIXES = ["", "k", "M", "G", "T", "P", "E", "Z", "Y", "R", "Q"];

/** A five-character number and at most four-character SI token-rate unit. */
export function formatGenerationSpeed(rate: number | null | undefined): { value: string; unit: string } | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  let prefix = 0;
  while (Math.round(rate * 10) >= 10_000) {
    // No SI prefix beyond quetta can represent this rate within the fixed slots.
    if (++prefix === RATE_PREFIXES.length) return null;
    rate /= 1000;
  }
  return { value: rate.toFixed(1), unit: `${RATE_PREFIXES[prefix]}t/s` };
}

/** Status-color tier for a token rate; the t/s badge and the speed chart share it. */
export function generationSpeedTier(rate: number): "success" | "renamed" | "warning" | "error" {
  return rate >= 50 ? "success" : rate >= 30 ? "renamed" : rate >= 15 ? "warning" : "error";
}

/** One completed model request. */
export interface GenerationSpeedSample {
  /** Output tokens over the whole request: omp's tok/s (get_state.tokensPerSecond). */
  tps: number;
  /** Output tokens after the first token arrived; null when omp recorded no TTFT. */
  decodeTps: number | null;
  outputTokens: number;
  durationMs: number;
  ttftMs: number | null;
  timestamp: number | null;
  model: string | null;
}

/** Number of recent samples behind the session average. */
export const GENERATION_SPEED_AVERAGE_WINDOW = 32;

// omp's utils/token-rate.ts ignores shorter requests as unmeasurable.
const MIN_DURATION_MS = 100;

/**
 * Per-request speeds from committed assistant messages, computed exactly as
 * omp computes its live tok/s: usage.output / duration. Messages without an
 * omp duration (older sessions, aborted requests) or without output are skipped.
 */
export function collectGenerationSpeedSamples(messages: readonly AgentMessage[]): GenerationSpeedSample[] {
  const samples: GenerationSpeedSample[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const outputTokens = message.usage?.output;
    const durationMs = message.duration;
    if (typeof outputTokens !== "number" || !(outputTokens > 0)) continue;
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < MIN_DURATION_MS) continue;
    const ttftMs = typeof message.ttft === "number" && Number.isFinite(message.ttft) && message.ttft >= 0 ? message.ttft : null;
    const decodeMs = ttftMs === null ? 0 : durationMs - ttftMs;
    samples.push({
      tps: (outputTokens * 1000) / durationMs,
      decodeTps: decodeMs >= MIN_DURATION_MS ? (outputTokens * 1000) / decodeMs : null,
      outputTokens,
      durationMs,
      ttftMs,
      timestamp: typeof message.timestamp === "number" ? message.timestamp : null,
      model: message.model || null,
    });
  }
  return samples;
}

export interface GenerationSpeedStats {
  count: number;
  mean: number;
  /** Total output tokens / total request time: weights long answers by their length. */
  tokenWeightedMean: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  /** Sample standard deviation (n − 1); 0 for a single sample. */
  stdDev: number;
  totalOutputTokens: number;
  /** Means over the samples that recorded a TTFT; null when none did. */
  meanTtftMs: number | null;
  meanDecodeTps: number | null;
}

/** Linear-interpolated percentile of an ascending array (Excel PERCENTILE.INC). */
function percentile(sorted: readonly number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function meanOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeGenerationSpeed(samples: readonly GenerationSpeedSample[]): GenerationSpeedStats | null {
  const rates = samples.map((sample) => sample.tps);
  const mean = meanOf(rates);
  if (mean === null) return null;
  const sorted = [...rates].sort((a, b) => a - b);
  const variance = rates.length > 1
    ? rates.reduce((sum, rate) => sum + (rate - mean) ** 2, 0) / (rates.length - 1)
    : 0;
  const totalOutputTokens = samples.reduce((sum, sample) => sum + sample.outputTokens, 0);
  const totalDurationMs = samples.reduce((sum, sample) => sum + sample.durationMs, 0);
  return {
    count: samples.length,
    mean,
    tokenWeightedMean: (totalOutputTokens * 1000) / totalDurationMs,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdDev: Math.sqrt(variance),
    totalOutputTokens,
    meanTtftMs: meanOf(samples.flatMap((sample) => (sample.ttftMs === null ? [] : [sample.ttftMs]))),
    meanDecodeTps: meanOf(samples.flatMap((sample) => (sample.decodeTps === null ? [] : [sample.decodeTps]))),
  };
}

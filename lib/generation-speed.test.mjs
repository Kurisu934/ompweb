import assert from "node:assert/strict";
import test from "node:test";
import { collectGenerationSpeedSamples, formatGenerationSpeed, summarizeGenerationSpeed } from "./generation-speed.ts";

test("generation speed promotes rounded rates before they exceed the fixed numeric slot", () => {
  for (const [rate, value, unit] of [
    [0, "0.0", "t/s"],
    [999.9, "999.9", "t/s"],
    [999.95, "1.0", "kt/s"],
    [12_345.6, "12.3", "kt/s"],
    [999_950, "1.0", "Mt/s"],
    [1e20, "100.0", "Et/s"],
    [1e30, "1.0", "Qt/s"],
  ]) {
    const result = formatGenerationSpeed(rate);
    assert.deepEqual(result, { value, unit });
    assert.ok(result.value.length <= 5);
    assert.ok(result.unit.length <= 4);
  }
});

test("generation speed rejects invalid and unrepresentable rates instead of overflowing", () => {
  for (const rate of [null, undefined, -1, NaN, Infinity, 1e33]) {
    assert.equal(formatGenerationSpeed(rate), null);
  }
});

const assistant = (output, duration, extra = {}) => ({
  role: "assistant", content: [], model: "m", provider: "p", usage: { output }, duration, ...extra,
});

test("speed samples use omp's tok/s and skip requests omp could not measure", () => {
  const samples = collectGenerationSpeedSamples([
    { role: "user", content: "hi" },
    assistant(429, 41_000, { ttft: 37_000, timestamp: 5 }),
    assistant(0, 2_000),          // tool-only turn: no output
    assistant(50, 99),            // under omp's 100 ms floor
    assistant(50, undefined),     // no recorded duration (older sessions)
    assistant(80, 2_000, { ttft: 1_950 }), // decode window too short to rate
  ]);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].tps, 429 / 41);
  assert.equal(samples[0].decodeTps, 429 / 4);
  assert.equal(samples[0].timestamp, 5);
  assert.equal(samples[1].tps, 40);
  assert.equal(samples[1].decodeTps, null);
});

test("speed statistics interpolate percentiles and weight by tokens", () => {
  const samples = collectGenerationSpeedSamples([
    assistant(100, 10_000, { ttft: 5_000 }), // 10 t/s
    assistant(200, 10_000),                  // 20 t/s
    assistant(300, 10_000),                  // 30 t/s
    assistant(4_000, 100_000),               // 40 t/s
  ]);
  const stats = summarizeGenerationSpeed(samples);
  assert.equal(stats.mean, 25);
  assert.equal(stats.median, 25);
  assert.ok(Math.abs(stats.p10 - 13) < 1e-9);
  assert.ok(Math.abs(stats.p90 - 37) < 1e-9);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 40);
  assert.ok(Math.abs(stats.stdDev - Math.sqrt(500 / 3)) < 1e-9);
  assert.equal(stats.tokenWeightedMean, 4_600 / 130);
  assert.equal(stats.meanTtftMs, 5_000);
  assert.equal(stats.meanDecodeTps, 20);
  assert.equal(summarizeGenerationSpeed([samples[0]]).stdDev, 0);
  assert.equal(summarizeGenerationSpeed([]), null);
});

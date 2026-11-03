import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { enforceSingleAgentPolicy } = jiti("./single-agent-policy.ts");

test("single-agent policy wins over new-session, resume and project config arguments", () => {
  for (const args of [[], ["--resume", "saved.jsonl"], ["--profile", "work", "--config", "unrestricted.yml"]]) {
    assert.deepEqual(enforceSingleAgentPolicy(args), [
      ...args, "--config", join(process.cwd(), "bin", "omp-single-agent.yml"),
    ]);
  }
});

test("missing or relaxed single-agent policy fails closed before OMP can launch", () => {
  const root = mkdtempSync(join(tmpdir(), "omp-single-agent-policy-"));
  try {
    assert.throws(() => enforceSingleAgentPolicy([], root), /ENOENT/);
    mkdirSync(join(root, "bin"));
    for (const policy of [
      "task: { maxRecursionDepth: 2, speculativeLaunch: false }\ntools: { approval: { task: deny } }",
      "task: { maxRecursionDepth: 0, speculativeLaunch: true }\ntools: { approval: { task: deny } }",
      "task: { maxRecursionDepth: 0, speculativeLaunch: false }\ntools: { approval: { task: allow } }",
    ]) {
      writeFileSync(join(root, "bin", "omp-single-agent.yml"), policy);
      assert.throws(() => enforceSingleAgentPolicy([], root), /refusing to launch/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

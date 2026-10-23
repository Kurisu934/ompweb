import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "omp-web-defaults-"));
const agentDir = join(root, "agent");
const project = join(root, "project");
mkdirSync(agentDir);
mkdirSync(join(project, ".omp"), { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
const jiti = createJiti(import.meta.url);
const { ompWebDefaultConfigArgs } = await jiti.import("./web-defaults.ts");
const overlay = ["--config", join("/pkg", "bin", "omp-web-defaults.yml")];
const globalConfig = join(agentDir, "config.yml");
const projectConfig = join(project, ".omp", "config.yml");

test.after(() => rmSync(root, { recursive: true, force: true }));
test.beforeEach(() => {
  rmSync(globalConfig, { force: true });
  rmSync(projectConfig, { force: true });
});

test("image generation is on by default until the user or project decides", () => {
  assert.deepEqual(ompWebDefaultConfigArgs(project, "/pkg"), overlay);
  writeFileSync(globalConfig, "theme: dark\ngenerate_image:\n  other: 1\n");
  assert.deepEqual(ompWebDefaultConfigArgs(project, "/pkg"), overlay, "unrelated keys keep the default");

  writeFileSync(globalConfig, "generate_image:\n  enabled: false\n");
  assert.deepEqual(ompWebDefaultConfigArgs(project, "/pkg"), [], "the user's choice wins");

  rmSync(globalConfig);
  writeFileSync(projectConfig, "generate_image:\n  enabled: false\n");
  assert.deepEqual(ompWebDefaultConfigArgs(project, "/pkg"), [], "a project's choice wins");

  writeFileSync(projectConfig, "generate_image: [unclosed\n");
  assert.deepEqual(ompWebDefaultConfigArgs(project, "/pkg"), [], "no default over a config omp cannot read");
});

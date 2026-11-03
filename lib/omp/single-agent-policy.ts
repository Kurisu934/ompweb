import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

/** Append last so project/profile overlays cannot restore subagent spawning. */
export function enforceSingleAgentPolicy(args: string[], packageRoot = process.cwd()): string[] {
  const path = join(packageRoot, "bin", "omp-single-agent.yml");
  const policy = parse(readFileSync(path, "utf8"));
  if (
    policy?.task?.maxRecursionDepth !== 0
    || policy?.task?.speculativeLaunch !== false
    || policy?.tools?.approval?.task !== "deny"
  ) {
    throw new Error("OMPWeb single-agent policy is invalid; refusing to launch OMP.");
  }
  return [...args, "--config", path];
}

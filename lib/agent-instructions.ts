export type AgentInstructionTarget =
  | { scope: "global" }
  | { scope: "provider"; provider: string }
  | { scope: "model"; provider: string; modelId: string };

export type AgentInstructionRule = AgentInstructionTarget & { text: string };

export const MAX_AGENT_INSTRUCTION_LENGTH = 20_000;
export const MAX_AGENT_INSTRUCTION_RULES = 100;

export class AgentInstructionValidationError extends Error {}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new AgentInstructionValidationError(`Invalid ${name}`);
  }
  return value.trim();
}

export function parseAgentInstructionTarget(value: unknown): AgentInstructionTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentInstructionValidationError("Expected an instruction rule");
  }
  const target = value as Record<string, unknown>;
  if (target.scope === "global") return { scope: "global" };
  if (target.scope === "provider") return { scope: "provider", provider: identifier(target.provider, "provider") };
  if (target.scope === "model") {
    return { scope: "model", provider: identifier(target.provider, "provider"), modelId: identifier(target.modelId, "model ID") };
  }
  throw new AgentInstructionValidationError("Invalid instruction scope");
}

export function parseAgentInstructionRule(value: unknown): AgentInstructionRule {
  const target = parseAgentInstructionTarget(value);
  const { text } = value as Record<string, unknown>;
  if (typeof text !== "string" || text.length > MAX_AGENT_INSTRUCTION_LENGTH || text.includes("\0")) {
    throw new AgentInstructionValidationError(`Instructions must be text of at most ${MAX_AGENT_INSTRUCTION_LENGTH} characters`);
  }
  // Empty text is an explicit override, not an absent rule.
  return { ...target, text };
}

export function sameInstructionTarget(a: AgentInstructionTarget, b: AgentInstructionTarget): boolean {
  return a.scope === b.scope
    && (a.scope === "global" || (b.scope !== "global" && a.provider === b.provider))
    && (a.scope !== "model" || (b.scope === "model" && a.modelId === b.modelId));
}

/** Exact provider + model identity; the winner replaces, never concatenates, broader rules. */
export function resolveAgentInstructions(
  rules: readonly AgentInstructionRule[],
  provider?: string,
  modelId?: string,
): AgentInstructionRule | undefined {
  let globalRule: AgentInstructionRule | undefined;
  let providerRule: AgentInstructionRule | undefined;
  for (const rule of rules) {
    if (rule.scope === "global") globalRule = rule;
    else if (rule.provider === provider) {
      if (rule.scope === "model" && rule.modelId === modelId) return rule;
      if (rule.scope === "provider") providerRule = rule;
    }
  }
  return providerRule ?? globalRule;
}

import { RpcProcess, type RpcProcessOptions } from "./rpc-process";

// OMP 18.x exits before entering RPC mode if a fresh profile has no model.
// A catalog model allows registry/auth commands to run without an API key.
// Only retry this specific startup failure: configured profiles must retain
// their default model, and unrelated configuration errors must stay visible.
const BOOTSTRAP_MODEL = "anthropic/claude-sonnet-4-5";

/** For --no-session registry/auth processes only. Never sends a model prompt,
 * adds credentials, or changes the user's configured/default model. */
export async function startControlRpc(
  options: RpcProcessOptions,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RpcProcess> {
  if (!options.extraArgs?.includes("--no-session")) {
    throw new Error("Control RPC requires --no-session");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error("Request aborted");
    const proc = new RpcProcess({
      ...options,
      extraArgs: [...options.extraArgs, ...(attempt ? ["--model", BOOTSTRAP_MODEL] : [])],
    });
    const onAbort = () => { void proc.dispose(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const ready = await proc.waitReady(timeoutMs);
      await proc.negotiateProtocol(ready);
      if (signal?.aborted) throw new Error("Request aborted");
      return proc;
    } catch (error) {
      await proc.dispose();
      if (signal?.aborted) throw new Error("Request aborted");
      const message = error instanceof Error ? error.message : String(error);
      const explicitModel = options.extraArgs.some(arg => /^--(?:model|models|provider)(?:=|$)/.test(arg));
      if (attempt !== 0 || explicitModel || !/No models available\./.test(message)) throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new Error("Unable to start control RPC");
}

/**
 * Fork targets for the message transcript.
 *
 * omp's `branch` RPC command — what the UI calls "fork" / "New session" —
 * only accepts a **user** message entry. Verified against a live
 * `omp --mode rpc-ui`: branching at an assistant entry answers
 * `success:false, error:"Invalid entry ID for branching"`. The new session
 * holds the history *before* that user entry, and the command returns the
 * entry's prompt text so the client can offer it for editing and re-sending.
 *
 * Rewind resolves a user message to itself and an assistant reply to the
 * prompt that started its turn. The first prompt is valid: its fork has an
 * empty context. The selected text and images are restored for editing.
 */

export function resolveForkEntryIds(
  messages: readonly { role: string; branchSummary?: boolean }[],
  entryIds: readonly (string | undefined)[],
): (string | undefined)[] {
  let lastUserEntryId: string | undefined;
  return messages.map((message, index) => {
    if (message.branchSummary) {
      lastUserEntryId = undefined;
      return undefined;
    }
    if (message.role === "user") {
      lastUserEntryId = entryIds[index];
      return lastUserEntryId;
    }
    return message.role === "assistant" ? lastUserEntryId : undefined;
  });
}

import { terminalErrorResponse } from "@/lib/terminal-api";
import { attachTerminal, type TerminalEvent } from "@/lib/terminal-manager";

export const dynamic = "force-dynamic";

// Shell output arrives in many tiny chunks; batching per frame keeps a busy
// command (build logs, `cat` of a big file) from sending thousands of events.
const FLUSH_MS = 8;

// GET /api/terminals/[id]/events — SSE: { type: "replay", data, exitCode? }
// first (the scrollback), then { type: "output", data } and { type: "exit", exitCode }.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cleanup: (() => void) | null = null;
  const encoder = new TextEncoder();

  let attached: ReturnType<typeof attachTerminal>;
  let pending = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let send: (data: unknown) => void = () => {};
  const flush = () => {
    flushTimer = null;
    if (!pending) return;
    const data = pending;
    pending = "";
    send({ type: "output", data });
  };
  const listener = (event: TerminalEvent) => {
    if (event.type === "output") {
      pending += event.data;
      flushTimer ??= setTimeout(flush, FLUSH_MS);
      return;
    }
    flush();
    send(event);
  };
  try {
    attached = attachTerminal(id, listener);
  } catch (error) {
    return terminalErrorResponse(error);
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(":\n\n"));
      }, 30_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (flushTimer) clearTimeout(flushTimer);
        attached.detach();
        req.signal.removeEventListener("abort", onAbort);
        try { controller.close(); } catch { /* already closed */ }
      };
      const onAbort = () => cleanup?.();
      send = (data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup?.();
        }
      };
      req.signal.addEventListener("abort", onAbort);
      send({ type: "replay", data: attached.replay, ...(attached.exitCode !== undefined ? { exitCode: attached.exitCode } : {}) });
      if (req.signal.aborted) cleanup();
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

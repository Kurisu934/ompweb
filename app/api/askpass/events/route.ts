import { subscribeAskpassRequests } from "@/lib/askpass";

export const dynamic = "force-dynamic";

// GET /api/askpass/events - SSE stream of pending sudo password requests from
// agent commands (lib/askpass.ts). Each frame carries the full pending list;
// passwords never travel on this stream. While no tab holds it, requests are
// refused at once instead of waiting for nobody.
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup?.();
        }
      };
      const unsubscribe = subscribeAskpassRequests((requests) => {
        send(`data: ${JSON.stringify({ type: "askpass_requests", requests })}\n\n`);
      });
      const heartbeat = setInterval(() => send(":\n\n"), 30_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", onAbort);
        try { controller.close(); } catch {}
      };
      const onAbort = () => cleanup?.();
      req.signal.addEventListener("abort", onAbort);
      if (req.signal.aborted) cleanup();
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

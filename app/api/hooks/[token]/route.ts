import { NextResponse } from "next/server";
import { readTextWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { triggerScheduledTaskWebhook } from "@/lib/scheduled-tasks";

export const dynamic = "force-dynamic";

/** Larger than the part kept in the prompt; the rest is cut there. */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

// POST /api/hooks/<token> — run the scheduled task owning this webhook token.
// The token is the credential: proxy.ts lets this path past the omp-web
// password and origin checks, so callers need nothing else. Delivery happens
// in the background; busy target sessions use their native follow-up queue.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let payload: string | null;
  try {
    payload = await readTextWithinLimit(req, MAX_WEBHOOK_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Webhook body is too large", code: "request_too_large" }, { status: 413 });
    }
    // Not UTF-8 (or the connection dropped): run without the body.
    payload = null;
  }
  const result = triggerScheduledTaskWebhook(token, payload);
  if (result === "not_found") return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  if (result === "disabled") return NextResponse.json({ error: "This task is paused", code: "task_disabled" }, { status: 409 });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

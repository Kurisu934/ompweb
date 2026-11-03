import { NextResponse } from "next/server";
import { apiErrorResponse, resolveSessionPathOr404 } from "@/lib/api-utils";
import {
  cancelScheduledMessage,
  listScheduledMessages,
  rescheduleMessage,
  scheduleMessage,
  ScheduleValidationError,
} from "@/lib/scheduled-messages";

function errorResponse(error: unknown) {
  if (error instanceof ScheduleValidationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  return apiErrorResponse(error);
}

const NOT_FOUND = { error: "Scheduled message not found", code: "scheduled_message_not_found" } as const;

// GET /api/sessions/[id]/scheduled — pending (and failed) scheduled messages, soonest first.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ messages: listScheduledMessages(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST body: { message, sendAt (epoch ms), advisor? } — schedule a text message.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("response" in resolved) return resolved.response;
    const body = await req.json() as { message?: unknown; sendAt?: unknown; advisor?: unknown };
    return NextResponse.json({ message: scheduleMessage({ sessionId: id, message: body.message, sendAt: body.sendAt, advisor: body.advisor }) });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH body: { messageId, sendAt } — change the time; also "send now" and "retry".
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json() as { messageId?: unknown; sendAt?: unknown };
    const entry = typeof body.messageId === "string" ? rescheduleMessage(id, body.messageId, body.sendAt) : null;
    return entry ? NextResponse.json({ message: entry }) : NextResponse.json(NOT_FOUND, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE ?messageId= — cancel.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const messageId = new URL(req.url).searchParams.get("messageId") ?? "";
    return cancelScheduledMessage(id, messageId)
      ? NextResponse.json({ success: true })
      : NextResponse.json(NOT_FOUND, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { answerAskpassRequest } from "@/lib/askpass";

const MAX_PASSWORD_CHARS = 1024;

// POST /api/askpass/answer  body: { id, password } to answer, { id, cancel: true } to refuse.
// The password is handed to the waiting sudo and not kept or logged anywhere.
export async function POST(req: Request) {
  let body: { id?: unknown; password?: unknown; cancel?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "Request id is required", code: "askpass_id_required" }, { status: 400 });
  }
  const password = body.cancel === true ? null : body.password;
  if (password !== null && (typeof password !== "string" || password.length > MAX_PASSWORD_CHARS || /[\r\n\0]/.test(password))) {
    return NextResponse.json({ error: "Invalid password", code: "askpass_invalid_password" }, { status: 400 });
  }
  if (!answerAskpassRequest(body.id, password)) {
    return NextResponse.json({ error: "This password request has ended", code: "askpass_request_gone" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

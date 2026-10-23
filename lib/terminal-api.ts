import { NextResponse } from "next/server";
import { apiErrorResponse } from "./api-utils";
import { RequestBodyTooLargeError } from "./bounded-form-data";
import { TerminalError } from "./terminal-manager";

/** Error body shared by the /api/terminals routes. */
export function terminalErrorResponse(error: unknown): Response {
  if (error instanceof TerminalError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: error.message, code: "request_too_large" }, { status: 413 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  return apiErrorResponse(error);
}

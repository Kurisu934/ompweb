import { NextResponse } from "next/server";
import { apiErrorResponse } from "./api-utils";
import { RequestBodyTooLargeError } from "./bounded-form-data";
import { TaskValidationError } from "./scheduled-tasks";

/** Room for a 100k-char prompt in multi-byte text plus the other fields. */
export const MAX_TASK_REQUEST_BYTES = 512 * 1024;

export function taskErrorResponse(error: unknown): NextResponse {
  if (error instanceof TaskValidationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: "Scheduled task request is too large", code: "request_too_large" }, { status: 413 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  return apiErrorResponse(error);
}

import { NextResponse } from "next/server";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { getSystemSnapshot, ProcessNotManagedError, startMemoryGuard, stopManagedProcess } from "@/lib/memory-guard";
import { parseMemoryGuardSettings } from "@/lib/memory-guard-settings";
import { apiErrorResponse } from "@/lib/api-utils";
import { isRecord } from "@/lib/type-guards";
import { loadWebServerSettings, saveWebServerSettings } from "@/lib/web-settings";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ProcessNotManagedError) return NextResponse.json({ error: error.message, code: "process_not_managed" }, { status: 404 });
  if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: error.message, code: "request_too_large" }, { status: 413 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  return apiErrorResponse(error);
}

// GET /api/system → SystemSnapshot (memory, CPU, per-session process usage, guard settings and actions)
export async function GET() {
  startMemoryGuard();
  return NextResponse.json(getSystemSnapshot());
}

// PUT /api/system { memoryGuard: Partial<MemoryGuardSettings> } → the saved settings
export async function PUT(req: Request) {
  try {
    const body = await parseJsonWithinLimit<unknown>(req, 4096);
    if (!isRecord(body) || !isRecord(body.memoryGuard)) {
      return NextResponse.json({ error: "Expected memoryGuard settings", code: "invalid_body" }, { status: 400 });
    }
    const memoryGuard = parseMemoryGuardSettings(body.memoryGuard, loadWebServerSettings().memoryGuard);
    return NextResponse.json({ memoryGuard: saveWebServerSettings({ memoryGuard }).memoryGuard });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/system { stopPid } → stop (SIGTERM) a process an agent or terminal started
export async function POST(req: Request) {
  try {
    const body = await parseJsonWithinLimit<unknown>(req, 1024);
    const pid = isRecord(body) ? body.stopPid : undefined;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) {
      return NextResponse.json({ error: "stopPid must be a process id", code: "invalid_pid" }, { status: 400 });
    }
    return NextResponse.json({ event: stopManagedProcess(pid) });
  } catch (error) {
    return errorResponse(error);
  }
}

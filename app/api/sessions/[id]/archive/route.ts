import { NextResponse } from "next/server";
import { resolveSessionPathOr404 } from "@/lib/api-utils";
import { archiveSession, sessionHasChildren } from "@/lib/session-archive";
import { readSessionHeader } from "@/lib/session-reader";
import { getRpcSession } from "@/lib/rpc-manager";
import { readSessionMetadata } from "@/lib/omp/local-bridge";
import { inspectNativeSessionLease } from "@/lib/omp/native-lease";
import { getAgentEnvOverrides } from "@/lib/omp/agent-env";

/** POST /api/sessions/[id]/archive — stop the live child, then archive the
 * native OMP JSONL and its sibling artifacts using OMP's gc layout. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("response" in resolved) return resolved.response;
    const filePath = resolved.filePath;
    const rpc = getRpcSession(id);
    const owner = readSessionMetadata(filePath);
    if ((rpc?.isAttached && rpc.isAlive()) || owner.status === "live" || owner.status === "invalid") {
      return NextResponse.json(
        { error: "Stop the original desktop process before archiving its session", code: "attached_session_archive_prohibited" },
        { status: 409 },
      );
    }
    const header = readSessionHeader(filePath);
    if (!header?.id) {
      return NextResponse.json(
        { error: "Cannot read session header for archiving", code: "session_header_invalid" },
        { status: 400 },
      );
    }
    const targetSessionId = header.id;
    const leaseCheck = await inspectNativeSessionLease(targetSessionId, undefined, getAgentEnvOverrides());
    if (leaseCheck.error) {
      return NextResponse.json(
        { error: `Cannot safely verify session ownership: ${leaseCheck.error}`, code: "session_lease_inspect_failed" },
        { status: 409 },
      );
    }
    if (leaseCheck.active) {
      return NextResponse.json(
        { error: "Stop the original desktop process before archiving its session", code: "attached_session_archive_prohibited" },
        { status: 409 },
      );
    }
    if (await sessionHasChildren(id)) {
      return NextResponse.json(
        { error: "Archive child sessions before archiving this session", code: "session_has_children" },
        { status: 409 },
      );
    }
    const archivedPath = await archiveSession(id, resolved.filePath);
    return NextResponse.json({ ok: true, archived: true, archivedPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, code: "session_archive_failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { resolveSessionPathOr404 } from "@/lib/api-utils";
import { archiveSession, sessionHasChildren } from "@/lib/session-archive";

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

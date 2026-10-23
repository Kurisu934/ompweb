import { NextRequest, NextResponse } from "next/server";
import { resolveSessionArtifact } from "@/lib/session-file-references";
import { encodeFilePathForApi } from "@/lib/file-paths";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  const { id, artifactId } = await params;
  const filePath = await resolveSessionArtifact(id, artifactId);
  if (!filePath) return NextResponse.json({ error: "Artifact not found in this session", code: "file_not_found" }, { status: 404 });
  if (request.nextUrl.searchParams.get("type") === "resolve") {
    return NextResponse.json({ filePath }, { headers: { "Cache-Control": "no-store" } });
  }
  // Reuse file authorization, size limits, ranges and download headers.
  // Never authorize the containing directory.
  const url = new URL(`/api/files/${encodeFilePathForApi(filePath)}`, request.url);
  url.search = request.nextUrl.search;
  url.searchParams.set("sessionId", id);
  if (!url.searchParams.has("type")) url.searchParams.set("type", "read");
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
}

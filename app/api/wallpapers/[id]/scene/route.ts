import { NextRequest } from "next/server";
import { guardApiRequest } from "@/lib/api-request-guard";
import { browserScene } from "@/lib/wallpaper-browser-scene";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = guardApiRequest(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const start = performance.now(), scene = await browserScene(id, true);
    const json = JSON.stringify(scene.manifest), etag = `"${createHash("sha256").update(json).digest("hex")}"`;
    const headers = { "Cache-Control": "private, no-cache", "ETag": etag, "X-OMP-Scene-Cache": scene.cache, "Server-Timing": `scene;dur=${(performance.now() - start).toFixed(1)}`, "Content-Type": "application/json" };
    return new Response(request.headers.get("if-none-match") === etag ? null : json, { status: request.headers.get("if-none-match") === etag ? 304 : 200, headers });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 422 }); }
}
export async function POST() { return Response.json({ error: "Scene streaming was removed. Refresh the page to use browser rendering." }, { status: 410 }); }

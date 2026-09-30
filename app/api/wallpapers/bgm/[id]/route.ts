import { deleteBgm, resolveBgm } from "@/lib/wallpaper-bgm-store";
import { mediaRange } from "@/lib/wallpaper-store";
import { wallpaperFileStream } from "@/lib/wallpaper-file-stream";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function serve(request: Request, context: Context, head: boolean) {
  let media;
  try { media = await resolveBgm((await context.params).id); } catch { return new Response(null, { status: 404 }); }
  const { handle, mime, stat } = media;
  let range;
  try { range = mediaRange(request.headers.get("range"), stat.size); }
  catch { await handle.close(); return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } }); }
  const headers = new Headers({ "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff", "Content-Length": String(range ? range.end - range.start + 1 : stat.size) });
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
  if (head) { await handle.close(); return new Response(null, { status: range ? 206 : 200, headers }); }
  return new Response(wallpaperFileStream(handle, range?.start ?? 0, range?.end ?? stat.size - 1), { status: range ? 206 : 200, headers });
}
export const GET = (request: Request, context: Context) => serve(request, context, false);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
export async function DELETE(_request: Request, context: Context) {
  try { await deleteBgm((await context.params).id); return Response.json({ ok: true }); }
  catch { return Response.json({ error: "Could not delete BGM" }, { status: 400 }); }
}

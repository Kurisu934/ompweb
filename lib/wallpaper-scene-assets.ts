import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { mediaRange } from "./wallpaper-store";
import { safeWallpaperFile } from "./wallpaper-store";
import * as fs from "node:fs/promises";
import { wallpaperFileStream } from "./wallpaper-file-stream";
import type { DiskSceneAsset } from "./wallpaper-scene-cache";

const compress = promisify(gzip);
const fonts = new WeakMap<Buffer, Promise<Buffer>>();

export async function sceneAssetResponse(request: Request, original: Buffer | DiskSceneAsset, mimeType: string) {
  const font = /^font\/(ttf|otf)$/.test(mimeType);
  const gzipQuality = request.headers.get("accept-encoding")?.match(/(?:^|,)\s*gzip\s*(?:;\s*q=(0(?:\.\d+)?|1(?:\.0+)?))?\s*(?=,|$)/i);
  const encoded = font && !request.headers.has("range") && !!gzipQuality && Number(gzipQuality[1] ?? 1) > 0 && (Buffer.isBuffer(original) || !!original.gzip);
  if (!Buffer.isBuffer(original)) {
    if ((await fs.lstat(original.directory)).isSymbolicLink() || await fs.realpath(original.directory) !== original.directory) throw new Error("Invalid scene cache directory");
    const file = await safeWallpaperFile(original.directory, original.key + (encoded ? ".gz" : ""));
    const handle = await fs.open(file, "r");
    try {
      const info = await handle.stat(), expected = encoded ? original.gzip! : original.stamp;
      if (!info.isFile() || info.size !== expected.size || info.mtimeMs !== expected.mtime || info.ctimeMs !== expected.ctime) throw new Error("Scene cache asset changed");
      let range;
      try { range = mediaRange(request.headers.get("range"), info.size); }
      catch { await handle.close(); return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } }); }
      const headers = new Headers({ "Content-Type": mimeType, "Accept-Ranges": "bytes", "Content-Length": String(range ? range.end - range.start + 1 : info.size), "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" });
      if (font) headers.set("Vary", "Accept-Encoding");
      if (encoded) headers.set("Content-Encoding", "gzip");
      if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      return new Response(wallpaperFileStream(handle, range?.start ?? 0, range?.end ?? info.size - 1), { status: range ? 206 : 200, headers });
    } catch (error) { await handle.close(); throw error; }
  }
  let data = original;
  if (encoded) {
    let pending = fonts.get(original);
    if (!pending) {
      pending = compress(original, { level: 3 }); fonts.set(original, pending);
      void pending.catch(() => fonts.delete(original));
    }
    data = await pending;
  }
  let range;
  try { range = mediaRange(request.headers.get("range"), data.length); }
  catch { return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } }); }
  const start = range?.start ?? 0, end = (range?.end ?? data.length - 1) + 1;
  const headers = new Headers({ "Content-Type": mimeType, "Accept-Ranges": "bytes", "Content-Length": String(end - start), "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" });
  if (font) headers.set("Vary", "Accept-Encoding");
  if (encoded) headers.set("Content-Encoding", "gzip");
  if (range) headers.set("Content-Range", `bytes ${start}-${end - 1}/${data.length}`);
  // Video probes commonly request bytes=0-. Yield chunks under backpressure
  // instead of copying the entire 100+ MiB clip for every probe.
  let offset = start;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= end) { controller.close(); return; }
      const next = Math.min(end, offset + 64 * 1024);
      controller.enqueue(data.subarray(offset, next)); offset = next;
    },
  });
  return new Response(body, { status: range ? 206 : 200, headers });
}

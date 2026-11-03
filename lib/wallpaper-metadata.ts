import * as fs from "node:fs/promises";
import sharp from "sharp";
import { readWallpaperPackageDirectory } from "./wallpaper-binary";

type Dimensions = { width: number; height: number };
type Metadata = Partial<Dimensions> & { modifiedAt: number; addedAt: number };
const cache = new Map<string, { stamp: string; value: Metadata }>();
function dimensions(width: unknown, height: unknown): Dimensions | undefined {
  return typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 65536 && height <= 65536 ? { width, height } : undefined;
}
async function readAt(handle: fs.FileHandle, offset: number, length: number) {
  const bytes = Buffer.alloc(length);
  let read = 0;
  while (read < length) { const part = await handle.read(bytes, read, length - read, offset + read); if (!part.bytesRead) throw new Error("Truncated wallpaper metadata"); read += part.bytesRead; }
  return bytes;
}
async function sceneDimensions(handle: fs.FileHandle, size: number, packed: boolean, entry: string) {
  let bytes: Buffer;
  if (packed) {
    let length = Math.min(size, 65536), directory;
    for (;;) {
      bytes = await readAt(handle, 0, length);
      try { directory = readWallpaperPackageDirectory(bytes, size); break; }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "Truncated wallpaper resource" || length === size || length >= 32 * 1024 * 1024) throw error;
        length = Math.min(size, length * 2);
      }
    }
    const resource = directory.get(entry);
    if (!resource || resource.size > 4 * 1024 * 1024) return;
    bytes = await readAt(handle, resource.offset, resource.size);
  } else {
    if (size > 4 * 1024 * 1024) return;
    bytes = await readAt(handle, 0, size);
  }
  const projection = JSON.parse(bytes.toString("utf8"))?.general?.orthogonalprojection;
  return dimensions(projection?.width, projection?.height);
}
async function mp4Dimensions(handle: fs.FileHandle, size: number) {
  let count = 0;
  async function boxes(start: number, end: number, depth: number): Promise<Dimensions | undefined> {
    for (let position = start; position + 8 <= end && ++count <= 10000;) {
      const head = await readAt(handle, position, Math.min(16, end - position));
      let length = head.readUInt32BE(0), header = 8;
      const type = head.toString("ascii", 4, 8);
      if (length === 1) { if (head.length < 16) return; length = Number(head.readBigUInt64BE(8)); header = 16; }
      else if (length === 0) length = end - position;
      if (!Number.isSafeInteger(length) || length < header || length > end - position) return;
      if ((depth === 0 && type === "moov") || (depth === 1 && type === "trak")) {
        const result = await boxes(position + header, position + length, depth + 1);
        if (result) return result;
      } else if (depth === 2 && type === "tkhd" && length - header >= 84) {
        const bytes = await readAt(handle, position + header, Math.min(96, length - header));
        const matrix = bytes[0] === 0 ? 40 : bytes[0] === 1 ? 52 : -1;
        if (matrix < 0 || bytes.length < matrix + 44) return;
        const width = bytes.readUInt32BE(matrix + 36) / 65536, height = bytes.readUInt32BE(matrix + 40) / 65536;
        const a = bytes.readInt32BE(matrix) / 65536, b = bytes.readInt32BE(matrix + 4) / 65536;
        const c = bytes.readInt32BE(matrix + 12) / 65536, d = bytes.readInt32BE(matrix + 16) / 65536;
        const result = dimensions(Math.abs(a * width) + Math.abs(c * height), Math.abs(b * width) + Math.abs(d * height));
        if (result) return result;
      }
      position += length;
    }
  }
  return boxes(0, size, 0);
}
function webmDimensions(bytes: Buffer) {
  let count = 0;
  function vint(offset: number, id: boolean) {
    if (offset >= bytes.length || !bytes[offset]) throw new Error("Invalid EBML metadata");
    let length = 1, marker = 128;
    while (!(bytes[offset] & marker)) { marker >>= 1; length++; }
    if (offset + length > bytes.length || id && length > 4) throw new Error("Truncated EBML metadata");
    let value = id ? bytes[offset] : bytes[offset] & (marker - 1);
    for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i];
    return { value, length };
  }
  function elements(start: number, end: number, depth: number): Dimensions | undefined {
    let width, height;
    for (let offset = start; offset < end && ++count <= 10000;) {
      const id = vint(offset, true); offset += id.length;
      const size = vint(offset, false); offset += size.length;
      const next = Math.min(end, offset + size.value);
      if ([0x18538067, 0x1654ae6b, 0xae, 0xe0].includes(id.value) && depth < 4) {
        const result = elements(offset, next, depth + 1); if (result) return result;
      } else if (depth === 4 && [0xb0, 0xba].includes(id.value) && size.value >= 1 && size.value <= 4 && offset + size.value <= end) {
        const value = bytes.readUIntBE(offset, size.value);
        if (id.value === 0xb0) width = value; else height = value;
      }
      if (next <= offset) break;
      offset = next;
    }
    return dimensions(width, height);
  }
  return elements(0, bytes.length, 0);
}

// Metadata reads skip media payloads; a refresh only re-probes changed files.
export async function wallpaperMetadata(file: string, kind: "scene" | "image" | "video", entry = "scene.json"): Promise<Metadata> {
  const stat = await fs.stat(file), key = `${kind}:${file}:${entry}`, stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const previous = cache.get(key);
  if (previous?.stamp === stamp) return previous.value;
  let size: Dimensions | undefined;
  try {
    if (kind === "image") {
      const metadata = await sharp(file, { limitInputPixels: 64 * 1024 * 1024 }).metadata();
      size = metadata.orientation && metadata.orientation >= 5 ? dimensions(metadata.height, metadata.width) : dimensions(metadata.width, metadata.height);
    } else {
      const handle = await fs.open(file, "r");
      try {
        if (kind === "scene") size = await sceneDimensions(handle, stat.size, file.endsWith(".pkg"), entry);
        else {
          const head = await readAt(handle, 0, Math.min(stat.size, 16));
          if (head.length >= 8 && head.toString("ascii", 4, 8) === "ftyp") size = await mp4Dimensions(handle, stat.size);
          else if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) size = webmDimensions(await readAt(handle, 0, Math.min(stat.size, 1024 * 1024)));
        }
      } finally { await handle.close(); }
    }
  } catch { /* Unknown dimensions remain explicitly filterable; media playback reports format errors. */ }
  const value = { ...size, modifiedAt: stat.mtimeMs, addedAt: stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs };
  if (cache.size >= 6000) cache.delete(cache.keys().next().value!);
  cache.set(key, { stamp, value });
  return value;
}

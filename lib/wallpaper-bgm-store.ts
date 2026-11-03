import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir } from "./omp/paths";
import { safeWallpaperFile } from "./wallpaper-store";
import { BGM_ACCEPT, MAX_BGM_BYTES, validBgmId, type WallpaperBgm } from "./wallpaper-bgm";

const rootDir = () => path.join(getAgentDir(), "web-wallpapers", "bgm");
const formats: Record<string, string> = { m4a: "audio/mp4", mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", wav: "audio/wav" };
const jobsKey = Symbol.for("ompweb.wallpaper-bgm-jobs");
const globals = globalThis as typeof globalThis & { [jobsKey]?: Map<string, Promise<WallpaperBgm>> };
const jobs = globals[jobsKey] ??= new Map();
type StoredBgm = WallpaperBgm & { file: string };
type Probe = { streams?: { codec_type: string; codec_name: string; channels?: number }[]; format?: { duration?: string } };

export class BgmError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}

export function bgmDemuxer(head: Buffer, extension: string) {
  if ([".mp4", ".m4v", ".mov", ".m4a"].includes(extension) && /^(ftyp|moov|mdat|wide)$/.test(head.toString("ascii", 4, 8))) return "mov";
  if ([".webm", ".mkv"].includes(extension) && head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return "matroska";
  if ([".ogg", ".opus"].includes(extension) && head.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (extension === ".flac" && head.toString("ascii", 0, 4) === "fLaC") return "flac";
  if (extension === ".wav" && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (extension === ".avi" && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "AVI ") return "avi";
  if (extension === ".mp3" && (head.toString("ascii", 0, 3) === "ID3" || head[0] === 255 && (head[1] & 224) === 224)) return "mp3";
  if (extension === ".aac" && head[0] === 255 && (head[1] & 246) === 240) return "aac";
  throw new BgmError("File content does not match a supported audio/video format", "invalid_media");
}

function runTool(tool: "ffmpeg" | "ffprobe", args: string[], signal: AbortSignal): Promise<string> {
  const executable = process.env[tool === "ffmpeg" ? "OMP_WEB_FFMPEG_BIN" : "OMP_WEB_FFPROBE_BIN"] || tool;
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, signal, timeout: tool === "ffmpeg" ? 600000 : 30000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (!error) resolve(stdout);
      else if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new BgmError("Install FFmpeg and ffprobe on the server, or configure their executable paths", "ffmpeg_missing", 503));
      else if (signal.aborted) reject(new BgmError("BGM import cancelled", "cancelled"));
      else reject(new BgmError("Audio extraction failed or timed out; check the media file", "extraction_failed"));
    });
  });
}

async function readStored(id: string): Promise<StoredBgm> {
  if (!validBgmId(id)) throw new Error("Invalid BGM identifier");
  const file = await safeWallpaperFile(rootDir(), `${id}/track.json`);
  if ((await fs.stat(file)).size > 4096) throw new Error("Invalid BGM metadata");
  const data = JSON.parse(await fs.readFile(file, "utf8")) as StoredBgm;
  if (data.id !== id || !/^audio\.(m4a|mp3|flac|ogg|wav)$/.test(data.file) || typeof data.title !== "string" || data.title.length > 200
    || !Number.isFinite(data.duration) || data.duration <= 0 || !Number.isSafeInteger(data.bytes) || data.bytes <= 0 || data.bytes > MAX_BGM_BYTES
    || !["audio", "video"].includes(data.source)) throw new Error("Invalid BGM metadata");
  const audio = await safeWallpaperFile(rootDir(), `${id}/${data.file}`);
  if ((await fs.stat(audio)).size !== data.bytes) throw new Error("Incomplete BGM cache");
  return data;
}
function publicInfo({ id, title, duration, bytes, source }: StoredBgm): WallpaperBgm { return { id, title, duration, bytes, source }; }
export async function listBgm(): Promise<WallpaperBgm[]> {
  await fs.mkdir(rootDir(), { recursive: true });
  const result: WallpaperBgm[] = [];
  for (const entry of await fs.readdir(rootDir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !validBgmId(entry.name)) continue;
    try { result.push(publicInfo(await readStored(entry.name))); } catch { /* Ignore partial or invalid imports. */ }
  }
  return result.sort((a, b) => a.title.localeCompare(b.title));
}
export async function resolveBgm(id: string) {
  const data = await readStored(id);
  const handle = await fs.open(await safeWallpaperFile(rootDir(), `${id}/${data.file}`), "r");
  try { return { handle, mime: formats[path.extname(data.file).slice(1)], stat: await handle.stat() }; }
  catch (error) { await handle.close(); throw error; }
}
export async function deleteBgm(id: string) {
  const data = await readStored(id);
  const root = await fs.realpath(rootDir()), folder = path.join(root, id);
  if ((await fs.lstat(folder)).isSymbolicLink()) throw new Error("Invalid BGM folder");
  await fs.unlink(await safeWallpaperFile(root, `${id}/${data.file}`));
  await fs.unlink(await safeWallpaperFile(root, `${id}/track.json`));
  await fs.rmdir(folder);
}

async function extract(input: string, directory: string, id: string, title: string, demuxer: string, signal: AbortSignal): Promise<WallpaperBgm> {
  const inputOptions = ["-protocol_whitelist", "file,pipe", "-f", demuxer,
    ...(demuxer === "mov" ? ["-enable_drefs", "0", "-use_absolute_path", "0"] : []), "-i", input];
  const probe: Probe = JSON.parse(await runTool("ffprobe", ["-v", "error", ...inputOptions, "-show_entries", "stream=codec_type,codec_name,channels:format=duration", "-of", "json"], signal));
  const audio = probe.streams?.find(s => s.codec_type === "audio");
  if (!audio) throw new BgmError("This file has no audio track", "no_audio");
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 4 * 60 * 60) throw new BgmError("BGM must have a valid duration of up to 4 hours", "invalid_duration");
  const copyFormats: Record<string, string> = { aac: "m4a", mp3: "mp3", flac: "flac", opus: "ogg", vorbis: "ogg", pcm_s16le: "wav", pcm_s24le: "wav" };
  const extension = copyFormats[audio.codec_name];
  const file = `audio.${extension || "m4a"}`;
  const output = path.join(directory, file);
  await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-max_alloc", "268435456", ...inputOptions,
    "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1", "-threads", "2",
    ...(extension ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "256k", "-ac", "2", "-ar", "48000"]),
    ...(file.endsWith(".m4a") ? ["-movflags", "+faststart"] : []), "-fs", String(MAX_BGM_BYTES + 1), output], signal);
  const bytes = (await fs.stat(output)).size;
  if (!bytes || bytes > MAX_BGM_BYTES) throw new BgmError("Extracted audio exceeds 512 MiB", "too_large", 413);
  const data: StoredBgm = { id, title, file, bytes, duration, source: probe.streams?.some(s => s.codec_type === "video") ? "video" : "audio" };
  await fs.writeFile(path.join(directory, "track.json"), JSON.stringify(data), { flag: "wx" });
  signal.throwIfAborted();
  // Publish a complete folder atomically; uploads and partial audio are never served.
  await fs.unlink(input);
  await fs.rename(directory, path.join(rootDir(), id));
  return publicInfo(data);
}

export async function importBgm(request: Request, originalName: string) {
  const title = path.basename(originalName.replaceAll("\\", "/")).slice(0, 200);
  const extension = path.extname(title).toLowerCase();
  if (!title || /[<>:"|?*\x00-\x1f]/.test(title) || !BGM_ACCEPT.split(",").includes(extension)) throw new BgmError("Unsupported audio/video filename", "invalid_media");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BGM_BYTES)) throw new BgmError("Maximum upload size: 512 MiB", "too_large", 413);
  await fs.mkdir(rootDir(), { recursive: true });
  const directory = path.join(rootDir(), `.import-${randomUUID()}`), input = path.join(directory, "input");
  await fs.mkdir(directory);
  const handle = await fs.open(input, "wx"), reader = request.body?.getReader();
  const hash = createHash("sha256").update("ompweb-bgm-v1\0"), head = Buffer.alloc(64);
  let size = 0;
  try {
    if (!reader) throw new BgmError("Empty upload", "invalid_media");
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BGM_BYTES) throw new BgmError("Maximum upload size: 512 MiB", "too_large", 413);
      if (size < head.length) head.set(value.subarray(0, head.length - size), size);
      hash.update(value);
      let offset = 0;
      while (offset < value.length) offset += (await handle.write(value, offset, value.length - offset)).bytesWritten;
      size += value.length;
    }
    await handle.close();
    if (!size || declared !== null && Number(declared) !== size) throw new BgmError("Incomplete upload", "invalid_media");
    const demuxer = bgmDemuxer(head, extension), id = hash.digest("hex");
    try { return { track: publicInfo(await readStored(id)), cached: true }; } catch { /* Cache miss. */ }
    const key = path.join(rootDir(), id), existing = jobs.get(key);
    if (existing) return { track: await existing, cached: true };
    if (jobs.size >= 2) throw new BgmError("Audio extraction is busy; retry shortly", "busy", 429);
    const job = extract(input, directory, id, title, demuxer, request.signal);
    jobs.set(key, job);
    try { return { track: await job, cached: false }; } finally { jobs.delete(key); }
  } finally {
    await reader?.cancel().catch(() => {}); reader?.releaseLock();
    await handle.close().catch(() => {});
    // Only known files in this request's generated temporary directory are removed.
    for (const file of ["input", "track.json", ...Object.keys(formats).map(ext => `audio.${ext}`)]) await fs.unlink(path.join(directory, file)).catch(() => {});
    await fs.rmdir(directory).catch(() => {});
  }
}

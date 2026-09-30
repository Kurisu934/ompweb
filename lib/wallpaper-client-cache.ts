import type { BrowserScene, SceneSound } from "./wallpaper-scene-types";

const DATABASE = "omp-web:scene-cache:v1", STORE = "resources";
const LIMIT = 256 * 1024 * 1024;
type Cached = { key: string; blob: Blob; bytes: number; used: number; etag?: string };
let database: Promise<IDBDatabase | undefined> | undefined;
function openCache() {
  if (database) return database;
  database = new Promise(resolve => {
    let settled = false;
    const finish = (db?: IDBDatabase) => { if (!settled) { settled = true; clearTimeout(timer); resolve(db); } else db?.close(); };
    const timer = setTimeout(() => finish(), 1500);
    try {
      if (typeof indexedDB === "undefined") { finish(); return; }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: "key" }); };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        finish(request.result);
      };
      request.onerror = () => finish();
    } catch { finish(); }
  });
  return database;
}
async function read(key: string): Promise<Cached | undefined> {
  const db = await openCache(); if (!db) return;
  try {
    const result = await new Promise<Cached | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (!result || !(result.blob instanceof Blob) || result.bytes !== result.blob.size || result.bytes < 1 || result.bytes > LIMIT) return;
    if (Date.now() - result.used > 60_000) {
      const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put({ ...result, used: Date.now() }); tx.onerror = () => {};
    }
    return result;
  } catch { return; }
}
async function put(record: Cached) {
  if (record.bytes < 1 || record.bytes > LIMIT) return;
  const db = await openCache(); if (!db) return;
  const write = (quotaRecovery: boolean) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), request = store.getAll();
    request.onsuccess = () => {
      const entries = (request.result as Cached[]).filter(r => r.key !== record.key).sort((a, b) => a.used - b.used);
      let total = entries.reduce((n, r) => n + (Number.isFinite(r.bytes) ? r.bytes : LIMIT), record.bytes);
      const target = quotaRecovery ? Math.max(record.bytes, total - Math.max(record.bytes, LIMIT / 4)) : LIMIT;
      for (const entry of entries) { if (total <= target) break; store.delete(entry.key); total -= entry.bytes; }
      if (!quotaRecovery) store.put(record);
    };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
  try { await write(false); }
  catch (error) {
    if ((error as DOMException)?.name !== "QuotaExceededError") return;
    try { await write(true); await write(false); } catch { /* Storage is optional, including private browsing. */ }
  }
}
function assetKey(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid scene asset key");
  return `asset:${key}`;
}
function checkUrl(url: string, key: string) {
  if (!new RegExp(`^/api/wallpapers/[a-f0-9]{32}/scene-assets/${key}$`).test(url)) throw new Error("Invalid scene asset URL");
}
export async function cachedSceneAsset(key: string) { return (await read(assetKey(key)))?.blob; }
export async function sceneAssetBlob(url: string, key: string, signal: AbortSignal) {
  checkUrl(url, key);
  const cached = await cachedSceneAsset(key); signal.throwIfAborted();
  if (cached) return cached;
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error("Cannot load scene asset");
  const blob = await response.blob(); signal.throwIfAborted();
  void put({ key: assetKey(key), blob, bytes: blob.size, used: Date.now() });
  return blob;
}
export async function cacheSceneVideo(url: string, key: string, signal: AbortSignal) {
  return cacheSceneMedia(url, key, signal, "video/");
}
async function cacheSceneMedia(url: string, key: string, signal: AbortSignal, type: "video/" | "audio/") {
  try {
    checkUrl(url, key);
    if (!await openCache()) return;
    if (await cachedSceneAsset(key)) return;
    signal.throwIfAborted();
    // Native video playback keeps first-frame streaming. Once playing, reuse
    // its HTTP range cache where possible and persist one complete local copy.
    const response = await fetch(url, { signal, cache: "force-cache", headers: { Range: "bytes=0-" } });
    if (!response.ok || !response.headers.get("content-type")?.startsWith(type)) { await response.body?.cancel(); return; }
    const length = Number(response.headers.get("content-length"));
    if (length > LIMIT) { await response.body?.cancel(); return; }
    const range = response.headers.get("content-range")?.match(/^bytes 0-(\d+)\/(\d+)$/);
    if (response.status === 206 && (!range || Number(range[1]) + 1 !== Number(range[2]))) { await response.body?.cancel(); return; }
    const blob = await response.blob(); signal.throwIfAborted();
    if (range && blob.size !== Number(range[2])) return;
    await put({ key: assetKey(key), blob, bytes: blob.size, used: Date.now() });
  } catch { /* Offline/cancelled/evicted downloads do not interrupt playback. */ }
}
export function sceneAudioCache(signal: AbortSignal) {
  const urls = new Map<string, string>(), pending = new Map<string, Promise<string>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  signal.addEventListener("abort", () => {
    timers.forEach(clearTimeout); timers.clear();
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
  }, { once: true });
  return (file: SceneSound["files"][number]): Promise<string> => {
    const previous = pending.get(file.key); if (previous) return previous;
    const result = (async () => {
      checkUrl(file.url, file.key);
      const blob = await cachedSceneAsset(file.key); signal.throwIfAborted();
      if (blob) { const url = URL.createObjectURL(blob); urls.set(file.key, url); return url; }
      const timer = setTimeout(() => {
        timers.delete(timer); void cacheSceneMedia(file.url, file.key, signal, "audio/");
      }, 3000);
      timers.add(timer);
      return file.url;
    })();
    pending.set(file.key, result); return result;
  };
}
export async function sceneManifest(id: string, signal: AbortSignal): Promise<BrowserScene> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid scene identifier");
  const key = `manifest:${id}`, cached = await read(key);
  let previous: BrowserScene | undefined;
  try { if (cached) previous = JSON.parse(await cached.blob.text()); } catch { /* Discard incomplete local metadata. */ }
  signal.throwIfAborted();
  const response = await fetch(`/api/wallpapers/${id}/scene`, { signal, cache: "no-store", headers: previous && cached?.etag ? { "If-None-Match": cached.etag } : {} });
  if (response.status === 304 && previous) return previous;
  if (!response.ok) throw new Error((await response.json()).error || "Scene renderer unavailable");
  const blob = await response.blob(), data = JSON.parse(await blob.text()) as BrowserScene;
  signal.throwIfAborted();
  void put({ key, blob, bytes: blob.size, used: Date.now(), etag: response.headers.get("etag") || undefined });
  return data;
}

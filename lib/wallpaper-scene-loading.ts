import type { SceneLayer, SceneParticles } from "./wallpaper-scene-types";

export type LoadedSceneFont = { face: FontFace; dispose: () => void };
export async function loadSceneFont(family: string, blob: Blob, signal: AbortSignal): Promise<LoadedSceneFont> {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  let face: FontFace | undefined, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (face) document.fonts.delete(face);
    URL.revokeObjectURL(url);
  };
  try {
    // Keep cached bytes as a Blob instead of copying a large ArrayBuffer through
    // FontFace hooks installed by page-saving extensions.
    face = new FontFace(family, `url("${url}")`);
    await face.load(); signal.throwIfAborted();
    document.fonts.add(face);
    return { face, dispose };
  } catch (error) { dispose(); throw error; }
}

// Drain in-flight work before callers dispose GPU resources after a failure.
export async function loadSceneResources<T>(items: T[], signal: AbortSignal, load: (item: T) => Promise<void>, concurrency = 4) {
  let next = 0, failed = false, failure: unknown;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try { signal.throwIfAborted(); await load(item); signal.throwIfAborted(); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, worker));
  signal.throwIfAborted();
  if (failed) throw failure;
}

export function sceneTextureDemand(layers: Iterable<{ layer: SceneLayer; visible: boolean }>, particles: SceneParticles[]) {
  const keys = new Set<string>();
  for (const { layer, visible } of layers) {
    if (!visible) continue;
    keys.add(layer.texture);
    for (const pass of layer.passes) for (const key of pass.textures) if (key) keys.add(key);
    for (const clip of layer.mesh?.clips || []) keys.add(clip.texture);
    if (layer.reflection) keys.add(layer.reflection.normal);
  }
  const visit = (particle: SceneParticles) => {
    keys.add(particle.texture);
    if (particle.refraction?.texture) keys.add(particle.refraction.texture);
    particle.children.forEach(visit);
  };
  particles.forEach(visit);
  return keys;
}

export function loadSceneVideo(video: HTMLVideoElement, url: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { video.removeEventListener("loadeddata", loaded); video.removeEventListener("error", failed); signal.removeEventListener("abort", aborted); };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Cannot decode embedded scene video")); };
    const aborted = () => { cleanup(); video.pause(); video.removeAttribute("src"); video.load(); reject(new DOMException("Aborted", "AbortError")); };
    video.addEventListener("loadeddata", loaded); video.addEventListener("error", failed); signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    video.preload = "auto"; video.src = url;
  });
}

"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Music2, Upload, RefreshCw, Trash2, X } from "lucide-react";
import { BGM_ACCEPT, MAX_BGM_BYTES, bgmUrl, type WallpaperBgm } from "@/lib/wallpaper-bgm";
import { useWallpaperPreferences } from "@/hooks/useWallpaper";
import { useI18n } from "@/lib/i18n";
import { subscribeWallpaperAudio, wallpaperAudioState, serverWallpaperAudioState } from "@/lib/wallpaper-audio";

export function WallpaperBgmConfig() {
  const { t } = useI18n();
  const { preferences, update } = useWallpaperPreferences();
  const [tracks, setTracks] = useState<WallpaperBgm[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  const audio = useSyncExternalStore(subscribeWallpaperAudio, wallpaperAudioState, serverWallpaperAudioState);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/wallpapers/bgm", { signal });
    if (!response.ok) throw new Error("Could not load BGM library");
    const data = await response.json(); setTracks(data.tracks);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); upload.current?.abort(); };
  }, [refresh]);
  async function importFile(file: File) {
    if (file.size > MAX_BGM_BYTES) { setError(t("wallpaperBgm.tooLarge")); return; }
    setBusy(true); setError(""); setStatus(""); setProgress(0);
    try {
      const data = await new Promise<{ track: WallpaperBgm; cached: boolean }>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); upload.current = xhr;
        xhr.open("POST", `/api/wallpapers/bgm/upload?name=${encodeURIComponent(file.name)}`);
        xhr.timeout = 15 * 60 * 1000;
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => {
          try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) {
              const key = `wallpaperBgm.error.${result.code}`;
              reject(new Error(t(key) === key ? result.error || t("wallpaperBgm.failed") : t(key)));
            } else resolve(result);
          } catch { reject(new Error(t("wallpaperBgm.failed"))); }
        };
        xhr.onerror = xhr.ontimeout = () => reject(new Error(t("wallpaperBgm.failed")));
        xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
        xhr.send(file);
      });
      setTracks(previous => [...previous.filter(track => track.id !== data.track.id), data.track]);
      update({ bgmId: data.track.id, paused: false });
      setStatus(t(data.cached ? "wallpaperBgm.reused" : "wallpaperBgm.ready"));
    } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); }
    finally { upload.current = null; setBusy(false); setProgress(null); }
  }
  async function remove() {
    const id = preferences.bgmId;
    if (!id || !window.confirm(t("wallpaperBgm.confirmDelete"))) return;
    setBusy(true); setError(""); setStatus(""); update({ bgmId: null });
    try {
      const response = await fetch(bgmUrl(id), { method: "DELETE" });
      if (!response.ok) throw new Error(t("wallpaperBgm.failed"));
      setTracks(previous => previous.filter(track => track.id !== id));
    } catch (e) { update({ bgmId: id }); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const selected = tracks.find(track => track.id === preferences.bgmId);
  return <section className="wallpaper-bgm" aria-labelledby="wallpaper-bgm-heading">
    <div className="wallpaper-bgm-heading">
      <h3 id="wallpaper-bgm-heading"><Music2 size={17} />{t("wallpaperBgm.title")}</h3>
      <button className="wallpaper-command" type="button" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />{t("wallpaperBgm.import")}</button>
      <button className="wallpaper-icon" type="button" disabled={busy} title={t("wallpaperBgm.refresh")} aria-label={t("wallpaperBgm.refresh")} onClick={() => void refresh().catch(e => setError(e.message))}><RefreshCw size={16} /></button>
      <input ref={input} data-bgm-upload type="file" hidden accept={BGM_ACCEPT} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    </div>
    <div className="wallpaper-bgm-selection">
      <select aria-label={t("wallpaperBgm.title")} disabled={busy} value={preferences.bgmId || ""} onChange={event => { update({ bgmId: event.target.value || null, paused: false }); setStatus(""); }}>
        <option value="">{t("wallpaperBgm.original")}</option>
        {preferences.bgmId && !selected && <option value={preferences.bgmId}>{t("wallpaperBgm.unavailable")}</option>}
        {tracks.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}
      </select>
      {selected && <span className="wallpaper-bgm-meta">{Math.floor(selected.duration / 60)}:{String(Math.floor(selected.duration % 60)).padStart(2, "0")} · {(selected.bytes / 1024 / 1024).toFixed(1)} MiB</span>}
      <button className="wallpaper-icon" type="button" disabled={busy || !selected} title={t("wallpaperBgm.delete")} aria-label={t("wallpaperBgm.delete")} onClick={() => void remove()}><Trash2 size={16} /></button>
    </div>
    {progress !== null && <div className="wallpaper-bgm-progress" role="status"><progress max="100" value={progress < 100 ? progress : undefined} /><span>{progress < 100 ? `${progress}%` : t("wallpaperBgm.processing")}</span><button className="wallpaper-icon" type="button" title={t("wallpaperBgm.cancel")} aria-label={t("wallpaperBgm.cancel")} onClick={() => upload.current?.abort()}><X size={16} /></button></div>}
    {status && <p className="wallpaper-bgm-meta" role="status">{status}</p>}
    {(error || preferences.bgmId && audio.error) && <p className="wallpaper-warning" role="alert">{error || t("wallpaperBgm.playbackError")}</p>}
  </section>;
}

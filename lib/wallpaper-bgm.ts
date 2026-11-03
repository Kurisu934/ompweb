export interface WallpaperBgm {
  id: string;
  title: string;
  duration: number;
  bytes: number;
  source: "audio" | "video";
}
export const BGM_ACCEPT = ".mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.mp4,.m4v,.mov,.webm,.mkv,.avi";
export const MAX_BGM_BYTES = 512 * 1024 * 1024;
export const validBgmId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
export const bgmUrl = (id: string) => `/api/wallpapers/bgm/${encodeURIComponent(id)}`;

import { defaultUrlTransform } from "react-markdown";
import { parseArtifactHref, resolveLocalFileHref } from "./file-links";
import { encodeFilePathForApi } from "./file-paths";

export function markdownFileUrlTransform(url: string): string {
  // Permit only recognized file references; keep react-markdown's protection
  // against javascript:, data:, and arbitrary custom protocols.
  return resolveLocalFileHref(url) ? url : defaultUrlTransform(url);
}

export function getFileApiUrl(
  filePath: string,
  type: "read" | "download" | "meta" | "preview" | "watch" | "resolve",
  sourceSessionId?: string | null,
  params: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams({ type });
  if (sourceSessionId) query.set("sessionId", sourceSessionId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const artifactId = parseArtifactHref(filePath);
  const endpoint = artifactId
    ? `/api/sessions/${encodeURIComponent(sourceSessionId || "_")}/artifacts/${artifactId}`
    : `/api/files/${encodeFilePathForApi(filePath)}`;
  return `${endpoint}?${query}`;
}

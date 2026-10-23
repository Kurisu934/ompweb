import { normalizeFilePathSlashes, resolveWorkspaceFilePath } from "./file-paths";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripLineSuffix(filePath: string): string {
  return filePath.replace(/:\d+(?::\d+)?$/, "");
}

function normalizeLocalPath(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath);
  const isWindowsDrive = /^[a-zA-Z]:\//.test(normalized);
  const isUnc = normalized.startsWith("//");
  const leadingSlash = normalized.startsWith("/") && !isWindowsDrive && !isUnc;
  const parts: string[] = [];

  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!leadingSlash && !isWindowsDrive && !isUnc) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  const joined = parts.join("/");
  if (isWindowsDrive) return joined;
  if (isUnc) return `//${joined}`;
  return leadingSlash ? `/${joined}` : joined;
}


function looksLikeRelativeFileHref(href: string): boolean {
  if (href.startsWith("#") || href.startsWith("?")) return false;
  if (href.startsWith("./") || href.startsWith("../")) return true;
  if (href.includes("/")) return true;
  return /(^|\/)\.?[^/]+\.[^/.]+$/.test(href);
}

function fileUrlToPath(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "file:") return null;
    const pathname = safeDecode(url.pathname);
    if (url.hostname) {
      return `//${url.hostname}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    }
    if (/^\/[a-zA-Z]:\//.test(pathname)) return pathname.slice(1);
    return pathname;
  } catch {
    return null;
  }
}

/** Resolution is not authorization: the file API checks roots/session references. */
export function resolveLocalFileHref(
  href: string | undefined,
  baseDir?: string,
): string | null {
  if (!href) return null;
  const artifactId = parseArtifactHref(href);
  if (artifactId) return `artifact://${artifactId}`;

  const cleanHref = href.split("#", 1)[0].split("?", 1)[0].trim();
  if (!cleanHref) return null;

  let candidate: string | null = null;
  const decodedHref = safeDecode(cleanHref);
  if (decodedHref.includes("\0")) return null;
  const isBackslashUncPath = decodedHref.startsWith("\\\\");
  const normalizedHref = normalizeFilePathSlashes(decodedHref);
  const lowerHref = normalizedHref.toLowerCase();

  if (lowerHref.startsWith("/api/") || lowerHref.startsWith("/_next/")) return null;
  if (!isBackslashUncPath && normalizedHref.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(normalizedHref) && !lowerHref.startsWith("file:") && !/^[a-zA-Z]:\//.test(normalizedHref)) {
    return null;
  }

  if (lowerHref.startsWith("file:")) {
    candidate = fileUrlToPath(cleanHref);
  } else if (/^[a-zA-Z]:\//.test(normalizedHref)) {
    candidate = normalizedHref;
  } else if (normalizedHref.startsWith("/")) {
    candidate = normalizedHref;
  } else if (baseDir && looksLikeRelativeFileHref(normalizedHref)) {
    candidate = `${normalizeFilePathSlashes(baseDir).replace(/\/+$/, "")}/${normalizedHref}`;
  }

  if (!candidate) return null;

  return stripLineSuffix(normalizeLocalPath(candidate));
}

/**
 * Tool paths are raw filesystem strings, so retain literal %, # and ?.
 * Strip read selectors at the end, preserving drive letters and filename colons.
 */
export function resolveToolFilePath(filePath: string, cwd?: string): string | null {
  const raw = filePath.trim();
  const artifactId = parseArtifactHref(raw);
  if (artifactId) return `artifact://${artifactId}`;
  const path = raw.replace(/(?::(?:raw|img|conflicts|-\d+|\d+(?:[-+]\d*)?(?:,\d+(?:[-+]\d*)?)*))+$/, "");
  const resolved = resolveWorkspaceFilePath(path, cwd);
  return resolved ? normalizeLocalPath(resolved) : null;
}

/** Persisted omp artifact IDs, optionally followed by a read-tool line selector. */
export function parseArtifactHref(href: string): string | null {
  return /^artifact:\/\/([A-Za-z0-9_-]{1,80})(?::(?:raw|[0-9,+-]+)(?::raw)?)?$/.exec(href)?.[1] ?? null;
}

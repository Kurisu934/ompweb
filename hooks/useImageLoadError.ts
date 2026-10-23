"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatApiError } from "@/lib/i18n/api-error";

/** Diagnose only failed local images; successful images still stream directly. */
export function useImageLoadError(src: string) {
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, [src]);
  const clearError = useCallback(() => {
    request.current?.abort();
    setFailure(null);
  }, []);
  const onError = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let message = formatApiError(null, "fileViewer.imageLoadFailed");
    if (src.startsWith("/api/files/") || /^\/api\/sessions\/[^/]+\/artifacts\//.test(src)) {
      try {
        const response = await fetch(src, { headers: { Range: "bytes=0-0" }, signal: controller.signal });
        if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
          message = formatApiError(await response.json(), "fileViewer.imageLoadFailed");
        } else {
          await response.body?.cancel();
        }
      } catch { /* Keep the decode/network error when diagnostics are unavailable. */ }
    }
    if (!controller.signal.aborted) setFailure({ src, message });
  }, [src]);
  return { error: failure?.src === src ? failure.message : null, onError, clearError };
}

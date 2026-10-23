"use client";

import { useEffect, useState } from "react";
import type { AskpassRequestInfo } from "@/lib/askpass";

/** Pending sudo password requests (lib/askpass.ts), live from /api/askpass/events. */
export function useAskpassRequests(): AskpassRequestInfo[] {
  const [requests, setRequests] = useState<AskpassRequestInfo[]>([]);
  useEffect(() => {
    const source = new EventSource("/api/askpass/events");
    source.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as { type?: string; requests?: AskpassRequestInfo[] };
        if (frame.type === "askpass_requests" && Array.isArray(frame.requests)) setRequests(frame.requests);
      } catch {
        // ignore malformed frames
      }
    };
    return () => source.close();
  }, []);
  return requests;
}

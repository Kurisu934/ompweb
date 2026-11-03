"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { SessionInfo } from "@/lib/types";
import { matchesShortcut } from "@/lib/keyboard-shortcuts";

const CommandPalette = dynamic(() => import("./CommandPalette").then((module) => module.CommandPalette), {
  ssr: false,
});

type Props = {
  onSelectSession: (session: SessionInfo) => void;
  onNewSession: () => void;
  currentModel?: string | null;
};

/**
 * Keeps the command palette chunk out of the initial shell. The first
 * configured shortcut or explicit toolbar action mounts it with the palette already
 * open; subsequent shortcuts are handled by the palette itself.
 */
export function CommandPaletteMount(props: Props) {
  const [loaded, setLoaded] = useState(false);
  const [openRequest, setOpenRequest] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!loaded && matchesShortcut("commandPalette", event)) {
        event.preventDefault();
        setLoaded(true);
        setOpenRequest((request) => request + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [loaded]);

  useEffect(() => {
    const onOpenRequest = () => {
      setLoaded(true);
      setOpenRequest((request) => request + 1);
    };
    window.addEventListener("omp:open-command-palette", onOpenRequest);
    return () => window.removeEventListener("omp:open-command-palette", onOpenRequest);
  }, []);

  if (!loaded) return null;
  return <CommandPalette {...props} initialOpen={openRequest > 0} openRequest={openRequest} />;
}

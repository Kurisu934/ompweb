"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SHORTCUTS, getShortcutBindings, subscribeShortcuts } from "@/lib/keyboard-shortcuts";

const serverSnapshot = () => DEFAULT_SHORTCUTS;

export function useShortcuts() {
  return useSyncExternalStore(subscribeShortcuts, getShortcutBindings, serverSnapshot);
}

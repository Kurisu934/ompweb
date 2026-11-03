"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { matchesShortcut } from "@/lib/keyboard-shortcuts";

interface DictationShortcutOptions {
  rootRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isComposingRef: RefObject<boolean>;
  onToggle: () => void;
}

export function useDictationShortcut(options: DictationShortcutOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });

  useEffect(() => {
    let candidate: string | null = null;
    const reset = () => { candidate = null; };
    const visible = (element: Element) => element.getClientRects().length > 0
      && getComputedStyle(element).visibility === "visible";
    const eligible = (event: KeyboardEvent) => {
      const { rootRef, inputRef, isComposingRef } = latest.current;
      const root = rootRef.current;
      if (!root || !root.isConnected || !visible(root) || root.closest("[inert], [hidden]")) return false;
      if (document.hidden || event.defaultPrevented || event.isComposing || event.keyCode === 229
        || isComposingRef.current
        || event.getModifierState("AltGraph")) return false;
      if (Array.from(document.querySelectorAll('[role="dialog"]:not(.toast-card), [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open]')).some(visible)) return false;
      for (const target of [event.target, document.activeElement]) {
        if (!(target instanceof Element)) continue;
        const editor = target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
        if (editor && editor !== inputRef.current) return false;
      }
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!eligible(event)) { reset(); return; }
      if (event.repeat) return;
      if (event.key !== "Alt") {
        reset();
        if (matchesShortcut("toggleDictation", event)) {
          event.preventDefault();
          latest.current.onToggle();
        }
        return;
      }
      if (!matchesShortcut("toggleDictation", event)) { reset(); return; }
      // Wait for release: Alt+Tab, Alt+letter and two-Alt chords are not dictation.
      candidate = candidate === null ? event.code || "Alt" : null;
    };
    const onChordKey = (event: KeyboardEvent) => {
      // A focused control may consume the other key before it bubbles to window.
      if (event.key !== "Alt") reset();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const activate = event.key === "Alt" && candidate === (event.code || "Alt") && eligible(event) && matchesShortcut("toggleDictation", event);
      reset();
      if (!activate) return;
      event.preventDefault();
      latest.current.onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onChordKey, true);
    window.addEventListener("keyup", onChordKey, true);
    window.addEventListener("blur", reset);
    window.addEventListener("pointerdown", reset, true);
    window.addEventListener("compositionstart", reset, true);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onChordKey, true);
      window.removeEventListener("keyup", onChordKey, true);
      window.removeEventListener("blur", reset);
      window.removeEventListener("pointerdown", reset, true);
      window.removeEventListener("compositionstart", reset, true);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);
}

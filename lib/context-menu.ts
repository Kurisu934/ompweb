/**
 * omp-web's own right-click menu: the client-safe core.
 *
 * Components contribute sections from their React `onContextMenu` handlers
 * (`contributeContextMenu`); the event keeps bubbling, so a row inside a
 * message adds its section first and the message adds its own after it.
 * `ContextMenuHost` (components/ui/context-menu.tsx) collects them on
 * `window` once every React handler has run, adds selection/app sections and
 * decides whether to replace the browser menu at all.
 */
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Display-only key hint, e.g. "Ctrl+K". */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface ContextMenuSection {
  id: string;
  /** Optional caption naming what the section acts on (session title, file name). */
  title?: string;
  items: ContextMenuItem[];
}

const contributions = new WeakMap<Event, ContextMenuSection[]>();

/** Add a section to the menu this right-click opens. Accepts React synthetic
 *  events (keyed by their native event) and native events. */
export function contributeContextMenu(event: Event | { nativeEvent: Event }, section: ContextMenuSection): void {
  if (section.items.length === 0) return;
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  const sections = contributions.get(native);
  if (sections) sections.push(section);
  else contributions.set(native, [section]);
}

/** Sections contributed for this event, innermost first. Consumes them. */
export function takeContextMenuContributions(event: Event): ContextMenuSection[] {
  const sections = contributions.get(event) ?? [];
  contributions.delete(event);
  return sections;
}

// Targets whose browser menu is worth more than ours: text editing (paste,
// spellcheck), media (save image), external links (open in new window), and
// anything that opts out, such as the terminal screen.
const NATIVE_TARGETS = [
  "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=file])",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable=false])",
  "img",
  "video",
  "audio",
  "canvas",
  "iframe",
  "a[href^='http:']",
  "a[href^='https:']",
  "a[href^='mailto:']",
  "[data-native-context-menu]",
].join(",");

/** True when this right-click should keep the browser's own menu: Shift held
 *  (the documented escape hatch), a touch long-press (keeps mobile text
 *  selection intact), or a target listed above. */
export function wantsNativeContextMenu(event: MouseEvent, target: Element): boolean {
  if (event.shiftKey) return true;
  if ("pointerType" in event && (event as PointerEvent).pointerType === "touch") return true;
  return target.closest(NATIVE_TARGETS) !== null;
}

/** Turn a selection into a Markdown blockquote ending in a blank line, ready
 *  for the reply to follow. Blank lines stay inside the quote. */
export function quoteMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "").split("\n");
  return `${lines.map((line) => (line.trim() ? `> ${line}` : ">")).join("\n")}\n\n`;
}

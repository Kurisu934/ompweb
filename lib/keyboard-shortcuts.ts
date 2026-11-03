export const SHORTCUTS = [
  { id: "abort", group: "chat", defaults: [] },
  { id: "newSession", group: "global", defaults: ["Ctrl+Alt+N"] },
  { id: "commandPalette", group: "global", defaults: ["Ctrl+K", "Meta+K"] },
  { id: "toggleTerminal", group: "global", defaults: ["Ctrl+Backquote"] },
  { id: "toggleMemos", group: "global", defaults: ["Insert"] },
  { id: "selectAll", group: "global", defaults: ["Ctrl+A", "Meta+A"] },
  { id: "cycleModel", group: "chat", defaults: ["Ctrl+Alt+M", "Meta+Alt+M"] },
  { id: "cycleThinking", group: "chat", defaults: ["Ctrl+Alt+T", "Meta+Alt+T"] },
  { id: "sendMessage", group: "composer", defaults: ["Enter", "Ctrl+Enter", "Meta+Enter", "Alt+Enter"] },
  { id: "inputHistory", group: "composer", defaults: ["ArrowUp"] },
  { id: "minimizeComposer", group: "composer", defaults: ["Escape"] },
  { id: "acceptCompletion", group: "composer", defaults: ["Tab", "ArrowRight"] },
  { id: "startDictation", group: "composer", defaults: ["Ctrl+M", "Meta+M"] },
  { id: "toggleDictation", group: "voice", defaults: ["Alt"] },
  { id: "cancelDictation", group: "voice", defaults: ["Escape"] },
  { id: "confirmDictation", group: "voice", defaults: ["Enter"] },
  { id: "stopSpeech", group: "voice", defaults: ["Escape"] },
  { id: "mentionSelection", group: "files", defaults: ["Ctrl+I", "Meta+I"] },
  { id: "copyTerminal", group: "files", defaults: ["Ctrl+Shift+C"] },
  { id: "deleteSession", group: "files", defaults: ["Delete"] },
  { id: "submitDialog", group: "chat", defaults: ["Ctrl+Enter", "Meta+Enter"] },
] as const;

export type ShortcutId = typeof SHORTCUTS[number]["id"];
export type ShortcutBindings = Readonly<Record<ShortcutId, readonly string[]>>;
type Overrides = Partial<Record<ShortcutId, string[]>>;
export const SHORTCUT_STORAGE_KEY = "omp-web:keyboard-shortcuts";
export const DEFAULT_SHORTCUTS = Object.fromEntries<readonly string[]>(SHORTCUTS.map(({ id, defaults }) => [id, defaults])) as ShortcutBindings;

export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
  getModifierState?: (key: string) => boolean;
}

const modifiers = ["Ctrl", "Meta", "Alt", "Shift"] as const;
const namedKeys: readonly string[] = ["Escape", "Enter", "Tab", "Space", "Backquote", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export function normalizeShortcut(value: string): string | null {
  if (value === "Alt") return value;
  const parts = value.split("+");
  const key = parts.pop()!;
  if (!key || !(namedKeys.includes(key) || /^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key))) return null;
  if (parts.some((part) => !modifiers.includes(part as typeof modifiers[number])) || new Set(parts).size !== parts.length) return null;
  return [...modifiers.filter((modifier) => parts.includes(modifier)), key].join("+");
}

/** Use physical letter keys for modified chords, including layouts where Alt changes event.key. */
export function shortcutFromEvent(event: ShortcutKeyEvent): string | null {
  if (event.isComposing || event.keyCode === 229 || event.getModifierState?.("AltGraph")) return null;
  if (event.key === "Alt" && !event.ctrlKey && !event.metaKey && !event.shiftKey) return "Alt";
  let key = event.key === " " ? "Space" : event.key === "`" ? "Backquote" : event.key;
  if (event.code === "Backquote") key = "Backquote";
  else if ((event.ctrlKey || event.metaKey || event.altKey) && /^Key[A-Z]$/.test(event.code ?? "")) key = event.code!.slice(3);
  if (key.length === 1) key = key.toUpperCase();
  return normalizeShortcut([
    ...(event.ctrlKey ? ["Ctrl"] : []), ...(event.metaKey ? ["Meta"] : []),
    ...(event.altKey ? ["Alt"] : []), ...(event.shiftKey ? ["Shift"] : []), key,
  ].join("+"));
}

export function parseShortcutOverrides(raw: string | null): Overrides {
  const result: Overrides = {};
  try {
    const data: unknown = JSON.parse(raw ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return result;
    for (const { id } of SHORTCUTS) {
      const value = (data as Record<string, unknown>)[id];
      if (!Array.isArray(value) || !value.every((key) => typeof key === "string" && normalizeShortcut(key) && (key !== "Alt" || id === "toggleDictation"))) continue;
      result[id] = [...new Set(value.map((key) => normalizeShortcut(key)!))];
    }
  } catch { /* Invalid saved preferences must not disable unrelated commands. */ }
  return result;
}

let owner: Window | undefined;
let overrides: Overrides = {};
let snapshot = DEFAULT_SHORTCUTS;
const listeners = new Set<() => void>();

function load(): void {
  if (typeof window === "undefined") return;
  try { overrides = parseShortcutOverrides(window.localStorage.getItem(SHORTCUT_STORAGE_KEY)); }
  catch { overrides = {}; }
  snapshot = { ...DEFAULT_SHORTCUTS, ...overrides };
}

function onStorage(event: StorageEvent): void {
  if (event.key !== SHORTCUT_STORAGE_KEY && event.key !== null) return;
  load();
  listeners.forEach((listener) => listener());
}

export function getShortcutBindings(): ShortcutBindings {
  if (typeof window !== "undefined" && owner !== window) {
    owner?.removeEventListener("storage", onStorage);
    owner = window;
    load();
    owner.addEventListener("storage", onStorage);
  }
  return snapshot;
}

export function subscribeShortcuts(listener: () => void): () => void {
  getShortcutBindings();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Changes apply immediately in this tab, even when storage is unavailable. */
export function setShortcutBinding(id: ShortcutId, keys: readonly string[] | null): boolean {
  getShortcutBindings();
  if (keys === null) delete overrides[id];
  else {
    if (keys.some((key) => !normalizeShortcut(key) || (key === "Alt" && id !== "toggleDictation"))) throw new Error("Invalid shortcut");
    overrides[id] = [...new Set(keys.map((key) => normalizeShortcut(key)!))];
  }
  snapshot = { ...DEFAULT_SHORTCUTS, ...overrides };
  let saved = false;
  try {
    window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(overrides));
    saved = true;
  } catch { /* The UI reports that this change cannot survive a reload. */ }
  listeners.forEach((listener) => listener());
  return saved;
}

export function matchesShortcut(id: ShortcutId, event: ShortcutKeyEvent, bindings = getShortcutBindings()): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return false;
  if (typeof Element !== "undefined" && event.target instanceof Element && event.target.closest("[data-shortcut-recorder]")) return false;
  const chord = shortcutFromEvent(event);
  return chord !== null && bindings[id].includes(chord);
}

export function shortcutLabel(id: ShortcutId, bindings = getShortcutBindings()): string {
  return bindings[id].map((key) => key.replace("Meta+", "⌘+").replace("Backquote", "`")).join(" / ");
}

export function shortcutAria(id: ShortcutId, bindings = getShortcutBindings()): string | undefined {
  return bindings[id].map((key) => key.replace("Ctrl+", "Control+").replace("Backquote", "`")).join(" ") || undefined;
}

export function shortcutHint(label: string, id: ShortcutId, bindings = getShortcutBindings()): string {
  const keys = shortcutLabel(id, bindings);
  return keys ? `${label} (${keys})` : label;
}

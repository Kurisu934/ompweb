import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createJiti } from "jiti";

const { DEFAULT_SHORTCUTS, SHORTCUT_STORAGE_KEY, parseShortcutOverrides, matchesShortcut, shortcutFromEvent, getShortcutBindings, setShortcutBinding, subscribeShortcuts } = await createJiti(import.meta.url).import("./keyboard-shortcuts.ts");
const key = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });
afterEach(() => {
  localStorage.removeItem(SHORTCUT_STORAGE_KEY);
  window.dispatchEvent(new window.StorageEvent("storage", { key: SHORTCUT_STORAGE_KEY }));
});

test("explicit unbinding survives parsing; malformed entries do not disable valid actions", () => {
  assert.deepEqual(parseShortcutOverrides(JSON.stringify({ abort: [], newSession: ["Shift+Ctrl+N", "Ctrl+Shift+N"], commandPalette: ["Ctrl+K", 3], toggleMemos: ["Alt"], toggleDictation: ["Alt"], unknown: ["F9"] })), {
    abort: [], newSession: ["Ctrl+Shift+N"], toggleDictation: ["Alt"],
  });
  for (const raw of ["{", "[]", "null", "42"]) assert.deepEqual(parseShortcutOverrides(raw), {});
});

test("modified physical keys match international layouts without intercepting composition, repeat, or other modifiers", () => {
  assert.equal(shortcutFromEvent(key("µ", { code: "KeyM", altKey: true, ctrlKey: true })), "Ctrl+Alt+M");
  assert.equal(matchesShortcut("toggleMemos", key("Insert"), DEFAULT_SHORTCUTS), true);
  for (const extra of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { getModifierState: () => true }]) {
    assert.equal(matchesShortcut("toggleMemos", key("Insert", extra), DEFAULT_SHORTCUTS), false);
  }
  const recorder = document.createElement("div");
  recorder.dataset.shortcutRecorder = "";
  const input = document.createElement("input");
  recorder.append(input);
  assert.equal(matchesShortcut("commandPalette", key("k", { ctrlKey: true, target: input }), DEFAULT_SHORTCUTS), false);
});

test("live rebind, clear, reload and cross-tab reset preserve the intended action", () => {
  let updates = 0;
  const unsubscribe = subscribeShortcuts(() => updates++);
  try {
    assert.equal(setShortcutBinding("abort", ["Ctrl+Shift+X"]), true);
    assert.equal(matchesShortcut("abort", key("Escape")), false);
    assert.equal(matchesShortcut("abort", key("x", { ctrlKey: true, shiftKey: true })), true);
    setShortcutBinding("abort", []);
    assert.equal(matchesShortcut("abort", key("x", { ctrlKey: true, shiftKey: true })), false);
    assert.deepEqual(JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)).abort, []);
    window.dispatchEvent(new window.StorageEvent("storage", { key: SHORTCUT_STORAGE_KEY }));
    assert.deepEqual(getShortcutBindings().abort, []);
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify({ abort: ["F9"], commandPalette: [] }));
    window.dispatchEvent(new window.StorageEvent("storage", { key: SHORTCUT_STORAGE_KEY }));
    assert.equal(matchesShortcut("abort", key("F9")), true);
    assert.equal(matchesShortcut("commandPalette", key("k", { ctrlKey: true })), false);
    setShortcutBinding("commandPalette", null);
    assert.equal(matchesShortcut("commandPalette", key("k", { ctrlKey: true })), true);
    assert.equal(updates, 5);
  } finally { unsubscribe(); }
});

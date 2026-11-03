import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createJiti } from "jiti";
import { act, cleanup, renderHook } from "@testing-library/react/pure.js";

const jiti = createJiti(import.meta.url, { tryNative: false, tsconfigPaths: true });
const { useDictationShortcut } = await jiti.import("./useDictationShortcut.ts");
const { setShortcutBinding } = await jiti.import("../lib/keyboard-shortcuts.ts");
afterEach(() => { cleanup(); document.body.replaceChildren(); setShortcutBinding("toggleDictation", null); });

function setup() {
  const root = document.createElement("div"), input = document.createElement("textarea");
  root.append(input); document.body.append(root);
  root.getClientRects = () => [{ width: 500, height: 100 }];
  let toggles = 0;
  const options = { rootRef: { current: root }, inputRef: { current: input }, isComposingRef: { current: false }, onToggle: () => toggles++ };
  const view = renderHook(props => useDictationShortcut(props), { initialProps: options });
  const key = (type, key = "Alt", init = {}, target = input) => {
    const event = new window.KeyboardEvent(type, { key, code: key === "Alt" ? "AltLeft" : key, bubbles: true, cancelable: true, ...init });
    act(() => { target.dispatchEvent(event); });
    return event;
  };
  const tap = (init = {}, target = input) => { key("keydown", "Alt", init, target); return key("keyup", "Alt", init, target); };
  return { root, input, options, view, key, tap, count: () => toggles };
}

test("bare left/right Alt toggles only on release and survives a rerender", () => {
  const s = setup();
  assert.equal(s.key("keydown").defaultPrevented, false, "do not consume Alt combinations");
  assert.equal(s.count(), 0);
  s.view.rerender({ ...s.options });
  assert.equal(s.key("keyup").defaultPrevented, true);
  s.tap({ code: "AltRight" });
  assert.equal(s.count(), 2);
  s.key("keyup");
  assert.equal(s.count(), 2, "an orphan keyup does not toggle");
});

test("long press toggles once, and the callback is not stale", () => {
  const s = setup();
  s.key("keydown");
  for (let n = 0; n < 10; n++) s.key("keydown", "Alt", { repeat: true });
  let latest = 0;
  s.view.rerender({ ...s.options, onToggle: () => latest++ });
  s.key("keyup");
  assert.equal(s.count(), 0); assert.equal(latest, 1);
  s.key("keydown", "Alt", { repeat: true }); s.key("keyup");
  assert.equal(latest, 1);
});

test("Alt chords, either release order, AltGr and both Alt keys never toggle", () => {
  const s = setup();
  for (const key of ["Tab", "n", "ArrowLeft", "Shift", "Control", "Meta"]) {
    s.key("keydown"); s.key("keydown", key, { altKey: true });
    s.key("keyup", key); s.key("keyup");
    s.key("keydown"); s.key("keydown", key, { altKey: true });
    s.key("keyup"); s.key("keyup", key);
  }
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "modifierAltGraph"]) {
    s.key("keydown", "Alt", { [modifier]: true }); s.key("keyup");
    s.key("keydown"); s.key("keyup", "Alt", { [modifier]: true });
  }
  s.key("keydown"); s.key("keydown", "Alt", { code: "AltRight" });
  s.key("keyup", "Alt", { code: "AltRight" }); s.key("keyup");
  s.tap({ key: "AltGraph", code: "AltRight" });
  assert.equal(s.count(), 0);
  s.tap(); assert.equal(s.count(), 1, "valid gestures still work after chords");
});

test("focus loss, pointer use, composition and visibility changes cancel a held Alt", () => {
  const s = setup();
  for (const type of ["blur", "pointerdown", "compositionstart"]) {
    s.key("keydown"); window.dispatchEvent(new Event(type)); s.key("keyup");
  }
  s.key("keydown"); document.dispatchEvent(new Event("visibilitychange")); s.key("keyup");
  s.tap({ isComposing: true }); s.tap({ keyCode: 229 });
  s.options.isComposingRef.current = true; s.tap();
  assert.equal(s.count(), 0);
  s.options.isComposingRef.current = false;
  s.tap(); assert.equal(s.count(), 1);
});

test("hidden, inert and unmounted composers cannot start recording", () => {
  const s = setup();
  s.root.getClientRects = () => []; s.tap();
  s.root.getClientRects = () => [{}];
  s.root.style.visibility = "hidden"; s.tap(); s.root.style.visibility = "";
  s.root.setAttribute("inert", ""); s.tap(); s.root.removeAttribute("inert");
  s.root.setAttribute("hidden", ""); s.tap(); s.root.removeAttribute("hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  s.tap(); delete document.hidden;
  assert.equal(s.count(), 0);
  s.key("keydown"); s.view.unmount(); s.key("keyup");
  s.tap(); assert.equal(s.count(), 0);
});

test("other editors, visible dialogs and menus keep their keyboard input", () => {
  const s = setup();
  for (const tag of ["input", "textarea", "select", "div"]) {
    const editor = document.createElement(tag);
    if (tag === "div") editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    s.tap({}, editor); editor.remove();
  }
  const search = document.createElement("input"); s.root.append(search);
  s.tap({}, search); search.focus(); s.tap({}, document.body); search.remove();
  for (const role of ["dialog", "alertdialog", "menu", "listbox"]) {
    const modal = document.createElement("div"); modal.setAttribute("role", role);
    modal.getClientRects = () => [{}]; document.body.append(modal);
    s.tap(); modal.remove();
  }
  assert.equal(s.count(), 0);
  s.tap({}, document.body); assert.equal(s.count(), 1, "page background can toggle the visible composer");
});

test("already-handled events are not hijacked", () => {
  const s = setup();
  const prevent = e => e.preventDefault();
  s.input.addEventListener("keydown", prevent); s.tap(); s.input.removeEventListener("keydown", prevent);
  s.input.addEventListener("keyup", prevent); s.tap(); s.input.removeEventListener("keyup", prevent);
  assert.equal(s.count(), 0);
});

test("chords consumed by a focused control still invalidate bare Alt", () => {
  const s = setup();
  const consume = event => { if (event.key !== "Alt") event.stopPropagation(); };
  s.input.addEventListener("keydown", consume); s.input.addEventListener("keyup", consume);
  s.key("keydown"); s.key("keydown", "a"); s.key("keyup"); s.key("keyup", "a");
  assert.equal(s.count(), 0);
});

test("non-modal transcription toasts do not block the next recording", () => {
  const s = setup(), toast = document.createElement("div");
  toast.setAttribute("role", "dialog"); toast.setAttribute("aria-modal", "false"); toast.className = "toast-card";
  toast.getClientRects = () => [{}]; document.body.append(toast);
  s.tap(); assert.equal(s.count(), 1);
});

test("remapped dictation responds immediately and clearing it restores native key handling", () => {
  const s = setup();
  setShortcutBinding("toggleDictation", ["Ctrl+Shift+D"]);
  s.tap();
  assert.equal(s.count(), 0);
  assert.equal(s.key("keydown", "d", { code: "KeyD", ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  assert.equal(s.count(), 1);
  setShortcutBinding("toggleDictation", []);
  assert.equal(s.key("keydown", "d", { code: "KeyD", ctrlKey: true, shiftKey: true }).defaultPrevented, false);
  assert.equal(s.count(), 1);
});

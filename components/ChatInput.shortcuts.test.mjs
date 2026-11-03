import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import React, { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react/pure.js";
import userEvent from "@testing-library/user-event";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { useGlobalKeyboardShortcuts, registerAbortHandler } = await jiti.import("@/hooks/useKeyboardShortcuts");
const { setShortcutBinding, SHORTCUT_STORAGE_KEY } = await jiti.import("@/lib/keyboard-shortcuts");
const { clearDraft } = await jiti.import("@/lib/draft-store");

beforeEach(() => { window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); });
afterEach(() => {
  cleanup(); registerAbortHandler(null); clearDraft("new:unassigned"); localStorage.clear();
  window.dispatchEvent(new window.StorageEvent("storage", { key: SHORTCUT_STORAGE_KEY }));
  delete window.matchMedia;
});
function GlobalShortcuts() {
  useGlobalKeyboardShortcuts({ activeCwd: "/tmp", onNewSession() {} });
  return null;
}
function mountRunning() {
  let aborts = 0;
  const abort = () => aborts++;
  registerAbortHandler(abort);
  render(React.createElement(React.Fragment, null,
    React.createElement(GlobalShortcuts),
    React.createElement(ChatInput, { onSend() {}, onAbort: abort, isStreaming: true }),
  ));
  return () => aborts;
}

test("Escape does not abort by default; a live remap applies to both composer and page exactly once", async () => {
  const count = mountRunning();
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(document.body, { key: "Escape" });
  assert.equal(count(), 0);
  act(() => setShortcutBinding("abort", ["Ctrl+Shift+X"]));
  fireEvent.keyDown(input, { key: "x", code: "KeyX", ctrlKey: true, shiftKey: true });
  assert.equal(count(), 1, "the same input event must not also trigger the global handler");
  fireEvent.keyDown(document.body, { key: "x", code: "KeyX", ctrlKey: true, shiftKey: true });
  assert.equal(count(), 2);
  act(() => setShortcutBinding("abort", []));
  fireEvent.keyDown(input, { key: "x", code: "KeyX", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(document.body, { key: "x", code: "KeyX", ctrlKey: true, shiftKey: true });
  assert.equal(count(), 2);
  await userEvent.setup().click(screen.getByRole("button", { name: /stop/i }));
  assert.equal(count(), 3, "unbinding must not disable the Stop button");
});

test("a bound stop key never aborts during IME, from another editor, or inside a dialog or terminal", () => {
  const count = mountRunning();
  act(() => setShortcutBinding("abort", ["Escape"]));
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Escape", isComposing: true });
  fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Escape", repeat: true });
  for (const markup of ['<input>', '<div role="dialog"><button>Close</button></div>', '<div data-native-context-menu><button>Terminal</button></div>']) {
    const root = document.createElement("div"); root.innerHTML = markup; document.body.append(root);
    fireEvent.keyDown(root.querySelector("button, input"), { key: "Escape" });
    root.remove();
  }
  assert.equal(count(), 0);
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(count(), 1);
});

test("remapping send leaves Enter for newlines and sends only with the new chord", async () => {
  const sent = [];
  render(React.createElement(ChatInput, { onSend: text => sent.push(text), onAbort() {}, isStreaming: false }));
  act(() => setShortcutBinding("sendMessage", ["Ctrl+Enter"]));
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "first{Enter}second");
  assert.deepEqual(sent, []);
  assert.equal(screen.getByRole("textbox").value, "first\nsecond");
  await user.keyboard("{Control>}{Enter}{/Control}");
  assert.deepEqual(sent, ["first\nsecond"]);
});

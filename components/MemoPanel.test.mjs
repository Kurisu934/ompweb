import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { afterEach, beforeEach } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react/pure.js";
import { createJiti } from "jiti";

const cssLoader = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/memos.css")) return { format: "module", source: "export {};", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { MemoPanel } = await jiti.import("./MemoPanel.tsx");
cssLoader.deregister();
const memo = (n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Note ${n}`, content: `## Content ${n}`, pinned: false, revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});
const key = (n) => `omp-web:memo-mode:${memo(n).id}`;
let memos;

beforeEach((t) => {
  localStorage.clear();
  sessionStorage.clear();
  memos = [memo(1), memo(2)];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/memos");
    if (init?.method === "POST") {
      const created = { ...memo(3), ...JSON.parse(init.body) };
      memos.unshift(created);
      return Response.json({ memo: created });
    }
    return Response.json({ memos });
  });
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

async function open() {
  fireEvent.keyDown(window, { key: "Insert" });
  await screen.findByRole("dialog", { name: "Memos" });
  await waitFor(() => assert.equal(document.querySelector(".memo-list").getAttribute("aria-busy"), "false"));
}

async function select(n) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Note ${n}`) }));
  await waitFor(() => assert.equal(screen.getByRole("textbox", { name: "Memo title" }).value, `Note ${n}`));
}

function assertMode(preview) {
  assert.equal(screen.getByRole("button", { name: "Preview", exact: true }).getAttribute("aria-pressed"), String(preview));
  assert.equal(screen.getByRole("button", { name: "Edit", exact: true }).getAttribute("aria-pressed"), String(!preview));
  assert.equal(!!document.querySelector(".memo-preview"), preview);
  assert.equal(!!screen.queryByRole("textbox", { name: "Memo content" }), !preview);
}

test("defaults to edit and keeps malformed preferences harmless", async () => {
  for (const value of [null, "invalid", "true"]) {
    if (value === null) localStorage.removeItem(key(1)); else localStorage.setItem(key(1), value);
    const view = render(React.createElement(MemoPanel));
    await open();
    assertMode(false);
    assert.equal(localStorage.getItem(key(1)), value);
    view.unmount();
  }
});

test("preview survives Insert close/open and component remount", async () => {
  const view = render(React.createElement(MemoPanel));
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Preview", exact: true }));
  assertMode(true);
  assert.equal(localStorage.getItem(key(1)), "preview");
  fireEvent.keyDown(window, { key: "Insert" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog", { name: "Memos" }), null));
  await open();
  assertMode(true);
  view.unmount();
  render(React.createElement(MemoPanel));
  await open();
  assertMode(true);
});

test("restores preview and persists a later explicit edit selection", async () => {
  localStorage.setItem(key(1), "preview");
  const view = render(React.createElement(MemoPanel));
  await open();
  assertMode(true);
  fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
  assertMode(false);
  assert.equal(localStorage.getItem(key(1)), "edit");
  view.unmount();
  render(React.createElement(MemoPanel));
  await open();
  assertMode(false);
});

test("each memo keeps its own mode across selection, refresh, close/open and remount", async () => {
  localStorage.setItem(key(1), "preview");
  localStorage.setItem(key(2), "edit");
  const view = render(React.createElement(MemoPanel));
  await open();
  assertMode(true);
  await select(2);
  assertMode(false);
  fireEvent.click(screen.getByRole("button", { name: "Preview", exact: true }));
  await select(1);
  assertMode(true);
  fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
  await select(2);
  assertMode(true);
  assert.equal(localStorage.getItem(key(1)), "edit");
  assert.equal(localStorage.getItem(key(2)), "preview");
  fireEvent.click(screen.getByRole("button", { name: "Refresh memos", exact: true }));
  await waitFor(() => assert.equal(document.querySelector(".memo-list").getAttribute("aria-busy"), "false"));
  assertMode(true);
  fireEvent.keyDown(window, { key: "Insert" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog", { name: "Memos" }), null));
  await open();
  assertMode(true);
  view.unmount();
  render(React.createElement(MemoPanel));
  await open();
  assertMode(false);
  await select(2);
  assertMode(true);
});

test("new memos default to edit and preserve existing memo choices", async () => {
  for (const empty of [false, true]) {
    localStorage.setItem(key(1), "preview");
    memos = empty ? [] : [memo(1), memo(2)];
    const view = render(React.createElement(MemoPanel));
    await open();
    const container = document.querySelector(empty ? ".memo-editor-empty" : ".memo-list-toolbar");
    fireEvent.click(within(container).getByRole("button", { name: "New memo", exact: true }));
    await screen.findByRole("textbox", { name: "Memo content" });
    assertMode(false);
    assert.equal(localStorage.getItem(key(1)), "preview");
    assert.equal(localStorage.getItem(key(3)), null);
    if (!empty) {
      await select(1);
      assertMode(true);
    }
    view.unmount();
  }
});

test("a failed creation keeps the selected memo in its current mode", async (t) => {
  localStorage.setItem(key(1), "preview");
  t.mock.method(globalThis, "fetch", async (_url, init) => init?.method === "POST"
    ? Response.json({ code: "save_failed" }, { status: 500 }) : Response.json({ memos }));
  render(React.createElement(MemoPanel));
  await open();
  fireEvent.click(screen.getByRole("button", { name: "New memo", exact: true }));
  await screen.findByRole("alert");
  assertMode(true);
  assert.equal(localStorage.getItem(key(1)), "preview");
});

test("the legacy global preference leaves each memo at its own default", async () => {
  localStorage.setItem("omp-web:memo-mode", "preview");
  render(React.createElement(MemoPanel));
  await open();
  assertMode(false);
  fireEvent.click(screen.getByRole("button", { name: "Preview", exact: true }));
  await select(2);
  assertMode(false);
  await select(1);
  assertMode(true);
});

test("storage read/write failures preserve working in-memory selection", async (t) => {
  t.mock.method(window.Storage.prototype, "getItem", () => { throw new Error("Storage denied"); });
  t.mock.method(window.Storage.prototype, "setItem", () => { throw new Error("Storage full"); });
  render(React.createElement(MemoPanel));
  await open();
  assertMode(false);
  fireEvent.click(screen.getByRole("button", { name: "Preview", exact: true }));
  assertMode(true);
  await select(2);
  assertMode(false);
  await select(1);
  assertMode(true);
  fireEvent.keyDown(window, { key: "Insert" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog", { name: "Memos" }), null));
  await open();
  assertMode(true);
  fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
  assertMode(false);
});

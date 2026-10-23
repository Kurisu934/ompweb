import "../../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react/pure.js";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ContextMenuHost } = await jiti.import("./context-menu.tsx");
const { contributeContextMenu, quoteMarkdown } = await jiti.import("../../lib/context-menu.ts");

afterEach(cleanup);

const h = React.createElement;
const item = (id, onSelect = () => {}) => ({ id, label: id, onSelect });
const appSection = () => ({ id: "app", items: [item("new chat")] });

function contributing(id, items, children) {
  return h("div", { "data-testid": id, onContextMenu: (event) => contributeContextMenu(event, { id, title: `${id} title`, items }) }, children);
}

const menuLabels = () => screen.queryAllByRole("menuitem").map((node) => node.textContent);

test("inner sections come first, then outer ones; the app section only fills empty spots", async () => {
  const picked = [];
  render(h("div", null,
    h(ContextMenuHost, { appSection }),
    contributing("message", [item("copy text")], contributing("code", [item("copy code", () => picked.push("code"))], h("span", null, "code"))),
    h("p", { "data-testid": "plain" }, "plain"),
  ));

  await act(async () => { fireEvent.contextMenu(screen.getByText("code"), { clientX: 10, clientY: 10 }); });
  assert.deepEqual(menuLabels(), ["copy code", "copy text"]);
  assert.ok(screen.getByText("code title"));

  await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "copy code" })); });
  assert.deepEqual(picked, ["code"]);

  await act(async () => { fireEvent.contextMenu(screen.getByTestId("plain"), { clientX: 20, clientY: 20 }); });
  assert.deepEqual(menuLabels(), ["new chat"]);
});

test("browser menu is kept for Shift, text fields, external links, and opted-out areas", async () => {
  render(h("div", null,
    h(ContextMenuHost, { appSection }),
    contributing("row", [item("rename")], h("div", null,
      h("input", { "aria-label": "field" }),
      h("a", { href: "https://example.com" }, "link"),
      h("div", { "data-native-context-menu": "" }, "terminal"),
      h("span", null, "label"),
    )),
  ));

  for (const target of [screen.getByLabelText("field"), screen.getByText("link"), screen.getByText("terminal")]) {
    let event;
    await act(async () => { event = fireEvent.contextMenu(target, { clientX: 5, clientY: 5 }); });
    assert.equal(event, true, "default not prevented");
    assert.deepEqual(menuLabels(), []);
  }

  let shifted;
  await act(async () => { shifted = fireEvent.contextMenu(screen.getByText("label"), { clientX: 5, clientY: 5, shiftKey: true }); });
  assert.equal(shifted, true);
  assert.deepEqual(menuLabels(), []);

  let plain;
  await act(async () => { plain = fireEvent.contextMenu(screen.getByText("label"), { clientX: 5, clientY: 5 }); });
  assert.equal(plain, false, "our menu replaces the browser menu");
  assert.deepEqual(menuLabels(), ["rename"]);
});

test("inside a dialog nothing app-wide is offered, so the browser menu stays", async () => {
  render(h("div", null,
    h(ContextMenuHost, { appSection }),
    h("div", { role: "dialog" }, h("span", null, "dialog text")),
  ));
  let result;
  await act(async () => { result = fireEvent.contextMenu(screen.getByText("dialog text"), { clientX: 5, clientY: 5 }); });
  assert.equal(result, true);
  assert.deepEqual(menuLabels(), []);
});

test("quotes keep paragraph breaks inside the blockquote and end ready for a reply", () => {
  assert.equal(quoteMarkdown("\r\nfirst\r\n\r\nsecond  \n\n"), "> first\n>\n> second\n\n");
  assert.equal(quoteMarkdown("  indented code"), ">   indented code\n\n");
});

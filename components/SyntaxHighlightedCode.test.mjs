import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { JSDOM } from "jsdom";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { SyntaxHighlightedCode } = await jiti.import("./SyntaxHighlightedCode.tsx");
const { vs, vscDarkPlus } = await jiti.import("../lib/syntax-highlight.ts");

test("highlighted code keeps syntax colors with a wallpaper ink fallback", () => {
  const code = 'use std::collections::HashMap;\nlet map = HashMap::from([(1, "a")]); // read only';
  const html = renderToStaticMarkup(React.createElement(SyntaxHighlightedCode, { code, lang: "rust" }));
  const { document } = new JSDOM(html).window;
  const tokens = [...document.querySelectorAll(".token[style]")].filter(el => el.style.color);
  assert.ok(tokens.length > 5);
  assert.ok(new Set(tokens.map(el => el.style.color)).size >= 3, "syntax categories remain distinct");
  assert.ok(tokens.every(el => el.style.color.includes("var(--wallpaper-code-ink,")));
  assert.equal(document.querySelectorAll(".linenumber").length, 2);
  assert.ok(document.querySelector("code").textContent.includes("HashMap"));
  assert.equal(vs.keyword.color, "#0000ff", "native palettes are not mutated");
  assert.equal(vscDarkPlus.keyword.color, "#569CD6");
});

test("unknown code languages retain their text and do not require wallpaper", () => {
  const html = renderToStaticMarkup(React.createElement(SyntaxHighlightedCode, { code: "a < b && b > c", lang: "unknown-language" }));
  const { document } = new JSDOM(html).window;
  assert.ok(document.querySelector("code").textContent.includes("a < b && b > c"));
  assert.match(document.querySelector("pre").style.color, /var\(--wallpaper-code-ink, #d4d4d4\)/);
});

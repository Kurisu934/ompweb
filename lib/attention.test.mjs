import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { dialogAttention, sortAttention } = await jiti.import("./attention.ts");

test("dialog titles are one shortened line; non-blocking frames are not attention", () => {
  assert.deepEqual(dialogAttention({ method: "input", title: "  Branch\n  name " }), { kind: "input", title: "Branch name" });
  assert.deepEqual(dialogAttention({ method: "open_url", url: "https://example.com/login" }), { kind: "open_url", title: "https://example.com/login" });
  assert.deepEqual(dialogAttention({ method: "ask", questions: [{ header: "DB" }] }), { kind: "ask", title: "DB" });
  assert.equal(dialogAttention({ method: "confirm", title: "x".repeat(300) }).title.length, 120);
  for (const method of ["notify", "setStatus", "setWidget", "setTitle", "cancel"]) assert.equal(dialogAttention({ method }), null);
});

test("attention reads oldest first", () => {
  const item = (id, createdAt) => ({ id, kind: "input", sessionId: "s", cwd: "/", title: "", createdAt });
  assert.deepEqual(sortAttention([item("b", 2), item("a", 2), item("c", 1)]).map((i) => i.id), ["c", "a", "b"]);
});

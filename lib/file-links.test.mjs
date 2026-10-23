import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

async function loadSubject() {
  return jiti.import("./file-links.ts");
}

test("resolves absolute markdown file links and strips line suffixes", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref(
      "/home/me/project/components/MarkdownBody.tsx:36",
      "/home/me/project",
    ),
    "/home/me/project/components/MarkdownBody.tsx",
  );
});

test("resolves absolute file links outside cwd", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref(
      "/home/me/.codex/config.toml:12",
      "/home/me/project",
    ),
    "/home/me/.codex/config.toml",
  );
});

test("resolves relative markdown file links against cwd", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref("components/AppShell.tsx#L42", "/home/me/project"),
    "/home/me/project/components/AppShell.tsx",
  );
});

test("resolves relative parent links for server-side authorization", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref("../outside.md", "/home/me/project"),
    "/home/me/outside.md",
  );
});

test("resolves preview links from the document directory, not the workspace root", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref("../file.js", "/home/me/project/docs/nested"),
    "/home/me/project/docs/file.js",
  );
  assert.equal(
    resolveLocalFileHref("../../../outside.js", "/home/me/project/docs/nested"),
    "/home/me/outside.js",
  );
});

test("does not treat app or external URLs as file links", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(resolveLocalFileHref("/api/files/home/me/project/a.ts", "/home/me/project"), null);
  assert.equal(resolveLocalFileHref("https://example.com/a.ts", "/home/me/project"), null);
  assert.equal(resolveLocalFileHref("ftp://example.com/a.ts", "/home/me/project"), null);
  assert.equal(resolveLocalFileHref("//example.com/a.ts", "/home/me/project"), null);
});

test("resolves Windows file URLs without a synthetic leading slash", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref("file:///C:/Users/me/project/file.txt:10", "C:/Users/me/project"),
    "C:/Users/me/project/file.txt",
  );
});

test("resolves UNC file URLs and backslash UNC paths", async () => {
  const { resolveLocalFileHref } = await loadSubject();

  assert.equal(
    resolveLocalFileHref("file://server/share/project/file.txt", "/home/me/project"),
    "//server/share/project/file.txt",
  );
  assert.equal(
    resolveLocalFileHref("\\\\server\\share\\project\\file.txt", "/home/me/project"),
    "//server/share/project/file.txt",
  );
});

test("tool file paths preserve filesystem spelling while resolving read selectors", async () => {
  const { resolveToolFilePath } = await loadSubject();
  for (const selector of [":35-220", ":-60", ":2+20", ":2-", ":5-16,19,59", ":raw:2-4", ":2-4:raw", ":img"]) {
    assert.equal(resolveToolFilePath(`lib/mesh.ts${selector}`, "/project"), "/project/lib/mesh.ts");
  }
  assert.equal(resolveToolFilePath("README", "/project"), "/project/README");
  assert.equal(resolveToolFilePath("../notes #1 100%25?.md:2", "/project/sub"), "/project/notes #1 100%25?.md");
  assert.equal(resolveToolFilePath("C:\\repo\\src\\main.ts:35-220"), "C:/repo/src/main.ts");
  assert.equal(resolveToolFilePath("\\\\host\\share\\main.ts:raw"), "//host/share/main.ts");
  assert.equal(resolveToolFilePath("/tmp/log:copy.txt:2-4"), "/tmp/log:copy.txt");
  assert.equal(resolveToolFilePath("artifact://36:2-4:raw", "/project"), "artifact://36");
  for (const path of ["xd://lsp", "https://example.com/a.ts", "agent://worker", "skill://example", "bad\0path"]) {
    assert.equal(resolveToolFilePath(path, "/project"), null);
  }
  assert.equal(resolveToolFilePath("relative.ts"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { runHostTool } = await jiti.import("./useAgentSession-stream.ts");

test("cross-session file requests validate in their owning workspace before asking", async (t) => {
  const opened = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(decodeURIComponent(url), "/api/files/D:/other-project/charts/plot.png?type=meta&sessionId=other-session");
    return Response.json({ mime: "image/png" });
  });
  const result = await runHostTool("open_file", { path: "charts\\plot.png" }, {
    cwd: "D:\\other-project", sessionId: "other-session",
    openUrl: () => "unused",
    openFile: (...args) => { opened.push(args); return "Asked the user to confirm"; },
  });
  assert.deepEqual(opened, [["D:/other-project/charts/plot.png", "plot.png"]]);
  assert.deepEqual(result, { text: "Asked the user to confirm", isError: false });
});

test("failed file checks never enqueue a cross-session confirmation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Access denied" }, { status: 403 }));
  const result = await runHostTool("open_file", { path: "/other/plot.png" }, {
    sessionId: "other-session", openUrl: () => "unused",
    openFile: () => assert.fail("must not offer an inaccessible file"),
  });
  assert.equal(result.isError, true);
  assert.match(result.text, /Access denied$/);
});

test("file navigation failures are reported, not silently marked opened", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const result = await runHostTool("open_file", { path: "/project/plot.png" }, {
    openUrl: () => "unused", openFile: () => { throw new Error("Viewer closed"); },
  });
  assert.equal(result.isError, true);
  assert.match(result.text, /Viewer closed$/);
});

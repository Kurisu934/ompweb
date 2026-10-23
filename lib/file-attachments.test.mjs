import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

test("file and artifact routes authorize only references from the requested session", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "omp-file-links-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const sid = "550e8400-e29b-41d4-a716-446655440000";
  const otherSid = "550e8400-e29b-41d4-a716-446655440001";
  const cwd = path.join(root, "workspace");
  const sessions = path.join(root, "agent", "sessions", "project");
  mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
  const image = path.join(root, "outside.png");
  const note = path.join(root, "outside note.md");
  const secret = path.join(root, "secret.txt");
  const toolNote = path.join(root, "tool note.md");
  writeFileSync(image, Buffer.from("89504e470d0a1a0a", "hex"));
  writeFileSync(note, "authorized relative file"); writeFileSync(secret, "not referenced");
  writeFileSync(toolNote, "referenced by read selector");
  const file = path.join(sessions, `2026-01-01T00-00-00-000Z_${sid}.jsonl`);
  const entries = [
    { type: "session", id: sid, version: 3, cwd },
    { type: "message", id: "a1", parentId: null, message: { role: "assistant", content: [{ type: "text", text: `![image](${image})\n[note](<../outside note.md>)\n[spill](artifact://36)\n[bad symlink](artifact://37)` }] } },
    { type: "message", id: "a2", parentId: "a1", message: { role: "assistant", content: [{ type: "toolCall", id: "read-note", name: "read", arguments: { path: "../tool note.md:raw:2-4" } }] } },
  ];
  writeFileSync(file, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(path.join(sessions, `${otherSid}.jsonl`), JSON.stringify({ type: "session", id: otherSid, version: 3, cwd }) + "\n");
  const artifacts = file.replace(/\.jsonl$/, ""); mkdirSync(artifacts);
  writeFileSync(path.join(artifacts, "36.bash.log"), "persisted artifact output");
  writeFileSync(path.join(artifacts, "99.bash.log"), "unreferenced artifact");
  symlinkSync(secret, path.join(artifacts, "37.bash.log"));
  const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
  const { GET } = await jiti.import("../app/api/files/[...path]/route.ts");
  const { GET: artifactGET } = await jiti.import("../app/api/sessions/[id]/artifacts/[artifactId]/route.ts");
  const { NextRequest } = await jiti.import("next/server");
  const { getFileApiUrl } = await jiti.import("./file-urls.ts");
  const requestFile = (target, sessionId, type = "read") => GET(new NextRequest(`http://localhost${getFileApiUrl(target, type, sessionId)}`), { params: Promise.resolve({ path: target.split(path.sep).filter(Boolean) }) });
  const requestArtifact = (id, sessionId = sid, type = "read") => artifactGET(new NextRequest(`http://localhost/api/sessions/${sessionId}/artifacts/${id}?type=${type}`), { params: Promise.resolve({ id: sessionId, artifactId: id }) });

  assert.equal((await requestFile(image, undefined)).status, 403);
  const allowedImage = await requestFile(image, sid);
  assert.equal(allowedImage.status, 200);
  assert.equal(allowedImage.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await allowedImage.arrayBuffer()), Buffer.from("89504e470d0a1a0a", "hex"));
  const relative = await requestFile(note, sid);
  assert.equal(relative.status, 200);
  assert.equal((await relative.json()).content, "authorized relative file");
  assert.equal((await requestFile(secret, sid)).status, 403);
  assert.equal((await requestFile(image, otherSid)).status, 403);
  assert.equal((await requestFile(root, sid, "list")).status, 403);
  const toolRead = await requestFile(toolNote, sid);
  assert.equal(toolRead.status, 200);
  assert.equal((await toolRead.json()).content, "referenced by read selector");
  assert.equal((await requestFile(toolNote, otherSid)).status, 403);
  assert.equal((await requestFile(toolNote, sid, "edit")).status, 403);
  const artifact = await requestArtifact("36");
  assert.equal(artifact.status, 307);
  const target = new URL(artifact.headers.get("location"));
  const resolvedPath = "/" + target.pathname.replace("/api/files/", "").split("/").map(decodeURIComponent).join("/");
  const output = await requestFile(resolvedPath, sid);
  assert.equal(output.status, 200);
  assert.equal((await output.json()).content, "persisted artifact output");
  assert.equal((await requestArtifact("36", sid, "resolve")).status, 200);
  for (const id of ["99", "37", "../secret", "36/../99", "missing"]) assert.equal((await requestArtifact(id)).status, 404);
  assert.equal((await requestArtifact("36", otherSid)).status, 404);
});

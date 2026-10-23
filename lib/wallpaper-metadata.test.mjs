import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { wallpaperMetadata } = await jiti.import("./wallpaper-metadata.ts");
const { selectWallpapers, parseWallpaperPreferences } = await jiti.import("./wallpapers.ts");
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const str = s => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)]);
const scene = (width, height) => Buffer.from(JSON.stringify({ general: { orthogonalprojection: { width, height } } }));
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "omp-wallpaper-metadata-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test("scene dimensions use the package directory offset and refresh changed metadata", async t => {
  const root = await temporary(t), file = path.join(root, "scene.pkg");
  const payload = scene(1920, 1080), offset = 128 * 1024 * 1024;
  const header = Buffer.concat([str("PKGV0024"), u32(1), str("scene.json"), u32(offset), u32(payload.length)]);
  const handle = await fs.open(file, "w");
  try { await handle.write(header, 0, header.length, 0); await handle.write(payload, 0, payload.length, header.length + offset); }
  finally { await handle.close(); }
  const metadata = await wallpaperMetadata(file, "scene");
  assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1080);
  assert.equal(metadata.modifiedAt, (await fs.stat(file)).mtimeMs);
  const plain = path.join(root, "scene.json");
  await fs.writeFile(plain, scene(1080, 1920));
  assert.equal((await wallpaperMetadata(plain, "scene")).width, 1080);
  await fs.writeFile(plain, scene(2560, 1440)); await fs.utimes(plain, 100, 200);
  assert.deepEqual(await wallpaperMetadata(plain, "scene"), { width: 2560, height: 1440, modifiedAt: 200000, addedAt: (await fs.stat(plain)).birthtimeMs });
  await fs.writeFile(file, header);
  assert.equal((await wallpaperMetadata(file, "scene")).width, undefined);
});
const box = (type, bytes) => { const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length + 8); header.write(type, 4); return Buffer.concat([header, bytes]); };
test("video orientation honors MP4 rotation and EBML video dimensions", async t => {
  const root = await temporary(t), file = path.join(root, "clip.mp4");
  for (const version of [0, 1]) {
    const matrix = version ? 52 : 40, tkhd = Buffer.alloc(matrix + 44); tkhd[0] = version;
    tkhd.writeInt32BE(65536, matrix + 4); tkhd.writeInt32BE(-65536, matrix + 12);
    tkhd.writeUInt32BE(1920 * 65536, matrix + 36); tkhd.writeUInt32BE(1080 * 65536, matrix + 40);
    await fs.writeFile(file, Buffer.concat([box("ftyp", Buffer.from("isom0000")), box("mdat", Buffer.alloc(1024)), box("moov", box("trak", box("tkhd", tkhd)))]));
    const m = await wallpaperMetadata(file, "video"); assert.equal(m.width, 1080); assert.equal(m.height, 1920);
  }
  const ebml = (id, bytes) => Buffer.concat([Buffer.from(id, "hex"), Buffer.from([0x80 + bytes.length]), bytes]);
  const webm = path.join(root, "clip.webm");
  await fs.writeFile(webm, Buffer.concat([ebml("1a45dfa3", ebml("4282", Buffer.from("webm"))), ebml("18538067", ebml("1654ae6b", ebml("ae", ebml("e0", Buffer.concat([ebml("b0", Buffer.from([0x07, 0x80])), ebml("ba", Buffer.from([0x04, 0x38]))])))))]));
  const m = await wallpaperMetadata(webm, "video"); assert.equal(m.width, 1920); assert.equal(m.height, 1080);
  await fs.writeFile(file, Buffer.from("broken video"));
  assert.equal((await wallpaperMetadata(file, "video")).width, undefined);
});
test("image orientation follows EXIF display rotation", async t => {
  const file = path.join(await temporary(t), "rotated.jpg");
  await sharp({ create: { width: 120, height: 80, channels: 3, background: "white" } }).jpeg().withMetadata({ orientation: 6 }).toFile(file);
  const m = await wallpaperMetadata(file, "image"); assert.equal(m.width, 80); assert.equal(m.height, 120);
});
const catalogue = [
  { id: "a", title: "Scene 10", kind: "scene", width: 1920, height: 1080, addedAt: 10, modifiedAt: 40 },
  { id: "b", title: "Scene 2", kind: "image", width: 1080, height: 1920, addedAt: 30, modifiedAt: 20 },
  { id: "c", title: "Scene 1", kind: "video", width: 100, height: 100, addedAt: 20, modifiedAt: 30 },
  { id: "d", title: "Unknown", kind: "web" },
];
const options = { query: "", orientation: "all", kind: "all", sort: "name-asc", mobile: false, locale: "en" };
const ids = opts => selectWallpapers(catalogue, { ...options, ...opts }).map(w => w.id);
test("automatic direction follows the device while explicit filters override it and compose with search", () => {
  assert.deepEqual(ids({ orientation: "auto" }), ["a"]);
  assert.deepEqual(ids({ orientation: "auto", mobile: true }), ["b"]);
  assert.deepEqual(ids({ orientation: "landscape", mobile: true }), ["a"]);
  assert.deepEqual(ids({ orientation: "square" }), ["c"]);
  assert.deepEqual(ids({ orientation: "unknown" }), ["d"]);
  assert.deepEqual(ids({ query: " SCENE ", kind: "image" }), ["b"]);
  assert.deepEqual(ids({ query: "Scene", orientation: "unknown" }), []);
  const saved = parseWallpaperPreferences(JSON.stringify({ libraryOrientation: "portrait", librarySort: "name-desc", libraryKind: "scene" }));
  assert.deepEqual(ids({ orientation: saved.libraryOrientation, sort: saved.librarySort, kind: saved.libraryKind }), []);
});
test("catalogue sorts naturally and chronologically, retains unknown dates last, and leaves source order intact", () => {
  assert.deepEqual(ids({}), ["c", "b", "a", "d"]);
  assert.deepEqual(ids({ sort: "name-desc" }), ["d", "a", "b", "c"]);
  assert.deepEqual(ids({ sort: "added-desc" }), ["b", "c", "a", "d"]);
  assert.deepEqual(ids({ sort: "added-asc" }), ["a", "c", "b", "d"]);
  assert.deepEqual(ids({ sort: "modified-desc" }), ["a", "c", "b", "d"]);
  assert.deepEqual(ids({ sort: "modified-asc" }), ["b", "c", "a", "d"]);
  assert.deepEqual(catalogue.map(w => w.id), ["a", "b", "c", "d"]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { gunzipSync } from 'node:zlib';
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { loadSceneFont, loadSceneResources, loadSceneVideo, sceneTextureDemand } = await jiti.import('./wallpaper-scene-loading.ts');

test('scene fonts use local Blob URLs without copying bytes through FontFace hooks and release on failure/cancellation', async t => {
  const added = new Set(), revoked = [], sources = [];
  let pending, mode = 'ok', next = 0;
  t.mock.method(URL, 'createObjectURL', () => `blob:font-${++next}`);
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  for (const [key, value] of Object.entries({ document: { fonts: { add: face => added.add(face), delete: face => added.delete(face) } }, FontFace: class {
    constructor(family, source) { this.family = family; sources.push(source); }
    load() { if (mode === 'error') return Promise.reject(new Error('Bad font')); if (mode === 'pending') return new Promise(resolve => { pending = resolve; }); return Promise.resolve(this); }
  } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  const bytes = new Blob(['font data']);
  bytes.arrayBuffer = () => { throw new Error('Must not copy font bytes'); };
  const font = await loadSceneFont('we-test', bytes, new AbortController().signal);
  assert.deepEqual(sources, ['url("blob:font-1")']); assert.equal(added.size, 1); assert.deepEqual(revoked, []);
  font.dispose(); font.dispose(); assert.equal(added.size, 0); assert.deepEqual(revoked, ['blob:font-1']);
  mode = 'error'; await assert.rejects(loadSceneFont('we-bad', bytes, new AbortController().signal), /Bad font/);
  assert.deepEqual(revoked, ['blob:font-1', 'blob:font-2']);
  mode = 'pending'; const abort = new AbortController(); const loading = loadSceneFont('we-cancel', bytes, abort.signal);
  abort.abort(); pending(); await assert.rejects(loading, { name: 'AbortError' });
  assert.equal(added.size, 0); assert.deepEqual(revoked, ['blob:font-1', 'blob:font-2', 'blob:font-3']);
  await assert.rejects(loadSceneFont('we-aborted', bytes, abort.signal), { name: 'AbortError' }); assert.equal(next, 3);
});
const { sceneAssetResponse } = await jiti.import('./wallpaper-scene-assets.ts');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('scene loading limits concurrency and drains started work on failure', async () => {
  let active = 0, peak = 0, finished = 0;
  await loadSceneResources([1,2,3,4,5,6], new AbortController().signal, async () => {
    active++; peak = Math.max(peak, active); await delay(5); active--; finished++;
  }, 3);
  assert.equal(peak, 3); assert.equal(finished, 6);
  const started = [];
  await assert.rejects(loadSceneResources([1,2,3,4,5], new AbortController().signal, async n => {
    started.push(n); if (n === 1) throw new Error('bad asset');
    active++; await delay(10); active--;
  }, 2), /bad asset/);
  assert.deepEqual(started, [1,2]); assert.equal(active, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadSceneResources([1], controller.signal, async () => assert.fail()), { name: 'AbortError' });
});

test('texture demand follows visible layers, effect inputs, masks and particle children', () => {
  const layer = {texture:'day', passes:[{textures:[null,'effect']}], reflection:{normal:'normal'}, mesh:{clips:[{texture:'mask'}]}};
  const keys = sceneTextureDemand([{layer,visible:true},{layer:{texture:'night',passes:[]},visible:false}], [{texture:'particle',refraction:{texture:'refraction'},children:[{texture:'child',children:[]}]}]);
  assert.deepEqual([...keys].sort(), ['child','day','effect','mask','normal','particle','refraction']);
});

class Video extends EventTarget {
  src = ''; preload = 'none'; paused = false; resets = 0;
  pause() { this.paused = true; }
  removeAttribute() { this.src = ''; }
  load() { this.resets++; }
}
test('deferred video loading waits for first frame and releases cancelled loads', async () => {
  const video = new Video(), controller = new AbortController();
  const promise = loadSceneVideo(video, '/clip', controller.signal);
  assert.equal(video.src, '/clip'); assert.equal(video.preload, 'auto');
  video.dispatchEvent(new Event('loadeddata')); await promise;
  controller.abort(); assert.equal(video.src, '/clip');
  const next = new Video(), abort = new AbortController();
  const pending = loadSceneVideo(next, '/next', abort.signal); abort.abort();
  await assert.rejects(pending, {name:'AbortError'});
  assert.equal(next.src, ''); assert.equal(next.resets, 1);
  const failed = new Video(), error = loadSceneVideo(failed, '/bad', new AbortController().signal);
  failed.dispatchEvent(new Event('error')); await assert.rejects(error, /Cannot decode/);
});

test('scene asset responses preserve ranges and cancellation without whole-file copies', async () => {
  const data = Buffer.alloc(200000, 71);
  for (const [range, status, start, length] of [[null,200,0,data.length],['bytes=10-19',206,10,10],['bytes=-8',206,data.length-8,8],['bytes=199990-',206,199990,10]]) {
    const response = await sceneAssetResponse(new Request('http://localhost/asset',{headers:range?{range}:{}}), data, 'video/mp4');
    assert.equal(response.status, status); assert.equal(Number(response.headers.get('content-length')), length);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data.subarray(start,start+length));
  }
  const invalid = await sceneAssetResponse(new Request('http://localhost/asset',{headers:{range:'bytes=200001-'}}),data,'video/mp4');
  assert.equal(invalid.status,416);
  const response = await sceneAssetResponse(new Request('http://localhost/asset'),data,'video/mp4');
  const reader = response.body.getReader(), chunk = (await reader.read()).value;
  assert.equal(chunk.length,65536); assert.equal(chunk.buffer,data.buffer);
  await reader.cancel();
});

test('font compression is lossless, negotiated and bypassed for byte ranges', async () => {
  const data = Buffer.from('test font payload '.repeat(20000));
  for(const encoding of ['gzip','br, gzip, deflate','gzip;q=0.5']) {
    const response = await sceneAssetResponse(new Request('http://localhost/font',{headers:{'accept-encoding':encoding}}),data,'font/ttf');
    assert.equal(response.headers.get('content-encoding'),'gzip');
    assert.equal(response.headers.get('vary'),'Accept-Encoding');
    assert.deepEqual(gunzipSync(Buffer.from(await response.arrayBuffer())),data);
  }
  for(const headers of [{},{'accept-encoding':'gzip;q=0'},{'accept-encoding':'br'},{'accept-encoding':'gzip',range:'bytes=0-9'}]) {
    const response = await sceneAssetResponse(new Request('http://localhost/font',{headers}),data,'font/ttf');
    assert.equal(response.headers.get('content-encoding'),null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), headers.range ? data.subarray(0,10) : data);
  }
});

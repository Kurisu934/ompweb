import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { cachedBrowserScene, sceneCacheRoot } = await jiti.import('./wallpaper-scene-cache.ts');
const { sceneAssetResponse } = await jiti.import('./wallpaper-scene-assets.ts');
const state = () => globalThis[Symbol.for('ompweb.scene-disk-cache.v1')];
const id = 'a'.repeat(32);
async function fixture(t, size = 1024) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-scene-cache-'));
  const before = { agent: process.env.PI_CODING_AGENT_DIR, limit: process.env.OMP_WEB_WALLPAPER_CACHE_MB };
  process.env.PI_CODING_AGENT_DIR = root; delete process.env.OMP_WEB_WALLPAPER_CACHE_MB;
  t.after(async () => {
    state().entries.clear(); await state().writes;
    for (const [key,value] of [['PI_CODING_AGENT_DIR',before.agent],['OMP_WEB_WALLPAPER_CACHE_MB',before.limit]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'omp-scene-cache-')));
    await fs.rm(root,{recursive:true,force:true});
  });
  const source = path.join(root,'source.tex'); await fs.writeFile(source,'original');
  const missing = path.join(root,'override.tex');
  const data = Buffer.alloc(size,71), key = createHash('sha256').update(data).digest('hex');
  let builds = 0;
  const compile = async observe => {
    builds++; await observe(source); await observe(missing);
    return {manifest:{version:1,width:100,height:100,layers:[],particles:[],textures:[],fonts:[{key,url:`/api/wallpapers/${id}/scene-assets/${key}`,mimeType:'font/ttf'}],testBuild:builds},assets:new Map([[key,data]])};
  };
  return { root, source, missing, key, data, compile, builds:()=>builds };
}
test('compiled scenes survive a fresh process and serve original bytes from disk', async t => {
  const f = await fixture(t);
  const first = await cachedBrowserScene(id,f.compile,true);
  assert.equal(first.cache,'built'); assert.equal(f.builds(),1);
  assert.equal(Buffer.isBuffer(first.assets.get(f.key)),false);
  assert.equal((await cachedBrowserScene(id,f.compile,true)).cache,'memory');
  const script = `const {createJiti}=require('jiti');(async()=>{const {cachedBrowserScene}=await createJiti(process.cwd()+'/cache-probe.cjs',{tsconfigPaths:true}).import('./lib/wallpaper-scene-cache.ts');const value=await cachedBrowserScene('${id}',async()=>{throw new Error('Unexpected raw scene compilation')},true);console.log(JSON.stringify({cache:value.cache,assets:value.assets.size}));})().catch(e=>{console.error(e);process.exitCode=1});`;
  const {stdout}=await promisify(execFile)(process.execPath,['-e',script],{cwd:process.cwd(),env:{...process.env},windowsHide:true});
  assert.deepEqual(JSON.parse(stdout),{cache:'disk',assets:1});
  const asset=first.assets.get(f.key);
  const full=await sceneAssetResponse(new Request('http://localhost/asset'),asset,'font/ttf');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()),f.data);
  const compressed=await sceneAssetResponse(new Request('http://localhost/asset',{headers:{'accept-encoding':'gzip'}}),asset,'font/ttf');
  assert.deepEqual(gunzipSync(Buffer.from(await compressed.arrayBuffer())),f.data);
  const range=await sceneAssetResponse(new Request('http://localhost/asset',{headers:{range:'bytes=10-19'}}),asset,'font/ttf');
  assert.equal(range.status,206); assert.deepEqual(Buffer.from(await range.arrayBuffer()),f.data.subarray(10,20));
});
test('source edits, new overrides and user properties invalidate cached compilation', async t => {
  const f=await fixture(t);
  await cachedBrowserScene(id,f.compile,true);
  await fs.writeFile(f.source,'updated source contents');
  assert.equal((await cachedBrowserScene(id,f.compile,true)).cache,'built');
  await fs.writeFile(f.missing,'now present');
  await cachedBrowserScene(id,f.compile,true);
  const properties=path.join(f.root,'web-wallpapers','scene-properties');await fs.mkdir(properties,{recursive:true});
  await fs.writeFile(path.join(properties,`${id}.json`),'{}');
  await cachedBrowserScene(id,f.compile,true);
  assert.equal(f.builds(),4);
});
test('corrupt or incomplete generated files are rebuilt instead of reused', async t => {
  const f=await fixture(t);let value=await cachedBrowserScene(id,f.compile,true);
  await fs.writeFile(path.join(value.directory,f.key),'broken');
  value=await cachedBrowserScene(id,f.compile,true);assert.equal(f.builds(),2);
  await fs.writeFile(path.join(value.directory,'manifest.json'),'{}');state().entries.clear();
  value=await cachedBrowserScene(id,f.compile,true);assert.equal(f.builds(),3);
  await fs.writeFile(path.join(value.directory,'record.json'),'not json');state().entries.clear();
  await cachedBrowserScene(id,f.compile,true);assert.equal(f.builds(),4);
  const root=sceneCacheRoot(), pointer=(await fs.readdir(root)).find(name=>name.endsWith('.json'));
  await fs.writeFile(path.join(root,pointer),JSON.stringify({generation:'../../outside'}));state().entries.clear();
  await cachedBrowserScene(id,f.compile,true);assert.equal(f.builds(),5);
});
test('disabled, unwritable and undersized caches fall back to bounded in-memory assets', async t => {
  const f=await fixture(t,200000);
  process.env.OMP_WEB_WALLPAPER_CACHE_MB='0';
  assert.equal((await cachedBrowserScene(id,f.compile,true)).cache,'uncached');
  state().entries.clear(); process.env.OMP_WEB_WALLPAPER_CACHE_MB='0.05';
  assert.equal((await cachedBrowserScene(id,f.compile,true)).cache,'uncached');
  state().entries.clear(); delete process.env.OMP_WEB_WALLPAPER_CACHE_MB;
  await fs.rm(sceneCacheRoot(),{recursive:true,force:true});await fs.writeFile(sceneCacheRoot(),'not a directory');
  const value=await cachedBrowserScene(id,f.compile,true);
  assert.equal(value.cache,'uncached'); assert.deepEqual(value.assets.get(f.key),f.data);
});
test('concurrent requests coalesce and disk capacity evicts older generated scenes', async t => {
  const f=await fixture(t,600000);process.env.OMP_WEB_WALLPAPER_CACHE_MB='1';
  const results=await Promise.all(Array.from({length:8},()=>cachedBrowserScene(id,f.compile,true)));
  assert.equal(f.builds(),1);assert.ok(results.every(r=>r.cache==='built'));
  const first=results[0].directory;
  const second=await cachedBrowserScene('b'.repeat(32),f.compile,true);
  assert.equal(second.cache,'built'); await assert.rejects(fs.stat(first),{code:'ENOENT'});
  assert.ok((await fs.stat(second.directory)).isDirectory());
});
test('sources changed during compilation are never published as a reusable cache', async t => {
  const f=await fixture(t);
  const value=await cachedBrowserScene(id,async observe=>{const result=await f.compile(observe);await fs.writeFile(f.source,'changed while compiling');return result;},true);
  assert.equal(value.cache,'uncached');
  state().entries.clear();
  assert.equal((await cachedBrowserScene(id,f.compile,true)).cache,'built');
});

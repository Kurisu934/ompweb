/* eslint-disable @typescript-eslint/no-require-imports -- Node-only browser QA runner. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.QA_BASE || 'http://127.0.0.1:13037');
assert.equal(base.hostname, '127.0.0.1');
assert.notEqual(base.port, '30177', 'Use an isolated preview, never production');
const output = path.resolve(process.env.QA_OUT || '.tmp/wallpaper-cache-browser-qa');
const profile = path.join(output, `profile-${Date.now()}`);
const id = '6f5087dd337ded86f199d783f1bb72f1';
const origin = process.env.QA_ORIGIN || `http://wallpaper-cache.test:${base.port}`;
assert.equal(new URL(origin).port, base.port);
const results = [];

async function open(profile, blocked = false) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: 390, height: 844 },
    args: ['--enable-webgl', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server', '--host-resolver-rules=MAP wallpaper-cache.test 127.0.0.1'],
  });
  await context.route('**/api/sessions', r => r.fulfill({ json: { sessions: [], runningSessionIds: [], runningSessions: [] } }));
  await context.route('**/api/provider-usage*', r => r.fulfill({ json: { generatedAt: Date.now(), reports: [] } }));
  await context.addInitScript(({ id, blocked }) => {
    localStorage.setItem('omp-web:wallpaper', JSON.stringify({ id, kind: 'scene', paused: false, brightness: 100, muted: true, fit: 'cover', glass: 'default' }));
    const now = new Date(); now.setHours(12, 0, 0, 0); Date.now = () => now.getTime();
    if (blocked) Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    window.__videos = []; window.__audio = [];
    const create = document.createElement.bind(document);
    document.createElement = function(tag, ...args) { const el = create(tag, ...args); if (tag.toLowerCase() === 'video') window.__videos.push(el); return el; };
    const Audio = window.Audio;
    window.Audio = function(...args) { const el = new Audio(...args); window.__audio.push(el); return el; };
  }, { id, blocked });
  const page = context.pages()[0] || await context.newPage();
  const errors = [], requests = [], manifests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', req => { if (req.url().includes('/scene-assets/')) requests.push({ key: req.url().split('/').pop(), type: req.resourceType() }); });
  page.on('response', response => { if (response.url().endsWith(`/${id}/scene`)) manifests.push(response.status()); });
  const start = performance.now();
  try {
    await page.goto(origin);
    await page.waitForFunction(() => Number(document.querySelector('canvas.wallpaper-scene')?.dataset.sceneTime) > 0, null, { timeout: 45000 });
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    console.error(JSON.stringify({ errors, requests, manifests, url: page.url(), body: await page.locator('body').innerText() }));
    await context.close(); throw error;
  }
  console.log(JSON.stringify({ step: 'first-frame', blocked, elapsed: performance.now() - start }));
  assert.equal(await page.evaluate(() => isSecureContext), false, 'Must prove caching works over insecure HTTP');
  return { context, page, errors, requests, manifests, firstFrameMs: performance.now() - start };
}
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('omp-web:scene-cache:v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, read = db.transaction('resources').objectStore('resources').getAll();
      read.onsuccess = () => { const rows = read.result.map(r => ({ key: r.key, bytes: r.bytes, type: r.blob.type, etag: r.etag })); db.close(); resolve(rows); };
      read.onerror = () => reject(read.error);
    };
  }));
}
async function verify(run, label) {
  const before = await run.page.evaluate(() => {
    const canvas = document.querySelector('canvas.wallpaper-scene'), sample = document.createElement('canvas');
    sample.width = 80; sample.height = 45; const ctx = sample.getContext('2d'); ctx.drawImage(canvas, 0, 0, 80, 45);
    return { time: Number(canvas.dataset.sceneTime), colors: new Set(ctx.getImageData(0, 0, 80, 45).data).size,
      videos: window.__videos.filter(v => v.src).map(v => ({ src: v.src.startsWith('blob:') ? 'blob:' : new URL(v.src).pathname, time: v.currentTime })),
      audio: window.__audio.filter(a => a.src).map(a => ({ src: a.src.startsWith('blob:') ? 'blob:' : new URL(a.src).pathname, time: a.currentTime })),
      alert: document.querySelector('.wallpaper-error')?.textContent };
  });
  await run.page.waitForTimeout(500);
  assert.ok(Number(await run.page.locator('canvas.wallpaper-scene').getAttribute('data-scene-time')) > before.time);
  assert.ok(before.colors > 30); assert.equal(before.alert, undefined); assert.deepEqual(run.errors, []);
  await run.page.screenshot({ path: path.join(output, `${label}.png`) });
  results.push({ label, firstFrameMs: run.firstFrameMs, ...before, requests: run.requests, manifests: run.manifests });
  console.log(JSON.stringify(results.at(-1)));
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  let run;
  try {
    run = await open(profile);
    let entries;
    const deadline = performance.now() + 120000;
    do {
      await run.page.waitForTimeout(500); entries = await records(run.page);
      if (entries.some(e => e.type.startsWith('video/')) && entries.some(e => e.type.startsWith('audio/'))) break;
    } while (performance.now() < deadline);
    assert.ok(entries.some(e => e.type.startsWith('video/')), 'Active video must be persisted');
    assert.ok(entries.some(e => e.type.startsWith('audio/')), 'Native BGM must be persisted');
    assert.equal(entries.filter(e => e.type.startsWith('video/')).length, 1, 'Do not eagerly download every time-of-day video');
    assert.ok(entries.some(e => e.key.startsWith('manifest:') && e.etag));
    assert.ok(entries.reduce((sum, e) => sum + e.bytes, 0) <= 256 * 1024 * 1024);
    await verify(run, 'cold'); await run.context.close(); run = undefined;

    run = await open(profile);
    await run.page.waitForTimeout(6000);
    await verify(run, 'browser-restart');
    assert.deepEqual(run.requests, [], 'Repeated visit must not fetch scene assets, including BGM');
    assert.deepEqual(run.manifests, [304]);
    assert.ok(results.at(-1).videos.every(v => v.src === 'blob:'));
    assert.ok(results.at(-1).audio.every(a => a.src === 'blob:'));

    const image = entries.find(e => e.type.startsWith('image/'));
    assert.ok(image);
    await run.page.evaluate(key => new Promise((resolve, reject) => {
      const open = indexedDB.open('omp-web:scene-cache:v1', 1);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('resources', 'readwrite'); tx.objectStore('resources').delete(key);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }), image.key);
    await run.context.close(); run = undefined;

    run = await open(profile);
    await run.page.waitForTimeout(1000);
    await verify(run, 'single-asset-evicted');
    assert.deepEqual(run.requests.map(r => `asset:${r.key}`), [image.key], 'Only the missing resource should download');
    await run.context.close(); run = undefined;

    run = await open(path.join(output, `blocked-${Date.now()}`), true);
    await run.page.waitForTimeout(4500);
    await verify(run, 'storage-blocked-fallback');
    assert.ok(!run.requests.some(r => r.type === 'fetch' && (r.key.startsWith('bec5cd1d') || r.key.startsWith('c80cb9a8'))), 'Do not background-download media when storage is unavailable');
  } finally { if (run) await run.context.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

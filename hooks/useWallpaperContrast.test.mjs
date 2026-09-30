import '../tests/setup-dom.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHook, cleanup } from '@testing-library/react';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { useWallpaperContrast } = await jiti.import('./useWallpaperContrast.ts');

test('wallpaper ink batches layout reads before attribute writes and measures each target once', t => {
  for (const [key, value] of Object.entries({ NodeFilter: window.NodeFilter, innerWidth: 1280, innerHeight: 800, ResizeObserver: class { observe() {} disconnect() {} } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(() => {}) } });
  t.after(() => { cleanup(); document.body.replaceChildren(); if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts); else delete document.fonts; });
  document.body.innerHTML = '<main class="wallpaper-shell"><p id="text">First<!-- split --> second</p><button id="button">Action</button><p id="hidden" style="visibility:hidden">Hidden</p><p id="outside">Offscreen</p><pre><code id="code">Code</code></pre><div role="alert" id="alert">Status</div></main>';
  const measured = [];
  t.mock.method(HTMLElement.prototype, 'getBoundingClientRect', function() {
    assert.equal(document.querySelector('[data-wallpaper-ink]'), null, 'A style write invalidated layout while targets were still being measured');
    measured.push(this.id);
    return this.id === 'outside' ? { width: 100, height: 20, top: 1000, bottom: 1020, left: 0, right: 100 } : { width: 100, height: 20, top: 10, bottom: 30, left: 0, right: 100 };
  });
  const { unmount } = renderHook(() => useWallpaperContrast({ adaptiveText: true, id: 'wallpaper' }, true));
  assert.equal(document.getElementById('text').dataset.wallpaperInk, 'global');
  assert.equal(document.getElementById('button').dataset.wallpaperInk, 'global');
  for (const id of ['hidden', 'outside', 'code', 'alert']) assert.equal(document.getElementById(id).dataset.wallpaperInk, undefined);
  assert.equal(measured.filter(id => id === 'text').length, 1);
  assert.equal(measured.filter(id => id === 'button').length, 1);
  unmount(); assert.equal(document.querySelector('[data-wallpaper-ink]'), null);
});

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const { createJiti } = require('jiti');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const base = process.env.QA_BASE || 'http://127.0.0.1:13042';
const out = process.env.QA_OUT || '.tmp/code-glass-qa';
const id = 'a'.repeat(32), sessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const code = 'use rayon::prelude::*;\nuse std::collections::HashMap;\n\nlet map: HashMap<u32, String> = HashMap::from([(1, "a".into()), (2, "b".into())]);\n\nlet results: Vec<Option<String>> = keys\n    .par_iter()\n    .map(|k| map.get(k).cloned()) // Read only, no lock\n    .collect();';
const contextData = {
  messages: [{ role: 'assistant', provider: 'qa', model: 'Code preview', content: [{ type: 'text', text: 'Read-only `HashMap` lookups can run in parallel.\n\n```rust\n' + code + '\n```' }] }],
  entryIds: ['a1'], thinkingLevel: 'off', model: null, todoPhases: [],
};
const info = { id: sessionId, path: '/qa/session.jsonl', cwd: '/qa', projectRoot: '/qa', name: 'Code glass', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', messageCount: 1, firstMessage: 'Code glass' };

async function audit(page, selector, backdrop) {
  return page.locator(selector).first().evaluate((el, backdrop) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgba = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const luminance = values => values.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { a = luminance(a); b = luminance(b); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node);
    // The fixed wallpaper paints above body/html backgrounds, below the shell.
    const shell = chain.findIndex(node => node.classList.contains('wallpaper-shell'));
    const background = chain.slice(Math.max(0, shell)).reduce((bg, node) => { const c = rgba(getComputedStyle(node).backgroundColor), alpha = c[3] / 255; return bg.map((v, i) => c[i] * alpha + v * (1 - alpha)); }, backdrop);
    const colors = [...new Set([el, ...el.querySelectorAll('code, .token, .linenumber')].map(node => getComputedStyle(node).color))];
    const style = getComputedStyle(el);
    return { alpha: rgba(style.backgroundColor)[3] / 255, blur: chain.map(node => getComputedStyle(node).backdropFilter).filter(v => v && v !== 'none'), colors, minimumContrast: Math.min(...colors.map(color => ratio(rgba(color), background))), background };
  }, backdrop);
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const imageOverride = process.env.QA_IMAGE ? await fs.readFile(process.env.QA_IMAGE) : null;
  const jiti = createJiti(__filename, { jsx: { runtime: 'automatic' }, tsconfigPaths: true });
  const { CodeBlock } = await jiti.import('../components/MermaidBlock.tsx');
  const streamingHtml = renderToStaticMarkup(React.createElement(CodeBlock, { code: 'const pending = "streaming";', lang: 'js', isStreaming: true }));
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const theme of ['light', 'omp']) for (const tone of ['dark', 'light']) for (const viewport of (process.env.QA_SMOKE ? [{ width: 1440, height: 960 }] : [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }])) {
      const bg = tone === 'dark' ? [24, 43, 65] : [216, 227, 239];
      const pixels = Buffer.alloc(640 * 480 * 3);
      for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) for (let c = 0; c < 3; c++) pixels[(y * 640 + x) * 3 + c] = bg[c] + ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 10 : 0);
      const wallpaper = imageOverride ? await sharp(imageOverride).png().toBuffer() : await sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } }).png().toBuffer();
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      await context.addInitScript(({ id, theme }) => {
        localStorage.setItem('omp-theme', theme);
        localStorage.setItem('omp-web:wallpaper', JSON.stringify({ id, kind: 'image', adaptiveText: true, textMode: 'auto', brightness: 100, glass: 'default', muted: true }));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.qaCopied = value; } } });
      }, { id, theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path === `/api/wallpapers/${id}/media`) return route.fulfill({ contentType: 'image/png', body: wallpaper });
        if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': qa\n\n' });
        if (path === '/api/sessions') return route.fulfill({ json: { sessions: [info], runningSessionIds: [], runningSessions: [] } });
        if (path === `/api/sessions/${sessionId}`) return route.fulfill({ json: { info, header: { ...info, type: 'session' }, tree: [], leafId: 'a1', context: contextData } });
        if (path.endsWith('/context')) return route.fulfill({ json: contextData });
        return route.fulfill({ json: { running: false, sessions: [], subagents: [], projects: [], models: {}, modelList: [], reports: [], pets: [], entries: [], providers: [], settings: {}, catalog: [], tools: [], commands: [], wallpapers: [], roots: [], warnings: [], ok: true } });
      });
      await page.goto(`${base}/?session=${sessionId}`);
      await page.waitForFunction(() => document.documentElement.dataset.wallpaperTextPolarity && document.querySelector('.markdown-code-block .token'));
      await page.locator('.markdown-code-block pre').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const initialKeyword = await page.locator('.token').filter({ hasText: /^use$/ }).first().evaluate(el => getComputedStyle(el).color);
      for (const mode of ['default', 'frosted', 'clear']) {
        await page.evaluate(mode => { const key = 'omp-web:wallpaper'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), glass: mode })); dispatchEvent(new Event('omp-web:wallpaper-preferences')); }, mode);
        await page.waitForTimeout(150);
        const surfaces = {};
        for (const selector of ['.markdown-code-block', '.markdown-code-header', '.markdown-code-action', '.markdown-code-block pre']) {
          const value = await audit(page, selector, bg.map(v => v + 10)); surfaces[selector] = value;
          assert.ok(value.alpha <= .11, `${selector} must not cover the glass`);
          if (mode === 'clear') { assert.equal(value.alpha, 0); assert.deepEqual(value.blur, []); }
          else assert.ok(value.blur.some(v => /blur\((14|20)px\)/.test(v)), `${selector} needs ancestor blur`);
        }
        if (!imageOverride) assert.ok(surfaces['.markdown-code-block pre'].minimumContrast >= 4.5, JSON.stringify(surfaces));
        assert.ok(surfaces['.markdown-code-block pre'].colors.length >= 4, 'keep syntax highlighting');
        if (mode === 'default') await page.locator('.wallpaper-assistant').screenshot({ path: `${out}/${theme}-${tone}-${viewport.width}.png` });
        report.push({ theme, tone, viewport, mode, surfaces });
      }
      await page.locator('.markdown-code-action').first().click();
      assert.equal(await page.evaluate(() => window.qaCopied), code);
      for (const textMode of ['material', 'fixed']) {
        await page.evaluate(({ textMode, textColor }) => { const key = 'omp-web:wallpaper'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), textMode, textColor })); dispatchEvent(new Event('omp-web:wallpaper-preferences')); }, { textMode, textColor: tone === 'dark' ? '#e4e6ed' : '#202632' });
        await page.waitForFunction(mode => document.documentElement.dataset.wallpaperText === mode, textMode);
        await page.waitForTimeout(500);
        if (!imageOverride) {
          const value = await audit(page, '.markdown-code-block pre', bg.map(v => v + 10));
          assert.ok(value.minimumContrast >= 4.5, `${textMode} ink remains readable: ${JSON.stringify(value)}`);
        }
      }
      await page.evaluate(html => { const element = document.createElement('section'); element.id = 'qa-streaming'; element.innerHTML = html; document.querySelector('.wallpaper-assistant').append(element); }, streamingHtml);
      assert.equal((await audit(page, '#qa-streaming pre', bg)).alpha, 0);
      await page.locator('#qa-streaming').evaluate(el => el.remove());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no page overflow');
      const pre = page.locator('.markdown-code-block pre').first();
      if (viewport.width < 640) assert.ok(await pre.evaluate(el => { el.scrollLeft = 80; return el.scrollLeft > 0; }), 'long code scrolls within the block');
      await page.evaluate(() => { const key = 'omp-web:wallpaper'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), id: null })); dispatchEvent(new Event('omp-web:wallpaper-preferences')); });
      await page.waitForFunction(() => document.documentElement.dataset.wallpaper !== 'on');
      const native = await audit(page, '.markdown-code-block pre', bg);
      assert.equal(native.alpha, 1, 'native code backdrop restored without wallpaper');
      const keyword = page.locator('.token').filter({ hasText: /^use$/ }).first();
      const actualNative = await keyword.evaluate(el => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = getComputedStyle(el).color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); });
      assert.deepEqual(actualNative, theme === 'light' ? [0, 0, 255] : [86, 156, 214]);
      assert.notEqual(initialKeyword, await keyword.evaluate(el => getComputedStyle(el).color));
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ theme, tone, viewport, glassModes: 3, textModes: 3, imageOverride: !!imageOverride, copy: true, streaming: true, nativeRestored: true, errors }));
      await context.close();
    }
  } finally { await fs.writeFile(`${out}/results.json`, JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

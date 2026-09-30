/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser regression runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const base = process.env.QA_BASE || 'http://127.0.0.1:13048';
const out = process.env.QA_OUT || '.tmp/provider-usage-refresh-qa';
const id = 'a'.repeat(32);
const empty = { running: false, sessions: [], runningSessionIds: [], runningSessions: [], subagents: [], projects: [], models: {}, modelList: [], reports: [], pets: [], entries: [], memos: [], tracks: [], providers: [], settings: {}, catalog: [], tools: [], commands: [], wallpapers: [], roots: [], warnings: [], agents: [], skills: [], plugins: [], servers: [], accounts: [], ok: true };

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ['light', 'omp']) for (const viewport of (process.env.QA_SMOKE ? [{ width: 1440, height: 960 }] : [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }])) {
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      const wallpaper = await sharp({ create: { width: 64, height: 64, channels: 3, background: theme === 'light' ? '#234352' : '#cadbd7' } }).png().toBuffer();
      await context.addInitScript(({ theme, id }) => {
        localStorage.setItem('omp-theme', theme);
        localStorage.setItem('omp-web:provider-usage-collapsed', 'false');
        localStorage.setItem('omp-web:wallpaper', JSON.stringify({ id, kind: 'image', adaptiveText: true, adaptivePalette: true, textMode: 'auto', brightness: 100, glass: 'default', muted: true }));
      }, { theme, id });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let requests = 0, failNext = false;
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path === `/api/wallpapers/${id}/media`) return route.fulfill({ contentType: 'image/png', body: wallpaper });
        if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': qa\n\n' });
        if (path === '/api/provider-usage') {
          requests++;
          if (failNext) { failNext = false; return route.fulfill({ status: 502, json: { error: 'Temporary test failure' } }); }
          return route.fulfill({ json: { generatedAt: Date.now(), reports: [{ provider: 'test-provider', accountLabel: 'Test account', fiveHour: { percent: requests * 10, resetMinutes: 120 } }] } });
        }
        return route.fulfill({ json: empty });
      });
      try {
        await page.clock.install();
        await page.goto(base);
        const panel = page.locator('.provider-usage-panel');
        const openSidebar = page.getByRole('button', { name: 'Show sidebar', exact: true });
        if (await openSidebar.isVisible()) await openSidebar.click();
        await panel.waitFor();
        const hasPercent = percent => page.waitForFunction(percent => document.querySelector('.provider-usage-panel')?.textContent.includes(`Highest ${percent}%`), percent);
        await hasPercent(10);
        await page.waitForFunction(() => document.documentElement.dataset.wallpaperTextPolarity);
        await page.waitForFunction(() => document.querySelector('.provider-usage-panel').getBoundingClientRect().x >= -0.5);
        await page.clock.pauseAt(new Date());
        const advance = async ms => { await page.clock.fastForward(ms); };
        const visibility = async visible => page.evaluate(visible => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          if (visible) window.dispatchEvent(new Event('focus'));
        }, visible);
        const online = async value => page.evaluate(value => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, value });
          window.dispatchEvent(new Event(value ? 'online' : 'offline'));
        }, value);

        await advance(60_000);
        await hasPercent(20);
        assert.equal(requests, 2);
        await visibility(false);
        await advance(180_000);
        assert.equal(requests, 2, 'hidden pages stop polling');
        await visibility(true);
        await hasPercent(30);
        assert.equal(requests, 3, 'returning refreshes only once');
        await online(false);
        await advance(180_000);
        assert.equal(requests, 3, 'offline pages stop polling');
        await online(true);
        await hasPercent(40);
        failNext = true;
        await advance(60_000);
        await page.waitForFunction(() => document.querySelector('.provider-usage-panel')?.textContent.includes('Provider limits unavailable'));
        assert.match(await panel.textContent(), /40%/, 'the last known meter survives a failed refresh');
        await advance(60_000);
        await hasPercent(60);
        assert.equal(requests, 6);
        await visibility(false);
        await advance(10_000);
        await visibility(true);
        assert.equal(requests, 6, 'fresh data is not re-fetched on every focus');
        const style = await panel.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter, rect: el.getBoundingClientRect().toJSON() }));
        assert.match(style.blur, /blur\(14px\)/);
        assert.ok(style.rect.x >= -1 && style.rect.right <= viewport.width + 1, JSON.stringify(style.rect));
        assert.deepEqual(errors, []);
        await panel.screenshot({ path: `${out}/usage-${theme}-${viewport.width}.png`, animations: 'disabled' });
        results.push({ theme, viewport, requests, backgroundPause: true, onlineRecovery: true, preservedOnError: true, glass: style.blur });
        console.log(JSON.stringify(results.at(-1)));
      } catch (error) {
        await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
    await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

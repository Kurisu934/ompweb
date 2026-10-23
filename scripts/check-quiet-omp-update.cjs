const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.QA_BASE || 'http://127.0.0.1:13043';
const out = process.env.QA_OUT || '.tmp/quiet-omp-update-qa';

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      const page = await context.newPage(), errors = [], checks = [], mutations = [];
      let availableVersion = '18.2.10';
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': qa\n\n' });
        if (path === '/api/omp-update') {
          const body = request.postDataJSON();
          if (body.action === 'check') checks.push(body); else mutations.push(body.action);
          return route.fulfill({ json: { currentVersion: '18.2.8', availableVersion, updateAvailable: !!availableVersion, updateCommand: 'omp update' } });
        }
        if (path === '/api/app-update') return route.fulfill({ json: { currentVersion: '0.5.0', availableVersion: null, updateAvailable: false } });
        if (path === '/api/windows-service') return route.fulfill({ json: { platform: 'linux', supported: false } });
        return route.fulfill({ json: { running: false, sessions: [], runningSessionIds: [], runningSessions: [], projects: [], models: {}, modelList: [], reports: [], pets: [], entries: [], providers: [], settings: {}, catalog: [], tools: [], commands: [], wallpapers: [], roots: [], warnings: [], ok: true } });
      });
      const waitForCheck = async previous => {
        for (let i = 0; i < 50 && checks.length <= previous; i++) await page.waitForTimeout(100);
        assert.ok(checks.length > previous, 'update check still runs');
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.toast-card').count(), 0, 'no automatic update popup');
      };
      const focusCheck = async () => {
        const count = checks.length;
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await waitForCheck(count);
      };
      await page.goto(base);
      await waitForCheck(0);
      assert.equal(await page.locator('[role="dialog"]').count(), 0);
      assert.equal(await page.locator('.sidebar-settings-row [role="status"]').count(), 1, 'settings badge remains available');
      await focusCheck();
      availableVersion = '18.2.11';
      await focusCheck();
      availableVersion = null;
      await focusCheck();
      assert.equal(await page.locator('.sidebar-settings-row [role="status"]').count(), 0, 'no-update clears badge');
      availableVersion = '18.2.10';
      const count = checks.length;
      await page.reload(); await waitForCheck(count);
      if (viewport.width < 768) await page.locator('button:has(svg.lucide-menu)').click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.locator('#settings-tab-system').click();
      const manual = page.getByRole('button', { name: 'Check OMP updates', exact: true });
      await manual.waitFor();
      await page.getByText(/v18\.2\.8.*v18\.2\.10/).waitFor();
      const beforeManual = checks.length;
      await manual.click(); await waitForCheck(beforeManual);
      assert.ok(checks.some(check => check.force === true), 'manual refresh still bypasses the cache');
      await page.getByRole('button', { name: 'Update now', exact: true }).waitFor();
      assert.deepEqual(mutations, [], 'no update or restart is performed');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${out}/${viewport.width}-manual-settings.png` });
      results.push({ viewport, checks: checks.length, startupQuiet: true, refocusQuiet: true, newVersionQuiet: true, reloadQuiet: true, manualRefresh: true, mutations, errors });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally { await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

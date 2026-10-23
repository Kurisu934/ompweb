const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const { createJiti } = require('jiti');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const base = process.env.QA_BASE || 'http://127.0.0.1:13045';
const out = process.env.QA_OUT || '.tmp/glass-surfaces-qa';
const id = 'a'.repeat(32), sessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const resultText = '2 background jobs have completed. Resume your work using the results below.\n\nJob bg_15: checked the source files.\nJob bg_17: tests passed.\nWall time: 36.24 seconds';
const messages = [
  { role: 'custom', customType: 'async-result', display: true, content: resultText, details: { jobs: ['bg_15', 'bg_17'], completed: true } },
  { role: 'custom', customType: 'advisor', display: true, content: 'Review the edge cases before deploying.' },
  { role: 'bashExecution', command: 'echo ready', output: 'ready\nAll checks passed.', exitCode: 0 },
  { role: 'custom', customType: 'compaction', content: '## Summary\n\nThe current work and file context are preserved.', details: { tokensBefore: 96000, tokensAfter: 24000, method: 'summary' } },
  { role: 'custom', customType: 'extension_debug', display: false, content: '<note>Extension diagnostics retained.</note>', details: { state: 'ready' } },
  { role: 'assistant', model: 'QA', content: [
    { type: 'thinking', thinking: 'Expanded thinking text.\n    Whitespace is retained.' },
    { type: 'text', text: 'A table with `inline code`.\n\n| State | Result |\n| --- | --- |\n| Build | Passed |\n| Preview | Ready |\n\n```js\nconst result = "ready";\n```' },
  ] },
];
const info = { id: sessionId, path: '/qa/session.jsonl', cwd: '/qa', projectRoot: '/qa', name: 'Glass surface audit', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', messageCount: messages.length, firstMessage: 'Glass surface audit' };
const todoPhases = [
  { name: 'Preparation', tasks: [{ content: 'Render the reference pages', status: 'completed' }, { content: 'Document verification rules', status: 'completed' }] },
  { name: 'Verification', tasks: [{ content: 'Check the expanded task and subagent panels', status: 'in_progress' }, { content: 'Collect the results', status: 'pending' }] },
  { name: 'Summary', tasks: Array.from({ length: 12 }, (_, i) => ({ content: `Verify the final output section ${i + 1}`, status: i === 2 ? 'blocked' : i === 3 ? 'abandoned' : 'pending', ...(i === 2 ? { blocker: 'Waiting for a result' } : {}) })) },
];
const subagents = ['completed', 'failed', 'aborted'].map((status, index) => ({ id: `qa-subagent-${index}`, agent: `Reviewer ${index + 1}`, task: `Check output section ${index + 1}`, status, index, transcriptAvailable: false, tokens: 2400, durationMs: 12000 }));
const contextData = { messages, entryIds: messages.map((_, i) => `entry-${i}`), thinkingLevel: 'high', model: null, todoPhases };
const empty = { running: false, sessions: [], subagents: [], projects: [], models: {}, modelList: [], reports: [], pets: [], entries: [], memos: [], tracks: [], providers: [], settings: {}, catalog: [], tools: [], commands: [], wallpapers: [], roots: [], warnings: [], agents: [], skills: [], plugins: [], servers: [], accounts: [], ok: true };

async function preferences(page, patch) {
  await page.evaluate(patch => {
    const key = 'omp-web:wallpaper';
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), ...patch }));
    dispatchEvent(new Event('omp-web:wallpaper-preferences'));
  }, patch);
  await page.waitForTimeout(200);
}

async function inspect(page, selector) {
  return page.locator(selector).first().evaluate(root => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const alpha = value => rgba(value)[3] / 255;
    const chain = []; for (let el = root; el; el = el.parentElement) chain.push(el);
    const opaque = [root, ...root.querySelectorAll('*')].flatMap(el => {
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !el.checkVisibility()) return [];
      if (el.closest('option, progress, [role="progressbar"], [role="switch"], .wallpaper-thumbnail, .wallpaper-palette-swatches, .pet-preview, .usage-heatmap')) return [];
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (rect.width <= 40 || rect.height <= 22 || alpha(style.backgroundColor) < .98) return [];
      return [{ tag: el.tagName, className: el.className, text: el.textContent.trim().slice(0, 70), background: style.backgroundColor }];
    });
    const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = [...root.querySelectorAll('.settings-card-title, .settings-card-desc, .settings-content-subtitle, .markdown-custom-message, .message-custom button')].filter(el => el.checkVisibility()).map(el => {
      const layers = []; for (let p = el; p && p !== document.body; p = p.parentElement) layers.unshift(p);
      const bg = layers.reduce((bg, node) => { const c = rgba(getComputedStyle(node).backgroundColor), a = c[3] / 255; return bg.map((v, i) => c[i] * a + v * (1 - a)); }, window.qaBackdrop);
      const a = luminance(rgba(getComputedStyle(el).color)), b = luminance(bg);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    return { alpha: alpha(getComputedStyle(root).backgroundColor), blur: chain.map(el => getComputedStyle(el).backdropFilter).filter(v => v && v !== 'none'), opaque, contrastSamples: contrast.length, minimumContrast: contrast.length ? Math.min(...contrast) : null };
  });
}

async function checkGlass(page, selector, mode) {
  const result = await inspect(page, selector);
  assert.deepEqual(result.opaque, [], `${selector}: no opaque UI layers`);
  assert.ok(result.alpha < .5, `${selector}: translucent base`);
  if (result.contrastSamples) assert.ok(result.minimumContrast >= 4.5, `${selector}: readable text ${result.minimumContrast}`);
  if (mode === 'clear') { assert.equal(result.alpha, 0); assert.deepEqual(result.blur, []); }
  else assert.ok(result.blur.some(v => /blur\((14|20)px\)/.test(v)), `${selector}: a frosted ancestor`);
  return result;
}

async function blurPixels(page, selector) {
  const panel = page.locator(selector).first();
  // Isolate the popup's blur from glass already painted below it. Keep its
  // ancestors unchanged so a clipped backdrop root still fails this check.
  await panel.evaluate(panel => {
    for (const el of document.querySelectorAll('body *')) {
      if (el !== panel && !el.contains(panel) && getComputedStyle(el).backdropFilter !== 'none') {
        el.setAttribute('data-qa-unblur', el.style.getPropertyValue('backdrop-filter'));
        el.setAttribute('data-qa-priority', el.style.getPropertyPriority('backdrop-filter'));
        el.style.setProperty('backdrop-filter', 'none', 'important');
      }
    }
    const style = document.createElement('style'); style.id = 'qa-blur-isolation';
    style.textContent = '.wallpaper-shell *::before { visibility: hidden !important; }';
    document.head.append(style);
  });
  const r = await panel.boundingBox();
  const clip = { x: Math.ceil(r.x + 60), y: Math.ceil(r.y + 3), width: Math.floor(r.width - 75), height: 3 };
  const deviation = async () => {
    const stats = await sharp(await page.screenshot({ clip })).stats();
    return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  };
  const blurred = await deviation();
  await panel.evaluate(el => el.style.setProperty('backdrop-filter', 'none', 'important'));
  const unblurred = await deviation();
  await panel.evaluate(el => el.style.removeProperty('backdrop-filter'));
  await page.evaluate(() => {
    document.querySelector('#qa-blur-isolation').remove();
    for (const el of document.querySelectorAll('[data-qa-unblur]')) {
      el.style.setProperty('backdrop-filter', el.getAttribute('data-qa-unblur'), el.getAttribute('data-qa-priority'));
      el.removeAttribute('data-qa-unblur'); el.removeAttribute('data-qa-priority');
    }
  });
  assert.ok(unblurred > 1 && blurred < unblurred * .75, `${selector}: actual backdrop blur ${JSON.stringify({ blurred, unblurred })}`);
  return { blurred, unblurred };
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const jiti = createJiti(__filename, { jsx: { runtime: 'automatic' }, tsconfigPaths: true });
  const { ChatInput } = await jiti.import('../components/ChatInput.tsx');
  const { setDraft, clearDraft } = await jiti.import('../lib/draft-store.ts');
  const draftKey = 'qa-composer-glass';
  setDraft(draftKey, { value: '', images: [], files: [{ name: 'notes.txt', mimeType: 'text/plain', content: 'Notes', size: 5 }] });
  const composerHtml = renderToStaticMarkup(React.createElement(ChatInput, {
    onSend() {}, onAbort() {}, isStreaming: true, draftKey,
    modelError: 'Model unavailable', retryInfo: { attempt: 1, maxAttempts: 3 },
    compactResult: { tokensBefore: 12000, estimatedTokensAfter: 4000 },
    activeGoal: { objective: 'Review the output', startedAt: Date.now() },
    activePlan: { objective: 'Check all panels' },
    queuedMessages: { followUp: ['Next task'], steering: [] },
  }));
  clearDraft(draftKey);
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const theme of ['light', 'omp']) for (const viewport of (process.env.QA_SMOKE ? [{ width: 1440, height: 960 }] : [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }])) {
      const bg = theme === 'light' ? [24, 43, 65] : [216, 227, 239];
      const pixels = Buffer.alloc(viewport.width * viewport.height * 3);
      for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) for (let c = 0; c < 3; c++) pixels[(y * viewport.width + x) * 3 + c] = bg[c] + ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 12 : 0);
      const wallpaper = await sharp(pixels, { raw: { ...viewport, channels: 3 } }).png().toBuffer();
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      await context.addInitScript(({ id, sessionId, theme, bg }) => {
        window.qaBackdrop = bg;
        sessionStorage.setItem(`omp-queue-${sessionId}`, JSON.stringify({ steering: ['Priority check'], followUp: ['Check the next panel', 'Verify the final result'] }));
        localStorage.setItem('omp-theme', theme);
        localStorage.setItem('omp-web:wallpaper', JSON.stringify({ id, kind: 'image', adaptiveText: true, adaptivePalette: true, textMode: 'auto', brightness: 100, glass: 'default', muted: true }));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.qaCopied = text; } } });
      }, { id, sessionId, theme, bg: bg.map(v => v + 12) });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path === `/api/wallpapers/${id}/media`) return route.fulfill({ contentType: 'image/png', body: wallpaper });
        if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': qa\n\n' });
        if (path === '/api/sessions') return route.fulfill({ json: { sessions: [info], runningSessionIds: [], runningSessions: [] } });
        if (path === `/api/sessions/${sessionId}`) return route.fulfill({ json: { info, header: { ...info, type: 'session' }, tree: [], leafId: 'entry-5', context: contextData } });
        if (path.endsWith('/context')) return route.fulfill({ json: contextData });
        if (path.endsWith('/subagents')) return route.fulfill({ json: { subagents } });
        if (path === `/api/sessions/${sessionId}/state`) return route.fulfill({ json: { running: false, state: {
          queuedMessageCount: 3,
          extensionStatuses: [{ key: 'Audit', text: 'Checking populated panels' }],
          extensionWidgets: [{ key: 'Audit details', lines: ['Verification is in progress.', 'All source files are preserved.'], placement: 'aboveEditor' }],
        } } });
        return route.fulfill({ json: empty });
      });
      try {
        await page.goto(`${base}/?session=${sessionId}`);
        if (process.env.QA_CSS) await page.addStyleTag({ path: process.env.QA_CSS });
        await page.waitForFunction(() => document.documentElement.dataset.wallpaperTextPolarity && document.querySelector('.message-custom'));
        await page.locator('.composer-subagents-panel').waitFor();
        for (const toggle of await page.locator('.process-details-toggle[aria-expanded="false"]').all()) await toggle.click();
        await page.locator('.message-hidden-toggle').click();
        await page.locator('.message-hidden-content').getByRole('button', { name: 'Show details' }).click();
        const card = page.locator('.message-custom').first();
        await card.getByRole('button', { name: 'Show details' }).click();
        await card.getByRole('button', { name: 'Copy', exact: true }).click();
        assert.equal(await page.evaluate(() => window.qaCopied), resultText);
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          const surfaces = {};
          for (const selector of ['.message-custom', '.message-compaction', '.message-hidden-toggle', '.message-hidden-content', '.message-execution', '.wallpaper-assistant', '.chat-input-shell', '.compacted-history-notice', '.extension-status-surface', '.extension-widget-surface', '.composer-queue-panel']) surfaces[selector] = await checkGlass(page, selector, mode);
          assert.deepEqual((await inspect(page, '.wallpaper-shell')).opaque, [], 'all mounted chat surfaces are translucent');
          await card.scrollIntoViewIfNeeded();
          if (mode === 'default') await card.screenshot({ path: `${out}/async-result-${theme}-${viewport.width}.png` });
          report.push({ theme, viewport, mode, view: 'chat', surfaces });
          const thinking = page.locator('.composer-thinking-control > button');
          await thinking.click();
          await page.waitForTimeout(300);
          const picker = '.composer-thinking-control .picker-panel';
          await checkGlass(page, picker, mode);
          const pickerPixels = mode === 'clear' ? null : await blurPixels(page, picker);
          await thinking.click();
          {
            const overflow = page.locator('.shell-topbar-overflow[data-compact="true"]');
            if (await overflow.count()) {
              await overflow.locator('summary').click();
              await checkGlass(page, '.shell-topbar-overflow-content', mode);
            }
            const themeButton = page.locator('.shell-toolbar-btn').filter({ has: page.locator('svg.lucide-sun, svg.lucide-sparkles') }).first();
            await themeButton.click();
            await page.waitForTimeout(300);
            const menu = '.shell-topbar .dropdown-surface[role="menu"]';
            const menuBounds = await page.locator(menu).boundingBox();
            assert.ok(menuBounds && menuBounds.y >= 0 && menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= viewport.width + 1, 'theme menu stays inside the viewport');
            await checkGlass(page, menu, mode);
            const menuPixels = mode === 'clear' ? null : await blurPixels(page, menu);
            await themeButton.click();
            if (await overflow.count()) await overflow.locator('summary').click();
            report.push({ theme, viewport, mode, view: 'menus', pickerPixels, menuPixels });
          }
        }
        const todo = page.getByRole('region', { name: 'Tasks', exact: true });
        const roster = page.locator('.composer-subagents-panel');
        await todo.locator(':scope > button').first().click();
        await roster.locator(':scope > button').click();
        const queue = page.locator('.composer-queue-panel');
        await queue.getByRole('button', { name: 'Show all queued prompts', exact: true }).click();
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          await checkGlass(page, '.composer-queue-panel', mode);
          assert.match(await queue.innerText(), /Verify the final result/);
        }
        await queue.getByRole('button', { name: 'Collapse queued prompts', exact: true }).click();
        // Rare transient states use real component markup. Live task controls
        // above are exercised in the application, not just rendered empty.
        await page.evaluate(html => {
          const fixture = document.createElement('section'); fixture.id = 'qa-composer-states';
          fixture.className = 'wallpaper-shell';
          fixture.style.cssText = 'position:fixed;inset:16px;z-index:9999;overflow:auto;padding:12px;';
          fixture.innerHTML = '<div class="wallpaper-chat-pane" style="min-height:100%">' + html + '<div class="bg-bg-subtle" data-qa-alias>Scoped background token</div></div>';
          document.body.append(fixture);
        }, composerHtml);
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          for (const name of ['model-error', 'retry', 'compaction-result', 'goal', 'plan', 'queue-panel', 'file-attachment']) {
            await checkGlass(page, `#qa-composer-states .composer-${name}`, mode);
          }
          const alias = await inspect(page, '#qa-composer-states [data-qa-alias]');
          assert.ok(alias.alpha <= .11, 'Tailwind utility must resolve the local translucent token');
          if (mode === 'clear') assert.equal(alias.alpha, 0);
          report.push({ theme, viewport, mode, view: 'composer-notices', surfaces: 7, scopedAlias: alias.alpha });
        }
        await page.locator('#qa-composer-states').evaluate(el => el.remove());
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          await checkGlass(page, '.composer-todo-panel', mode);
          await checkGlass(page, '.composer-subagents-panel', mode);
          await todo.getByRole('button', { name: 'Show all tasks', exact: true }).click();
          const taskScroller = todo.getByRole('group', { name: 'Task list', exact: true });
          assert.ok(await taskScroller.evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollTop > 0; }), 'expanded long task list scrolls internally');
          await checkGlass(page, '.composer-todo-panel', mode);
          if (mode === 'default') {
            await taskScroller.evaluate(el => { el.scrollTop = 0; });
            await todo.screenshot({ path: `${out}/tasks-expanded-${theme}-${viewport.width}.png` });
            await blurPixels(page, '.composer-todo-panel');
          }
          await todo.getByRole('button', { name: 'Show fewer tasks', exact: true }).click();
          report.push({ theme, viewport, mode, view: 'populated-panels', tasks: 16, subagents: 3, scroll: true });
        }
        await roster.getByRole('button', { name: /^Reviewer 1 / }).click();
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          await checkGlass(page, '[role="dialog"]', mode);
        }
        await page.keyboard.press('Escape');
        await todo.locator(':scope > button').first().click();
        await roster.locator(':scope > button').click();
        await page.getByRole('button', { name: 'Minimize input', exact: true }).click();
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          await checkGlass(page, '.composer-minimized', mode);
        }
        await page.locator('.composer-minimized > button').first().click();
        await preferences(page, { glass: 'default' });
        await page.keyboard.press('Insert');
        await page.locator('.memo-dialog').waitFor();
        for (const mode of ['default', 'frosted', 'clear']) {
          await preferences(page, { glass: mode });
          report.push({ theme, viewport, mode, view: 'memo', surface: await checkGlass(page, '.memo-dialog', mode) });
        }
        await page.keyboard.press('Insert');
        await preferences(page, { glass: 'default' });
        await page.keyboard.press('Control+k');
        const command = page.locator('[cmdk-root]');
        await command.waitFor();
        await checkGlass(page, '[cmdk-root]', 'default');
        await page.keyboard.press('Escape');
        if (viewport.width < 768) await page.locator('button:has(svg.lucide-menu)').click();
        await page.locator('.sidebar-settings-row').click();
        await page.locator('.settings-content h2').waitFor();
        for (const tab of ['general', 'appearance', 'providers', 'usage', 'agents', 'extensions', 'system']) {
          await page.locator(`#settings-tab-${tab}`).click();
          for (const subTab of tab === 'appearance' ? ['display', 'wallpapers', 'pets', 'motion'] : tab === 'general' ? ['layout', 'behavior', 'shortcuts'] : tab === 'providers' ? ['connected', 'custom', 'system', 'defaults'] : tab === 'agents' ? ['instructions', 'subagents', 'runtime', 'approvals'] : [null]) {
            if (subTab) await page.locator(`#${tab}-tab-${subTab}`).click();
            await page.waitForTimeout(350);
            const view = subTab ? `${tab}-${subTab}` : tab;
            assert.deepEqual(errors, [], `settings ${view} rendered without errors`);
            for (const mode of ['default', 'frosted', 'clear']) {
              await preferences(page, { glass: mode });
              report.push({ theme, viewport, mode, view, surface: await checkGlass(page, '.settings-view', mode) });
            }
            await preferences(page, { glass: 'default' });
            if (['general', 'appearance', 'providers', 'extensions'].includes(tab)) await page.locator('.settings-view').screenshot({ path: `${out}/settings-${view}-${theme}-${viewport.width}.png` });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no page overflow: ${view}`);
          }
        }
        await preferences(page, { id: null });
        await page.waitForFunction(() => document.documentElement.dataset.wallpaper !== 'on');
        const native = await inspect(page, '.settings-view');
        assert.equal(native.alpha, 1, 'native settings background is restored');
        assert.deepEqual(native.blur, []);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ theme, viewport, chat: true, settingsTabs: 11, glassModes: 3, memo: true, commandPalette: true, copy: true, nativeRestored: true }));
      } catch (error) {
        await page.screenshot({ path: `${out}/failure-${theme}-${viewport.width}.png` });
        await fs.writeFile(`${out}/failure-${theme}-${viewport.width}.json`, JSON.stringify({ errors, text: await page.locator('body').innerText() }, null, 2));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await fs.writeFile(`${out}/results.json`, JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

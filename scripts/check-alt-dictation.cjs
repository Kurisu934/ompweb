/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.QA_BASE || 'http://127.0.0.1:13044';
const out = process.env.QA_OUT || '.tmp/alt-dictation-qa';
const sid = '00000000-0000-4000-8000-000000000001';
const cwd = '/workspace/demo';
const info = { id: sid, path: '/demo/session.jsonl', cwd, projectRoot: cwd, name: 'Voice shortcut test', created: '2026-01-01', modified: '2026-01-01', messageCount: 0 };
const sessionContext = { entryIds: [], messages: [], thinkingLevel: 'high', model: null, todoPhases: [] };

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }]) {
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      const page = await context.newPage(), errors = [], sends = [], transcriptions = [];
      let holdTranscript = false, pendingTranscript;
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('omp-lang', 'en');
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const state = window.__voiceQA = { requests: 0, tracks: [], hold: false, pending: [], deny: false };
        navigator.mediaDevices.getUserMedia = async constraints => {
          state.requests++;
          if (state.deny) { state.deny = false; throw new Error('Microphone access denied'); }
          const stream = await original(constraints);
          state.tracks.push(...stream.getTracks());
          if (state.hold) await new Promise(resolve => state.pending.push(resolve));
          return stream;
        };
      });
      await page.route('**/api/**', route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const reply = json => route.fulfill({ json });
        if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': qa\n\n' });
        if (path === '/api/sessions') return reply({ sessions: [info], runningSessionIds: [], runningSessions: [] });
        if (path === `/api/sessions/${sid}`) return reply({ sessionId: sid, filePath: info.path, info, leafId: null, tree: [], context: sessionContext, agent: { running: false } });
        if (path === `/api/sessions/${sid}/context`) return reply({ context: sessionContext, leafId: null, tree: [] });
        if (path.startsWith('/api/agent/') && request.method() === 'POST') {
          const command = request.postDataJSON();
          if (command.type === 'predict_word') return reply({ suffix: null });
          if (command.type === 'predict_word_feedback') return reply({ ok: true });
          sends.push(request.postData());
        }
        if (path === '/api/projects') return reply({ projects: [{ path: cwd }] });
        if (path === '/api/cwd/validate') return reply({ valid: true, cwd, isDirectory: true });
        if (path === '/api/stt') {
          transcriptions.push(request.postDataBuffer()?.length || 0);
          if (holdTranscript) { pendingTranscript = route; return; }
          return reply({ text: 'Synthetic speech.' });
        }
        return reply({ running: false, sessions: [], runningSessionIds: [], runningSessions: [], projects: [], models: {}, modelList: [], reports: [], pets: [], entries: [], providers: [], settings: {}, catalog: [], tools: [], commands: [], wallpapers: [], roots: [], warnings: [], memos: [], ok: true, updateAvailable: false });
      });
      await page.goto(`${base}/?session=${sid}`);
      const input = page.locator('.chat-input-shell textarea');
      const start = page.getByRole('button', { name: 'Start dictation', exact: true });
      const pause = page.getByRole('button', { name: 'Pause recording', exact: true });
      await input.waitFor();
      const alt = () => page.keyboard.press('AltLeft');
      const micRequests = () => page.evaluate(() => window.__voiceQA.requests);
      const idleTracks = () => page.waitForFunction(() => window.__voiceQA.tracks.every(track => track.readyState === 'ended'));
      const waitForInput = async () => input.waitFor({ timeout: 5000 }).catch(async error => {
        console.log('dictation state', { transcriptions, state: await page.evaluate(() => ({ focused: document.activeElement?.tagName, composer: document.querySelector('.chat-input-shell')?.innerText, status: [...document.querySelectorAll('.chat-input-shell [role="status"]')].map(el => el.getAttribute('aria-label')), tracks: window.__voiceQA.tracks.map(t => t.readyState) })) });
        throw error;
      });

      await input.fill('Existing '); await input.focus();
      assert.equal(await start.getAttribute('aria-keyshortcuts'), 'Alt');
      await page.keyboard.down('AltLeft');
      assert.equal(await micRequests(), 0, 'keydown alone does not record');
      await page.keyboard.up('AltLeft'); await pause.waitFor();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${viewport.width}-recording.png` });
      await alt();
      await page.waitForFunction(() => document.querySelector('.chat-input-shell textarea')?.value === 'Existing Synthetic speech.').catch(async error => {
        console.log(JSON.stringify(await page.evaluate(() => ({ value: document.querySelector('.chat-input-shell textarea')?.value, composer: document.querySelector('.chat-input-shell')?.innerText, focused: document.activeElement?.tagName, requests: window.__voiceQA.requests, tracks: window.__voiceQA.tracks.map(t => t.readyState) }))));
        console.log({ transcriptions, errors });
        await page.screenshot({ path: `${out}/${viewport.width}-failure.png` });
        throw error;
      });
      await idleTracks(); assert.equal(transcriptions.length, 1);
      await page.waitForFunction(() => document.activeElement === document.querySelector('.chat-input-shell textarea'));
      assert.deepEqual(sends, [], 'Alt never sends a message');
      console.log(`${viewport.width}: start/stop and transcript insertion passed`);

      const beforeChords = await micRequests();
      for (const chord of ['AltLeft+Tab', 'AltLeft+a', 'Shift+AltLeft', 'Control+AltLeft', 'Meta+AltLeft']) await page.keyboard.press(chord);
      await page.keyboard.down('AltLeft');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.keyboard.up('AltLeft');
      assert.equal(await micRequests(), beforeChords);

      await page.evaluate(() => {
        const editor = document.createElement('input'); editor.id = 'foreign-editor'; document.body.append(editor); editor.focus();
      });
      await alt(); assert.equal(await micRequests(), beforeChords);
      await page.evaluate(() => document.getElementById('foreign-editor').remove());
      await input.focus();
      await page.keyboard.press('Insert');
      await page.locator('.memo-dialog').waitFor();
      await alt(); assert.equal(await micRequests(), beforeChords, 'memos do not start dictation');
      await page.keyboard.press('Insert');
      await page.locator('.memo-dialog').waitFor({ state: 'hidden' });

      await input.focus(); await alt(); await pause.waitFor(); await page.waitForTimeout(700); await pause.click();
      await page.getByRole('button', { name: 'Resume recording', exact: true }).waitFor();
      await alt(); await waitForInput(); await idleTracks();
      assert.equal(transcriptions.length, 2, 'Alt also stops a paused recording');
      console.log(`${viewport.width}: dialogs and paused recording passed`);

      await start.click(); await pause.waitFor();
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await page.getByRole('button', { name: 'Transcribe', exact: true }).waitFor();
      await alt(); await waitForInput();
      assert.equal(transcriptions.length, 3, 'Alt confirms an existing review');

      holdTranscript = true;
      await input.focus(); await alt(); await pause.waitFor(); await page.waitForTimeout(700); await alt();
      await page.getByRole('status', { name: 'Transcribing...', exact: false }).waitFor();
      const beforeBusy = await micRequests(); await alt();
      assert.equal(await micRequests(), beforeBusy, 'no new recording while transcription is busy');
      for (let n = 0; !pendingTranscript && n < 50; n++) await page.waitForTimeout(100);
      assert.ok(pendingTranscript);
      await pendingTranscript.fulfill({ json: { text: 'Synthetic speech.' } }); holdTranscript = false;
      await waitForInput(); await idleTracks();
      console.log(`${viewport.width}: review and transcription busy state passed`);

      const beforeCancel = await input.inputValue(), beforeTranscriptions = transcriptions.length;
      await input.focus(); await alt(); await pause.waitFor(); await page.keyboard.press('Escape');
      await input.waitFor(); await idleTracks();
      assert.equal(await input.inputValue(), beforeCancel);
      assert.equal(transcriptions.length, beforeTranscriptions, 'Escape discards without transcribing');

      await page.evaluate(() => { window.__voiceQA.hold = true; });
      await input.focus(); await alt();
      await page.waitForFunction(() => window.__voiceQA.pending.length > 0);
      await alt(); await start.waitFor();
      await page.evaluate(() => { window.__voiceQA.hold = false; window.__voiceQA.pending.splice(0).forEach(resolve => resolve()); });
      await idleTracks(); assert.equal(await pause.count(), 0, 'cancelled permission does not restart recording');

      await page.evaluate(() => { window.__voiceQA.deny = true; });
      await input.focus(); await alt(); await start.waitFor();
      await page.getByText('Microphone access denied', { exact: true }).waitFor();
      await alt(); await pause.waitFor(); await page.keyboard.press('Escape'); await input.waitFor(); await idleTracks();

      await page.evaluate(() => { window.__voiceQA.hold = true; });
      await input.focus(); await alt();
      await page.waitForFunction(() => window.__voiceQA.pending.length > 0);
      if (viewport.width < 768) await page.locator('button:has(svg.lucide-menu)').click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await input.waitFor({ state: 'hidden' });
      await page.evaluate(() => { window.__voiceQA.hold = false; window.__voiceQA.pending.splice(0).forEach(resolve => resolve()); });
      await idleTracks();
      const beforeSettings = await micRequests(); await alt();
      assert.equal(await micRequests(), beforeSettings, 'settings never starts a hidden composer');
      assert.deepEqual(sends, []); assert.deepEqual(errors, []);
      results.push({ viewport, microphoneRequests: await micRequests(), transcriptions: transcriptions.length, audioUploaded: transcriptions.every(bytes => bytes > 100), messagesSent: sends.length, errors });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally { await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

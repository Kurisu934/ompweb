import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { spectrumBands, audioUniformSpectrum, WallpaperAudio } = await jiti.import('./wallpaper-audio.ts');
const { parseWallpaperPreferences } = await jiti.import('./wallpapers.ts');
test('audio preferences default to audible and preserve bounded volume independently of mute', () => {
  const defaults = parseWallpaperPreferences(null);
  assert.equal(defaults.volume, 50); assert.equal(defaults.muted, false); assert.equal(defaults.paused, false);
  assert.equal(parseWallpaperPreferences('{"volume":-5}').volume, 0);
  assert.equal(parseWallpaperPreferences('{"volume":999}').volume, 100);
  assert.equal(parseWallpaperPreferences('{"volume":"5"}').volume, 50);
  assert.equal(parseWallpaperPreferences('{"volume":35,"muted":true}').volume, 35);
});
test('FFT uses ordered logarithmic bands and bounded normalized magnitudes', () => {
  assert.deepEqual(spectrumBands(new Uint8Array(1024), 48000, 2048), Array(64).fill(0));
  const bins = new Uint8Array(1024); bins[43] = 255;
  const bands = spectrumBands(bins, 48000, 2048);
  assert.equal(bands.length, 64); assert.ok(bands.some(n => n === 1));
  assert.ok(bands.slice(0, 20).every(n => n === 0));
  assert.ok(bands.every(n => n >= 0 && n <= 1));
});
test('shader spectra retain stereo channel and downsample every source bin', () => {
  const stereo = [...Array(64).fill(.25), ...Array(64).fill(.75)];
  assert.deepEqual(audioUniformSpectrum('g_AudioSpectrum16Left', stereo), Array(16).fill(.25));
  assert.deepEqual(audioUniformSpectrum('g_AudioSpectrum32Right', stereo), Array(32).fill(.75));
  assert.deepEqual(audioUniformSpectrum('g_AudioSpectrum64', stereo), Array(64).fill(.5));
  assert.equal(audioUniformSpectrum('g_Time', stereo), undefined);
});

test('replacement BGM suppresses native sounds, shares FFT and restores native playback without leaking nodes', async t => {
  const elements = [], contexts = [];
  class Media extends EventTarget {
    paused = true; ended = false; volume = 1; currentTime = 0;
    constructor() { super(); elements.push(this); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() {}
  }
  class AudioNode {
    gain = { value: 1 }; disconnected = false;
    connect() {}
    disconnect() { this.disconnected = true; }
    getByteFrequencyData(bins) { bins.fill(128); }
  }
  class Context {
    state = 'running'; destination = {}; sampleRate = 48000; gains = []; sources = [];
    constructor() { contexts.push(this); }
    createGain() { const n = new AudioNode(); this.gains.push(n); return n; }
    createChannelSplitter() { return new AudioNode(); }
    createAnalyser() { return new AudioNode(); }
    createMediaElementSource(media) { const n = new AudioNode(); n.media = media; this.sources.push(n); return n; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  for (const [key, value] of Object.entries({ Audio: Media, AudioContext: Context, document: Object.assign(new EventTarget(), { hidden: false }), window: new EventTarget() })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  const settings = { volume: 40, muted: false, paused: false };
  const player = new WallpaperAudio([{ id: 1, files: [{ url: '/native.mp3' }], volume: .7, mode: 'loop' }], settings, undefined, '/custom.wav');
  t.after(() => player.dispose());
  await Promise.resolve();
  const [native, custom] = elements, [ctx] = contexts;
  assert.equal(native.paused, true); assert.equal(custom.paused, false); assert.equal(custom.loop, true);
  assert.equal(ctx.gains[1].gain.value, .4); assert.equal(ctx.gains[2].gain.value, 0);
  assert.equal(player.spectrum().length, 128); assert.ok(player.spectrum().some(n => n > 0));
  player.command({ id: 1, action: 'volume', value: .2 });
  player.command({ id: 1, action: 'play' });
  await Promise.resolve();
  assert.equal(native.paused, true); assert.equal(ctx.gains[2].gain.value, 0);
  player.configure({ ...settings, muted: true }); assert.equal(ctx.gains[1].gain.value, 0);
  player.configure({ ...settings, paused: true });
  assert.equal(custom.paused, true); assert.ok(player.spectrum().every(n => n === 0));
  player.configure(settings); await Promise.resolve(); assert.equal(custom.paused, false);
  player.setReplacement('/second.wav'); await Promise.resolve();
  assert.equal(custom.paused, true); assert.equal(custom.src, ''); assert.equal(ctx.sources[1].disconnected, true);
  assert.equal(elements[2].paused, false); assert.equal(contexts.length, 1);
  player.setReplacement(null); await Promise.resolve();
  assert.equal(elements[2].paused, true); assert.equal(native.paused, false); assert.equal(ctx.gains[2].gain.value, .2);
  player.dispose();
  assert.equal(ctx.state, 'closed'); assert.ok(ctx.sources.every(source => source.disconnected));

  await t.test('cached audio waits for its source, advances playlists, and ignores disposal races', async () => {
    const pending = [], requested = [];
    const cached = new WallpaperAudio([{ id: 2, files: [{ url: '/one.mp3' }, { url: '/two.mp3' }], volume: 1, mode: 'loop' }], settings, undefined, '/custom.wav', file => {
      requested.push(file.url); return new Promise(resolve => pending.push(resolve));
    });
    const native = elements.at(-2);
    assert.deepEqual(requested, [], 'replacement audio must not download native BGM');
    cached.setReplacement(null);
    assert.deepEqual(requested, ['/one.mp3']);
    assert.equal(native.paused, true);
    pending.shift()('blob:cached-one');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(native.src, 'blob:cached-one'); assert.equal(native.paused, false);
    native.dispatchEvent(new Event('ended'));
    assert.deepEqual(requested, ['/one.mp3', '/two.mp3']);
    cached.dispose(); pending.shift()('blob:cached-two');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(native.src, ''); assert.equal(native.paused, true);
  });
});

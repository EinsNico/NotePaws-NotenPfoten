const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const vm = require('vm');

function compile(file) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  return babel.transform(file.endsWith('.vue') ? source.match(/<script>([\s\S]*?)<\/script>/)[1] : source,
    { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code;
}
function model(file) {
  const loaded = { exports: {} };
  new Function('module', 'exports', compile('../src/model/' + file + '.js'))(loaded, loaded.exports);
  return loaded.exports;
}
const rhythm = model('RhythmSense');
const preferences = model('RhythmSensePreferences');
const haptics = model('RhythmSenseHaptics');
const componentCode = compile('../src/components/RhythmSense.vue');
const clone = value => JSON.parse(JSON.stringify(value));

function setup(settings = {}) {
  let now = 1000, revision = 0, subscriber, timer = 1;
  const pulses = [], sounds = [], writes = [], intervals = new Map(), timeouts = new Map();
  const documentListeners = {}, contextListeners = {};
  const navigator = {};
  const setApi = (behavior = 'success') => {
    if (behavior === 'missing') { delete navigator.vibrate; return; }
    navigator.vibrate = duration => {
      pulses.push({ duration, at: now });
      if (behavior === 'throw') throw new Error('Vibration blocked');
      return behavior !== 'false';
    };
  };
  setApi(settings.api || 'success');
  const document = { hidden: false,
    addEventListener(name, fn) { documentListeners[name] = fn; },
    removeEventListener(name) { delete documentListeners[name]; }
  };
  const context = { state: 'running', get currentTime() { return now / 1000; },
    addEventListener(name, fn) { contextListeners[name] = fn; },
    removeEventListener(name) { delete contextListeners[name]; }
  };
  const options = { appVolume: 100, vibration: settings.vibration !== false,
    rhythmSenseSettings: settings.preferences || null,
    saveOptions() { writes.push(clone(this.rhythmSenseSettings)); }
  };
  const audio = {
    getContext: () => context, resume: () => Promise.resolve(true),
    getDelayMs: () => settings.delayMs || 0,
    getSettings: () => ({ feedbackSound: settings.feedbackSound !== false }),
    subscribe(fn) { subscriber = fn; fn({ revision }); return () => { subscriber = null; }; }
  };
  const componentModule = { exports: {} };
  vm.runInNewContext(componentCode, {
    module: componentModule, exports: componentModule.exports,
    require(name) {
      if (name.endsWith('/RhythmSense')) return rhythm;
      if (name.endsWith('/RhythmSensePreferences')) return preferences;
      if (name.endsWith('/RhythmSenseHaptics')) return { createRhythmSenseHaptics: (getNavigator, getEnabled) => haptics.createRhythmSenseHaptics(() => navigator, getEnabled) };
      if (name.endsWith('/RhythmSenseDenseLayout')) return { shouldUseRhythmDenseScore: () => false };
      if (name.endsWith('/Options')) return options;
      if (name.endsWith('/ScreenAwakeMixin')) return {createScreenAwakeMixin:()=>({})};
      if (name.endsWith('/AudioSynchronization')) return audio;
      if (name.endsWith('/AppVolume')) return { appVolumeToAudioLevel: value => value / 100 };
      if (name.endsWith('/RhythmSenseRoundStorage')) return { saveBar: () => Promise.resolve({ saved: true }) };
      return {};
    },
    document, performance: { now: () => now },
    setInterval(fn) { const id = timer++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { const id = timer++; timeouts.set(id, fn); return id; },
    clearTimeout(id) { timeouts.delete(id); }
  });
  const definition = componentModule.exports.default;
  const app = Object.assign(definition.data(), {
    $refs: {}, $set(array, index, value) { array[index] = value; },
    $nextTick(fn) { fn(); }, $t(key) { return key; }, $emit() {}
  });
  Object.keys(definition.methods).forEach(name => { app[name] = definition.methods[name].bind(app); });
  Object.keys(definition.computed).forEach(name => Object.defineProperty(app, name,
    { get() { return definition.computed[name].call(app); } }));
  definition.created.call(app);
  // Keep real source scheduling, timing, input and lifecycle behavior. Audio
  // synthesis itself has separate integration coverage and needs no device here.
  app.playDrum = (dull, at) => sounds.push({ kind: 'drum', dull, at });
  app.playMetronome = (accent, at) => sounds.push({ kind: 'metronome', accent, at });
  app.screen = 'training';
  app.roundLength = 1;
  const advance = target => {
    while (now < target) {
      now = Math.min(now + 8, target);
      if (app.clockTimer) app.tick();
    }
  };
  return {
    app, context, pulses, sounds, writes, intervals, timeouts, setApi, advance, options,
    positive: () => pulses.filter(pulse => pulse.duration > 0),
    now: () => now,
    setTime(value) { now = value; },
    setGlobalVibration(enabled) {
      options.vibration = enabled;
      definition.watch.globalVibrationEnabled.call(app, app.globalVibrationEnabled);
    },
    tickAt(value) { now = value; app.tick(); },
    routeChange() { subscriber({ revision: ++revision }); },
    hide() { document.hidden = true; documentListeners.visibilitychange(); },
    suspend() { context.state = 'suspended'; contextListeners.statechange(); },
    deviceReady() { documentListeners.deviceready(); },
    destroy() { definition.beforeDestroy.call(app); },
    documentListeners, contextListeners
  };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }
test('haptics gracefully handle absent, rejected and throwing APIs, and cancel only active short pulses', () => {
  let device = null;
  const controller = haptics.createRhythmSenseHaptics(() => device);
  assert.strictEqual(controller.available(), false);
  assert.strictEqual(controller.pulse(), false);
  assert.doesNotThrow(() => controller.cancel());
  const calls = [];
  device = { vibrate(value) { calls.push(value); return true; } };
  assert.strictEqual(controller.available(), true);
  assert.strictEqual(controller.pulse(100), true);
  assert.strictEqual(controller.pulse(6.5), true);
  assert.strictEqual(controller.pulse(0.1), true);
  controller.cancel(); controller.cancel();
  assert.deepStrictEqual(calls, [18, 6, 2, 0]);
  assert(calls.every(value => typeof value === 'number'), 'never queues a vibration pattern');
  device.vibrate = () => false;
  assert.strictEqual(controller.pulse(), false);
  assert.doesNotThrow(() => controller.cancel());
  device.vibrate = () => { throw new Error('Not available'); };
  assert.strictEqual(controller.pulse(), false);
  assert.doesNotThrow(() => controller.cancel());
  device.vibrate = () => true;
  controller.pulse();
  device.vibrate = () => { throw new Error('Cannot cancel'); };
  assert.doesNotThrow(() => controller.cancel());
  const rejectedAfterActive = [];
  device.vibrate = value => { rejectedAfterActive.push(value); return true; };
  controller.pulse();
  device.vibrate = value => { rejectedAfterActive.push(value); return false; };
  assert.strictEqual(controller.pulse(), false);
  controller.cancel();
  assert.deepStrictEqual(rejectedAfterActive, [18, 18, 0], 'a rejected follow-up pulse does not forfeit cancellation of the earlier active pulse');
});
test('the app-wide switch blocks pulses and cancels an active pulse without losing device availability', () => {
  let enabled = false;
  const calls = [];
  const controller = haptics.createRhythmSenseHaptics(() => ({
    vibrate(value) { calls.push(value); return true; }
  }), () => enabled);
  assert.strictEqual(controller.available(), true);
  assert.strictEqual(controller.pulse(18), false);
  assert.deepStrictEqual(calls, [], 'disabled vibration does not touch the device');
  enabled = true;
  assert.strictEqual(controller.pulse(18), true);
  enabled = false;
  assert.strictEqual(controller.pulse(18), false);
  assert.deepStrictEqual(calls, [18, 0], 'disabling cancels the earlier pulse and never queues another');
  assert.strictEqual(controller.available(), true);
  assert.strictEqual(controller.pulse(18), false);
  assert.deepStrictEqual(calls, [18, 0], 'repeated disabled calls do not repeatedly cancel');
  enabled = true;
  assert.strictEqual(controller.pulse(6), true);
  assert.deepStrictEqual(calls, [18, 0, 6], 'enabling restores short pulses');
});
test('both vibration settings start off, remain separate, and save independently', async () => {
  const h = setup();
  assert.strictEqual(h.app.previewVibration, false);
  assert.strictEqual(h.app.tapVibration, false);
  h.app.setVibration('previewVibration', true);
  assert.strictEqual(h.app.previewVibration, true);
  assert.strictEqual(h.app.tapVibration, false);
  h.app.setVibration('tapVibration', true);
  h.app.setVibration('previewVibration', false);
  assert.deepStrictEqual(h.writes.map(value => [value.previewVibration, value.tapVibration]), [[true, false], [true, true], [false, true]]);
  const before = h.writes.length;
  h.app.setVibration('unrelated', true);
  await h.app.start();
  h.app.setVibration('tapVibration', false);
  assert.strictEqual(h.writes.length, before);
  assert.strictEqual(h.app.tapVibration, true, 'changing settings during playback is ignored');
  h.destroy();
});
test('global off suppresses saved preview and tap preferences without erasing them or hiding device support', async () => {
  const selected = preferences.normalizeRhythmSensePreferences({
    noteValues: ['quarter'], previewVibration: true, tapVibration: true
  });
  const h = setup({ vibration: false, preferences: selected });
  assert.strictEqual(h.app.previewVibration, true);
  assert.strictEqual(h.app.tapVibration, true);
  assert.strictEqual(h.app.hapticsAvailable, true);
  await h.app.start();
  const barMs = rhythm.rhythmSenseBarDurationMs(h.app.bpm, h.app.meter);
  h.advance(h.app.phaseStart);
  assert.strictEqual(h.positive().length, 0, 'the preview respects the master switch');
  h.advance(h.app.phaseStart + barMs);
  assert.strictEqual(h.app.phase, 'countin');
  h.app.tapDrum({ timeStamp: h.now() });
  h.advance(h.app.phaseStart + barMs);
  assert.strictEqual(h.app.phase, 'practice');
  h.app.tapDrum({ timeStamp: h.now() });
  assert.strictEqual(h.positive().length, 0, 'count-in and practice taps respect the master switch');
  assert.strictEqual(h.app.hapticsAvailable, true, 'a user choice is not treated as hardware failure');
  assert.deepStrictEqual(h.options.rhythmSenseSettings, selected);
  h.options.vibration = true;
  h.app.tapDrum({ timeStamp: h.now() });
  assert.strictEqual(h.positive().length, 1, 'the saved tap preference works after re-enabling');
  h.destroy();
});
test('switching the app-wide setting off during preview immediately cancels its pulse and suppresses following notes', async () => {
  const h = setup({ preferences: preferences.normalizeRhythmSensePreferences({
    noteValues: ['quarter'], previewVibration: true, tapVibration: true
  }) });
  await h.app.start();
  const origin = h.app.phaseStart;
  h.advance(origin);
  assert.strictEqual(h.positive().length, 1);
  h.setGlobalVibration(false);
  assert.strictEqual(h.pulses[h.pulses.length - 1].duration, 0, 'the watcher stops an active pulse immediately');
  const next = origin + rhythm.rhythmSenseOnsetMs(h.app.events[1], h.app.bpm, h.app.meter);
  h.advance(next);
  assert.strictEqual(h.positive().length, 1);
  assert.strictEqual(h.app.previewVibration, true);
  assert.strictEqual(h.app.tapVibration, true);
  h.setGlobalVibration(true);
  h.advance(origin + rhythm.rhythmSenseOnsetMs(h.app.events[2], h.app.bpm, h.app.meter));
  assert.strictEqual(h.positive().length, 2, 'only a new upcoming note vibrates after re-enabling');
  h.destroy();
});
test('preview pulses follow the heard timeline including lead and output delay, without phantom input pulses', async () => {
  for (const delayMs of [0, 250, 500]) {
    const h = setup({ delayMs, feedbackSound: false });
    h.app.setVibration('previewVibration', true);
    h.app.setVibration('tapVibration', true);
    h.app.noteValues = ['quarter'];
    h.app.events = rhythm.createRhythmSenseBar(0, '4/4', h.app.noteValues);
    await h.app.start();
    const origin = h.app.phaseStart;
    assert.strictEqual(origin, 1100 + delayMs);
    assert.strictEqual(h.positive().length, 0);
    h.advance(origin - 1);
    assert.strictEqual(h.positive().length, 0, 'silent until scheduled audio reaches the listener');
    h.advance(origin);
    assert.deepStrictEqual(h.positive(), [{ duration: 18, at: origin }]);
    h.app.tapDrum({ timeStamp: h.now() });
    assert.strictEqual(h.positive().length, 1, 'preview ignores drum taps');
    h.app.tick();
    assert.strictEqual(h.positive().length, 1, 'repeated render ticks do not replay the pulse');
    const next = origin + rhythm.rhythmSenseOnsetMs(h.app.events[1], h.app.bpm, h.app.meter);
    h.advance(next - 1);
    assert.strictEqual(h.positive().length, 1);
    h.advance(next);
    assert.strictEqual(h.positive().length, 2);
    h.destroy();
  }
});
test('32nd and 64th pulses stay shorter than their spacing in simple and compound meters', async () => {
  for (const value of ['thirtySecond', 'sixtyFourth']) {
    for (const meter of ['4/4', '6/8']) {
      const h = setup({ delayMs: 500 });
      h.app.setVibration('previewVibration', true);
      h.app.bpm = 120;
      h.app.meter = meter;
      h.app.noteValues = [value];
      h.app.events = rhythm.createRhythmSenseBar(0, meter, [value]);
      const gap = h.app.events[0].duration * rhythm.rhythmSenseUnitMs(120, meter);
      await h.app.start();
      const origin = h.app.phaseStart;
      h.advance(origin);
      assert.strictEqual(h.positive()[0].duration, Math.floor(Math.min(18, gap * .3)));
      assert(h.positive()[0].duration < gap / 2);
      h.advance(origin + gap + 1);
      assert.strictEqual(h.positive().length, 2);
      h.destroy();
    }
  }
});
test('a delayed visual tick emits at most one fresh pulse and skips stale notes', async () => {
  const h = setup({ delayMs: 500 });
  h.app.setVibration('previewVibration', true);
  h.app.bpm = 120;
  h.app.noteValues = ['sixtyFourth'];
  h.app.events = rhythm.createRhythmSenseBar(0, '4/4', h.app.noteValues);
  await h.app.start();
  const origin = h.app.phaseStart;
  const gap = h.app.events[0].duration * rhythm.rhythmSenseUnitMs(120, '4/4');
  h.advance(origin);
  h.tickAt(origin + 3 * gap + 1);
  assert.strictEqual(h.app.lastNote, 3);
  assert.strictEqual(h.positive().length, 2, 'three newly crossed events produce only the current fresh pulse');
  h.tickAt(origin + 4.95 * gap);
  assert.strictEqual(h.app.lastNote, 4);
  assert.strictEqual(h.positive().length, 2, 'an old event does not vibrate late');
  h.tickAt(origin + 5 * gap + 1);
  assert.strictEqual(h.positive().length, 3);
  h.destroy();
});
test('normal 16 ms timer jitter still gives a brief 64th-note pulse in 9/8 at 120 bpm', async () => {
  const h = setup({ delayMs: 500 });
  h.app.setVibration('previewVibration', true);
  h.app.bpm = 120;
  h.app.meter = '9/8';
  h.app.noteValues = ['sixtyFourth'];
  h.app.events = rhythm.createRhythmSenseBar(0, '9/8', h.app.noteValues);
  await h.app.start();
  const origin = h.app.phaseStart;
  const gap = h.app.events[0].duration * rhythm.rhythmSenseUnitMs(120, '9/8');
  h.advance(origin - 1);
  h.tickAt(origin + 16);
  assert.strictEqual(h.positive().length, 1);
  assert.strictEqual(h.positive()[0].duration, 2);
  assert(h.positive()[0].duration < gap - 16, 'the pulse ends before the next note');
  h.tickAt(origin + gap + 16);
  assert.strictEqual(h.positive().length, 2);
  h.destroy();
  const slow = setup({ delayMs: 500 });
  slow.app.setVibration('previewVibration', true);
  slow.app.noteValues = ['quarter'];
  slow.app.events = rhythm.createRhythmSenseBar(0, '4/4', slow.app.noteValues);
  await slow.app.start();
  const slowOrigin = slow.app.phaseStart;
  slow.advance(slowOrigin - 1);
  slow.tickAt(slowOrigin + 40);
  assert.strictEqual(slow.positive().length, 0, 'a substantially late pulse is skipped even when a long note has time remaining');
  slow.destroy();
});
test('one user tap causes one pulse during count-in and practice, independently of sound and pointer clicks', async () => {
  const h = setup({ feedbackSound: false });
  h.app.setVibration('tapVibration', true);
  await h.app.start();
  const barMs = rhythm.rhythmSenseBarDurationMs(h.app.bpm, h.app.meter);
  h.advance(h.app.phaseStart + barMs);
  assert.strictEqual(h.app.phase, 'countin');
  assert.strictEqual(h.positive().length, 0, 'count-in metronome does not trigger tap vibration');
  const soundCount = h.sounds.length;
  h.app.handleDrumPointer({ timeStamp: h.now() });
  h.app.handleDrumClick({ detail: 1, timeStamp: h.now() });
  h.app.handleDrumClick({ detail: 0, timeStamp: h.now() });
  assert.strictEqual(h.positive().length, 1, 'pointer and synthetic click do not double pulse');
  assert.strictEqual(h.sounds.length, soundCount + 1, 'legacy feedback setting cannot bypass the shared output policy');
  h.advance(h.app.phaseStart + barMs);
  assert.strictEqual(h.app.phase, 'practice');
  const beforePractice = h.positive().length;
  h.app.handleDrumPointer({ timeStamp: h.now() });
  assert.strictEqual(h.positive().length, beforePractice + 1);
  assert.strictEqual(h.app.results[0], 'correct');
  h.destroy();
});
test('a tap arriving at the practice boundary retains its pulse after advancing the count-in phase', async () => {
  const h = setup({ feedbackSound: false });
  h.app.setVibration('tapVibration', true);
  await h.app.start();
  const barMs = rhythm.rhythmSenseBarDurationMs(h.app.bpm, h.app.meter);
  h.advance(h.app.phaseStart + barMs);
  h.app.tapDrum({ timeStamp: h.now() });
  const before = h.positive().length;
  h.setTime(h.app.phaseStart + barMs);
  h.app.tapDrum({ timeStamp: h.now() });
  assert.strictEqual(h.app.phase, 'practice');
  assert.strictEqual(h.positive().length, before + 1);
  assert.deepStrictEqual(h.pulses.slice(-2).map(pulse => pulse.duration), [0, 18],
    'phase cleanup must happen before the new user-tap pulse');
  assert.strictEqual(h.app.results[0], 'correct');
  h.destroy();
});
test('idle, preview, paused and result states do not create user-tap vibration', () => {
  const h = setup();
  h.app.setVibration('tapVibration', true);
  for (const phase of ['idle', 'preview', 'paused', 'result']) {
    h.app.phase = phase;
    h.app.tapDrum({ timeStamp: h.now() });
  }
  assert.strictEqual(h.pulses.length, 0);
  h.destroy();
});
test('stop, route changes, hidden views, suspension, exit and destroy cancel vibration and leave no pulses queued', async () => {
  for (const reason of ['stop', 'route', 'hidden', 'suspended', 'exit', 'destroy']) {
    const h = setup({ delayMs: 250 });
    h.app.setVibration('previewVibration', true);
    await h.app.start();
    h.advance(h.app.phaseStart);
    assert.strictEqual(h.positive().length, 1);
    if (reason === 'stop') h.app.stopClock();
    if (reason === 'route') h.routeChange();
    if (reason === 'hidden') h.hide();
    if (reason === 'suspended') h.suspend();
    if (reason === 'exit') h.app.exitTraining();
    if (reason === 'destroy') h.destroy();
    assert.strictEqual(h.pulses[h.pulses.length - 1].duration, 0, reason);
    assert.strictEqual(h.intervals.size, 0, reason);
    h.advance(h.now() + 10000);
    assert.strictEqual(h.positive().length, 1, reason + ': no queued pattern survives cancellation');
    if (reason !== 'destroy') h.destroy();
    assert.strictEqual(Object.keys(h.documentListeners).length, 0);
    assert.strictEqual(Object.keys(h.contextListeners).length, 0);
  }
});
test('Cordova device-ready refreshes API availability and API failures leave training usable', async () => {
  const h = setup({ api: 'missing' });
  assert.strictEqual(h.app.hapticsAvailable, false);
  h.setApi(); h.deviceReady();
  assert.strictEqual(h.app.hapticsAvailable, true);
  h.app.setVibration('previewVibration', true);
  h.setApi('false');
  await h.app.start();
  h.advance(h.app.phaseStart);
  assert.strictEqual(h.app.hapticsAvailable, false);
  assert.strictEqual(h.app.phase, 'preview');
  h.setApi('throw');
  assert.doesNotThrow(() => h.app.vibrate(18));
  assert.strictEqual(h.app.phase, 'preview');
  h.setApi(); h.deviceReady();
  assert.strictEqual(h.app.hapticsAvailable, true);
  h.destroy();
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    process.stdout.write(`✓ ${entry.name}\n`);
  }
  process.stdout.write('Rhythm Sense haptics tests passed.\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

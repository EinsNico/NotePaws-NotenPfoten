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
const rhythmModule = { exports: {} };
new Function('module', 'exports', compile('../src/model/RhythmSense.js'))(rhythmModule, rhythmModule.exports);
const rhythm = rhythmModule.exports;
const componentHelpers = {};
for(const name of ['RhythmSensePreferences', 'RhythmSenseDenseLayout', 'RhythmSenseHaptics']) {
  const helperModule = { exports: {} };
  new Function('module', 'exports', compile('../src/model/' + name + '.js'))(helperModule, helperModule.exports);
  componentHelpers[name] = helperModule.exports;
}
const componentCode = compile('../src/components/RhythmSense.vue');
const soundModule = {exports:{}};
new Function('module','exports','require',compile('../src/model/AppSound.js'))(soundModule,soundModule.exports,()=>({sound:true}));

function setup(delayMs = 0, preferences = null, soundEnabled = true) {
  let now = 1000;
  let delay = delayMs;
  let feedbackSound = true;
  let revision = 0;
  let subscriber;
  let resume = () => Promise.resolve(true);
  let preferenceSaves = 0;
  const options = { sound:soundEnabled, appVolume: 100, rhythmSenseSettings: preferences,
    saveOptions() { preferenceSaves++; } };
  const master = soundModule.exports.createAppSoundController(()=>options.sound);
  const saved = [], sources = [], timeouts = new Map(), intervals = new Map();
  let timer = 1;
  const documentListeners = {}, contextListeners = {};
  const document = { hidden: false,
    addEventListener(name, fn) { documentListeners[name] = fn; },
    removeEventListener(name) { delete documentListeners[name]; }
  };
  function node() {
    return { disconnected: false, connect(to) {this.destination=to;}, disconnect() { this.disconnected = true; } };
  }
  function source(kind) {
    const value = Object.assign(node(), { kind, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } });
    sources.push(value);
    return value;
  }
  const context = {
    state: 'running', sampleRate: 1000, destination: {}, closed: false,
    get currentTime() { return now / 1000; },
    createOscillator() { return source('oscillator'); },
    createBufferSource() { return source('noise'); },
    createGain() { return Object.assign(node(), { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }); },
    createBiquadFilter() { return Object.assign(node(), { frequency: { setValueAtTime() {} } }); },
    createBuffer(channels, length) { return { getChannelData() { return new Float32Array(length); } }; },
    addEventListener(name, fn) { contextListeners[name] = fn; },
    removeEventListener(name) { delete contextListeners[name]; },
    close() { this.closed = true; }
  };
  const service = {
    getContext() { return context; }, resume() { return resume(); },
    getDelayMs() { return delay; }, getSettings() { return { feedbackSound }; },
    subscribe(fn) { subscriber = fn; fn({ revision }); return () => { subscriber = null; }; }
  };
  const componentModule = { exports: {} };
  vm.runInNewContext(componentCode, {
    module: componentModule, exports: componentModule.exports,
    require(name) {
      if(name.endsWith('/RhythmSense')) return rhythm;
      if(name.endsWith('/AudioSynchronization')) return service;
      if(name.endsWith('/Options')) return options;
      if(name.endsWith('/AppVolume')) return { appVolumeToAudioLevel: value => value / 100 };
      if(name.endsWith('/AppSound')) return { getAppAudioDestination:master.destination };
      if(name.endsWith('/ScreenAwakeMixin')) return {createScreenAwakeMixin:()=>({})};
      if(name.endsWith('/RhythmSenseRoundStorage')) return { saveBar(record) { saved.push(record); return Promise.resolve({ saved: true }); } };
      return componentHelpers[name.split('/').pop()] || {};
    },
    performance: { now: () => now }, document,
    setInterval(fn) { const id = timer++; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { const id = timer++; timeouts.set(id, fn); return id; }, clearTimeout(id) { timeouts.delete(id); }
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
  app.screen = 'training';
  app.roundLength = 1;
  const advance = target => {
    while(now < target) {
      now = Math.min(now + 10, target);
      sources.forEach(value => {
        if(value.onended && value.stops.some(at => at !== undefined && at <= context.currentTime)) {
          const ended = value.onended; value.onended = null; ended();
        }
      });
      if(app.clockTimer) app.tick();
    }
  };
  return { app, context, sources, saved, timeouts, intervals, advance, options,
    now: () => now,
    preferenceSaves: () => preferenceSaves,
    setDelay(value, notify = false) { delay = value; if(notify && subscriber) subscriber({ revision: ++revision }); },
    setFeedback(value) { feedbackSound = value; },
    setSound(value) { options.sound=value;master.refresh(); },
    output() { return master.destination(context); },
    setResume(fn) { resume = fn; },
    setHidden() { document.hidden = true; documentListeners.visibilitychange(); },
    suspend() { context.state = 'suspended'; contextListeners.statechange(); },
    destroy() { definition.beforeDestroy.call(app); },
    listeners: { documentListeners, contextListeners }
  };
}

async function run() {
  const preferences = setup();
  assert.deepStrictEqual(preferences.app.noteValues, ['whole', 'half', 'quarter']);
  assert.strictEqual(preferences.app.previewVibration, false);
  assert.strictEqual(preferences.app.tapVibration, false);
  assert(preferences.app.events.every(event => preferences.app.noteValues.includes(event.value)),
    'the initial exercise follows the beginner selection');
  preferences.app.toggleNoteValue('half');
  preferences.app.toggleNoteValue('quarter');
  assert.deepStrictEqual(preferences.app.noteValues, ['whole']);
  const savesBeforeLastToggle = preferences.preferenceSaves();
  preferences.app.toggleNoteValue('whole');
  preferences.app.toggleNoteValue('invalid');
  assert.deepStrictEqual(preferences.app.noteValues, ['whole'], 'the final selected value stays enabled');
  assert.strictEqual(preferences.preferenceSaves(), savesBeforeLastToggle);
  assert.deepStrictEqual(preferences.options.rhythmSenseSettings.noteValues, ['whole']);
  preferences.app.setMeter('3/4');
  assert.strictEqual(preferences.app.selectionFitsMeter, false);
  assert.strictEqual(preferences.app.events.length, 0);
  preferences.app.screen = 'menu';
  preferences.app.beginTraining();
  assert.strictEqual(preferences.app.screen, 'menu', 'an impossible selection cannot open training');
  await preferences.app.start();
  assert.strictEqual(preferences.app.audioStarting, false);
  assert.strictEqual(preferences.sources.length, 0, 'invalid selection never starts audio');
  preferences.app.toggleNoteValue('quarter');
  assert.strictEqual(preferences.app.selectionFitsMeter, true);
  assert(preferences.app.events.every(event => event.value === 'quarter'));
  preferences.app.phase = 'practice';
  const lockedValues = preferences.app.noteValues.slice();
  preferences.app.toggleNoteValue('sixtyFourth');
  assert.deepStrictEqual(preferences.app.noteValues, lockedValues, 'a running round keeps its selection');
  preferences.destroy();

  const selectedValues = ['eighth', 'sixtyFourth'];
  const selected = setup(0, { noteValues: selectedValues, previewVibration: false, tapVibration: false });
  selected.app.screen = 'menu';
  let menuStarts = 0;
  selected.app.start = () => { menuStarts++; };
  selected.app.beginTraining();
  assert.strictEqual(menuStarts, 1);
  assert.strictEqual(selected.app.screen, 'training');
  const selectedSeen = new Set();
  for(let bar = 0; bar < 25; bar++) {
    assert(selected.app.events.every(event => selectedValues.includes(event.value)),
      'menu, picker and subsequent bars respect the same strict selection');
    selected.app.events.forEach(event => selectedSeen.add(event.value));
    assert.strictEqual(selected.app.events.reduce((sum, event) => sum + event.duration, 0), 4);
    selected.app.phase = 'practice';
    selected.app.results = selected.app.events.map(() => 'correct');
    selected.app.acceptedOffsets = selected.app.events.map(() => 0);
    selected.app.completeBar();
    const record = selected.saved[selected.saved.length - 1];
    assert.deepStrictEqual(record.settings.noteValues, selectedValues);
    assert(record.notes.every(note => selectedValues.includes(note.value)));
    selected.app.beginNextBar();
  }
  assert.deepStrictEqual(Array.from(selectedSeen).sort(), selectedValues.slice().sort());
  selected.destroy();

  // Dense inputs must advance expired targets themselves. At 64ths an input
  // callback can arrive before the next 16-ms visual timer callback.
  const dense = setup(0, { noteValues: ['sixtyFourth'], previewVibration: false, tapVibration: false });
  dense.app.bpm = 120;
  dense.app.phase = 'practice';
  dense.app.phaseStart = dense.now();
  dense.app.results = dense.app.events.map(() => null);
  dense.app.acceptedOffsets = dense.app.events.map(() => null);
  assert.strictEqual(dense.app.usesDenseScore, true);
  const fourthOnset = dense.app.phaseStart + rhythm.rhythmSenseOnsetMs(dense.app.events[4], dense.app.bpm);
  dense.advance(fourthOnset);
  assert.strictEqual(dense.app.clockTimer, null);
  assert(dense.app.results.every(result => result === null), 'no visual clock has assigned misses');
  dense.app.tapDrum({ timeStamp: dense.now() });
  assert(dense.app.results.slice(0, 4).every(result => result === 'missed'));
  assert.strictEqual(dense.app.results[4], 'correct');
  assert.strictEqual(dense.app.acceptedOffsets[4], 0);
  assert.strictEqual(dense.app.results[5], null);
  assert.strictEqual(dense.app.tapMarkers[0].targetIndex, 4);
  const earlierQueuedOnset = dense.app.phaseStart + rhythm.rhythmSenseOnsetMs(dense.app.events[2], dense.app.bpm);
  dense.app.tapDrum({ timeStamp: earlierQueuedOnset });
  assert.strictEqual(dense.app.results[2], 'correct', 'an earlier queued touch can still recover its own target');
  assert.strictEqual(dense.app.results[4], 'correct', 'recovering an older target preserves a later hit');
  dense.destroy();

  for(const roundLength of [1, 3]) {
    for(const timelyTimestamp of [true, false]) {
      const h = setup(250, { noteValues: ['sixtyFourth'], previewVibration: false, tapVibration: false });
      h.app.setMeter('9/8');
      h.app.setTempo(120);
      h.app.roundLength = roundLength;
      await h.app.start();
      const barMs = rhythm.rhythmSenseBarDurationMs(120, '9/8');
      assert.strictEqual(barMs, 1500);
      const practiceStart = h.app.phaseStart + 2 * barMs;
      const lastIndex = h.app.events.length - 1;
      const lastOffset = rhythm.rhythmSenseOnsetMs(h.app.events[lastIndex], 120, '9/8');
      assert(Math.abs(lastOffset - 1479.1666666667) < .000001);
      const originalTimestamp = practiceStart + lastOffset;
      const originalWindow = rhythm.rhythmSenseWindows(h.app.events, lastIndex, 120, '9/8');
      h.advance(practiceStart + 1500);
      assert.strictEqual(h.app.phase, 'practice');
      assert.strictEqual(h.saved.length, 0, 'barline tick leaves pending input deliverable');
      h.advance(practiceStart + 1502);
      h.app.tapDrum({ timeStamp: timelyTimestamp ? originalTimestamp : h.now() });
      assert.strictEqual(h.app.results[lastIndex], timelyTimestamp ? 'correct' : 'missed',
        'arrival grace never changes correctness based on the original input time');
      if(timelyTimestamp) assert.strictEqual(Math.abs(h.app.acceptedOffsets[lastIndex]), 0);
      assert(h.now() - originalTimestamp > originalWindow.outerMs,
        'this delivery is outside the normal window, exercising the timestamp path');
      assert.deepStrictEqual(rhythm.rhythmSenseWindows(h.app.events, lastIndex, 120, '9/8'), originalWindow,
        'hit windows remain unchanged during the delivery grace');
      h.advance(practiceStart + 1549);
      assert.strictEqual(h.saved.length, 0);
      h.advance(practiceStart + 1550);
      assert.strictEqual(h.saved.length, 1);
      assert.strictEqual(h.saved[0].notes[lastIndex].result, timelyTimestamp ? 'correct' : 'missed');
      if(timelyTimestamp) assert.strictEqual(Math.abs(h.saved[0].notes[lastIndex].offsetMs), 0);
      else assert.strictEqual(h.saved[0].notes[lastIndex].offsetMs, null);
      assert.strictEqual(h.saved[0].durationMs, 1500, 'delivery grace is not added to musical duration');
      assert.strictEqual(h.app.completedBarCount, 1);
      assert.strictEqual(h.app.phase, roundLength === 1 ? 'result' : 'preview');
      if(roundLength === 1) {
        assert.strictEqual(h.intervals.size, 0);
        assert.strictEqual(h.app._audioSources.size, 0);
      } else {
        const nextHeardStart = h.app.phaseStart;
        assert.strictEqual(nextHeardStart, practiceStart + 1550 + 100 + 250);
        assert.strictEqual(h.app.activeBeat, -1);
        h.advance(nextHeardStart - 1);
        assert.strictEqual(h.app.activeBeat, -1, 'next preview waits for its newly scheduled heard start');
        h.advance(nextHeardStart);
        assert.strictEqual(h.app.activeBeat, 0);
        assert.strictEqual(h.saved.length, 1);
      }
      h.destroy();
    }
  }

  for(const delay of [0, 250, 500]) {
    const h = setup(delay), app = h.app;
    app.noteValues = ['quarter', 'eighth'];
    app.events = rhythm.createRhythmSenseBar(0);
    await app.start();
    const origin = app.phaseStart;
    const barMs = rhythm.rhythmSenseBarDurationMs(app.bpm);
    assert.strictEqual(origin, 1100 + delay);
    assert.strictEqual(app.activeBeat, -1, 'no visual beat before the sound arrives');
    assert(h.sources.length > 0 && h.sources.length < 6, 'only the imminent click and note are queued');
    assert(h.sources.every(source => source.starts[0] <= h.context.currentTime + .15));
    assert.strictEqual(h.sources[0].starts[0] * 1000 + delay, origin,
      'first audible click and visual target share a performance timestamp');
    h.advance(origin - 1);
    assert.strictEqual(app.activeBeat, -1);
    h.advance(origin);
    assert.strictEqual(app.activeBeat, 0);
    const firstPractice = origin + barMs * 2;
    h.advance(firstPractice - 1);
    assert.strictEqual(app.phase, 'countin');
    assert(app.results.every(result => result === null), 'not missed before the heard practice starts');
    h.advance(firstPractice);
    assert.strictEqual(app.phase, 'practice');
    assert.strictEqual(app.results[0], null);
    app.tapDrum({ timeStamp: h.now() });
    assert.strictEqual(app.results[0], 'correct');
    assert.strictEqual(app.acceptedOffsets[0], 0, 'visible on-time touch is not shifted a second time');
    for(let index = 1; index < app.events.length; index++) {
      h.advance(firstPractice + rhythm.rhythmSenseOnsetMs(app.events[index], app.bpm));
      app.tapDrum({ timeStamp: h.now() });
      assert.strictEqual(app.results[index], 'correct');
    }
    h.advance(firstPractice + barMs - 1);
    assert.strictEqual(h.saved.length, 0, 'no round completion before the heard bar ends');
    h.advance(firstPractice + barMs);
    assert.strictEqual(app.phase, 'practice', 'already timestamped inputs can arrive just after the barline');
    assert.strictEqual(h.saved.length, 0);
    h.advance(firstPractice + barMs + 49);
    assert.strictEqual(h.saved.length, 0, 'input delivery grace does not prematurely save the bar');
    h.advance(firstPractice + barMs + 50);
    assert.strictEqual(app.phase, 'result');
    assert.strictEqual(h.saved.length, 1);
    assert(h.saved[0].notes.every(note => note.offsetMs === 0));
    assert.strictEqual(h.intervals.size, 0);
    assert.strictEqual(app._audioSources.size, 0);
    h.destroy();
    assert.strictEqual(h.context.closed, false, 'the shared context stays available');
  }

  // Missing strokes become missed on the audible timeline, not when the audio
  // enters the output buffer (which can be half a second earlier).
  for(const delay of [0, 250, 500]) {
    const h = setup(delay); await h.app.start();
    const practice = h.app.phaseStart + 2 * rhythm.rhythmSenseBarDurationMs(h.app.bpm);
    const window = rhythm.rhythmSenseWindows(h.app.events, 0, h.app.bpm).outerMs;
    h.advance(practice + window);
    assert.strictEqual(h.app.results[0], null);
    h.advance(practice + window + 1);
    assert.strictEqual(h.app.results[0], 'missed');
    h.destroy();
  }

  // Settings are captured once for the run. A notified route/settings change
  // interrupts it, rather than moving targets underneath an existing round.
  const changed = setup(250); await changed.app.start();
  const originalStart = changed.app.phaseStart;
  changed.setDelay(500);
  changed.advance(originalStart);
  assert.strictEqual(changed.app.roundDelayMs, 250);
  assert.strictEqual(changed.app.phaseStart, originalStart);
  const queued = changed.sources.slice();
  changed.setDelay(500, true);
  assert.strictEqual(changed.app.phase, 'paused');
  assert.strictEqual(changed.app.audioNotice, 'RHYTHM_AUDIO_CHANGED');
  assert.strictEqual(changed.saved.length, 0);
  assert.strictEqual(changed.app._audioSources.size, 0);
  assert(queued.every(source => source.disconnected));
  changed.advance(originalStart + 15000);
  assert.strictEqual(changed.saved.length, 0);
  changed.destroy();

  for(const reason of ['hidden', 'suspended', 'exit', 'destroy']) {
    const h = setup(500); await h.app.start();
    const queued = h.sources.slice();
    if(reason === 'hidden') h.setHidden();
    if(reason === 'suspended') h.suspend();
    if(reason === 'exit') h.app.exitTraining();
    if(reason === 'destroy') h.destroy();
    assert.strictEqual(h.intervals.size, 0, reason);
    assert.strictEqual(h.app._audioSources.size, 0, reason);
    assert(queued.every(source => source.stops.includes(undefined) && source.disconnected), reason);
    assert.strictEqual(h.saved.length, 0, reason);
    assert.strictEqual(h.context.closed, false, reason);
    if(reason !== 'destroy') h.destroy();
    assert.strictEqual(Object.keys(h.listeners.documentListeners).length, 0);
    assert.strictEqual(Object.keys(h.listeners.contextListeners).length, 0);
  }

  const silent = setup(250); silent.setFeedback(false); await silent.app.start();
  assert(silent.sources.some(source => source.kind === 'noise'), 'preview drums remain audible');
  const practice = silent.app.phaseStart + 2 * rhythm.rhythmSenseBarDurationMs(silent.app.bpm);
  silent.advance(practice);
  const beforeTap = silent.sources.length;
  silent.app.tapDrum({ timeStamp: silent.now() });
  assert(silent.sources.length > beforeTap, 'legacy feedback switch no longer overrides the global sound setting');
  assert.strictEqual(silent.app.results[0], 'correct');
  assert.strictEqual(silent.app.drumFlash, true);
  silent.destroy();

  const muted = setup(250, null, false); await muted.app.start();
  const mutedStart = muted.app.phaseStart + 2 * rhythm.rhythmSenseBarDurationMs(muted.app.bpm);
  muted.advance(mutedStart); muted.app.tapDrum({timeStamp:muted.now()});
  assert.strictEqual(muted.app.results[0], 'correct', 'mute does not alter timing or scoring');
  assert.strictEqual(muted.output().gain.value, 0);
  assert(muted.sources.every(source=>source.destination &&
    (source.kind === 'noise' ? source.destination.destination.destination : source.destination.destination) === muted.output()));
  muted.setSound(true); assert.strictEqual(muted.output().gain.value, 1);
  assert.strictEqual(muted.app.phase, 'practice', 'unmuting does not restart the round');
  muted.destroy();

  for(const meter of rhythm.RHYTHM_SENSE_METERS) {
    const h = setup(500);
    h.app.meter = meter;
    h.app.noteValues = ['quarter', 'eighth'];
    h.app.events = rhythm.createRhythmSenseBar(0, meter);
    const clicks = [];
    h.app.playMetronome = (accent, at) => { clicks.push({ accent, at }); };
    await h.app.start();
    const origin = h.app.phaseStart;
    const barMs = rhythm.rhythmSenseBarDurationMs(h.app.bpm, meter);
    const beatCount = rhythm.rhythmSenseBeatsPerBar(meter);
    h.advance(origin + 3 * barMs + 50);
    assert.strictEqual(clicks.length, 3 * beatCount, meter + ': one pulse per notated beat in each phase');
    for(let index = 0; index < clicks.length; index++) {
      assert.strictEqual(clicks[index].accent, index % beatCount === 0);
      assert(Math.abs(clicks[index].at * 1000 + 500 - origin
        - index * rhythm.rhythmSenseBeatMs(h.app.bpm)) < .001,
      meter + ': scheduled pulses keep their exact audio timeline');
    }
    h.destroy();
  }

  const partial = setup(500); partial.app.roundLength = 3; await partial.app.start();
  partial.advance(partial.app.phaseStart + 3 * rhythm.rhythmSenseBarDurationMs(partial.app.bpm) + 50);
  assert.strictEqual(partial.saved.length, 1);
  const retained = JSON.stringify(partial.saved);
  partial.setHidden();
  assert.strictEqual(partial.app.phase, 'paused');
  assert.strictEqual(partial.app.completedBarCount, 1);
  assert.strictEqual(JSON.stringify(partial.saved), retained, 'interrupting the next bar preserves completed records');
  partial.destroy();

  const waiting = setup(); let release;
  waiting.setResume(() => new Promise(resolve => { release = resolve; }));
  const pending = waiting.app.start();
  assert.strictEqual(waiting.app.audioStarting, true);
  waiting.app.exitTraining(); release(true); await pending;
  assert.strictEqual(waiting.app.phase, 'idle');
  assert.strictEqual(waiting.sources.length, 0, 'late resume cannot revive an exited session');
  waiting.destroy();

  const blocked = setup(); blocked.setResume(() => Promise.resolve(false));
  await blocked.app.start();
  assert.strictEqual(blocked.app.phase, 'paused');
  assert.strictEqual(blocked.app.audioNotice, 'RHYTHM_AUDIO_UNAVAILABLE');
  assert.strictEqual(blocked.saved.length, 0);
  blocked.destroy();
  process.stdout.write('Rhythm Sense audio synchronization tests passed\n');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

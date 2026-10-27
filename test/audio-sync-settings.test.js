const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('babel-core');

function compiled(file) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  return babel.transform(file.endsWith('.vue') ? source.match(/<script>([\s\S]*?)<\/script>/)[1] : source,
    { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code;
}
const componentCode = compiled('../src/components/AudioSyncSettings.vue');
const calibrationCode = compiled('../src/model/AudioCalibration.js');

function setup({ manualMs = 80, estimatedMs = 30, appVolume = 70, disabled = false, soundEnabled = true } = {}) {
  let now = 1000, nextTimer = 1, resumeCount = 0;
  let resume = () => Promise.resolve(true);
  let state = { settings: { automatic: true, manualMs, feedbackSound: true },
    delayMs: manualMs === null ? estimatedMs || 0 : manualMs, estimatedMs,
    source: manualMs === null ? estimatedMs === null ? 'unavailable' : 'system' : 'manual',
    route: 'unknown', routeReliable: false, revision: 0 };
  const updates = [], sources = [], subscribers = new Set(), timers = new Map();
  const copy = value => JSON.parse(JSON.stringify(value));
  const emit = () => subscribers.forEach(fn => fn(copy(state)));
  function events(target = {}) {
    const handlers = new Map();
    return Object.assign(target, {
      addEventListener(name, fn) { if(!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
      removeEventListener(name, fn) { if(handlers.has(name)) handlers.get(name).delete(fn); },
      dispatch(name) { if(handlers.has(name)) Array.from(handlers.get(name)).forEach(fn => fn()); },
      listenerCount() { return Array.from(handlers.values()).reduce((sum, group) => sum + group.size, 0); }
    });
  }
  const document = events({ hidden: false });
  const context = events({
    state: 'running', destination: {}, closed: false,
    get currentTime() { return now / 1000; },
    close() { this.closed = true; },
    createOscillator() {
      const source = { starts: [], stops: [], disconnected: false,
        frequency: { setValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; },
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); }
      };
      sources.push(source); return source;
    },
    createGain() { return { connect() {}, disconnect() {}, gain: {
      setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}
    } }; }
  });
  const service = {
    getState: () => copy(state), getSettings: () => copy(state.settings), getContext: () => context,
    getDelayMs: () => state.delayMs,
    resume() { resumeCount++; return resume(); },
    subscribe(fn) { subscribers.add(fn); fn(copy(state)); return () => subscribers.delete(fn); },
    updateSettings(patch) {
      updates.push(copy(patch));
      const oldDelay = state.delayMs;
      Object.assign(state.settings, patch);
      state.delayMs = state.settings.manualMs === null ? state.estimatedMs || 0 : state.settings.manualMs;
      state.source = state.settings.manualMs === null ? state.estimatedMs === null ? 'unavailable' : 'system' : 'manual';
      if(oldDelay !== state.delayMs) state.revision++;
      emit(); return copy(state);
    },
    reset() { return this.updateSettings({ manualMs: null }); }
  };
  const environment = {
    regeneratorRuntime: require('babel-runtime/regenerator'),
    performance: { now: () => now }, document,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const calibrationModule = { exports: {} };
  vm.runInNewContext(calibrationCode, Object.assign({}, environment,
    { module: calibrationModule, exports: calibrationModule.exports,
      require:name=>name === './AppSound' ? {getAppAudioDestination:context=>context.destination} : {} }));
  const componentModule = { exports: {} };
  vm.runInNewContext(componentCode, Object.assign({}, environment, {
    module: componentModule, exports: componentModule.exports,
    require(name) {
      if(name.endsWith('/AudioSynchronization')) return service;
      if(name.endsWith('/AudioCalibration')) return calibrationModule.exports;
      if(name.endsWith('/AppVolume')) return { appVolumeToAudioLevel: value => value / 100 };
      if(name.endsWith('/AppSound')) return { getAppAudioDestination:context=>context.destination };
      throw new Error('Unexpected component dependency: ' + name);
    }
  }));
  const definition = componentModule.exports.default;
  const app = Object.assign(definition.data(), { disabled, appVolume, soundEnabled,
    $t(key, args) { return args ? key + ':' + JSON.stringify(args) : key; }
  });
  Object.keys(definition.methods).forEach(name => { app[name] = definition.methods[name].bind(app); });
  Object.keys(definition.computed).forEach(name => Object.defineProperty(app, name,
    { get() { return definition.computed[name].call(app); } }));
  definition.created.call(app);
  function advance(target) {
    for(;;) {
      const due = Array.from(timers.entries()).filter(([, item]) => item.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if(!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = target;
  }
  return { app, context, document, sources, updates, timers, subscribers, advance,
    now: () => now, state: () => copy(state), resumeCount: () => resumeCount,
    setResume(fn) { resume = fn; },
    initialEstimate(value) {
      state.estimatedMs = value;
      if(state.settings.manualMs === null) { state.delayMs = value; state.source = 'system'; }
      emit();
    },
    initialRoute() { state.route = 'speaker'; state.routeReliable = true; emit(); },
    routeChange() { state.route = 'headphones'; state.routeReliable = true; state.revision++; emit(); },
    interrupt() { context.state = 'suspended'; context.dispatch('statechange'); },
    setDisabled(value) { app.disabled = value; definition.watch.disabled.call(app, value); },
    setVolume(value) { app.appVolume = value; definition.watch.appVolume.call(app); },
    setSound(value) {app.soundEnabled=value;definition.watch.soundEnabled.call(app,value);},
    destroy() { definition.beforeDestroy.call(app); }
  };
}

async function sampledCalibration(h, offsets) {
  await h.app.startCalibration();
  const first = h.sources[0].starts[0] * 1000;
  for(let index = 0; index < offsets.length; index++) {
    h.advance(first + (4 + index) * 1100 + offsets[index]);
    h.app.tap({ timeStamp: h.now() });
  }
}

async function run() {
  // First-time browser/native metadata during resume is not an output switch.
  const initial = setup({ manualMs: null, estimatedMs: null }); let finishResume;
  initial.setResume(() => new Promise(resolve => { finishResume = resolve; }));
  const starting = initial.app.startCalibration();
  assert.strictEqual(initial.app.starting, true);
  initial.initialEstimate(35); initial.initialRoute();
  assert.strictEqual(initial.app.starting, true);
  assert.strictEqual(initial.sources.length, 0);
  finishResume(true); await starting;
  assert.strictEqual(initial.app.calibrationState.running, true);
  assert.strictEqual(initial.app.notice, '');
  assert.strictEqual(initial.sources.length, 24);
  assert.strictEqual(initial.context.listenerCount(), 1);
  initial.destroy();

  const result = setup();
  await sampledCalibration(result, Array(20).fill(250));
  assert.strictEqual(result.app.result.ok, true);
  assert.strictEqual(result.app.result.delayMs, 250);
  assert.strictEqual(result.app.busy, false);
  assert.strictEqual(result.state().settings.manualMs, 80, 'measurement needs explicit Apply');
  assert.strictEqual(result.updates.length, 0);
  result.app.applyResult();
  assert.strictEqual(result.state().settings.manualMs, 250);
  assert.strictEqual(result.app.result, null);
  assert(result.app.notice.startsWith('AUDIO_SYNC_APPLIED:'));
  assert.strictEqual(result.context.listenerCount(), 0);
  result.destroy();

  const failure = setup();
  await sampledCalibration(failure, Array.from({ length: 20 }, (_, index) => index % 2 ? 700 : 10));
  assert.strictEqual(failure.app.result.ok, false);
  failure.app.applyResult();
  assert.strictEqual(failure.state().settings.manualMs, 80);
  assert.strictEqual(failure.updates.length, 0, 'bad samples do not overwrite a known calibration');
  failure.destroy();

  const staleResult = setup();
  await sampledCalibration(staleResult, Array(20).fill(250));
  staleResult.routeChange();
  assert.strictEqual(staleResult.app.result, null, 'a result from the previous output must not remain applicable');
  staleResult.app.applyResult();
  assert.strictEqual(staleResult.state().settings.manualMs, 80);
  assert.strictEqual(staleResult.updates.length, 0);
  staleResult.destroy();

  for(const action of ['cancel', 'unmount', 'route', 'hide', 'native-pause', 'disabled', 'mute']) {
    const h = setup(); let release;
    h.setResume(() => new Promise(resolve => { release = resolve; }));
    const pending = h.app.startCalibration();
    if(action === 'cancel') h.app.cancelExercise();
    if(action === 'unmount') h.destroy();
    if(action === 'route') h.routeChange();
    if(action === 'hide') { h.document.hidden = true; h.document.dispatch('visibilitychange'); }
    if(action === 'native-pause') h.document.dispatch('pause');
    if(action === 'disabled') h.setDisabled(true);
    if(action === 'mute') h.setSound(false);
    release(true); await pending;
    assert.strictEqual(h.app.busy, false, action);
    assert.strictEqual(h.sources.length, 0, action + ': pending resume must not start a cancelled test');
    assert.strictEqual(h.timers.size, 0, action);
    if(action !== 'unmount') h.destroy();
    assert.strictEqual(h.document.listenerCount(), 0);
    assert.strictEqual(h.subscribers.size, 0);
  }

  for(const exercise of ['calibration', 'check']) {
    for(const action of ['interrupt', 'cancel', 'unmount', 'route', 'volume', 'collapse', 'mute']) {
      const h = setup();
      await (exercise === 'calibration' ? h.app.startCalibration() : h.app.startCheck());
      assert.strictEqual(h.app.busy, true);
      assert(h.sources.length > 0);
      if(action === 'interrupt') h.interrupt();
      if(action === 'cancel') h.app.cancelExercise();
      if(action === 'unmount') h.destroy();
      if(action === 'route') h.routeChange();
      if(action === 'volume') h.setVolume(0);
      if(action === 'mute') h.setSound(false);
      if(action === 'collapse') h.app.onDisclosure({ target: { open: false } });
      assert.strictEqual(h.app.busy, false, exercise + '/' + action);
      assert.strictEqual(h.app.result, null);
      assert.strictEqual(h.timers.size, 0, exercise + '/' + action);
      assert.strictEqual(h.context.listenerCount(), 0);
      assert(h.sources.every(source => source.disconnected && source.stops.includes(undefined)));
      assert.strictEqual(h.context.closed, false, 'settings never close the shared audio context');
      assert.strictEqual(h.state().settings.manualMs, 80);
      if(action === 'interrupt') assert.strictEqual(h.app.notice, 'AUDIO_SYNC_UNAVAILABLE');
      if(action === 'route') assert.strictEqual(h.app.notice, 'AUDIO_SYNC_CHANGED');
      if(action !== 'unmount') h.destroy();
    }
  }

  const check = setup({ manualMs: 250 });
  await check.app.startCheck();
  const firstHeard = check.sources[0].starts[0] * 1000 + 250;
  check.advance(firstHeard - 1); assert.strictEqual(check.app.checkFlash, false);
  check.advance(firstHeard); assert.strictEqual(check.app.checkFlash, true);
  check.advance(firstHeard + 110); assert.strictEqual(check.app.checkFlash, false);
  check.advance(8000);
  assert.strictEqual(check.app.busy, false);
  assert.strictEqual(check.context.listenerCount(), 0);
  assert.strictEqual(check.updates.length, 0, 'checking synchronization never calibrates silently');
  check.destroy();

  const settings = setup();
  settings.app.setDelay(''); settings.app.setDelay('not-a-number');
  assert.strictEqual(settings.updates.length, 0);
  settings.app.setDelay('255');
  assert.strictEqual(settings.state().settings.manualMs, 255);
  settings.app.setAutomatic(false);
  assert.strictEqual(settings.state().settings.automatic, false);
  settings.app.reset();
  assert.strictEqual(settings.state().settings.manualMs, null);
  assert.strictEqual(settings.app.notice, 'AUDIO_SYNC_RESET_DONE');
  assert.strictEqual(settings.state().delayMs, 30);
  settings.app.setDelay(250);
  await settings.app.useSystemEstimate();
  assert.strictEqual(settings.resumeCount(), 1, 'system estimate is refreshed with an active context');
  assert.strictEqual(settings.state().settings.manualMs, null);
  settings.destroy();

  const unavailableEstimate = setup({ estimatedMs: null });
  await unavailableEstimate.app.useSystemEstimate();
  assert.strictEqual(unavailableEstimate.state().settings.manualMs, 80);
  assert.strictEqual(unavailableEstimate.app.notice, 'AUDIO_SYNC_SOURCE_UNKNOWN');
  unavailableEstimate.destroy();

  for(const options of [{ appVolume: 0 }, { disabled: true }, { soundEnabled: false }]) {
    const h = setup(options); await h.app.startCalibration(); await h.app.startCheck();
    assert.strictEqual(h.resumeCount(), 0);
    assert.strictEqual(h.sources.length, 0);
    assert.strictEqual(h.app.busy, false);
    if(options.appVolume === 0) assert.strictEqual(h.app.notice, 'AUDIO_SYNC_MUTED');
    if(options.soundEnabled === false) assert.strictEqual(h.app.notice, 'AUDIO_SYNC_SOUND_DISABLED');
    h.destroy();
  }
  const mutedEstimate=setup({soundEnabled:false});await mutedEstimate.app.useSystemEstimate();
  assert.strictEqual(mutedEstimate.resumeCount(),1,'a silent system estimate is still available with app sound off');
  assert.strictEqual(mutedEstimate.sources.length,0);mutedEstimate.destroy();
  for(const resume of [() => Promise.resolve(false), () => Promise.reject(new Error('denied'))]) {
    const h = setup(); h.setResume(resume); await h.app.startCalibration();
    assert.strictEqual(h.app.notice, 'AUDIO_SYNC_UNAVAILABLE');
    assert.strictEqual(h.app.busy, false);
    assert.strictEqual(h.sources.length, 0);
    h.destroy();
  }
  process.stdout.write('Audio synchronization settings lifecycle tests passed\n');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

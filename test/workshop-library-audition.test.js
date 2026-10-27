const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep, original = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), { babelrc:false, presets:[['env', { modules:'commonjs' }]] }).code, filename)
  : original(mod, filename);
const model = require('../src/model/Workshop');
const { createWorkshopPlayback } = require('../src/model/WorkshopPlayback');
const { createWorkshopLibraryPlayback } = require('../src/model/WorkshopLibraryPlayback');
Module._extensions['.js'] = original;
const tests = [];
function test(name, run) { tests.push([name, run]); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function note(id, slot, value = 48, noteValue = 'quarter') {
  return { id, kind:'note', startSlot:slot, noteValue, pitch:model.workshopPitchFromValue(value) };
}
function piece(id = 'a', count = 1) {
  const score = model.createWorkshopDraft('Library ' + id, count).score;
  score.parts[0].measures[0].events = [note('note-' + id, 0)];
  return { id, currentRevisionId:'revision-' + id, revisions:[{ id:'revision-' + id, score }] };
}
function fixture(extra = {}) {
  const states = [], requests = [], prepared = [], listeners = new Set();
  let stops = 0, makeCount = 0, volume = 64;
  const context = { state:'running' }, audioState = { revision:1 };
  const audio = { resume:async () => true, getContext:() => context, getDelayMs:() => 170,
    getState:() => audioState, subscribe(listener) { listeners.add(listener); listener(audioState); return () => listeners.delete(listener); } };
  const player = { prepare:async values => { prepared.push(values); return true; }, stopAll() { stops++; } };
  const controller = createWorkshopLibraryPlayback(Object.assign({ audioSynchronization:audio,
    getAppVolume:() => volume, onState:state => states.push(state),
    createPianoPlayer(options) { makeCount++; assert.strictEqual(options.audioSynchronization, audio);
      assert.strictEqual(options.allowFractionalPitch, true); assert.strictEqual(options.maxVoices, 256); return player; },
    createPlayback(score, selectedPlayer, options) {
      assert.strictEqual(selectedPlayer, player);
      const request = { score, options, starts:0, stops:0, active:false, timeline:model.workshopTimeline(score) };
      request.getTimeline = () => request.timeline;
      request.start = () => { request.starts++; request.active = true; return true; };
      request.stop = () => { request.stops++; const wasActive = request.active; request.active = false; if (wasActive) options.onStop(); };
      requests.push(request); return request;
    }
  }, extra));
  return { controller, audio, context, player, states, requests, prepared, listeners,
    get stops() { return stops; }, get makeCount() { return makeCount; }, setVolume(value) { volume = value; },
    changeTiming() { audioState.revision++; listeners.forEach(listener => listener(audioState)); } };
}
async function afterResume() { await Promise.resolve(); await Promise.resolve(); }

test('auditions the current saved revision with prepared samples, volume and delay, without changing it', async () => {
  const saved = piece(), score = saved.revisions[0].score;
  score.parts.push({ id:'left', clef:'bass', measures:[{ id:'left-bar', events:[note('bass-note', 0, 36)] }] });
  saved.revisions.unshift({ id:'old-revision', score:model.createWorkshopDraft('Previous').score });
  assert(model.isValidWorkshopScore(score)); const before = JSON.stringify(saved), f = fixture();
  const request = f.controller.toggle(saved);
  assert.deepStrictEqual(f.controller.getState(), { pieceId:'a', busy:true, playing:false, error:null });
  assert(await request);
  assert.strictEqual(f.requests[0].score, score); assert.strictEqual(f.requests[0].options.delayMs, 170);
  assert.strictEqual(f.requests[0].options.appVolume, 64); assert.strictEqual(f.requests[0].starts, 1);
  assert.deepStrictEqual(f.prepared[0].filter(Number.isFinite).sort((a,b) => a-b), [36, 48]);
  assert.deepStrictEqual(f.controller.getState(), { pieceId:'a', busy:false, playing:true, error:null });
  assert.strictEqual(JSON.stringify(saved), before); f.controller.dispose();
});
test('tapping the same playing card stops its playback and all voices', async () => {
  const f = fixture(); assert(await f.controller.toggle(piece())); const previousStops = f.stops;
  assert.strictEqual(await f.controller.toggle(piece()), false); assert.strictEqual(f.requests[0].stops, 1);
  assert(f.stops > previousStops); assert.deepStrictEqual(f.controller.getState(), { pieceId:null, busy:false, playing:false, error:null });
  f.controller.dispose();
});
test('switching cards ends the previous timeline before starting the next and reuses decoded samples', async () => {
  const f = fixture(); assert(await f.controller.toggle(piece('a'))); f.setVolume(28);
  assert(await f.controller.toggle(piece('b'))); assert.strictEqual(f.requests[0].stops, 1);
  assert.strictEqual(f.requests[0].active, false); assert.strictEqual(f.requests[1].active, true);
  assert.strictEqual(f.requests[1].options.appVolume, 28); assert.strictEqual(f.makeCount, 1);
  // An old completion callback cannot clear the new card.
  f.requests[0].options.onStop(); assert.strictEqual(f.controller.getState().pieceId, 'b'); f.controller.dispose();
});
test('stopping while audio unlock is pending cannot create or start a late player', async () => {
  const gate = deferred(), f = fixture(); f.audio.resume = () => gate.promise;
  const pending = f.controller.toggle(piece()); f.controller.stop(); gate.resolve(true);
  assert.strictEqual(await pending, false); assert.strictEqual(f.makeCount, 0); assert.strictEqual(f.requests.length, 0);
  assert.strictEqual(f.controller.getState().pieceId, null); f.controller.dispose();
});
test('tapping the same loading card cancels pending sample preparation', async () => {
  const gate = deferred(), f = fixture(); f.player.prepare = () => gate.promise;
  const pending = f.controller.toggle(piece()); await afterResume(); assert.strictEqual(f.requests.length, 1);
  assert.strictEqual(await f.controller.toggle(piece()), false); gate.resolve(true);
  assert.strictEqual(await pending, false); assert.strictEqual(f.requests[0].starts, 0);
  assert.strictEqual(f.requests[0].stops, 1); assert.strictEqual(f.controller.getState().pieceId, null); f.controller.dispose();
});
test('late preparation failure from a replaced card cannot stop or mark the new one as failed', async () => {
  const gate = deferred(), f = fixture(); let calls = 0;
  f.player.prepare = () => ++calls === 1 ? gate.promise : Promise.resolve(true);
  const pending = f.controller.toggle(piece('a')); await afterResume();
  assert(await f.controller.toggle(piece('b'))); const previousStops = f.stops;
  gate.reject(new Error('late decode failure')); assert.strictEqual(await pending, false);
  assert.strictEqual(f.stops, previousStops); assert.strictEqual(f.requests[0].starts, 0);
  assert.deepStrictEqual(f.controller.getState(), { pieceId:'b', busy:false, playing:true, error:null }); f.controller.dispose();
});
test('a suspended audio context reports an error and a later tap can retry', async () => {
  const f = fixture(); f.context.state = 'suspended'; f.audio.resume = async () => false;
  assert.strictEqual(await f.controller.toggle(piece()), false); assert.strictEqual(f.makeCount, 0);
  assert.deepStrictEqual(f.controller.getState(), { pieceId:'a', busy:false, playing:false, error:'WORKSHOP_AUDIO_UNAVAILABLE' });
  f.context.state = 'running'; f.audio.resume = async () => true;
  assert(await f.controller.toggle(piece())); assert.strictEqual(f.controller.getState().error, null); f.controller.dispose();
});
test('a platform without Web Audio can use the existing sample fallback', async () => {
  const f = fixture(); f.audio.resume = async () => false; f.audio.getContext = () => null;
  assert(await f.controller.toggle(piece())); assert.strictEqual(f.requests[0].starts, 1); f.controller.dispose();
});
test('sample preparation errors release the candidate without starting audio', async () => {
  for (const result of [false, new Error('sample missing')]) {
    const f = fixture(); f.player.prepare = async () => { if (result instanceof Error) throw result; return result; };
    assert.strictEqual(await f.controller.toggle(piece()), false); assert.strictEqual(f.requests[0].starts, 0);
    assert.strictEqual(f.requests[0].stops, 1); assert(f.stops > 0);
    assert.strictEqual(f.controller.getState().error, 'WORKSHOP_AUDIO_UNAVAILABLE'); f.controller.dispose();
  }
});
test('invalid, missing and empty saved revisions are rejected without unlocking audio', async () => {
  const empty = piece(); empty.revisions[0].score.parts[0].measures[0].events = [];
  const missing = piece(); missing.currentRevisionId = 'not-present';
  const invalid = piece(); invalid.revisions[0].score.bpm = -1;
  for (const saved of [null, missing, empty, invalid]) {
    const f = fixture(); let unlocked = 0; f.audio.resume = async () => { unlocked++; return true; };
    assert.strictEqual(await f.controller.toggle(saved), false); assert.strictEqual(unlocked, 0);
    assert.strictEqual(f.requests.length, 0); assert.strictEqual(f.controller.getState().busy, false);
    assert.strictEqual(f.controller.getState().error, 'WORKSHOP_AUDIO_UNAVAILABLE'); f.controller.dispose();
  }
});
test('a changed timing snapshot cancels both active and pending playback', async () => {
  const f = fixture(); assert(await f.controller.toggle(piece())); f.changeTiming();
  assert.strictEqual(f.requests[0].active, false); assert.strictEqual(f.controller.getState().pieceId, null);
  const gate = deferred(); f.player.prepare = () => gate.promise;
  const pending = f.controller.toggle(piece('b')); await afterResume(); f.changeTiming(); gate.resolve(true);
  assert.strictEqual(await pending, false); assert.strictEqual(f.requests[1].starts, 0); f.controller.dispose();
});
test('disposing pending playback unsubscribes and prevents further audition requests', async () => {
  const gate = deferred(), f = fixture(); f.player.prepare = () => gate.promise;
  const pending = f.controller.toggle(piece()); await afterResume(); f.controller.dispose();
  assert.strictEqual(f.listeners.size, 0); gate.resolve(true); assert.strictEqual(await pending, false);
  assert.strictEqual(f.requests[0].starts, 0); assert.strictEqual(await f.controller.toggle(piece('b')), false);
  assert.strictEqual(f.requests.length, 1); f.controller.dispose();
});
test('state snapshots contain no score and cannot be mutated by a view', async () => {
  const f = fixture(); assert(await f.controller.toggle(piece())); const snapshot = f.controller.getState();
  assert.deepStrictEqual(Object.keys(snapshot).sort(), ['busy', 'error', 'pieceId', 'playing']);
  snapshot.pieceId = 'tampered'; f.states[f.states.length-1].playing = false;
  assert.strictEqual(f.controller.getState().pieceId, 'a'); assert.strictEqual(f.controller.getState().playing, true); f.controller.dispose();
});

function clockFixture() {
  let time = 0, sequence = 0; const timers = new Map(), attacks = [], voices = new Set(), history = [];
  const clock = { nowFn:() => time,
    setTimeoutFn(fn, delay) { const id = ++sequence; timers.set(id, { due:time+delay, fn }); return id; },
    clearTimeoutFn(id) { timers.delete(id); } };
  function advance(target) {
    let limit = 100000;
    while (timers.size) {
      const [id, next] = Array.from(timers).sort((a,b) => a[1].due-b[1].due || a[0]-b[0])[0];
      if (next.due > target) break;
      assert(--limit > 0); timers.delete(id); time = next.due; next.fn();
    }
    time = target;
  }
  const audio = { resume:async () => true, getContext:() => ({ state:'running' }),
    getDelayMs:() => 125, getState:() => ({ revision:0 }), subscribe:() => () => {} };
  const player = { prepare:async () => true,
    play(value, volume) { const sample = { value, volume, at:time }; attacks.push(sample); voices.add(sample); return sample; },
    stop(sample) { voices.delete(sample); }, stopAll() { voices.clear(); } };
  const controller = createWorkshopLibraryPlayback({ audioSynchronization:audio, getAppVolume:() => 42,
    createPianoPlayer:() => player, createPlayback:createWorkshopPlayback, playbackOptions:clock,
    onState:state => history.push({ time, state }) });
  return { controller, advance, timers, attacks, voices, history };
}
test('the real timeline plays both staves and ends after the output delay without residual timers or voices', async () => {
  const saved = piece(), score = saved.revisions[0].score; score.bpm = 120;
  score.parts[0].measures[0].events = [note('top-a', 0), note('top-b', 2, 52)];
  score.parts.push({ id:'left', clef:'bass', measures:[{ id:'bass-bar', events:[note('bass', 0, 36, 'whole')] }] });
  assert(model.isValidWorkshopScore(score)); const before = JSON.stringify(saved), f = clockFixture();
  assert(await f.controller.toggle(saved)); assert.strictEqual(f.attacks.length, 2); f.advance(500);
  assert.strictEqual(f.attacks.length, 3); assert(f.attacks.every(sample => sample.volume === 42));
  f.advance(2000); assert.strictEqual(f.voices.size, 0); assert(f.controller.getState().playing);
  f.advance(2125); assert.deepStrictEqual(f.controller.getState(), { pieceId:null, busy:false, playing:false, error:null });
  assert.strictEqual(f.timers.size, 0); assert.strictEqual(JSON.stringify(saved), before); f.controller.dispose();
});
test('stopping a real timeline clears future attacks and timers', async () => {
  const saved = piece(), score = saved.revisions[0].score;
  score.parts[0].measures[0].events = [note('first', 0), note('later', 2)];
  const f = clockFixture(); assert(await f.controller.toggle(saved)); assert(f.timers.size > 0);
  f.controller.stop(); assert.strictEqual(f.voices.size, 0); assert.strictEqual(f.timers.size, 0);
  const count = f.attacks.length; f.advance(10000); assert.strictEqual(f.attacks.length, count); f.controller.dispose();
});

(async () => {
  for (const [name, run] of tests) { await run(); console.log('✓ ' + name); }
  console.log('Workshop library audition: ' + tests.length + ' checks passed.');
})().catch(error => { console.error(error); process.exit(1); });

const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const root = path.resolve(__dirname, '../src') + path.sep, original = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => filename.startsWith(root)
  ? mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), { babelrc:false, presets:[['env', { modules:'commonjs' }]] }).code, filename)
  : original(mod, filename);
const model = require('../src/model/Workshop'), ties = require('../src/model/WorkshopTies');
const { createWorkshopPlayback } = require('../src/model/WorkshopPlayback');
const { importWorkshopMusicXmlText } = require('../src/model/WorkshopMusicXml');
Module._extensions['.js'] = original;
function score(count = 1) { return model.createWorkshopDraft('Transport', count).score; }
function note(id, startSlot = 0, noteValue = 'quarter', value = 48, extra = {}) {
  return Object.assign({ id, kind:'note', startSlot, noteValue, pitch:model.workshopPitchFromValue(value) }, extra);
}
function rest(id, startSlot, extra = {}) { return Object.assign({ id, kind:'rest', startSlot, noteValue:'quarter', pitch:null }, extra); }
function fixture(value, options = {}) {
  let time = 0, id = 0, maxPending = 0, stops = 0, pauses = 0;
  const timers = new Map(), callbacks = [], played = [], steps = [], updates = [], positions = [];
  const player = {
    play(value, volume, settings) {
      const sample = { value, volume, time, offsetSeconds:settings.offsetSeconds, stoppedAt:null };
      played.push(sample); return sample;
    },
    stop(sample) { if (sample && sample.stoppedAt === null) sample.stoppedAt = time; },
    stopAll() { played.forEach(sample => { if (sample.stoppedAt === null) sample.stoppedAt = time; }); }
  };
  const playback = createWorkshopPlayback(value, player, Object.assign({}, options, {
    appVolume:100, nowFn:() => time,
    setTimeoutFn(fn, delay) { assert(delay >= 0 && Number.isFinite(delay)); timers.set(++id, { fn, due:time + delay }); callbacks.push(fn); maxPending = Math.max(maxPending, timers.size); return id; },
    clearTimeoutFn(timer) { timers.delete(timer); },
    onStep(event) { steps.push(event); },
    onActiveNotes(ids, barIndex) { updates.push({ ids, barIndex, time }); },
    onStop() { stops++; }, onPause() { pauses++; },
    onPosition(positionMs, barIndex, state) { positions.push({ positionMs, barIndex, state }); }
  }));
  return {
    playback, played, steps, updates, positions, timers, callbacks,
    get stops() { return stops; }, get pauses() { return pauses; }, get maxPending() { return maxPending; },
    advance(target) {
      assert(target >= time); let safety = 100000;
      while (timers.size) {
        const [id, timer] = Array.from(timers).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (timer.due > target + 1e-7) break;
        assert(--safety > 0, 'bounded playback loop'); timers.delete(id); time = timer.due; timer.fn();
      }
      time = target;
    }
  };
}
let tests = 0;
function test(name, callback) { callback(); tests++; console.log('✓ ' + name); }

test('pause freezes audible position, stops sources and resumes the remaining sample envelope without onStop', () => {
  const value = score(2); value.parts[0].measures[0].events = [note('held', 0, 'half'), note('next', 4, 'half', 50)];
  value.parts[0].measures[1].events = [note('last', 0, 'whole', 52)];
  const f = fixture(value, { delayMs:300 }); assert(f.playback.start());
  assert.strictEqual(f.stops, 0); f.advance(1500); assert.strictEqual(f.playback.getPosition(), 1200);
  assert(f.playback.pause()); assert.strictEqual(f.pauses, 1); assert.strictEqual(f.stops, 0);
  assert.strictEqual(f.playback.isPlaying(), false); assert.strictEqual(f.playback.isPaused(), true);
  assert.strictEqual(f.played[0].stoppedAt, 1500); assert.strictEqual(f.timers.size, 0);
  f.advance(5000); assert.strictEqual(f.playback.getPosition(), 1200); assert(f.playback.resume());
  assert.strictEqual(f.played[1].value, 48); assert.strictEqual(f.played[1].offsetSeconds, 1.2);
  f.advance(5200); assert.strictEqual(f.playback.getPosition(), 1200);
  f.advance(5800); assert.strictEqual(f.playback.getPosition(), 1700); assert.strictEqual(f.played[2].value, 50);
  f.advance(6100); assert.strictEqual(f.playback.getPosition(), 2000);
  f.advance(12100); assert.strictEqual(f.playback.getPosition(), 8000); assert.strictEqual(f.stops, 1);
  assert.strictEqual(f.playback.isPlaying(), false); assert.strictEqual(f.playback.isPaused(), false); assert.strictEqual(f.timers.size, 0);
});

test('seek while paused preserves pause and resumes tied notes once at their original sample age', () => {
  let value = score(); value.parts[0].measures[0].events = [note('a'), note('b', 2), note('c', 4)];
  value = ties.connectWorkshopTies(value, ['a', 'b', 'c']); assert(value);
  const f = fixture(value); assert(f.playback.seek(1500));
  assert.strictEqual(f.playback.getPosition(), 1500); assert(f.playback.isPaused()); assert.strictEqual(f.played.length, 0);
  assert.deepStrictEqual(f.updates[f.updates.length - 1].ids, ['b']);
  f.playback.resume(); assert.strictEqual(f.played.length, 1); assert.strictEqual(f.played[0].offsetSeconds, 1.5);
  f.advance(500); assert.strictEqual(f.played.length, 1); assert.deepStrictEqual(f.updates[f.updates.length - 1].ids, ['c']);
  f.advance(1500); assert.strictEqual(f.played[0].stoppedAt, 1500); assert.strictEqual(f.stops, 0);
  f.advance(2500); assert.strictEqual(f.stops, 1); assert.strictEqual(f.playback.getPosition(), 4000);
});

test('seek restores full and half pedal state and releases inherited notes at the correct remaining time', () => {
  const value = score(); value.parts[0].measures[0].events = [note('pedal-down', 0, 'quarter', 48, { pedal:'down' }),
    note('second', 2, 'quarter', 52), rest('pedal-up', 6, { pedal:'up' })];
  const f = fixture(value); f.playback.seek(2500); f.playback.resume();
  assert.deepStrictEqual(f.played.map(sample => [sample.value, sample.offsetSeconds]), [[48, 2.5], [52, 1.5]]);
  assert.deepStrictEqual(f.updates[f.updates.length - 1].ids, []); f.advance(499); assert(f.played.every(sample => sample.stoppedAt === null));
  f.advance(500); assert(f.played.every(sample => sample.stoppedAt === 500)); f.playback.stop();
  const half = score(); half.parts[0].measures[0].events = [note('half-pedal', 0, 'quarter', 48)];
  half.parts[0].measures[0].directions = [{ id:'half-pedal-direction', type:'pedal', value:'half', startSlot:0 }];
  const h = fixture(half); h.playback.seek(1200); h.playback.resume(); assert.strictEqual(h.played[0].offsetSeconds, 1.2);
  h.advance(99); assert.strictEqual(h.played[0].stoppedAt, null); h.advance(100); assert.strictEqual(h.played[0].stoppedAt, 100); h.playback.stop();
  const expired = fixture(half); expired.playback.seek(1400); expired.playback.resume(); assert.strictEqual(expired.played.length, 0); expired.playback.stop();
});

test('performed timeline exposes repeat occurrences, original source slots and tempo-aware seek positions', () => {
  const value = score(3); value.parts[0].measures[0].repeatStart = true; value.parts[0].measures[1].repeatEnd = 2;
  value.parts[0].measures[0].events = [note('n0', 2)];
  value.parts[0].measures[1].events = [note('n1', 0, 'whole', 50)];
  value.parts[0].measures[1].directions = [{ id:'faster', type:'tempo', value:120, startSlot:0 }];
  value.parts[0].measures[2].events = [note('n2', 0, 'whole', 52)]; assert(model.isValidWorkshopScore(value));
  const f = fixture(value), timeline = f.playback.getTimeline();
  assert.deepStrictEqual(timeline.measures.map(bar => [bar.index, bar.measureIndex, bar.units, bar.startMs, bar.endMs]),
    [[0, 0, 8, 0, 4000], [1, 1, 8, 4000, 6000], [0, 2, 8, 6000, 10000], [1, 3, 8, 10000, 12000], [2, 4, 8, 12000, 14000]]);
  assert.deepStrictEqual(timeline.events.filter(event => event.id === 'n0').map(event => [event.startSlot, event.startMs, event.measureIndex]), [[2, 1000, 0], [2, 7000, 2]]);
  assert.strictEqual(f.playback.getDuration(), 14000); f.playback.seek(10500);
  assert.deepStrictEqual(f.playback.getPositionState(), { positionMs:10500, durationMs:14000, measureIndex:3, barIndex:1, playing:false, paused:true });
  f.playback.resume(); assert.strictEqual(f.played[0].value, 50); assert.strictEqual(f.played[0].offsetSeconds, .5);
  f.advance(1500); assert.strictEqual(f.played[1].value, 52); assert.strictEqual(f.playback.getPositionState().measureIndex, 4);
  f.advance(3500); assert.strictEqual(f.playback.getPositionState().barIndex, 2); assert.strictEqual(f.stops, 1);
});

test('seeking during playback cancels prior callbacks, clamps boundaries and preserves a valid restart', () => {
  const value = score(2); value.parts[0].measures.forEach((bar, index) => { bar.events = [note('n' + index, 0, 'whole', 48 + index)]; });
  const f = fixture(value, { delayMs:400 }); f.playback.start(); f.advance(1100);
  const stale = f.callbacks.slice(); assert(f.playback.seek(4500)); assert(f.playback.isPlaying()); assert.strictEqual(f.playback.getPosition(), 4500);
  assert.strictEqual(f.played[0].stoppedAt, 1100); assert.strictEqual(f.played[1].value, 49); assert.strictEqual(f.played[1].offsetSeconds, .5);
  const count = f.played.length, updates = f.updates.length; stale.forEach(callback => callback());
  assert.strictEqual(f.played.length, count); assert.strictEqual(f.updates.length, updates);
  assert.strictEqual(f.playback.seek(NaN), false); assert.strictEqual(f.playback.getPosition(), 4500);
  assert(f.playback.seek(9000)); assert.strictEqual(f.playback.getPosition(), 8000); assert.strictEqual(f.stops, 1); assert.strictEqual(f.timers.size, 0);
  assert(f.playback.seek(-10)); assert.strictEqual(f.playback.getPosition(), 0); assert(f.playback.isPaused());
  assert(f.playback.resume()); assert.strictEqual(f.played[f.played.length - 1].value, 48);
  f.playback.stop(); assert.strictEqual(f.stops, 2); f.playback.stop(); assert.strictEqual(f.stops, 2);
});

test('quarter-tone resume offsets use media playback rate and empty selected bars retain their local duration', () => {
  const value = score(2); value.parts[0].measures[0].events = [note('quarter-tone', 0, 'whole', 48.5)];
  const f = fixture(value); f.playback.seek(1000); f.playback.resume();
  assert(Math.abs(f.played[0].offsetSeconds - Math.pow(2, .5 / 12)) < 1e-10); f.playback.stop();
  const empty = fixture(value, { barIndex:1 }); assert.strictEqual(empty.playback.getDuration(), 4000);
  empty.playback.seek(1200); assert.strictEqual(empty.playback.getPositionState().barIndex, 1); empty.playback.resume();
  empty.advance(2800); assert.strictEqual(empty.played.length, 0); assert.strictEqual(empty.stops, 1); assert.strictEqual(empty.playback.getPosition(), 4000);
});

test('dense 102-bar scores continue beyond bar 66 with bounded timers and can seek near the end', () => {
  const value = score(102); value.bpm = 100;
  value.parts[0].measures.forEach((bar, barIndex) => { bar.events = Array.from({ length:16 }, (_, index) => note('n-' + barIndex + '-' + index, index / 2, 'sixteenth', 48 + index % 12)); });
  const f = fixture(value, { delayMs:250 }); assert(f.playback.start()); f.advance(f.playback.getDuration() + 250);
  assert.strictEqual(f.played.length, 1632); assert(f.steps.some(event => event.barIndex === 65)); assert(f.steps.some(event => event.barIndex === 101));
  assert.strictEqual(f.maxPending <= 5, true); assert.strictEqual(f.timers.size, 0); assert.strictEqual(f.playback.getPositionState().barIndex, 101);
  f.playback.seek(65 * 2400 + 400); const before = f.played.length; f.playback.resume();
  f.advance(f.playback.getDuration() + 250 + (f.playback.getDuration() - (65 * 2400 + 400)) + 250);
  assert(f.played.length > before + 500); assert.strictEqual(f.playback.getPosition(), f.playback.getDuration()); assert.strictEqual(f.timers.size, 0);
});

test('empty performed orders and invalid bar choices refuse playback while transport getters and cleanup remain safe', () => {
  const value = score(); value.parts[0].measures[0].events = [note('unused')]; value.parts[0].measures[0].ending = [2];
  assert(model.isValidWorkshopScore(value)); assert.deepStrictEqual(model.workshopPlaybackBarOrder(value), []);
  const empty = fixture(value); assert.strictEqual(empty.playback.start(), false); assert.strictEqual(empty.playback.seek(100), false);
  assert.deepStrictEqual(empty.playback.getPositionState(), { positionMs:0, durationMs:0, measureIndex:null, barIndex:null, playing:false, paused:false });
  empty.playback.stop(); assert.strictEqual(empty.played.length, 0); assert.strictEqual(empty.timers.size, 0);
  const invalid = fixture(score(), { barIndex:4 }); assert.strictEqual(invalid.playback.start(), false);
  assert(Number.isFinite(invalid.playback.getPositionState().positionMs)); invalid.playback.stop(); assert.strictEqual(invalid.timers.size, 0);
});

if (process.env.WORKSHOP_REFERENCE_XML) {
  test('the supplied Canon reference plays all 102 imported bars and restarts beyond the reported cutoff', () => {
    const imported = importWorkshopMusicXmlText(fs.readFileSync(process.env.WORKSHOP_REFERENCE_XML, 'utf8'));
    const f = fixture(imported.score, { delayMs:200 }); const timeline = f.playback.getTimeline();
    assert.strictEqual(timeline.measures.length, 102); assert(f.playback.start()); f.advance(f.playback.getDuration() + 200);
    assert.strictEqual(f.played.length, 1589); assert.strictEqual(f.steps.length, 1603); assert.strictEqual(f.playback.getPositionState().barIndex, 101);
    assert(f.steps.some(event => event.barIndex === 65 && event.value !== null)); assert(f.maxPending < 20); assert.strictEqual(f.timers.size, 0);
    f.playback.seek(timeline.measures[65].startMs); const before = f.played.length; f.playback.resume();
    f.advance(f.playback.getDuration() + 200 + f.playback.getDuration() - timeline.measures[65].startMs + 200);
    assert(f.played.length > before + 400); assert.strictEqual(f.playback.getPositionState().barIndex, 101); assert.strictEqual(f.timers.size, 0);
  });
}
console.log(tests + ' workshop playback transport checks passed.');

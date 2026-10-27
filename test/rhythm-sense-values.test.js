const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');

const filename = path.resolve(__dirname, '../src/model/RhythmSense.js');
const loaded = { exports: {} };
new Function('module', 'exports', babel.transform(fs.readFileSync(filename, 'utf8'), {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code)(loaded, loaded.exports);
const rhythm = loaded.exports;
const ALL = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond', 'sixtyFourth'];
const TICKS = { whole: 64, half: 32, quarter: 16, eighth: 8, sixteenth: 4, thirtySecond: 2, sixtyFourth: 1 };
const METER_TICKS = { '4/4': 64, '3/4': 48, '2/4': 32, '6/8': 48, '9/8': 72 };
const defaults = ['whole', 'half', 'quarter'];
assert.deepStrictEqual(rhythm.RHYTHM_SENSE_NOTE_VALUES, ALL);
assert.deepStrictEqual(rhythm.RHYTHM_SENSE_DEFAULT_NOTE_VALUES, defaults);
assert(Object.isFrozen(rhythm.RHYTHM_SENSE_NOTE_VALUES));
assert(Object.isFrozen(rhythm.RHYTHM_SENSE_DEFAULT_NOTE_VALUES));
for(const raw of [undefined, null, '', 'sixteenth', {}, 42, [], ['invalid'], ['dottedQuarter', 'dottedEighth']]) {
  assert.deepStrictEqual(rhythm.normalizeRhythmSenseNoteValues(raw), defaults);
}
const normalized = rhythm.normalizeRhythmSenseNoteValues(['sixtyFourth', 'quarter', 'quarter', 'invalid', 'half']);
assert.deepStrictEqual(normalized, ['half', 'quarter', 'sixtyFourth']);
normalized.push('whole');
assert.deepStrictEqual(rhythm.normalizeRhythmSenseNoteValues(null), defaults, 'returned arrays cannot mutate defaults');
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(defaults, '4/4'), true);
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(defaults, '6/8'), true);
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(defaults, '9/8'), false);
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(['whole'], '3/4'), false);
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(['half'], '6/8'), false);
assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(['whole', 'eighth'], '9/8'), true);
assert.throws(() => rhythm.rhythmSenseSelectionFitsMeter(ALL, '5/8'), RangeError);

// Independently enumerate reachable lengths; this also checks invalid selections
// without depending on the generator's powers-of-two divisibility shortcut.
function reachable(values, total) {
  const lengths = new Set([0]);
  for(let length = 1; length <= total; length++) {
    if(values.some(value => lengths.has(length - TICKS[value]))) lengths.add(length);
  }
  return lengths;
}
function verifyBar(events, values, total, meter) {
  let position = 0;
  assert(events.length > 0 && events.length <= total);
  events.forEach((event, index) => {
    assert.strictEqual(event.id, index);
    assert(values.includes(event.value), `${meter}: ${event.value} was not selected`);
    assert.strictEqual(event.duration * 16, TICKS[event.value]);
    assert.strictEqual(event.beat * 16, position);
    assert.strictEqual(Number.isInteger(event.beat * 16), true);
    position += TICKS[event.value];
    assert(position <= total, 'a note cannot run over the bar line');
  });
  assert.strictEqual(position, total, 'every selected pattern fills the bar exactly');
}
let checkedSelections = 0, checkedPatterns = 0;
for(let mask = 1; mask < 128; mask++) {
  const values = ALL.filter((_, index) => mask & (1 << index));
  const original = JSON.stringify(values);
  for(const meter of rhythm.RHYTHM_SENSE_METERS) {
    checkedSelections++;
    const total = METER_TICKS[meter], lengths = reachable(values, total);
    const fits = lengths.has(total);
    assert.strictEqual(rhythm.rhythmSenseSelectionFitsMeter(values, meter), fits, `${meter}: ${values}`);
    if(!fits) {
      for(const seed of [0, 1, 19]) {
        assert.throws(() => rhythm.createRhythmSenseBar(seed, meter, values), RangeError);
      }
      assert.throws(() => rhythm.createRhythmSensePatternPicker(meter, null, () => 0, values), RangeError);
      continue;
    }
    const seen = new Set(), signatures = new Set();
    for(let seed = 0; seed < 24; seed++) {
      const events = rhythm.createRhythmSenseBar(seed, meter, values);
      verifyBar(events, values, total, meter);
      assert.deepStrictEqual(events, rhythm.createRhythmSenseBar(seed, meter, values.slice().reverse()),
        'selection ordering must not change the deterministic seed');
      events.forEach(event => seen.add(event.value));
      signatures.add(events.map(event => event.value).join(','));
      checkedPatterns++;
    }
    values.filter(value => lengths.has(total - TICKS[value])).forEach(value => {
      assert(seen.has(value), `${meter}: enabled feasible value ${value} disappeared from the generated series`);
    });
    let randomSeed = 23;
    const random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
    for(const rng of [() => 0, random]) {
      const picker = rhythm.createRhythmSensePatternPicker(meter, 0, rng, values);
      let previous = rhythm.createRhythmSenseBar(0, meter, values).map(event => event.value).join(',');
      for(let round = 0; round < 25; round++) {
        const index = picker();
        assert(Number.isSafeInteger(index) && index >= 0);
        const events = rhythm.createRhythmSenseBar(index, meter, values);
        verifyBar(events, values, total, meter);
        const signature = events.map(event => event.value).join(',');
        if(signatures.size > 1) assert.notStrictEqual(signature, previous,
          `${meter}/${values}: picker repeats despite distinct available rhythms`);
        previous = signature;
      }
    }
    assert.strictEqual(JSON.stringify(values), original, 'generation and picking never mutate the selection');
  }
}
assert.strictEqual(checkedSelections, 635, 'all 127 nonempty subsets in all five meters are covered');

for(const value of ALL) {
  for(const meter of rhythm.RHYTHM_SENSE_METERS) {
    if(!rhythm.rhythmSenseSelectionFitsMeter([value], meter)) continue;
    const picker = rhythm.createRhythmSensePatternPicker(meter, null, () => .5, [value]);
    for(let repeat = 0; repeat < 20; repeat++) {
      const events = rhythm.createRhythmSenseBar(picker(), meter, [value]);
      assert(events.every(event => event.value === value), 'single-pattern catalogs remain playable indefinitely');
    }
  }
}
for(const value of ['thirtySecond', 'sixtyFourth']) {
  for(const meter of rhythm.RHYTHM_SENSE_METERS) {
    for(const bpm of rhythm.RHYTHM_SENSE_TEMPOS) {
      const events = rhythm.createRhythmSenseBar(0, meter, [value]);
      const gap = rhythm.rhythmSenseUnitMs(bpm, meter) * TICKS[value] / 16;
      const played = events.map(() => null);
      for(let index = 0; index < events.length; index++) {
        const at = rhythm.rhythmSenseOnsetMs(events[index], bpm, meter);
        assert(Math.abs(at - gap * index) < 1e-8);
        const windows = rhythm.rhythmSenseWindows(events, index, bpm, meter);
        assert(windows.preciseMs > 0 && windows.outerMs > windows.preciseMs);
        assert(windows.outerMs < gap / 2, 'adjacent dense targets keep separate acceptance windows');
        const offset = (windows.preciseMs + windows.outerMs) / 2;
        assert.strictEqual(rhythm.rhythmSenseTap(events, played, at - offset, bpm, meter).result, 'early');
        assert.strictEqual(rhythm.rhythmSenseTap(events, played, at + offset, bpm, meter).result, 'late');
        assert.strictEqual(rhythm.rhythmSenseTap(events, played, at - windows.outerMs - .01, bpm, meter).result, 'too-early');
        assert.strictEqual(rhythm.rhythmSenseTap(events, played, at + windows.outerMs + .01, bpm, meter).result, 'too-late');
        const exact = rhythm.rhythmSenseTap(events, played, at, bpm, meter);
        assert.strictEqual(exact.result, 'correct'); assert.strictEqual(exact.index, index);
        played[index] = exact.result;
      }
      assert.strictEqual(rhythm.rhythmSenseTap(events, played, events.length * gap, bpm, meter).result, 'extra');
      const evaluation = rhythm.evaluateRhythmSenseRound(events, played);
      assert.strictEqual(evaluation.correct, events.length);
      assert.deepStrictEqual(evaluation.byValue, [{ value, total: events.length, correct: events.length,
        early: 0, late: 0, missed: 0 }]);
      const options = { sessionId: 'dense', barNumber: 1, meter, bpm, roundLength: 3,
        noteValues: [value], events, results: played, acceptedOffsets: events.map(() => 0),
        completedAt: '2026-10-05T10:00:00.000Z' };
      const record = rhythm.createRhythmSenseBarRecord(options);
      assert.deepStrictEqual(record.settings.noteValues, [value]);
      assert.strictEqual(record.notes.length, events.length);
      assert(record.notes.every(note => note.value === value && note.offsetMs === 0));
      assert.strictEqual(record.score.correct, events.length);
      assert.strictEqual(record.timing.evaluatedInputs, events.length);
      assert.strictEqual(record.durationMs, rhythm.rhythmSenseBarDurationMs(bpm, meter));
      assert.strictEqual(Date.parse(record.completedAt) - Date.parse(record.startedAt), record.durationMs);
      delete options.noteValues;
      assert.strictEqual(Object.prototype.hasOwnProperty.call(rhythm.createRhythmSenseBarRecord(options).settings, 'noteValues'), false,
        'legacy saved records do not acquire new default metadata');
    }
  }
}

// Existing deterministic fixtures without a selected-values argument remain stable.
assert.deepStrictEqual(rhythm.createRhythmSenseBar(0).map(event => event.value),
  ['quarter', 'eighth', 'eighth', 'quarter', 'quarter']);
assert.deepStrictEqual(rhythm.createRhythmSenseBar(4).map(event => event.value),
  ['quarter', 'dottedEighth', 'sixteenth', 'quarter', 'quarter']);
assert(rhythm.createRhythmSenseBar(0, '4/4', defaults).every(event => defaults.includes(event.value)));
assert.throws(() => rhythm.createRhythmSenseBar(-1, '4/4', ALL), RangeError);
assert.throws(() => rhythm.createRhythmSenseBar(1.5, '4/4', ALL), RangeError);
assert.throws(() => rhythm.createRhythmSenseBar(Number.MAX_SAFE_INTEGER + 1, '4/4', ALL), RangeError);
verifyBar(rhythm.createRhythmSenseBar(Number.MAX_SAFE_INTEGER, '9/8', ALL), ALL, 72, '9/8');
process.stdout.write(`Rhythm Sense note-value selection tests passed (${checkedSelections} selections, ${checkedPatterns} deterministic patterns)\n`);

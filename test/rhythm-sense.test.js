const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const babel = require('babel-core');

const filename = path.resolve(__dirname, '../src/model/RhythmSense.js');
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = function transpile(loadedModule, file) {
  if (file !== filename) return originalLoader(loadedModule, file);
  const transformed = babel.transform(fs.readFileSync(file, 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  });
  return loadedModule._compile(transformed.code, file);
};
const rhythm = require(filename);
Module._extensions['.js'] = originalLoader;
const componentHelpers = {};
for(const name of ['RhythmSensePreferences', 'RhythmSenseDenseLayout', 'RhythmSenseHaptics']) {
  const helperModule = { exports: {} };
  const code = babel.transform(fs.readFileSync(path.resolve(__dirname, '../src/model/' + name + '.js'), 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code;
  new Function('module', 'exports', code)(helperModule, helperModule.exports);
  componentHelpers[name] = helperModule.exports;
}

assert.deepStrictEqual(rhythm.RHYTHM_SENSE_TEMPOS, [60, 80, 100, 120]);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(60), 4000);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(120), 2000);
assert.deepStrictEqual(rhythm.RHYTHM_SENSE_METERS, ['4/4', '3/4', '2/4', '6/8', '9/8']);
assert.strictEqual(rhythm.rhythmSenseBeatsPerBar('3/4'), 3);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(80, '3/4'), 2250);
assert.strictEqual(rhythm.rhythmSenseBeatsPerBar('2/4'), 2);
assert.strictEqual(rhythm.rhythmSenseBarUnits('2/4'), 2);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(80, '2/4'), 1500);
assert.strictEqual(rhythm.rhythmSenseBeatsPerBar('6/8'), 2);
assert.strictEqual(rhythm.rhythmSenseBarUnits('6/8'), 3);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(80, '6/8'), 1500);
assert.strictEqual(rhythm.rhythmSenseUnitMs(80, '6/8'), 500);
assert.strictEqual(rhythm.rhythmSenseBeatsPerBar('9/8'), 3);
assert.strictEqual(rhythm.rhythmSenseBarUnits('9/8'), 4.5);
assert.strictEqual(rhythm.rhythmSenseBarDurationMs(80, '9/8'), 2250);
assert.strictEqual(rhythm.rhythmSenseUnitMs(80, '9/8'), 500);
assert.throws(() => rhythm.rhythmSenseBeatsPerBar('5/8'), RangeError);
assert.strictEqual(rhythm.rhythmSenseBeatMs(80), 750);
assert.throws(() => rhythm.rhythmSenseBeatMs(0), RangeError);

for (let pattern = 0; pattern < 5; pattern++) {
  const events = rhythm.createRhythmSenseBar(pattern);
  assert.strictEqual(events.reduce((sum, event) => sum + event.duration, 0), 4);
  assert.strictEqual(events[0].beat, 0);
}
const generated = [];
for(let pattern = 5; pattern < 505; pattern++) {
  const bar = rhythm.createRhythmSenseBar(pattern);
  assert.strictEqual(bar.reduce((sum, event) => sum + event.duration, 0), 4);
  assert.strictEqual(bar[0].beat, 0);
  assert(bar.filter(event => event.value === 'sixteenth').length <= 4);
  assert(bar.filter(event => event.value === 'dottedEighth').length <= 1);
  bar.forEach((event, index) => {
    if(index) assert.strictEqual(event.beat, bar[index - 1].beat + bar[index - 1].duration);
  });
  generated.push(bar.map(event => event.value).join(','));
}
assert(new Set(generated).size > 20, 'new rhythms should offer real variety');
for(const value of ['whole', 'half', 'quarter', 'dottedEighth', 'eighth', 'sixteenth']) {
  assert(generated.some(pattern => pattern.split(',').includes(value)),
    `new rhythms should include ${value} notes`);
}
assert(generated.slice(1).every((pattern, index) => pattern !== generated[index]),
  'another rhythm should not repeat the previous bar');
assert.notStrictEqual(generated[0], rhythm.createRhythmSenseBar(4).map(event => event.value).join(','));
assert.throws(() => rhythm.createRhythmSenseBar(-1), RangeError);
for(const meter of rhythm.RHYTHM_SENSE_METERS){
  let seed = 23;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = rhythm.createRhythmSensePatternPicker(meter, null, random);
  const signatures = [];
  const firstTiers = [];
  for(let bar = 0; bar < 60; bar++){
    const events = rhythm.createRhythmSenseBar(pick(), meter);
    assert.strictEqual(events.reduce((sum, event) => sum + event.duration, 0), rhythm.rhythmSenseBarUnits(meter));
    const signature = events.map(event => event.value).join(',');
    assert.notStrictEqual(signature, signatures[signatures.length - 1], `${meter} repeats a bar immediately`);
    signatures.push(signature);
    if(bar < 3){
      firstTiers.push(events.some(event => ['sixteenth', 'dottedEighth'].includes(event.value))
        ? 'dense' : events.length <= rhythm.rhythmSenseBeatsPerBar(meter) ? 'simple' : 'varied');
    }
  }
  assert.deepStrictEqual(firstTiers.sort(), ['dense', 'simple', 'varied'], `${meter} should mix three densities`);
  assert(new Set(signatures).size >= 8, `${meter} should offer varied rhythms`);
}
assert.throws(() => rhythm.createRhythmSensePatternPicker('5/8'), RangeError);
assert.deepStrictEqual(new Set(rhythm.createRhythmSenseBar(2).map(event => event.value)),
  new Set(['quarter', 'eighth', 'sixteenth']));
assert.strictEqual(rhythm.createRhythmSenseBar(3)[0].value, 'whole');
const dottedEighthBar = rhythm.createRhythmSenseBar(4);
assert.deepStrictEqual(dottedEighthBar.slice(1, 3).map(event => [event.value, event.beat]),
  [['dottedEighth', 1], ['sixteenth', 1.75]]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(dottedEighthBar[2], 80), 1312.5);
assert.strictEqual(rhythm.rhythmSenseTap(dottedEighthBar, ['correct', 'correct', null, null, null], 1312.5, 80).result, 'correct');
for(let pattern = 0; pattern < 250; pattern++) {
  const bar = rhythm.createRhythmSenseBar(pattern, '3/4');
  assert.strictEqual(bar.reduce((sum, event) => sum + event.duration, 0), 3);
  assert.strictEqual(bar[0].beat, 0);
  assert(bar.filter(event => event.value === 'sixteenth').length <= 4);
  assert(bar.filter(event => event.value === 'dottedEighth').length <= 1);
  assert(bar.every(event => event.value !== 'whole'));
}
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '3/4'))
  .some(bar => bar.some(event => event.value === 'dottedEighth')));
const threeFourDotted = rhythm.createRhythmSenseBar(4, '3/4');
assert.deepStrictEqual(threeFourDotted.slice(1, 3).map(event => [event.value, event.beat]),
  [['dottedEighth', 1], ['sixteenth', 1.75]]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(threeFourDotted[2], 80, '3/4'), 1312.5);
assert.strictEqual(rhythm.rhythmSenseTap(threeFourDotted,
  ['correct', 'correct', null, null], 1312.5, 80, '3/4').result, 'correct');
for(let pattern = 0; pattern < 250; pattern++) {
  const bar = rhythm.createRhythmSenseBar(pattern, '2/4');
  assert.strictEqual(bar.reduce((sum, event) => sum + event.duration, 0), 2);
  assert.strictEqual(bar[0].beat, 0);
  assert(bar.every(event => event.beat < 2 && event.value !== 'whole'));
  assert(bar.filter(event => event.value === 'dottedEighth').length <= 1);
}
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '2/4'))
  .some(bar => bar.some(event => event.value === 'dottedEighth')));
const twoFourDotted = rhythm.createRhythmSenseBar(4, '2/4');
assert.deepStrictEqual(twoFourDotted.slice(1).map(event => [event.value, event.beat]),
  [['dottedEighth', 1], ['sixteenth', 1.75]]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(twoFourDotted[2], 80, '2/4'), 1312.5);
assert.strictEqual(rhythm.rhythmSenseTap(twoFourDotted,
  ['correct', 'correct', null], 1312.5, 80, '2/4').result, 'correct');
assert.strictEqual(rhythm.rhythmSenseOnsetMs({ beat: 1 }, 80, '2/4'), 750);
for(let pattern = 0; pattern < 250; pattern++) {
  const bar = rhythm.createRhythmSenseBar(pattern, '6/8');
  assert.strictEqual(bar.reduce((sum, event) => sum + event.duration, 0), 3);
  assert.strictEqual(bar[0].beat, 0);
  assert(bar.some(event => event.beat === 1.5), 'the two dotted-quarter groups stay distinct');
  assert(bar.every(event => ['dottedQuarter', 'quarter', 'dottedEighth', 'eighth', 'sixteenth'].includes(event.value)));
  assert(bar.filter(event => event.value === 'sixteenth').length <= 2);
  assert(bar.filter(event => event.value === 'dottedEighth').length <= 1);
}
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '6/8'))
  .some(bar => bar.some(event => event.value === 'sixteenth')));
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '6/8'))
  .some(bar => bar.some(event => event.value === 'dottedEighth')));
const sixEight = rhythm.createRhythmSenseBar(0, '6/8');
assert.strictEqual(rhythm.rhythmSenseOnsetMs(sixEight[1], 80, '6/8'), 250);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(sixEight[3], 80, '6/8'), 750);
assert.strictEqual(rhythm.rhythmSenseTap(sixEight, [null, ...sixEight.slice(1).map(() => null)], 0, 80, '6/8').result, 'correct');
assert.strictEqual(rhythm.rhythmSenseTap(sixEight, ['correct', ...sixEight.slice(1).map(() => null)], 250, 80, '6/8').result, 'correct');
const sixteenthBar = rhythm.createRhythmSenseBar(4, '6/8');
assert.deepStrictEqual(sixteenthBar.slice(0, 4).map(event => event.beat), [0, 0.5, 0.75, 1]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(sixteenthBar[2], 80, '6/8'), 375);
assert.strictEqual(rhythm.rhythmSenseTap(sixteenthBar, ['correct', 'correct', null, null, null, null], 375, 80, '6/8').result, 'correct');
const sixEightDotted = rhythm.createRhythmSenseBar(5, '6/8');
assert.deepStrictEqual(sixEightDotted.map(event => [event.value, event.beat]),
  [['dottedEighth', 0], ['sixteenth', 0.75], ['eighth', 1], ['dottedQuarter', 1.5]]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(sixEightDotted[1], 80, '6/8'), 375);
assert.strictEqual(rhythm.rhythmSenseTap(sixEightDotted,
  ['correct', null, null, null], 375, 80, '6/8').result, 'correct');
for(let pattern = 0; pattern < 250; pattern++) {
  const bar = rhythm.createRhythmSenseBar(pattern, '9/8');
  assert.strictEqual(bar.reduce((sum, event) => sum + event.duration, 0), 4.5);
  assert.strictEqual(bar[0].beat, 0);
  assert(bar.some(event => event.beat === 1.5));
  assert(bar.some(event => event.beat === 3));
  assert(bar.every(event => ['dottedQuarter', 'quarter', 'dottedEighth', 'eighth', 'sixteenth'].includes(event.value)));
  assert(bar.filter(event => event.value === 'sixteenth').length <= 2);
  assert(bar.filter(event => event.value === 'dottedEighth').length <= 1);
}
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '9/8'))
  .some(bar => bar.some(event => event.value === 'sixteenth')));
assert(Array.from({ length: 250 }, (_, index) => rhythm.createRhythmSenseBar(index, '9/8'))
  .some(bar => bar.some(event => event.value === 'dottedEighth')));
const nineEight = rhythm.createRhythmSenseBar(0, '9/8');
assert.strictEqual(rhythm.rhythmSenseOnsetMs(nineEight[6], 80, '9/8'), 1500);
assert.strictEqual(rhythm.rhythmSenseTap(nineEight, Array(6).fill('correct').concat(Array(3).fill(null)), 1500, 80, '9/8').result, 'correct');
const nineSixteenthBar = rhythm.createRhythmSenseBar(4, '9/8');
assert.deepStrictEqual(nineSixteenthBar.slice(0, 4).map(event => event.beat), [0, 0.5, 0.75, 1]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(nineSixteenthBar[2], 80, '9/8'), 375);
assert.strictEqual(rhythm.rhythmSenseTap(nineSixteenthBar,
  ['correct', 'correct', ...nineSixteenthBar.slice(2).map(() => null)], 375, 80, '9/8').result, 'correct');
const nineEightDotted = rhythm.createRhythmSenseBar(5, '9/8');
assert.deepStrictEqual(nineEightDotted.map(event => [event.value, event.beat]),
  [['dottedEighth', 0], ['sixteenth', 0.75], ['eighth', 1],
    ['dottedQuarter', 1.5], ['dottedQuarter', 3]]);
assert.strictEqual(rhythm.rhythmSenseOnsetMs(nineEightDotted[1], 80, '9/8'), 375);
assert.strictEqual(rhythm.rhythmSenseTap(nineEightDotted,
  ['correct', null, null, null, null], 375, 80, '9/8').result, 'correct');

const events = rhythm.createRhythmSenseBar(0);
const results = events.map(() => null);
assert.strictEqual(rhythm.rhythmSenseTap(events, results, -300).result, 'too-early');
assert.strictEqual(rhythm.rhythmSenseTap(events, results, 0).result, 'correct');
assert.strictEqual(rhythm.rhythmSenseTap(events, results, 140).result, 'late');
assert.strictEqual(rhythm.rhythmSenseTap(events, results, 300).result, 'too-late');
results[0] = 'correct';
assert.strictEqual(rhythm.rhythmSenseTap(events, results, 0).result, 'too-early');
assert.strictEqual(rhythm.rhythmSenseTap(events, results, 750).index, 1);
assert.ok(rhythm.rhythmSenseWindows(rhythm.createRhythmSenseBar(2), 4).outerMs < 180);

for (const bpm of rhythm.RHYTHM_SENSE_TEMPOS) {
  const beatMs = 60000 / bpm;
  assert.strictEqual(rhythm.rhythmSenseOnsetMs(events[1], bpm), beatMs);
  const firstPlayed = ['correct', ...events.slice(1).map(() => null)];
  assert.strictEqual(rhythm.rhythmSenseTap(events, firstPlayed, beatMs, bpm).result, 'correct');
}
assert(rhythm.rhythmSenseWindows(rhythm.createRhythmSenseBar(2), 4, 120).outerMs
  < rhythm.rhythmSenseWindows(rhythm.createRhythmSenseBar(2), 4, 60).outerMs);

assert.deepStrictEqual(
  rhythm.summarizeRhythmSenseResults(Array(5).fill(null), ['correct', 'early', 'late', 'missed', null]),
  { total: 5, correct: 1, early: 1, late: 1, missed: 2 }
);
assert.deepStrictEqual(
  rhythm.summarizeRhythmSenseResults([], []),
  { total: 0, correct: 0, early: 0, late: 0, missed: 0 }
);
const evaluated = rhythm.evaluateRhythmSenseRound(
  rhythm.createRhythmSenseBar(1), ['correct', 'early', null]
);
assert.strictEqual(evaluated.precisionPercent, 33);
assert.strictEqual(evaluated.hitCount, 2);
assert.strictEqual(evaluated.hitPercent, 67);
assert.deepStrictEqual(evaluated.byValue, [
  { value: 'half', total: 1, correct: 1, early: 0, late: 0, missed: 0 },
  { value: 'quarter', total: 2, correct: 0, early: 1, late: 0, missed: 1 }
]);
const savedBar = rhythm.createRhythmSenseBarRecord({
  sessionId: 'session-a', barNumber: 2, meter: '4/4', bpm: 80, roundLength: 3,
  events: rhythm.createRhythmSenseBar(1), results: ['correct', 'early', 'missed'],
  tapMarkers: [
    { targetIndex: 0, offsetMs: 40, result: 'correct' },
    { targetIndex: 1, offsetMs: -120, result: 'early' }
  ],
  completedAt: '2026-09-28T12:00:00.000Z'
});
assert.strictEqual(savedBar.id, 'session-a:bar:2');
assert.deepStrictEqual(savedBar.score, {
  evaluatedInputs: 3, correct: 1, wrong: 1, missed: 1, accuracy: 33
});
assert.strictEqual(savedBar.timing.totalAbsoluteOffsetMs, 160);
assert.strictEqual(savedBar.timing.averageAbsoluteOffsetMs, 80);
assert.deepStrictEqual(savedBar.notes.map(note => note.offsetMs), [40, -120, null]);
assert.strictEqual(savedBar.settings.meter, '4/4');
const retainedTiming = rhythm.createRhythmSenseBarRecord({
  sessionId: 'session-a', barNumber: 3, meter: '4/4', bpm: 80, roundLength: 3,
  events: rhythm.createRhythmSenseBar(1), results: ['correct', 'early', 'missed'],
  tapMarkers: [], acceptedOffsets: [40, -120, null],
  completedAt: '2026-09-28T12:00:03.000Z'
});
assert.deepStrictEqual(retainedTiming.notes.map(note => note.offsetMs), [40, -120, null],
  'timing persists even when visual tap markers were trimmed');
assert.deepStrictEqual(rhythm.evaluateRhythmSenseRound([], []), {
  total: 0, correct: 0, early: 0, late: 0, missed: 0,
  hitCount: 0, precisionPercent: 0, hitPercent: 0, byValue: []
});
const mergedEvaluation = rhythm.mergeRhythmSenseEvaluations(
  evaluated,
  rhythm.evaluateRhythmSenseRound(rhythm.createRhythmSenseBar(1),
    ['correct', 'correct', 'correct'])
);
assert.strictEqual(mergedEvaluation.total, 6);
assert.strictEqual(mergedEvaluation.correct, 4);
assert.strictEqual(mergedEvaluation.early, 1);
assert.strictEqual(mergedEvaluation.missed, 1);
assert.strictEqual(mergedEvaluation.precisionPercent, 67);
assert.deepStrictEqual(mergedEvaluation.byValue, [
  { value: 'half', total: 2, correct: 2, early: 0, late: 0, missed: 0 },
  { value: 'quarter', total: 4, correct: 2, early: 1, late: 0, missed: 1 }
]);

const componentSource = fs.readFileSync(path.resolve(__dirname, '../src/components/RhythmSense.vue'), 'utf8');
const componentScript = componentSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const compiledComponent = babel.transform(componentScript, {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code;
const componentModule = { exports: {} };
const testOptions = { appVolume: 100, rhythmSenseSettings: null, saveOptions() {} };
const savedRhythmBars = [];
new Function('module', 'exports', 'require', compiledComponent)(
  componentModule, componentModule.exports,
  name => name.endsWith('/RhythmSense') ? rhythm : name.endsWith('/AppVolume')
    ? { appVolumeToAudioLevel: value => value / 100 }
    : name.endsWith('/RhythmSenseRoundStorage') ? { __esModule: true, default: {
      saveBar(record) { savedRhythmBars.push(record); return Promise.resolve({ saved: true }); }
    } }
    : name.endsWith('/AppSound') ? { getAppAudioDestination:context=>context.destination }
    : name.endsWith('/ScreenAwakeMixin') ? {createScreenAwakeMixin:()=>({})}
    : name.endsWith('/Options') ? testOptions : componentHelpers[name.split('/').pop()] || {}
);
const component = componentModule.exports.default;
const instance = Object.assign(component.data(), { $refs: {}, $set(array, index, value) { array[index] = value; } });
Object.keys(component.methods).forEach(name => { instance[name] = component.methods[name].bind(instance); });
Object.defineProperty(instance, 'isRunning', { get() { return component.computed.isRunning.call(instance); } });
Object.defineProperty(instance, 'beatCount', { get() { return component.computed.beatCount.call(instance); } });
Object.defineProperty(instance, 'displayedCount', { get() { return component.computed.displayedCount.call(instance); } });
Object.defineProperty(instance, 'beamGroups', { get() { return component.computed.beamGroups.call(instance); } });
Object.defineProperty(instance, 'secondaryBeamGroups', { get() { return component.computed.secondaryBeamGroups.call(instance); } });
Object.defineProperty(instance, 'selectionFitsMeter', { get() { return component.computed.selectionFitsMeter.call(instance); } });
Object.defineProperty(instance, 'usesDenseScore', { get() { return component.computed.usesDenseScore.call(instance); } });
assert.strictEqual(instance.screen, 'menu');
assert.strictEqual(instance.mobileNoteValue('dottedEighth'), '3/16');
assert(componentSource.includes('v-if="screen === \'menu\'" class="sense-menu"'));
assert(componentSource.includes('class="sense-start-card"'));
assert(componentSource.indexOf("@click=\"beginTraining\"") < componentSource.indexOf("<h2>{{$t('RHYTHM_ROUND_LENGTH')}}</h2>"));
assert(componentSource.indexOf("<h2>{{$t('RHYTHM_ROUND_LENGTH')}}</h2>") < componentSource.indexOf("<h2>{{$t('RHYTHM_TEMPO')}}</h2>"));
assert(componentSource.indexOf("<h2>{{$t('RHYTHM_TEMPO')}}</h2>") < componentSource.indexOf("<h2>{{$t('RHYTHM_METER')}}</h2>"));
assert(componentSource.includes('class="sense-training-heading"'));
assert(componentSource.includes('v-if="screen === \'training\'" class="sense-card sense-exercise"'));
let startedFromMenu = 0;
instance.$nextTick = callback => callback();
instance.start = () => { startedFromMenu += 1; };
instance.beginTraining();
assert.strictEqual(instance.screen, 'training');
assert.strictEqual(startedFromMenu, 1, 'menu starts the preview automatically');
assert.strictEqual(typeof instance.patternPicker, 'function');
const firstRhythm = instance.events.map(event => event.value).join(',');
instance.changePattern();
assert.notStrictEqual(instance.events.map(event => event.value).join(','), firstRhythm,
  'another pattern does not repeat the visible bar');
instance.phase = 'practice';
instance.exitTraining();
assert.strictEqual(instance.screen, 'menu', 'back from training returns to the tempo menu');
assert.strictEqual(instance.phase, 'idle');
let leftMode = 0;
instance.$emit = event => { if(event === 'back') leftMode += 1; };
instance.exitTraining();
assert.strictEqual(leftMode, 1, 'back from menu returns to the home page');
instance.start = component.methods.start.bind(instance);
instance.setMeter('3/4');
assert.strictEqual(instance.beatCount, 3);
assert.strictEqual(instance.events.reduce((sum, event) => sum + event.duration, 0), 3);
assert.strictEqual(instance.mobileNoteX({ beat: 2.5 }), 296);
instance.events = threeFourDotted;
assert(instance.isAfterDottedEighth(instance.events[2]));
assert.strictEqual(instance.mobileNoteX(instance.events[2]), 220);
instance.events = rhythm.createRhythmSenseBar(0, '3/4');
instance.phase = 'countin';
instance.$t = key => key;
assert.strictEqual(component.computed.statusText.call(instance), 'RHYTHM_COUNT_IN_3');
instance.phase = 'idle';
instance.setMeter('2/4');
assert.strictEqual(instance.beatCount, 2);
assert.strictEqual(instance.displayedCount, 2);
assert.strictEqual(instance.events.reduce((sum, event) => sum + event.duration, 0), 2);
instance.events = twoFourDotted;
assert(instance.isAfterDottedEighth(instance.events[2]));
assert.strictEqual(instance.mobileNoteX(instance.events[2]), 307);
instance.events = rhythm.createRhythmSenseBar(0, '2/4');
instance.phase = 'countin';
assert.strictEqual(component.computed.statusText.call(instance), 'RHYTHM_COUNT_IN_2');
instance.phase = 'idle';
instance.setMeter('6/8');
instance.events = rhythm.createRhythmSenseBar(0, '6/8');
assert.strictEqual(instance.beatCount, 2);
assert.strictEqual(instance.displayedCount, 6);
assert.deepStrictEqual(instance.beamGroups, [{ start: 0, end: 2 }, { start: 3, end: 5 }]);
assert.strictEqual(instance.mobileNoteX({ beat: 0 }), 60);
assert.strictEqual(instance.mobileNoteX({ beat: 1.5 }), 225);
assert.strictEqual(instance.mobileNoteX({ beat: 2.5 }), 315);
assert(instance.isBeamed(instance.events[1]));
instance.events = sixteenthBar;
assert.deepStrictEqual(instance.secondaryBeamGroups,
  [{ start: 0, end: 3, secondaryStart: 1, secondaryEnd: 2 }]);
assert(instance.isBeamed(instance.events[2]));
instance.events = sixEightDotted;
assert(instance.isAfterDottedEighth(instance.events[1]));
assert.strictEqual(instance.mobileNoteX(instance.events[1]), 127.5);
assert.strictEqual(instance.beamGroups.length, 0, 'the mixed dotted group keeps individual flags');
instance.events = sixEight;
instance.phase = 'countin';
assert.strictEqual(component.computed.statusText.call(instance), 'RHYTHM_COUNT_IN_6_8');
instance.phase = 'idle';
instance.noteValues = ['quarter', 'eighth'];
instance.setMeter('9/8');
instance.events = rhythm.createRhythmSenseBar(0, '9/8');
assert.strictEqual(instance.beatCount, 3);
assert.strictEqual(instance.displayedCount, 9);
assert.deepStrictEqual(instance.beamGroups, [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 8 }]);
assert.strictEqual(instance.mobileNoteX({ beat: 0 }), 45);
assert.strictEqual(instance.mobileNoteX({ beat: 3 }), 245);
assert.strictEqual(instance.mobileNoteX({ beat: 4 }), 305);
instance.events = nineSixteenthBar;
assert.deepStrictEqual(instance.secondaryBeamGroups,
  [{ start: 0, end: 3, secondaryStart: 1, secondaryEnd: 2 }]);
assert(instance.isBeamed(instance.events[2]));
instance.events = nineEightDotted;
assert(instance.isAfterDottedEighth(instance.events[1]));
assert(instance.isAfterDottedSixteenth(instance.events[2]));
assert.strictEqual(instance.mobileNoteX(instance.events[1]), 80);
assert.strictEqual(instance.mobileNoteX(instance.events[2]), 115);
assert.strictEqual(instance.beamGroups.length, 0, 'the mixed dotted group keeps individual flags');
instance.events = nineEight;
instance.phase = 'countin';
assert.strictEqual(component.computed.statusText.call(instance), 'RHYTHM_COUNT_IN_9_8');
instance.phase = 'idle';
instance.setMeter('4/4');
assert.strictEqual(instance.beatCount, 4);
instance.setMeter('6/8');
instance.phase = 'countin';
instance.phaseStart = performance.now() - 1000;
instance.lastBeat = -1;
const pulses = [];
instance.playMetronome = accent => { pulses.push(accent); };
instance.tick();
assert.deepStrictEqual(pulses, [], 'the visual tick does not trigger already scheduled audio');
assert.strictEqual(instance.activeBeat, 4, 'the fifth eighth is highlighted during the second pulse');
instance.phase = 'idle';
instance.setMeter('9/8');
instance.phase = 'countin';
instance.phaseStart = performance.now() - 1750;
instance.lastBeat = -1;
instance.tick();
assert.deepStrictEqual(pulses, [], '9/8 highlighting does not duplicate scheduled audio');
assert.strictEqual(instance.activeBeat, 7, 'the eighth eighth is highlighted during the third pulse');
instance.phase = 'idle';
instance.setMeter('4/4');
instance.setTempo(60);
assert.strictEqual(instance.bpm, 60);
instance.phase = 'preview';
instance.phaseStart = 500;
instance.nextPhase();
assert.strictEqual(instance.phase, 'countin');
assert.strictEqual(instance.phaseStart, 4500);
instance.setTempo(120);
assert.strictEqual(instance.bpm, 60, 'tempo stays locked throughout the round');
instance.phase = 'result';
instance.setTempo(120);
assert.strictEqual(instance.bpm, 120);
assert.strictEqual(instance.phase, 'idle');

assert(componentSource.includes('@pointerdown.prevent="handleDrumPointer"'));
assert(componentSource.includes('class="sense-percussion"'));
assert(!componentSource.includes('class="sense-clef"'));
assert(!componentSource.includes('v-for="line in 5"'));
assert(componentSource.includes("'is-practice': phase === 'practice'"));
assert(componentSource.includes('resultSummary.missed'));
assert(componentSource.includes('resultSummary.precisionPercent'));
assert(componentSource.includes('resultSummary.byValue'));
assert(componentSource.includes('roundLength === 0 && isRunning'));
assert(componentSource.includes('RHYTHM_ROUND_PROGRESS'));
assert(componentSource.includes('class="sense-score sense-score-mobile"'));
assert(componentSource.includes("RHYTHM_SAVE_FAILED"));
assert(componentSource.includes("RHYTHM_EVAL_SAVED"));
assert(componentSource.includes('class="sense-tap-offset"'));
assert(!componentSource.includes('<text x="52" y="49" class="sense-meter">4</text>'));
assert.strictEqual(instance.mobileNoteX({ beat: 0 }), instance.mobileNoteX({ beat: 2 }));
assert.strictEqual(instance.mobileNoteX({ beat: 1.5 }), instance.mobileNoteX({ beat: 3.5 }));
assert(componentSource.includes('.sense-page.is-running .sense-heading { display:none; }'));
for(const bar of [rhythm.createRhythmSenseBar(2), rhythm.createRhythmSenseBar(3), rhythm.createRhythmSenseBar(24)]) {
  bar.forEach(event => {
    const x = instance.mobileNoteX(event);
    assert(x >= 76 && x <= 310, 'every mobile note must remain visible on its staff');
  });
}
instance.$t = key => key;
instance.phase = 'practice';
instance.feedback = '';
assert.strictEqual(component.computed.feedbackText.call(instance), 'RHYTHM_TAP_NOW');
instance.feedback = 'too-early';
assert.strictEqual(component.computed.feedbackText.call(instance), 'RHYTHM_FEEDBACK_EARLY');
let tapCount = 0;
instance.tapDrum = () => { tapCount += 1; };
instance.handleDrumPointer({ timeStamp: performance.now() });
instance.handleDrumClick({ detail: 1 });
instance.handleDrumClick({ detail: 0 });
assert.strictEqual(tapCount, 1, 'one touch must register only one strike');
instance.lastPointerTapAt = performance.now() - 500;
instance.handleDrumClick({ detail: 0 });
assert.strictEqual(tapCount, 2, 'keyboard activation must still register a strike');

const sessionInstance = Object.assign(component.data(), {
  $refs: {}, $set(array, index, value) { array[index] = value; },
  $nextTick(callback) { callback(); }, $t(key) { return key; }
});
Object.keys(component.methods).forEach(name => {
  sessionInstance[name] = component.methods[name].bind(sessionInstance);
});
Object.defineProperty(sessionInstance, 'isRunning', {
  get() { return component.computed.isRunning.call(sessionInstance); }
});
Object.defineProperty(sessionInstance, 'selectionFitsMeter', {
  get() { return component.computed.selectionFitsMeter.call(sessionInstance); }
});
for(const length of rhythm.RHYTHM_SENSE_ROUND_LENGTHS){
  sessionInstance.setRoundLength(length);
  assert.strictEqual(sessionInstance.roundLength, length);
}
sessionInstance.setRoundLength(3);
for(let bar = 0; bar < 3; bar++){
  sessionInstance.phase = 'practice';
  sessionInstance.results = sessionInstance.events.map(() => bar === 0 ? 'correct' : null);
  sessionInstance.nextPhase();
  assert.strictEqual(sessionInstance.completedBarCount, bar + 1);
  assert.strictEqual(sessionInstance.phase, bar === 2 ? 'result' : 'preview');
}
assert.strictEqual(savedRhythmBars.length, 3, 'each completed bar is saved separately');
assert.deepStrictEqual(savedRhythmBars.map(record => record.barNumber), [1, 2, 3]);
assert(savedRhythmBars.every(record => record.sessionId === savedRhythmBars[0].sessionId));
assert(sessionInstance.sessionEvaluation.total > sessionInstance.events.length,
  'the final evaluation includes all three bars');
assert.strictEqual(component.computed.resultSummary.call(sessionInstance).total,
  sessionInstance.sessionEvaluation.total);
for(const length of [10, 20]){
  sessionInstance.setRoundLength(length);
  sessionInstance.completedBarCount = 0;
  sessionInstance.sessionEvaluation = rhythm.evaluateRhythmSenseRound([], []);
  sessionInstance.patternIndex = 0;
  sessionInstance.events = rhythm.createRhythmSenseBar(0);
  for(let bar = 0; bar < length; bar++){
    sessionInstance.phase = 'practice';
    sessionInstance.results = sessionInstance.events.map(() => 'correct');
    sessionInstance.nextPhase();
    assert.strictEqual(sessionInstance.phase, bar === length - 1 ? 'result' : 'preview');
  }
  assert.strictEqual(sessionInstance.completedBarCount, length);
}
sessionInstance.setRoundLength(0);
sessionInstance.completedBarCount = 0;
sessionInstance.sessionEvaluation = rhythm.evaluateRhythmSenseRound([], []);
sessionInstance.phase = 'practice';
sessionInstance.results = sessionInstance.events.map(() => 'correct');
sessionInstance.nextPhase();
assert.strictEqual(sessionInstance.phase, 'preview', 'unlimited rounds continue automatically');
sessionInstance.endTraining();
assert.strictEqual(sessionInstance.phase, 'result', 'unlimited round ends on request');
assert.strictEqual(sessionInstance.completedBarCount, 1, 'unfinished preview is not counted');

instance.tapDrum = component.methods.tapDrum.bind(instance);
instance.playDrum = () => {};
instance.phase = 'practice';
instance.bpm = 80;
instance.results = ['missed', ...events.slice(1).map(() => null)];
instance.phaseStart = performance.now() - 200;
instance.tapDrum({ timeStamp: instance.phaseStart });
assert.strictEqual(instance.results[0], 'correct', 'queued timely touch recovers a premature miss');
assert.strictEqual(instance.tapMarkers.length, 1, 'a scored touch appears on the staff');
assert.strictEqual(instance.tapMarkers[0].offsetMs, 0);
assert.strictEqual(instance.tapMarkerX(instance.tapMarkers[0], false), instance.noteX(events[0]));
assert.strictEqual(component.computed.lastTapOffset.call(instance), '0 ms');
instance.recordTapMarker(120, 'late', 0);
assert(instance.tapMarkerX(instance.tapMarkers[1], false) > instance.noteX(events[0]),
  'a late touch is drawn after the target note');
assert.strictEqual(component.computed.lastTapOffset.call(instance), '+120 ms');
clearTimeout(instance.flashTimer);

const drumSounds = [];
instance.playDrum = dull => { drumSounds.push(dull); };
instance.phase = 'countin';
instance.results = events.map(() => null);
const barMs = rhythm.rhythmSenseBarDurationMs(instance.bpm);
instance.phaseStart = performance.now() - barMs / 2;
instance.tapDrum({ timeStamp: performance.now() });
assert(instance.results.every(result => result === null), 'count-in taps do not score');
assert.strictEqual(instance.feedback, 'warmup');
assert.strictEqual(instance.tapMarkers.length, 2, 'warm-up touch adds no scored marker');
assert.strictEqual(drumSounds.pop(), false, 'warm-up tap is audible');
clearTimeout(instance.flashTimer);

const firstWindow = rhythm.rhythmSenseWindows(events, 0, instance.bpm).outerMs;
instance.phaseStart = performance.now() - barMs + firstWindow / 2;
instance.tapDrum({ timeStamp: performance.now() });
assert.strictEqual(instance.results[0], 'early', 'a tap just before practice counts as early');
assert.strictEqual(instance.tapMarkers.length, 3, 'early count-in touch is visible');
assert(instance.tapMarkers[2].offsetMs < 0);
assert(instance.tapMarkerX(instance.tapMarkers[2], true) < instance.mobileNoteX(events[0]));
assert.strictEqual(drumSounds.pop(), true, 'scored early tap sounds muffled');
instance.nextPhase();
assert.strictEqual(instance.phase, 'practice');
assert.strictEqual(instance.results[0], 'early', 'early result survives the phase change');
assert.strictEqual(instance.tapMarkers.length, 3, 'early marker survives the phase change');
clearTimeout(instance.flashTimer);

instance.phase = 'countin';
instance.feedback = '';
instance.results = events.map(() => null);
instance.phaseStart = performance.now() - barMs - 10;
instance.tapDrum({ timeStamp: performance.now() });
assert.strictEqual(instance.phase, 'practice', 'a tap at the boundary belongs to practice');
assert.strictEqual(instance.results[0], 'correct');
clearTimeout(instance.flashTimer);

sessionInstance.tapMarkers = [{ id: 1, targetIndex: 0, offsetMs: 80, result: 'late' }];
sessionInstance.phase = 'practice';
sessionInstance.results = sessionInstance.events.map(() => 'correct');
sessionInstance.beginNextBar();
assert.deepStrictEqual(sessionInstance.tapMarkers, [], 'a new bar clears the previous tap positions');

const noises = [];
const fakeContext = {
  sampleRate: 1000, currentTime: 0, destination: {},
  createBuffer(channels, length) {
    assert.strictEqual(channels, 1);
    const samples = new Float32Array(length);
    return { getChannelData() { return samples; } };
  },
  createBufferSource() {
    return { connect() {}, start() {}, stop() {} };
  },
  createBiquadFilter() {
    const filter = { connect() {}, frequency: { setValueAtTime(value) { filter.cutoff = value; } } };
    noises.push(filter);
    return filter;
  },
  createGain() {
    return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
  }
};
instance.audioContext = fakeContext;
instance.tone = () => {};
instance.playDrum = component.methods.playDrum.bind(instance);
instance.playDrum(false); // Preview and correct input use this exact path.
assert.strictEqual(noises[0].type, 'highpass');
assert.strictEqual(noises[0].cutoff, 1700);
const cachedNoise = instance.snareNoise;
instance.playDrum(true);
assert.strictEqual(instance.snareNoise, cachedNoise);
assert.strictEqual(noises[1].type, 'lowpass');
assert.strictEqual(noises[1].cutoff, 520);
testOptions.appVolume = 0;
instance.playDrum(false);
assert.strictEqual(noises.length, 2, 'muting app audio also mutes the snare');

process.stdout.write('Rhythm Sense model tests passed\n');

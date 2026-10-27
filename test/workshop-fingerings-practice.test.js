const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep, originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc:false, presets:[['env', { modules:'commonjs' }]]
  }).code, filename);
};
const model = require('../src/model/Workshop'), practice = require('../src/model/WorkshopPractice');
Module._extensions['.js'] = originalLoader;
const score = model.createWorkshopDraft('Fingering practice').score;
score.parts[0].measures[0].events = [
  { id:'first', kind:'note', pitch:model.workshopPitchFromValue(48), noteValue:'quarter', startSlot:0 },
  { id:'second', kind:'note', pitch:model.workshopPitchFromValue(52), noteValue:'quarter', startSlot:2 }
];
const plain = practice.createWorkshopPracticePlan(score);
const annotated = model.cloneWorkshop(score);
annotated.parts[0].measures[0].events[0].fingerings = [
  { value:'1' }, { value:'2', substitution:true }, { value:'3', alternate:true, placement:'below' }
];
annotated.parts[0].measures[0].events[1].fingering = 4;
assert(model.isValidWorkshopScore(annotated));
const before = JSON.stringify(annotated), withFingering = practice.createWorkshopPracticePlan(annotated);
assert.deepStrictEqual(withFingering.targets, plain.targets);
assert.strictEqual(withFingering.durationMs, plain.durationMs);
assert.deepStrictEqual(withFingering.timeline.beats, plain.timeline.beats);
assert.strictEqual(JSON.stringify(annotated), before);
function perform(plan) {
  let state = practice.startWorkshopPractice(practice.createWorkshopPractice(plan, { behavior:'wait' }));
  state = practice.submitWorkshopPracticeInput(state, 48);
  state = practice.advanceWorkshopPractice(state, 1000);
  state = practice.submitWorkshopPracticeInput(state, 52);
  return practice.advanceWorkshopPractice(state, plan.durationMs);
}
const ordinaryResult = perform(plain), annotatedResult = perform(withFingering);
assert.strictEqual(annotatedResult.status, 'complete');
assert.strictEqual(annotatedResult.correctCount, 2);
for (const field of ['correctCount', 'wrongCount', 'missedCount', 'results']) {
  assert.deepStrictEqual(annotatedResult[field], ordinaryResult[field]);
}
process.stdout.write('✓ Rich and legacy fingerings preserve practice targets, timing and note-only evaluation\n');

const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJsLoader = Module._extensions[".js"];
const originalVueLoader = Module._extensions[".vue"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalJsLoader(loadedModule, filename);
  return loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = function stubVisualComponent(loadedModule) {
  loadedModule.exports = { default: { name: "VisualStub" } };
};

function loadView(name) {
  const filename = path.resolve(__dirname, `../src/components/${name}.vue`);
  const script = fs.readFileSync(filename, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  loadedModule._compile(babel.transform(script, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return Vue.extend(loadedModule.exports.default);
}

const { createNoteFlowRoundSeed } = require("../src/model/NoteFlowRoundSeed");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { startNoteFlowChordRhythmPractice,
  submitNoteFlowChordRhythmInput } = require("../src/model/NoteFlowChordRhythmPractice");
const Melody = loadView("NoteFlowGamePreview");
const Chords = loadView("NoteFlowChordTraining");
Module._extensions[".js"] = originalJsLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

const menuOptions = {
  handMode: "two", clef: ["bass", "treble"], secondaryNotesPerBlock: 4,
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no",
  difficulty: "normal", movement: "calm", bpm: 50, gameLength: 20,
  behavior: "wait", inputMode: "midi", rhythmMeter: "4/4",
  rhythmValues: { treble: ["quarter", "eighth"], bass: ["half", "quarter"] }
};
function melody() {
  const view = new Melody({ propsData: { preview: { menuOptions } }, methods: { $t: key => key } });
  view.midiConnected = true;
  return view;
}
function chordTraining() {
  const plan = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", movement: "calm",
    chordSize: 3, bassNote: true, behavior: "wait", bpm: 50,
    gameLength: 20, rhythmMeter: "4/4", rhythmValues: ["quarter", "eighth"]
  });
  return new Chords({ propsData: { plan }, methods: { $t: key => key } });
}
function pitches(cycle) {
  return cycle.timeline.events.map(event => event.expectedValues.join(",")).join(";");
}
function chordPitches(view) {
  return view.rhythmScore.targets.map(target => target.expectedValues.join(",")).join(";");
}
function rhythmPattern(score) {
  return score.measures.map(measure => measure.events
    ? measure.events.map(event => `${event.kind}:${event.durationTicks}`).join(",")
    : Object.keys(measure.voices).map(hand => (
    measure.voices[hand].map(event => `${event.kind}:${event.durationTicks}`).join(",")
  )).join("/")).join(";");
}
async function test(name, body) {
  await body();
  process.stdout.write(`\u2713 ${name}\n`);
}

async function run() {
  // Fix both entropy sources: the per-process sequence must prevent same-tick reuse.
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 1770000000000;
  Math.random = () => 0.25;
  try {
    await test("new rounds never reuse a seed even with the same clock and random value", () => {
      const seeds = Array.from({ length: 40 }, createNoteFlowRoundSeed);
      assert.strictEqual(new Set(seeds).size, seeds.length);
    });

    await test("entering melody training again varies notes and rhythms within the selected settings", () => {
      const before = JSON.stringify(menuOptions);
      const views = Array.from({ length: 8 }, melody);
      assert(new Set(views.map(view => pitches(view.generatedCycle))).size > 1);
      assert(new Set(views.map(view => rhythmPattern(view.generatedRhythmScore))).size > 1);
      views.forEach(view => {
        assert.strictEqual(view.generatedCycle.tonalityPlan.key.id, "C-major");
        assert.strictEqual(view.generatedCycle.config.handMode, "two");
        assert.strictEqual(view.generatedRhythmScore.meter.signature, "4/4");
      });
      assert.strictEqual(JSON.stringify(menuOptions), before);
    });

    await test("melody pause/resume retains exactly the current score and totals", () => {
      const view = melody();
      const score = view.generatedRhythmScore;
      const cycle = view.generatedCycle;
      view.roundTimer = Object.assign({}, view.roundTimer, { status: "paused" });
      view.roundProgress.correct = 7;
      let resumes = 0;
      view.$refs.flowStaff = { resumeMotion() { resumes += 1; } };
      view.playTraining();
      assert.strictEqual(resumes, 1);
      assert.strictEqual(view.generatedRhythmScore, score);
      assert.strictEqual(view.generatedCycle, cycle);
      assert.strictEqual(view.roundProgress.correct, 7);
    });

    await test("the upper play-again control regenerates melody before starting and resets only the new round", async () => {
      const view = melody();
      const oldScore = view.generatedRhythmScore;
      const oldCycle = view.generatedCycle;
      const savedResult = { score: { correct: 7 } };
      view.roundResult = savedResult;
      view.roundTimer = Object.assign({}, view.roundTimer, { status: "complete" });
      view.roundProgress.correct = 7;
      let starts = 0;
      view.$refs.flowStaff = { toggleMotion() {
        starts += 1;
        assert.notStrictEqual(view.generatedRhythmScore, oldScore);
        assert.strictEqual(view.roundTimer.status, "ready");
        assert.strictEqual(view.roundProgress.correct, 0);
      } };
      assert.strictEqual(view.canPlay, true);
      assert.strictEqual(view.playControlLabel, "FLOW_PLAY_AGAIN");
      view.playTraining();
      assert.strictEqual(starts, 0, "wait for the new score watcher before starting");
      assert.notStrictEqual(view.generatedCycle.config.seed, oldCycle.config.seed);
      assert.strictEqual(view.roundResult, null);
      await view.$nextTick();
      assert.strictEqual(starts, 1);
      assert.strictEqual(savedResult.score.correct, 7);
    });

    await test("rapid play-again clicks start only the latest score once", async () => {
      const view = melody();
      let starts = 0;
      view.$refs.flowStaff = { toggleMotion() { starts += 1; } };
      view.restartRound();
      const supersededScore = view.generatedRhythmScore;
      view.restartRound();
      const currentScore = view.generatedRhythmScore;
      assert.notStrictEqual(currentScore, supersededScore);
      await view.$nextTick();
      assert.strictEqual(starts, 1, "older callbacks must not pause the restarted round");
      assert.strictEqual(view.generatedRhythmScore, currentScore);
    });

    await test("new chord rounds vary grips and rhythms while retaining the chosen key and options", () => {
      const view = chordTraining();
      const originalPlan = JSON.stringify(view.plan);
      const seeds = [], notes = [], rhythms = [];
      for (let round = 0; round < 8; round += 1) {
        seeds.push(view.roundSeed);
        notes.push(chordPitches(view));
        rhythms.push(rhythmPattern(view.rhythmScore));
        assert.strictEqual(view.plan.keyId, "C-major");
        assert(view.rhythmScore.targets.every(target => (
          target.chord.pitchClasses.every(value => [0, 2, 4, 5, 7, 9, 11].includes(value))
        )));
        assert.strictEqual(view.rhythmScore.meter.signature, "4/4");
        assert.strictEqual(view.practice.correctCount, 0);
        view.initializeTraining();
      }
      assert.strictEqual(new Set(seeds).size, seeds.length);
      assert(new Set(notes).size > 1);
      assert(new Set(rhythms).size > 1);
      assert.strictEqual(JSON.stringify(view.plan), originalPlan);
    });

    await test("the upper chord play-again control discards pending input and old results before playback", () => {
      const view = chordTraining();
      view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
      view.rhythmState = submitNoteFlowChordRhythmInput(view.rhythmState,
        view.practice.timeline.targets[0].expectedValues[0], 0);
      assert(view.practice.pendingValues.length > 0);
      const oldSeed = view.roundSeed;
      const savedResult = { score: { correct: 4 } };
      view.roundResult = savedResult;
      view.roundTimer = Object.assign({}, view.roundTimer, { status: "complete" });
      view.midiConnected = true;
      let starts = 0;
      const topAction = view.playMotion.bind(view);
      view.playMotion = () => { starts += 1; };
      assert.strictEqual(view.canPlay, true);
      assert.strictEqual(view.playControlLabel, "FLOW_PLAY_AGAIN");
      topAction();
      assert.strictEqual(starts, 1);
      assert.notStrictEqual(view.roundSeed, oldSeed);
      assert.deepStrictEqual(view.practice.pendingValues, []);
      assert.strictEqual(view.practice.targetIndex, 0);
      assert.strictEqual(view.roundResult, null);
      assert.strictEqual(view.roundTimer.status, "ready");
      assert.strictEqual(savedResult.score.correct, 4);
    });

    await test("MIDI disconnect blocks the upper play-again control without clearing either result", () => {
      [melody(), chordTraining()].forEach(view => {
        const result = { score: { correct: 3 } };
        view.roundResult = result;
        view.roundTimer = Object.assign({}, view.roundTimer, { status: "complete" });
        view.midiConnected = false;
        view.$refs.flowStaff = { toggleMotion() { throw new Error("disconnected MIDI must not start"); } };
        assert.strictEqual(view.canPlay, false);
        if (view.playTraining) view.playTraining(); else view.playMotion();
        assert.strictEqual(view.roundResult, result);
        assert.strictEqual(view.roundTimer.status, "complete");
      });
    });
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
}

run().then(() => process.stdout.write("Note Flow round freshness: OK\n"))
  .catch(error => { console.error(error); process.exitCode = 1; });

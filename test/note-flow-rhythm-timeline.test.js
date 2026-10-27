const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const rhythm = require("../src/model/NoteFlowRhythm.js");
const timeline = require("../src/model/NoteFlowRhythmTimeline.js");
const generator = require("../src/model/NoteFlowGenerator.js");
const rhythmGenerator = require("../src/model/NoteFlowRhythmGenerator.js");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function event(kind, startTick, noteValue, value = null, dots = 0) {
  return { kind, startTick, noteValue, dots,
    note: kind === "note" ? { value, clef: "treble" } : null };
}

function score(meter, voices, count = 1) {
  const measure = rhythm.createNoteFlowRhythmMeasure({ meter, voices });
  Object.keys(voices).forEach(hand => {
    measure.voices[hand].forEach((item, index) => {
      if (item.kind === "note") item.note = voices[hand][index].note;
    });
  });
  return {
    meter: rhythm.getNoteFlowMeter(meter),
    hands: Object.keys(voices),
    measures: Array.from({ length: count }, () => measure)
  };
}

test("4/4 schedules independent eighth and half notes on one shared clock", () => {
  const treble = Array.from({ length: 8 }, (_, index) => (
    event("note", index * 48, "eighth", 60 + index)
  ));
  const bass = [
    event("note", 0, "half", 36),
    event("note", 192, "half", 43)
  ];
  const result = timeline.createNoteFlowRhythmTimeline(score("4/4", { treble, bass }), { bpm: 60 });
  assert.strictEqual(result.durationMs, 4000);
  assert.strictEqual(result.events.length, 10);
  assert.strictEqual(result.targets.length, 8);
  assert.deepStrictEqual(result.targets.map(target => target.startMs),
    [0, 500, 1000, 1500, 2000, 2500, 3000, 3500]);
  assert.deepStrictEqual(result.targets[0].expectedValues, [60, 36]);
  assert.deepStrictEqual(result.targets[4].expectedValues, [64, 43]);
  assert.strictEqual(result.targets[0].notes[1].endMs, 2000);
  assert.deepStrictEqual(result.pulseStarts.map(pulse => pulse.atMs),
    [0, 1000, 2000, 3000]);
});

test("3/4 is three quarter pulses while 6/8 is two dotted-quarter pulses", () => {
  const triple = timeline.createNoteFlowRhythmTimeline(score("3/4", {
    treble: [event("note", 0, "quarter", 60), event("note", 96, "quarter", 62),
      event("rest", 192, "quarter")]
  }), { bpm: 60 });
  assert.strictEqual(triple.durationMs, 3000);
  assert.deepStrictEqual(triple.pulseStarts.map(pulse => pulse.atMs), [0, 1000, 2000]);
  assert.strictEqual(triple.targets.length, 2);
  assert.strictEqual(triple.events[2].kind, "rest");

  const compound = timeline.createNoteFlowRhythmTimeline(score("6/8", {
    treble: [event("note", 0, "quarter", 60, 1),
      event("rest", 144, "quarter", null, 1)],
    bass: [event("rest", 0, "eighth"), event("note", 48, "quarter", 36),
      event("note", 144, "quarter", 43, 1)]
  }), { bpm: 60 });
  assert.strictEqual(compound.durationMs, 2000);
  assert.deepStrictEqual(compound.pulseStarts.map(pulse => pulse.atMs), [0, 1000]);
  assert.deepStrictEqual(compound.targets.map(target => target.startMs), [0, 333, 1000]);
  assert.strictEqual(compound.targets[0].notes.length, 1);
  assert.strictEqual(compound.targets[2].notes[0].durationTicks, 144);
});

test("absolute tick conversion avoids cumulative rounding drift across long runs", () => {
  const long = timeline.createNoteFlowRhythmTimeline(score("6/8", {
    treble: [event("note", 0, "quarter", 60, 1),
      event("note", 144, "quarter", 62, 1)]
  }, 100), { bpm: 73 });
  assert.strictEqual(long.durationMs, Math.round(200 * 60000 / 73));
  assert.strictEqual(long.measures[99].endMs, long.durationMs);
  assert.strictEqual(long.pulseStarts.length, 200);
});

test("generated rhythmic score is consumable without touching live playback", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two", secondaryNotesPerBlock: 8, seed: "rhythm-clock"
  });
  const before = JSON.stringify(cycle.timeline);
  const generated = rhythmGenerator.generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 2,
    allowedValues: { treble: ["eighth"], bass: ["half"] }
  });
  const result = timeline.createNoteFlowRhythmTimeline(generated, { bpm: 50 });
  assert.strictEqual(result.durationMs, 9600);
  assert.strictEqual(result.targets.length, 16);
  assert.strictEqual(JSON.stringify(cycle.timeline), before);
});

test("invalid BPM, incomplete measures and missing pitches are rejected", () => {
  const valid = score("3/4", { treble: [event("note", 0, "half", 60),
    event("note", 192, "quarter", 62)] });
  assert.throws(() => timeline.createNoteFlowRhythmTimeline(valid, { bpm: 0 }), RangeError);
  assert.throws(() => timeline.createNoteFlowRhythmTimeline(valid, { bpm: 120.5 }), RangeError);
  const missing = JSON.parse(JSON.stringify(valid));
  delete missing.measures[0].voices.treble[0].note;
  assert.throws(() => timeline.createNoteFlowRhythmTimeline(missing), RangeError);
  const partial = JSON.parse(JSON.stringify(valid));
  partial.measures[0].voices.treble.pop();
  assert.throws(() => timeline.createNoteFlowRhythmTimeline(partial), RangeError);
  const mismatched = JSON.parse(JSON.stringify(valid));
  mismatched.measures[0].meter.signature = "4/4";
  assert.throws(() => timeline.createNoteFlowRhythmTimeline(mismatched), RangeError);
});

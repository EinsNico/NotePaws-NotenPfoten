const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordRhythmLayout } = require("../src/model/NoteFlowChordRhythmLayout");
const { TICKS_PER_QUARTER } = require("../src/model/NoteFlowRhythm");
const { getNoteFlowTonality } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const plan = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "G-major", accidentals: "sharpAndFlat", chordSize: 4,
  bassNote: true, seed: 17
});

test("two-bar score shows both clefs, meter, key signature and barlines", () => {
  const score = generateNoteFlowChordRhythmicScore(plan, {
    meter: "3/4", allowedValues: ["quarter"]
  });
  const layout = createNoteFlowChordRhythmLayout(score, {
    tonality: getNoteFlowTonality(plan.keyId), displayKeySignature: true
  });
  assert.strictEqual(layout.staves.length, 2);
  assert(layout.staves.every(staff => staff.keySignature.length === 1));
  assert.deepStrictEqual(layout.timeSignature, { numerator: 3, denominator: 4 });
  assert.strictEqual(layout.barlines.length, 2);
  assert.strictEqual(layout.events.length, 6);
  assert(layout.events.every(event => event.parts[0].heads.length === 4
    && event.parts[1].heads.length === 1));
  assert(layout.events[1].x > layout.events[0].x);
  assert(layout.events[3].x > layout.barlines[0].x);
});

test("whole notes have no stems and dotted notes retain their dots", () => {
  const whole = generateNoteFlowChordRhythmicScore(plan, {
    meter: "4/4", allowedValues: ["whole"]
  });
  const wholeLayout = createNoteFlowChordRhythmLayout(whole);
  assert.strictEqual(wholeLayout.events[0].noteValue, "whole");
  assert(wholeLayout.events[0].parts.every(part => part.stem === null));
  const dotted = generateNoteFlowChordRhythmicScore(plan, {
    meter: "6/8", allowedValues: ["dotted-quarter"]
  });
  const dottedLayout = createNoteFlowChordRhythmLayout(dotted);
  assert.deepStrictEqual(dottedLayout.timeSignature, { numerator: 6, denominator: 8 });
  assert(dottedLayout.events.every(event => event.dots === 1));
});

test("live layout keeps later measures and exact tick-based spacing", () => {
  const score = generateNoteFlowChordRhythmicScore(plan, {
    meter: "3/4", allowedValues: ["quarter"]
  });
  const layout = createNoteFlowChordRhythmLayout(score, {
    measureCount: score.measures.length
  });
  assert.strictEqual(layout.barlines.length, score.measures.length);
  assert.strictEqual(layout.events.length,
    score.measures.reduce((count, measure) => count + measure.events.length, 0));
  assert.strictEqual(layout.events[0].globalStartTick, 0);
  assert(layout.events.every((event, index) => index === 0
    || event.x > layout.events[index - 1].x));
  assert(layout.firstNoteX > 0 && layout.pixelsPerQuarter > 0);
});

test("eighth-note beams stay within a pulse and rests break groups", () => {
  const score = generateNoteFlowChordRhythmicScore(plan, {
    meter: "4/4", allowedValues: ["eighth"], restChance: 1
  });
  const layout = createNoteFlowChordRhythmLayout(score);
  assert(layout.events.some(event => event.kind === "rest"));
  assert(layout.events.filter(event => event.kind === "rest")
    .every(event => event.parts.every(part => !part.heads)));
  assert.strictEqual(layout.beams.length, 0);
  const continuous = createNoteFlowChordRhythmLayout(
    generateNoteFlowChordRhythmicScore(plan, {
      meter: "4/4", allowedValues: ["eighth"]
    })
  );
  const trebleBeams = continuous.beams.filter(beam => beam.clef === "treble");
  const bassBeams = continuous.beams.filter(beam => beam.clef === "bass");
  assert(trebleBeams.length > 0);
  assert.strictEqual(trebleBeams.length, bassBeams.length);
  assert(trebleBeams.every(beam => beam.x2 > beam.x1));
});

test("sixteenths receive secondary beams and an empty score is rejected", () => {
  const score = generateNoteFlowChordRhythmicScore(plan, {
    meter: "4/4", allowedValues: ["sixteenth"]
  });
  const layout = createNoteFlowChordRhythmLayout(score);
  assert(layout.beams.some(beam => beam.level === 2));
  assert.throws(() => createNoteFlowChordRhythmLayout({ measures: [], targets: [] }), TypeError);
});

// Walk the actual ABC outline; using its control-point hull is conservative
// and also catches non-text glyph origins that caused the former collisions.
function glyphBounds(path) {
  let x = 0, y = 0, startX = 0, startY = 0;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  function include(px, py) {
    left = Math.min(left, px); right = Math.max(right, px);
    top = Math.min(top, py); bottom = Math.max(bottom, py);
  }
  path.forEach(part => {
    const command = part[0];
    if (command === "M" || command === "m") {
      x = command === "M" ? part[1] : x + part[1];
      y = command === "M" ? part[2] : y + part[2];
      startX = x; startY = y; include(x, y);
    } else if (command === "l") {
      x += part[1]; y += part[2]; include(x, y);
    } else if (command === "c") {
      include(x + part[1], y + part[2]);
      include(x + part[3], y + part[4]);
      x += part[5]; y += part[6]; include(x, y);
    } else if (command === "z" || command === "Z") {
      x = startX; y = startY;
    } else throw new Error("Unsupported outline command " + command);
  });
  return { left, right, top, bottom };
}

const Glyphs = require("abcjs/src/write/creation/glyphs");
test("dense minor-key sixteenths leave room for real accidentals, heads and barlines at three and eight tones", () => {
  for (const chordSize of [3, 8]) {
    const densePlan = createNoteFlowChordPlan({ handMode: "single", singleHand: "treble", chordSize,
      customTrebleMinValue: 36, customMaxValue: 84, tonalityMode: "circle", selectedKey: "A-minor",
      accidentals: "sharpAndFlat", seed: 12 });
    const score = generateNoteFlowChordRhythmicScore(densePlan, {
      meter: "4/4", allowedValues: ["sixteenth"], restChance: 0
    });
    const layout = createNoteFlowChordRhythmLayout(score, {
      measureCount: score.measures.length, tonality: getNoteFlowTonality("A-minor"), displayKeySignature: true
    });
    assert(layout.pixelsPerQuarter > 76, "fixed nineteen-pixel onsets cannot contain these glyphs");
    let accidentalCount = 0;
    layout.events.forEach((event, eventIndex) => {
      assert(Math.abs(event.x - layout.firstNoteX
        - event.globalStartTick / TICKS_PER_QUARTER * layout.pixelsPerQuarter) < 1e-8,
      "playline and note positions retain the same linear tick mapping");
      const previous = layout.events[eventIndex - 1];
      event.parts.forEach(part => (part.heads || []).forEach((head, headIndex) => {
        if (!head.accidental) return;
        accidentalCount++;
        const box = glyphBounds(Glyphs.getPathForSymbol(event.x - 19 - headIndex * 9,
          head.y, `accidentals.${head.accidental}`, .8, .8));
        if (!previous) assert(box.left > layout.timeSignatureX + 12,
          "the first accidental must clear the fixed time signature");
        if (previous) previous.parts.forEach(previousPart => (previousPart.heads || []).forEach(previousHead => {
          const previousX = previous.x + previousHead.offsetX;
          const intersectsY = box.top < previousHead.y + 6 && box.bottom > previousHead.y - 6;
          if (intersectsY) assert(box.left > previousX + 8,
            "current accidental must clear every previous chord head at its actual y position");
        }));
        if (event.startTick === 0 && event.measureIndex > 0) {
          assert(box.left > layout.barlines[event.measureIndex - 1].x + 1,
            "a new measure's accidentals must remain after its barline");
        }
      }));
    });
    assert(accidentalCount > 0, "the regression must actually contain the raised minor leading note");
  }
});

console.log("Chord rhythm notation layout: OK");

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
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator.js");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator.js");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const palette = ["whole", "half", "quarter", "eighth", "sixteenth"];
const cycle = generateNoteFlowCycle({
  handMode: "single", clefs: ["treble"], seed: "rhythm-density"
});

function scoreFor(seed, noteDensity, allowedValues = palette) {
  return generateNoteFlowRhythmicScore(Object.assign({}, cycle, { seed }), {
    meter: "4/4", measureCount: 16, noteDensity,
    allowedValues: { treble: allowedValues }
  });
}

function noteEvents(score, hand = "treble") {
  return score.measures.reduce((events, measure) => (
    events.concat(measure.voices[hand].filter(event => event.kind === "note"))
  ), []);
}

function summarize(noteDensity) {
  const result = { eventCount: 0, measures: 0, openingValues: {} };
  for (let seed = 1; seed <= 64; seed += 1) {
    scoreFor(seed, noteDensity).measures.forEach(measure => {
      const events = measure.voices.treble;
      result.eventCount += events.length;
      result.measures += 1;
      const first = events[0].noteValue;
      result.openingValues[first] = (result.openingValues[first] || 0) + 1;
      assert.strictEqual(events[events.length - 1].endTick, 384);
      events.forEach((event, index) => {
        assert(palette.includes(event.noteValue));
        assert.strictEqual(event.startTick, index ? events[index - 1].endTick : 0);
      });
    });
  }
  return result;
}

test("long values do not exclude selected short values on the opening beat", () => {
  const result = summarize(50);
  palette.forEach(value => assert(result.openingValues[value] > 100,
    `${value} should remain selectable on a strong beat`));
  const shortOpeningCount = result.openingValues.eighth + result.openingValues.sixteenth;
  assert(shortOpeningCount / result.measures > 0.30);
});

test("higher density generates measurably more attacks with the same allowed values", () => {
  const sparse = summarize(0);
  const calm = summarize(35);
  const mixed = summarize(65);
  const leap = summarize(78);
  const dense = summarize(100);
  assert(calm.eventCount > sparse.eventCount);
  assert(mixed.eventCount > calm.eventCount * 1.4);
  assert(leap.eventCount > mixed.eventCount * 1.2);
  assert(dense.eventCount > leap.eventCount * 1.2);
  assert(dense.eventCount > sparse.eventCount * 4);
});

test("density is deterministic and does not mutate the generated pitch cycle", () => {
  const first = scoreFor(214, 65);
  assert.deepStrictEqual(first, scoreFor(214, 65));
  assert.strictEqual(JSON.stringify(cycle), JSON.stringify(generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], seed: "rhythm-density"
  })));
  // A one-value selection fixes the rhythm regardless of the density slider.
  assert.deepStrictEqual(scoreFor(214, 0, ["eighth"]), scoreFor(214, 100, ["eighth"]));
});

test("both hands keep independent seeded rhythms when one palette changes", () => {
  const twoHands = generateNoteFlowCycle({ handMode: "two", seed: "rhythm-independent" });
  const options = {
    meter: "6/8", measureCount: 12, noteDensity: 78,
    allowedValues: {
      treble: ["dotted-quarter", "quarter", "eighth", "sixteenth"],
      bass: ["dotted-quarter", "eighth"]
    }
  };
  const first = generateNoteFlowRhythmicScore(twoHands, options);
  const changed = generateNoteFlowRhythmicScore(twoHands, Object.assign({}, options, {
    allowedValues: { treble: ["eighth"], bass: options.allowedValues.bass }
  }));
  assert.deepStrictEqual(first.measures.map(measure => measure.voices.bass),
    changed.measures.map(measure => measure.voices.bass));
  const bassPitches = twoHands.timeline.events.reduce((pitches, event) => (
    pitches.concat(event.notes.filter(note => note.clef === "bass"))
  ), []);
  const bassEvents = noteEvents(first, "bass");
  assert(bassEvents.length > bassPitches.length);
  assert.strictEqual(first.nextState.lastPrimaryValue, noteEvents(first, "treble").slice(-1)[0].note.value);
  assert.strictEqual(first.nextState.lastSecondaryValue, bassEvents.slice(-1)[0].note.value);
  assert.strictEqual(changed.nextState.lastSecondaryValue, first.nextState.lastSecondaryValue);
  first.measures.forEach(measure => {
    ["treble", "bass"].forEach(hand => {
      const events = measure.voices[hand];
      assert.strictEqual(events[events.length - 1].endTick, 288);
    });
  });
  assert.deepStrictEqual(first.allowedValues, options.allowedValues);
});

test("dense single-hand attacks advance and retrace the melody without a loop-end jump", () => {
  const before = JSON.stringify(cycle);
  const score = generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 8, allowedValues: { treble: ["eighth"] }
  });
  const pitches = cycle.timeline.events.map(event => event.notes[0]);
  const events = noteEvents(score);
  assert.strictEqual(events.length, 64);
  assert.strictEqual(pitches.length, 32);
  const path = pitches.concat(pitches.slice(1, -1).reverse());
  events.forEach((event, index) => {
    assert.strictEqual(event.note, path[index % path.length]);
    assert.strictEqual(event.tonalityPlan, cycle.tonalityPlan);
  });
  assert.strictEqual(JSON.stringify(cycle), before);
});

test("single-hand continuation describes the actual played ending and recent movement", () => {
  const generated = generateNoteFlowCycle({
    handMode: "single", clefs: ["bass", "treble"], movement: "leaping", seed: "played-ending"
  });
  const before = JSON.stringify(generated.nextState);
  const score = generateNoteFlowRhythmicScore(generated, {
    meter: "4/4", measureCount: 16, noteDensity: 78,
    allowedValues: { treble: ["eighth", "sixteenth"], bass: ["quarter", "eighth"] }
  });
  const played = score.measures.reduce((events, measure) => (
    events.concat(score.hands.reduce((notes, hand) => (
      notes.concat(measure.voices[hand].filter(event => event.kind === "note"))
    ), []).sort((left, right) => left.startTick - right.startTick))
  ), []);
  const values = played.map(event => event.note.value);
  const last = played[played.length - 1].note;
  assert.strictEqual(score.nextState.lastPrimaryValue, last.value);
  assert.strictEqual(score.nextState.lastClef, last.clef);
  assert.deepStrictEqual(score.nextState.recentValues, values.slice(-8));
  assert.deepStrictEqual(score.nextState.recentIntervals,
    values.slice(1).map((value, index) => value - values[index]).slice(-3));
  assert.strictEqual(score.nextState.keyId, generated.nextState.keyId);
  assert.strictEqual(JSON.stringify(generated.nextState), before);
});

test("buffered dense single-hand phrases continue from the played ending without octave jumps", () => {
  let state = null;
  let previousLast = null;
  for (let cycleIndex = 0; cycleIndex < 100; cycleIndex += 1) {
    const generated = generateNoteFlowCycle({
      seed: "stream-edges", movement: "leaping", clefs: ["treble"], difficulty: "normal",
      tonalityMode: "circle", selectedKey: "C-major"
    }, cycleIndex, state);
    const score = generateNoteFlowRhythmicScore(generated, {
      meter: "4/4", measureCount: 16, noteDensity: 78, restChance: 0.12,
      allowedValues: { treble: ["whole", "half", "quarter", "eighth", "sixteenth", "dotted-quarter"] }
    });
    const played = noteEvents(score);
    if (previousLast) {
      assert(Math.abs(played[0].note.value - previousLast.value) <= 12);
    }
    played.forEach((event, index) => {
      if (index) assert(Math.abs(event.note.value - played[index - 1].note.value) <= 12);
    });
    previousLast = played[played.length - 1].note;
    state = score.nextState;
  }
});

test("a genuine one-pitch source stays repeatable and has valid continuation state", () => {
  const onePitch = Object.assign({}, cycle, {
    timeline: Object.assign({}, cycle.timeline, { events: cycle.timeline.events.slice(0, 1) })
  });
  const score = generateNoteFlowRhythmicScore(onePitch, {
    meter: "4/4", measureCount: 2, allowedValues: { treble: ["eighth"] }
  });
  const notes = noteEvents(score);
  assert(notes.every(event => event.note === onePitch.timeline.events[0].notes[0]));
  assert.strictEqual(score.nextState.repeatCount, notes.length);
  assert.deepStrictEqual(score.nextState.recentIntervals, [0, 0, 0]);
  assert.deepStrictEqual(score.nextState.recentValues,
    Array(8).fill(onePitch.timeline.events[0].notes[0].value));
});

test("two-hand rhythm preserves timed accompaniment and separation across unequal palettes", () => {
  for (let seed = 1; seed <= 32; seed += 1) {
    const generated = generateNoteFlowCycle({
      seed, handMode: "two", secondaryNotesPerBlock: 16, movement: "mixed", difficulty: "normal",
      tonalityMode: "circle", selectedKey: "C-major"
    });
    const score = generateNoteFlowRhythmicScore(generated, {
      meter: "4/4", measureCount: 16, noteDensity: 65, restChance: 0.12,
      allowedValues: { treble: ["quarter", "eighth"], bass: ["half", "quarter"] }
    });
    score.measures.forEach((measure, measureIndex) => {
      const treble = measure.voices.treble.filter(event => event.kind === "note");
      const bass = measure.voices.bass.filter(event => event.kind === "note");
      score.hands.forEach(hand => measure.voices[hand].forEach(event => {
        if (event.kind === "rest") return;
        const tick = measureIndex * 384 + event.startTick;
        const source = generated.timeline.events[Math.floor(tick / (16 * 384) * 32)];
        assert.strictEqual(event.note.clef, hand);
        const range = hand === "bass" ? { min: 28, max: 48 } : { min: 48, max: 69 };
        assert(event.note.value >= range.min && event.note.value <= range.max);
        assert(generated.tonalityPlan.key.scalePitchClasses.includes(event.note.pitchClass));
        if (hand === "bass") {
          const position = generated.blocks.reduce((all, block) => all.concat(block.positions), [])[source.index];
          assert(position.harmony.pitchClasses.includes(event.note.pitchClass));
        }
      }));
      treble.forEach(right => bass.forEach(left => {
        if (right.startTick < left.endTick && left.startTick < right.endTick) {
          assert(left.note.value <= right.note.value - 5);
        }
      }));
    });
    assert.strictEqual(score.nextState.lastPrimaryValue, noteEvents(score, "treble").slice(-1)[0].note.value);
    assert.strictEqual(score.nextState.lastSecondaryValue, noteEvents(score, "bass").slice(-1)[0].note.value);
  }
});

test("sparse attacks cover the source phrase and rests do not consume extra pitches", () => {
  const pitches = cycle.timeline.events.map(event => event.notes[0]);
  const sparse = generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 1, allowedValues: { treble: ["eighth"] }
  });
  assert.deepStrictEqual(noteEvents(sparse).map(event => event.note),
    [0, 4, 8, 12, 16, 20, 24, 28].map(index => pitches[index]));
  const withRests = generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 2, allowedValues: { treble: ["eighth"] }, restChance: 1
  });
  assert.deepStrictEqual(noteEvents(withRests).map(event => event.note), [pitches[0], pitches[16]]);
  assert(withRests.measures.every(measure => measure.voices.treble
    .filter(event => event.kind === "rest").every(event => !event.note)));
});

test("pitch redistribution leaves selected note values and every timing field unchanged", () => {
  const options = {
    meter: "6/8", measureCount: 16, noteDensity: 78, restChance: 0.12,
    allowedValues: { treble: ["quarter", "eighth", "sixteenth", "dotted-quarter"] }
  };
  const redistributed = Object.assign({}, cycle, {
    timeline: Object.assign({}, cycle.timeline, {
      events: cycle.timeline.events.map(event => Object.assign({}, event, {
        notes: event.notes.map(note => Object.assign({}, note, { value: 60 }))
      }))
    })
  });
  const rhythmFields = score => score.measures.map(measure => measure.voices.treble.map(event => ({
    kind: event.kind, hand: event.hand, noteValue: event.noteValue, dots: event.dots,
    startTick: event.startTick, endTick: event.endTick, durationTicks: event.durationTicks
  })));
  assert.deepStrictEqual(rhythmFields(generateNoteFlowRhythmicScore(cycle, options)),
    rhythmFields(generateNoteFlowRhythmicScore(redistributed, options)));
});

test("custom repetition settings remain audible in the actual dense played score", () => {
  const results = {};
  for (const repetition of [0, 100]) {
    let sourceRepeats = 0, sourcePairs = 0, playedRepeats = 0, playedPairs = 0;
    for (let seed = 1; seed <= 64; seed += 1) {
      const generated = generateNoteFlowCycle({
        seed, movement: "custom", difficulty: "custom", clefs: ["treble"],
        algorithmSettings: { jumpFrequency: 35, jumpSize: 7, repetition, noteDensity: 78 },
        ranges: { treble: { min: 48, max: 72 } }, accidentals: "no",
        selectedKey: "C-major", tonalityMode: "circle"
      });
      const pitches = generated.timeline.events.map(event => event.notes[0]);
      pitches.forEach((note, index) => {
        if (!index) return;
        sourcePairs += 1;
        sourceRepeats += note.value === pitches[index - 1].value ? 1 : 0;
      });
      const played = noteEvents(generateNoteFlowRhythmicScore(generated, {
        meter: "4/4", measureCount: 16, noteDensity: 78, restChance: 0.12,
        allowedValues: { treble: ["quarter", "eighth", "sixteenth"] }
      }));
      played.forEach((event, index) => {
        assert(event.note.value >= 48 && event.note.value <= 72);
        if (!index) return;
        playedPairs += 1;
        playedRepeats += event.note.value === played[index - 1].note.value ? 1 : 0;
      });
    }
    results[repetition] = playedRepeats / playedPairs;
    assert(Math.abs(results[repetition] - sourceRepeats / sourcePairs) < 0.03);
  }
  assert(results[0] < 0.10);
  assert(results[100] > results[0] * 4);
});

test("invalid density and impossible duration palettes are rejected", () => {
  [-1, 101, NaN, Infinity, "65"].forEach(noteDensity => {
    assert.throws(() => scoreFor(12, noteDensity), RangeError);
  });
  assert.throws(() => generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", allowedValues: { treble: ["dotted-quarter", "dotted-eighth"] }
  }), RangeError);
  assert.throws(() => generateNoteFlowRhythmicScore(cycle, {
    meter: "3/4", allowedValues: { treble: ["half"] }
  }), RangeError);
  assert.deepStrictEqual(scoreFor(10, 50, ["quarter", "quarter", "eighth"]),
    scoreFor(10, 50, ["quarter", "eighth"]));
});

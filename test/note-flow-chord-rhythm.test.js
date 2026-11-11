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
const { chooseNoteFlowSuspendedChord, createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordRhythmLayout } = require("../src/model/NoteFlowChordRhythmLayout");
const { createNoteFlowChordNotation, formatNoteFlowExtendedChord } = require("../src/model/NoteFlowChordNotation");
const { NOTE_FLOW_TONALITIES, getNoteFlowTonality } = require("../src/model/NoteFlowTonality");
const { isValidNoteFlowChordPreferences } = require("../src/model/NoteFlowPreferences");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const plan = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", accidentals: "no",
  chordSize: 4, bassNote: true, bpm: 60, seed: 17
});
const sourceChords = plan.blocks.reduce((all, block) => all.concat(block.chords), []);

test("default 4/4 preserves every chord and aligns the optional bass onset", () => {
  const before = JSON.stringify(plan);
  const score = generateNoteFlowChordRhythmicScore(plan);
  assert.strictEqual(score.meter.signature, "4/4");
  assert.deepStrictEqual(score.hands, ["treble", "bass"]);
  assert.deepStrictEqual(score.targets.map(event => event.chord.id), sourceChords.map(chord => chord.id));
  score.targets.forEach(event => {
    assert.deepStrictEqual(event.expectedValues, event.chord.values);
    assert.strictEqual(event.endMs - event.startMs,
      Math.round(event.globalEndTick * 1000 / 96)
        - Math.round(event.globalStartTick * 1000 / 96));
  });
  assert.strictEqual(JSON.stringify(plan), before);
  assert.deepStrictEqual(score, generateNoteFlowChordRhythmicScore(plan));
});

test("3/4 and 6/8 fill every measure without dropping harmony", () => {
  ["3/4", "6/8"].forEach(meter => {
    const score = generateNoteFlowChordRhythmicScore(plan, {
      meter, allowedValues: meter === "3/4"
        ? ["quarter", "eighth"] : ["dotted-quarter", "eighth"],
      restChance: 1
    });
    assert.deepStrictEqual(score.targets.map(event => event.chord.id), sourceChords.map(chord => chord.id));
    assert(score.measures.some(measure => measure.events.some(event => event.kind === "rest")));
    score.measures.forEach(measure => {
      assert.strictEqual(measure.events[0].kind, "note");
      assert.strictEqual(measure.events[0].startTick, 0);
      assert.strictEqual(measure.events[measure.events.length - 1].endTick,
        score.meter.durationTicks);
      measure.events.slice(1).forEach((event, index) => {
        assert.strictEqual(event.startTick, measure.events[index].endTick);
      });
    });
    assert.strictEqual(score.durationTicks, score.measures.length * score.meter.durationTicks);
  });
});

test("different lengths change time, not chord order or number of MIDI targets", () => {
  const quarter = generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["quarter"] });
  const half = generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["half"] });
  assert.strictEqual(quarter.targets.length, half.targets.length);
  assert.deepStrictEqual(quarter.targets.map(event => event.chord.id),
    half.targets.map(event => event.chord.id));
  assert.strictEqual(half.targets[1].startTick, quarter.targets[1].startTick * 2);
  assert(half.durationTicks > quarter.durationTicks);
});

test("without bass, each onset expects only the chord hand", () => {
  const singleHand = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", bassNote: false, seed: 17
  });
  const score = generateNoteFlowChordRhythmicScore(singleHand, {
    meter: "6/8", allowedValues: ["dotted-quarter"]
  });
  assert.deepStrictEqual(score.hands, ["treble"]);
  assert(score.targets.every(event => event.expectedValues.length === 3));
  assert(score.measures.every(measure => measure.events.every(event => (
    event.noteValue === "quarter" && event.dots === 1
  ))));
});

test("normalized chord-menu choices feed the separate rhythm preview model", () => {
  const selected = createNoteFlowChordPlan({
    rhythmMeter: "6/8", rhythmValues: ["dotted-quarter"], seed: 23
  });
  const score = generateNoteFlowChordRhythmicScore(selected, {
    meter: selected.options.rhythmMeter,
    allowedValues: selected.options.rhythmValues,
    bpm: selected.options.bpm
  });
  assert.strictEqual(score.meter.signature, "6/8");
  assert(score.measures.every(measure => measure.events.every(event => (
    event.noteValue === "quarter" && event.dots === 1
  ))));
});

test("mixing changes the pitches per onset and keeps the rhythm and hand ranges", () => {
  const original = generateNoteFlowChordRhythmicScore(plan);
  const mixed = generateNoteFlowChordRhythmicScore(plan, { chordPercent: 25 });
  assert.deepStrictEqual(mixed.targets.map(event => event.startMs), original.targets.map(event => event.startMs));
  assert.strictEqual(mixed.targets.filter(event => event.expectedValues.length > 1).length,
    Math.round(original.targets.length / 4));
  mixed.targets.forEach((event, index) => {
    const source = original.targets[index].chord;
    assert(event.expectedValues.every(value => source.values.includes(value)));
    assert(event.chord.trebleValues.every(value => source.trebleValues.includes(value)));
    assert(event.chord.bassValues.every(value => source.bassValues.includes(value)));
  });
  const singles = generateNoteFlowChordRhythmicScore(plan, { chordPercent: 0 });
  assert(singles.targets.every(event => event.expectedValues.length === 1));
  assert.deepStrictEqual(generateNoteFlowChordRhythmicScore(plan, { chordPercent: 100 }), original);
});

test("invalid meters, values, BPM and empty plans fail clearly", () => {
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { meter: "7/8" }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, {
    meter: "3/4", allowedValues: ["whole"]
  }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { allowedValues: [] }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore(plan, { bpm: 0 }), RangeError);
  assert.throws(() => generateNoteFlowChordRhythmicScore({ blocks: [] }), TypeError);
});

const suspensionTypes = ["sus2", "sus4"];
const enabledSuspensions = {
  sus2: { enabled: true, weight: 100 },
  sus4: { enabled: true, weight: 100 }
};
const isSuspension = event => suspensionTypes.includes(event.chord.quality);

test("suspensions resolve on the next attack with playable grips and correct spelling in every key", () => {
  for (const tonality of NOTE_FLOW_TONALITIES) {
    const advanced = createNoteFlowChordPlan({
      selectedKey: tonality.id, accidentals: "sharpAndFlat",
      handMode: "two", chordSize: 4, bassNotesPerChord: 1,
      suspensions: enabledSuspensions
    });
    const score = generateNoteFlowChordRhythmicScore(advanced, { allowedValues: ["whole"], restChance: 1 });
    assert(score.targets.some(isSuspension), tonality.id);
    const last = score.targets[score.targets.length - 1];
    assert.strictEqual(last.chord.scaleDegree, 1);
    assert(!isSuspension(last));
    score.targets.forEach((target, index) => {
      if (!isSuspension(target)) return;
      const resolution = score.targets[index + 1];
      const [root, suspendedTone, fifth] = target.chord.pitchClasses;
      assert(tonality.scalePitchClasses.includes(suspendedTone));
      assert.strictEqual(resolution.globalStartTick, target.globalEndTick);
      assert.strictEqual(resolution.chord.pitchClasses[0], root);
      assert.strictEqual(resolution.chord.pitchClasses[2], fifth);
      assert(["major", "minor"].includes(resolution.chord.quality));
      assert.strictEqual(target.expectedValues.length, 4);
      assert(!target.expectedValues.some(value => value % 12 === resolution.chord.pitchClasses[1]));
      assert(target.expectedValues.filter(value => value % 12 !== suspendedTone)
        .every(value => resolution.expectedValues.includes(value)));
      const spelling = createNoteFlowChordNotation(target.chord, { tonality, displayKeySignature: true });
      const rootNote = spelling.notes.find(note => note.value % 12 === root);
      const susNote = spelling.notes.find(note => note.value % 12 === suspendedTone);
      const expectedSteps = target.chord.quality === "sus2" ? 1 : 3;
      assert.strictEqual((susNote.writtenStep - rootNote.writtenStep + 70) % 7, expectedSteps);
      assert(/^[A-H][a-z]*sus[24]$/.test(formatNoteFlowExtendedChord(target.chord, tonality, "german")));
      for (const hand of ["bass", "treble"]) {
        const range = advanced.options.ranges[hand];
        assert(target.chord[hand + "Values"].every(value => value >= range.min && value <= range.max));
      }
    });
  }
});

test("both sliders bias the available types and an unplayable grip falls back to the ordinary chord", () => {
  const tonality = getNoteFlowTonality("C-major");
  const chord = sourceChords.find(item => item.scaleDegree === 1);
  const distribution = settings => Array.from({ length: 100 }, (_, roll) => (
    chooseNoteFlowSuspendedChord(chord, tonality, settings, () => roll / 100)
  )).filter(Boolean).map(item => item.quality);
  const preferSus2 = distribution({
    sus2: { enabled: true, weight: 85 }, sus4: { enabled: true, weight: 15 }
  });
  const preferSus4 = distribution({
    sus2: { enabled: true, weight: 15 }, sus4: { enabled: true, weight: 85 }
  });
  assert(preferSus2.filter(type => type === "sus2").length > preferSus4.filter(type => type === "sus2").length);
  assert(preferSus4.filter(type => type === "sus4").length > preferSus2.filter(type => type === "sus4").length);
  const inversion = Object.assign({}, chord, {
    bassValues: [], trebleValues: [52, 55, 60],
    ranges: { bass: { min: 28, max: 48 }, treble: { min: 52, max: 60 } }
  });
  assert.strictEqual(chooseNoteFlowSuspendedChord(inversion, tonality, {
    sus2: { enabled: true, weight: 100 }, sus4: { enabled: false, weight: 100 }
  }, () => 0), null);
});

test("mixed suspension pairs preserve the full-chord ratio across cycles and render both staves", () => {
  const advanced = createNoteFlowChordPlan(Object.assign({}, plan.options, { chordExtensions: enabledSuspensions }));
  const tonality = getNoteFlowTonality(advanced.keyId);
  for (const chordPercent of [0, 10, 25, 50, 75, 100]) {
    let offset = 0;
    let suspensions = 0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const score = generateNoteFlowChordRhythmicScore(advanced, {
        chordPercent, targetOffset: offset, seed: cycle, allowedValues: ["quarter"]
      });
      const count = score.targets.filter(target => target.expectedValues.length > 1).length;
      assert.strictEqual(count, Math.round((offset + score.targets.length) * chordPercent / 100)
        - Math.round(offset * chordPercent / 100));
      score.targets.forEach((target, index) => {
        if (!isSuspension(target)) return;
        suspensions += 1;
        assert(score.targets[index + 1].expectedValues.length > 1);
        assert.strictEqual(score.targets[index + 1].chord.scaleDegree, target.chord.scaleDegree);
      });
      const layout = createNoteFlowChordRhythmLayout(score, { tonality, measureCount: score.measures.length });
      assert.strictEqual(layout.staves.length, count ? 2 : 1);
      offset += score.targets.length;
    }
    if (chordPercent >= 25) assert(suspensions > 0, chordPercent);
  }
});

test("older chord preferences migrate their sus settings and new extensions require valid weights", () => {
  const legacy = Object.assign({}, plan.options);
  delete legacy.chordExtensions;
  assert(isValidNoteFlowChordPreferences(legacy));
  assert(isValidNoteFlowChordPreferences(Object.assign({}, legacy, { suspensions: enabledSuspensions })));
  const migrated = createNoteFlowChordPlan(Object.assign({}, legacy, { suspensions: enabledSuspensions })).options;
  assert.deepStrictEqual(migrated.chordExtensions.sus4, enabledSuspensions.sus4);
  assert.deepStrictEqual(migrated.chordExtensions.dominant7, { enabled: false, weight: 35 });
  assert(isValidNoteFlowChordPreferences(migrated));
  assert(!isValidNoteFlowChordPreferences(Object.assign({}, legacy, {
    suspensions: Object.assign({}, enabledSuspensions, { sus2: { enabled: true, weight: 101 } })
  })));
  assert(!isValidNoteFlowChordPreferences(Object.assign({}, migrated, {
    chordExtensions: Object.assign({}, migrated.chordExtensions, { dominant7: { enabled: true, weight: 101 } })
  })));
  const previousExtensions = Object.assign({}, migrated.chordExtensions, { dominant7: { enabled: true, weight: 67 } });
  delete previousExtensions.major7;
  delete previousExtensions.minor7;
  const previous = Object.assign({}, migrated, { chordExtensions: previousExtensions });
  assert(isValidNoteFlowChordPreferences(previous));
  const updated = createNoteFlowChordPlan(previous).options.chordExtensions;
  assert.deepStrictEqual(updated.dominant7, previousExtensions.dominant7);
  assert.deepStrictEqual(updated.major7, { enabled: false, weight: 35 });
  assert.deepStrictEqual(updated.minor7, { enabled: false, weight: 35 });
});

const enabledSevenths = { dominant7: { enabled: true, weight: 100 } };
const isSeventh = target => target.chord.quality === "dominant7";

test("dominant sevenths use four distinct chord tones and resolve the leading tone and seventh", () => {
  for (const tonality of NOTE_FLOW_TONALITIES) {
    const advanced = createNoteFlowChordPlan({
      selectedKey: tonality.id, accidentals: "sharpAndFlat", chordExtensions: enabledSevenths,
      handMode: "two", chordSize: 4, bassNotesPerChord: 1
    });
    const score = generateNoteFlowChordRhythmicScore(advanced);
    assert(score.targets.some(isSeventh), tonality.id);
    score.targets.forEach((target, index) => {
      if (!isSeventh(target)) return;
      const tonic = score.targets[index + 1];
      const [root, leadingTone, , seventh] = target.chord.pitchClasses;
      assert.strictEqual(target.chord.scaleDegree, 5);
      assert.strictEqual(tonic.chord.scaleDegree, 1);
      assert.strictEqual(tonic.globalStartTick, target.globalEndTick);
      assert.deepStrictEqual(target.chord.pitchClasses.map(pc => (pc - root + 12) % 12), [0, 4, 7, 10]);
      assert.strictEqual(new Set(target.expectedValues.map(value => value % 12)).size, 4);
      const notation = createNoteFlowChordNotation(target.chord, { tonality, displayKeySignature: true });
      const rootNote = notation.notes.find(note => note.value % 12 === root);
      const seventhNote = notation.notes.find(note => note.value % 12 === seventh);
      assert.strictEqual((seventhNote.writtenStep - rootNote.writtenStep + 70) % 7, 6);
      assert(/^[A-H][a-z]*7$/.test(formatNoteFlowExtendedChord(target.chord, tonality, "german")));
      for (const hand of ["bass", "treble"]) {
        const values = target.chord[hand + "Values"];
        const resolved = tonic.chord[hand + "Values"];
        const range = advanced.options.ranges[hand];
        assert(values.every(value => value >= range.min && value <= range.max));
        assert(values.filter(value => value % 12 === leadingTone).every(value => resolved.includes(value + 1)));
        const descent = tonality.mode === "minor" ? 2 : 1;
        assert(values.filter(value => value % 12 === seventh).every(value => resolved.includes(value - descent)));
      }
    });
  }
});

test("sevenths respect grip size, modal harmony and their frequency setting", () => {
  const settings = { chordExtensions: enabledSevenths, seed: 17 };
  const threeTones = createNoteFlowChordPlan(Object.assign({}, settings, { chordSize: 3 }));
  assert(!generateNoteFlowChordRhythmicScore(threeTones).targets.some(isSeventh));
  const modalMinor = createNoteFlowChordPlan(Object.assign({}, settings, { chordSize: 4, selectedKey: "A-minor" }));
  assert(!generateNoteFlowChordRhythmicScore(modalMinor).targets.some(isSeventh));
  const count = weight => {
    const advanced = createNoteFlowChordPlan({
      chordSize: 4, chordExtensions: { dominant7: { enabled: true, weight } }
    });
    return Array.from({ length: 30 }, (_, seed) => generateNoteFlowChordRhythmicScore(advanced, { seed }))
      .reduce((total, score) => total + score.targets.filter(isSeventh).length, 0);
  };
  assert(count(100) > count(10));
});

test("mixed seventh cadences keep the selected chord share without breaking sus pairs", () => {
  const advanced = createNoteFlowChordPlan(Object.assign({}, plan.options, {
    chordExtensions: Object.assign({}, enabledSevenths, enabledSuspensions)
  }));
  for (const chordPercent of [0, 25, 50, 75, 100]) {
    let offset = 0;
    let seventhCount = 0;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const score = generateNoteFlowChordRhythmicScore(advanced, { chordPercent, targetOffset: offset, seed: cycle });
      const fullChords = score.targets.filter(target => target.expectedValues.length > 1).length;
      assert.strictEqual(fullChords, Math.round((offset + score.targets.length) * chordPercent / 100)
        - Math.round(offset * chordPercent / 100));
      score.targets.forEach((target, index) => {
        if (!isSeventh(target) && !isSuspension(target)) return;
        const resolution = score.targets[index + 1];
        assert(resolution.expectedValues.length > 1);
        assert.strictEqual(resolution.chord.scaleDegree, isSeventh(target) ? 1 : target.chord.scaleDegree);
        if (isSeventh(target)) seventhCount += 1;
      });
      offset += score.targets.length;
    }
    if (chordPercent >= 50) assert(seventhCount > 0, chordPercent);
  }
});

const diatonicTypes = ["major7", "minor7"];
const diatonicExtensions = {
  major7: { enabled: true, weight: 100 },
  minor7: { enabled: true, weight: 100 }
};

test("major and minor sevenths keep four diatonic tones and lead into a playable following chord", () => {
  for (const tonality of NOTE_FLOW_TONALITIES) {
    const scale = tonality.scalePitchClasses;
    for (const quality of diatonicTypes) {
      let occurrences = 0;
      for (let seed = 0; seed < 6; seed += 1) {
        const advanced = createNoteFlowChordPlan({
          selectedKey: tonality.id, accidentals: "sharpAndFlat", chordSize: 4, seed,
          chordExtensions: { [quality]: diatonicExtensions[quality] }
        });
        const score = generateNoteFlowChordRhythmicScore(advanced);
        score.targets.forEach((target, index) => {
          if (target.chord.quality !== quality) return;
          occurrences += 1;
          const resolution = score.targets[index + 1];
          const [root, , , seventh] = target.chord.pitchClasses;
          const major = quality === "major7";
          assert.strictEqual(resolution.globalStartTick, target.globalEndTick);
          assert.deepStrictEqual(target.chord.pitchClasses.map(pc => (pc - root + 12) % 12),
            major ? [0, 4, 7, 11] : [0, 3, 7, 10]);
          assert(target.chord.pitchClasses.every(pc => scale.includes(pc)));
          assert.strictEqual(new Set(target.expectedValues.map(value => value % 12)).size, 4);
          const { min, max } = advanced.options.ranges.treble;
          assert(target.expectedValues.every(value => value >= min && value <= max));
          assert(target.expectedValues[3] - target.expectedValues[0] <= 12);
          const previousScaleTone = scale[(scale.indexOf(seventh) + 6) % 7];
          const descent = (seventh - previousScaleTone + 12) % 12;
          assert(target.expectedValues.filter(value => value % 12 === seventh).every(value => (
            resolution.expectedValues.includes(value) || resolution.expectedValues.includes(value - descent)
          )));
          const notation = createNoteFlowChordNotation(target.chord, { tonality, displayKeySignature: true });
          const rootNote = notation.notes.find(note => note.value % 12 === root);
          const seventhNote = notation.notes.find(note => note.value % 12 === seventh);
          assert.strictEqual((seventhNote.writtenStep - rootNote.writtenStep + 70) % 7, 6);
          assert(formatNoteFlowExtendedChord(target.chord, tonality, "german").endsWith(major ? "maj7" : "m7"));
        });
      }
      assert(occurrences > 0, tonality.id + " " + quality);
    }
  }
});

test("each new weight affects frequency, and three-tone grips stay triads", () => {
  const threeTones = createNoteFlowChordPlan({ chordSize: 3, chordExtensions: diatonicExtensions });
  assert(!generateNoteFlowChordRhythmicScore(threeTones).targets.some(target => (
    diatonicTypes.includes(target.chord.quality)
  )));
  for (const quality of diatonicTypes) {
    const count = weight => {
      const advanced = createNoteFlowChordPlan({
        chordSize: 4, chordExtensions: { [quality]: { enabled: true, weight } }
      });
      return Array.from({ length: 25 }, (_, seed) => generateNoteFlowChordRhythmicScore(advanced, { seed }))
        .reduce((total, score) => total + score.targets.filter(target => target.chord.quality === quality).length, 0);
    };
    assert(count(100) > count(10), quality);
  }
});

test("Mixed keeps its chord share and every resolution with all extensions enabled", () => {
  const advanced = createNoteFlowChordPlan(Object.assign({}, plan.options, {
    chordExtensions: Object.assign({}, enabledSevenths, enabledSuspensions, diatonicExtensions)
  }));
  for (const chordPercent of [0, 25, 50, 75, 100]) {
    let offset = 0;
    const heard = new Set();
    for (let seed = 0; seed < 12; seed += 1) {
      const score = generateNoteFlowChordRhythmicScore(advanced, { chordPercent, targetOffset: offset, seed });
      const fullChords = score.targets.filter(target => target.expectedValues.length > 1).length;
      assert.strictEqual(fullChords, Math.round((offset + score.targets.length) * chordPercent / 100)
        - Math.round(offset * chordPercent / 100));
      score.targets.forEach((target, index) => {
        const quality = target.chord.quality;
        if (!isSeventh(target) && !isSuspension(target) && !diatonicTypes.includes(quality)) return;
        heard.add(quality);
        const resolution = score.targets[index + 1];
        assert(resolution.expectedValues.length > 1);
        assert.strictEqual(resolution.globalStartTick, target.globalEndTick);
        if (isSeventh(target)) assert.strictEqual(resolution.chord.scaleDegree, 1);
        if (isSuspension(target)) assert.strictEqual(resolution.chord.scaleDegree, target.chord.scaleDegree);
      });
      offset += score.targets.length;
    }
    if (chordPercent >= 75) diatonicTypes.forEach(type => assert(heard.has(type), type));
  }
});

console.log("Chord rhythm model: OK");

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (loaded, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loaded, filename);
  return loaded._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
let marker, wrongPitchValue, input, tonality, generator, rhythmGenerator, timelineModel, staffModel, chordPlan, chordRhythm;
try {
  const markers = require("../src/model/NoteFlowWrongPitchMarkers");
  marker = markers.createNoteFlowWrongPitchMarker;
  wrongPitchValue = markers.getNoteFlowWrongPitchValue;
  input = require("../src/model/NoteFlowInput");
  tonality = require("../src/model/NoteFlowTonality");
  generator = require("../src/model/NoteFlowGenerator");
  rhythmGenerator = require("../src/model/NoteFlowRhythmGenerator");
  timelineModel = require("../src/model/NoteFlowRhythmTimeline");
  staffModel = require("../src/model/NoteFlowRhythmStaffLayout");
  chordPlan = require("../src/model/NoteFlowChordPlan");
  chordRhythm = require("../src/model/NoteFlowChordRhythm");
} finally {
  Module._extensions[".js"] = originalLoader;
}

const staves = [
  { clef: "treble", bottomY: 100, bottomStep: 30, lineYs: [60, 70, 80, 90, 100] },
  { clef: "bass", bottomY: 175, bottomStep: 18, lineYs: [135, 145, 155, 165, 175] }
];
function target(notes) {
  return { expectedValues: notes.map(note => note.value),
    notes: notes.map(note => ({ hand: note.clef, note })) };
}
function map(playedValue, notes = [{ value: 60, clef: "treble" }], options = {}) {
  return marker(Object.assign({ target: target(notes), playedValue, staves }, options));
}
function test(name, body) { body(); process.stdout.write(`✓ ${name}\n`); }
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("layout-free classification preserves wrong MIDI zero and distinguishes it from null", () => {
  const current = { expectedValues: [48, 52, 55] };
  assert.strictEqual(wrongPitchValue({ target: current, playedValue: 0 }), 0);
  assert.strictEqual(wrongPitchValue({ target: current, playedValue: 48 }), null);
  assert.strictEqual(wrongPitchValue({ target: current, playedValue: 0, inputMode: "touch" }), null);
  assert.strictEqual(wrongPitchValue({ target: current, playedValue: null }), null);
  assert.strictEqual(wrongPitchValue({ target: current, playedValue: 2, inputMode: "touch", pendingValues: [48] }),
    input.getNoteFlowTouchAudioValue(current.expectedValues, [48], 2));
  assert.strictEqual(map(0).value, 0);
});

test("internal middle C remains C4=48; a wrong MIDI octave keeps its true staff pitch", () => {
  const result = map(48);
  assert.strictEqual(result.value, 48);
  assert.strictEqual(result.note, "C4");
  assert.strictEqual(result.writtenStep, 28);
  assert.strictEqual(result.y, 110);
  assert.deepStrictEqual(result.ledgerLineYs, [110]);
  assert.strictEqual(map(60), null);
  assert.strictEqual(map(48, undefined, { inputMode: "touch" }), null);
});

test("all simultaneous melody pitches remain marker-free regardless of input/pending order", () => {
  const notes = [{ value: 36, clef: "bass" }, { value: 60, clef: "treble" }];
  for (const note of notes) {
    assert.strictEqual(map(note.value, notes, { pendingValues: [60] }), null);
    assert.strictEqual(map(note.value, notes, { pendingValues: [36, 60], inputMode: "touch" }), null);
    assert.strictEqual(map(note.value % 12 + 24, notes, { inputMode: "touch" }), null);
  }
  assert.strictEqual(map(48, notes).value, 48);
});

test("all chord tones count, including legacy bass and already-recognized repeated tones", () => {
  const chords = [
    { values: [48, 52, 55, 60, 64, 67, 36], trebleValues: [48, 52, 55, 60, 64, 67], bassValues: [36] },
    { values: [48, 52, 55], bassValue: 36 }
  ];
  for (const chord of chords) {
    const expected = chord.bassValue == null ? chord.values : chord.values.concat(chord.bassValue);
    for (const value of expected) {
      assert.strictEqual(marker({ target: { chord, expectedValues: expected }, playedValue: value,
        pendingValues: expected.slice(), staves }), null);
      assert.strictEqual(marker({ target: { chord, expectedValues: expected }, playedValue: value % 12,
        pendingValues: expected.slice(), inputMode: "touch", staves }), null);
    }
  }
});

test("timing-only, missing-note and strike-timeout feedback cannot create a pitch marker", () => {
  const current = target([{ value: 60, clef: "treble" }]);
  for (const feedback of ["wrong", "early", "late", "missed"]) {
    assert.strictEqual(marker({ target: Object.assign({ feedback }, current), playedValue: 60, staves }), null);
    assert.strictEqual(marker({ target: Object.assign({ feedback }, current), staves }), null);
  }
  assert.strictEqual(marker({ target: { kind: "rest", expectedValues: [60] }, playedValue: 61, staves }), null);
});

test("wrong touch markers use the actual existing audio mapping rather than raw pitch class", () => {
  const result = map(9, undefined, { inputMode: "touch" });
  assert.strictEqual(input.getNoteFlowTouchAudioValue([60], [], 9), 57);
  assert.strictEqual(result.value, 57);
  assert.strictEqual(result.note, "A4");
  assert.strictEqual(result.y, 85);
  const notes = [{ value: 36, clef: "bass" }, { value: 60, clef: "treble" }];
  const upper = map(2, notes, { inputMode: "touch", pendingValues: [36] });
  assert.strictEqual(upper.value, input.getNoteFlowTouchAudioValue([36, 60], [36], 2));
  assert.strictEqual(upper.value, 38);
  assert.strictEqual(upper.clef, "bass");
});

test("nearest assignment checks every chord tone, not just the first pitch or voice", () => {
  const current = { chord: { values: [36, 48, 52, 55, 60, 64, 67],
    bassValues: [36, 48], trebleValues: [52, 55, 60, 64, 67] } };
  const high = marker({ target: current, playedValue: 66, staves });
  assert.strictEqual(high.expectedValue, 67);
  assert.strictEqual(high.clef, "treble");
  const low = marker({ target: current, playedValue: 38, staves });
  assert.strictEqual(low.expectedValue, 36);
  assert.strictEqual(low.clef, "bass");
});

test("equal distance chooses lower sounding pitch; same-pitch unison chooses staff order", () => {
  const notes = [{ value: 36, clef: "bass" }, { value: 60, clef: "treble" }];
  assert.strictEqual(map(48, notes).clef, "bass");
  assert.strictEqual(map(48, notes.slice().reverse(), { staves: staves.slice().reverse() }).clef, "bass");
  const unison = [{ value: 48, clef: "bass" }, { value: 48, clef: "treble" }];
  assert.strictEqual(map(49, unison).clef, "treble");
  assert.strictEqual(map(49, unison.slice().reverse()).clef, "treble");
  assert.strictEqual(map(49, unison, { staves: staves.slice().reverse() }).clef, "bass");
});

test("melody bottomLineY staves keep their current coordinates and proper ledger lines", () => {
  const melodyStaff = [{ clef: "treble", bottomLineY: 130, lineYs: [90, 100, 110, 120, 130] }];
  const c = map(48, undefined, { staves: melodyStaff });
  assert.strictEqual(c.y, 140);
  assert.deepStrictEqual(c.ledgerLineYs, [140]);
  const low = map(36, undefined, { staves: melodyStaff });
  assert.deepStrictEqual(low.ledgerLineYs, [140, 150, 160, 170]);
});

test("existing notation yields sharp/flat placement, natural glyphs and key octave boundaries", () => {
  const sharp = map(49);
  const flat = map(49, undefined, { preferSharp: false, noteNaming: "international" });
  assert.strictEqual(sharp.accidental, "sharp");
  assert.strictEqual(flat.accidental, "flat");
  assert.strictEqual(sharp.y, 110);
  assert.strictEqual(flat.y, 105);
  assert.strictEqual(sharp.note, "Cis4");
  assert.strictEqual(flat.note, "D♭4");
  assert.strictEqual(map(53, undefined, { tonality: tonality.getNoteFlowTonality("G-major"),
    displayKeySignature: true }).accidental, "nat");
  assert.strictEqual(map(54, undefined, { tonality: tonality.getNoteFlowTonality("G-major"),
    displayKeySignature: true }).accidental, null);
  assert.strictEqual(map(59, undefined, { tonality: tonality.getNoteFlowTonality("F-major"),
    displayKeySignature: true, preferSharp: false }).accidental, "nat");
  const ces = map(47, undefined, { tonality: tonality.getNoteFlowTonality("C-flat-major"),
    displayKeySignature: true, preferSharp: false });
  assert.strictEqual(ces.writtenStep, 28);
  assert.strictEqual(ces.y, 110);
  assert.strictEqual(ces.accidental, null);
});

test("all thirty keys and both spelling preferences reconstruct the played sounding pitch", () => {
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const alterations = { flat: -1, sharp: 1, dblflat: -2, dblsharp: 2, nat: 0 };
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  for (const key of tonality.NOTE_FLOW_TONALITIES) {
    for (const preferSharp of [true, false]) {
      for (let playedValue = 24; playedValue <= 96; playedValue += 1) {
        if (playedValue === 60) continue;
        const result = map(playedValue, undefined, { tonality: key, displayKeySignature: true, preferSharp });
        const letterIndex = result.writtenStep % 7;
        const signature = key.signature.alteredNotes.find(entry => entry.note === letters[letterIndex]);
        const adjustment = result.accidental == null ? (signature ? (signature.accidental === "sharp" ? 1 : -1) : 0)
          : alterations[result.accidental];
        assert.strictEqual(Math.floor(result.writtenStep / 7) * 12 + natural[letterIndex] + adjustment, playedValue);
      }
    }
  }
});

test("real generated two-staff rhythm targets and chord targets map without changing them", () => {
  const cycle = generator.generateNoteFlowCycle({ handMode: "two", secondaryNotesPerBlock: 8, seed: "wrong-pitch-mapping" });
  const score = rhythmGenerator.generateNoteFlowRhythmicScore(cycle, {
    meter: "4/4", measureCount: 2, allowedValues: { treble: ["eighth"], bass: ["half"] }
  });
  const timeline = timelineModel.createNoteFlowRhythmTimeline(score, { bpm: 60 });
  const layout = staffModel.createNoteFlowRhythmStaffLayout(cycle, timeline);
  const current = timeline.targets[0];
  const before = JSON.stringify({ current, staves: layout.staves });
  for (const value of current.expectedValues) assert.strictEqual(marker({ target: current, playedValue: value, staves: layout.staves }), null);
  const wrong = Array.from({ length: 72 }, (_, index) => 24 + index).find(value => !current.expectedValues.includes(value));
  assert.strictEqual(marker({ target: current, playedValue: wrong, staves: layout.staves }).value, wrong);
  assert.strictEqual(JSON.stringify({ current, staves: layout.staves }), before);

  const plan = chordPlan.createNoteFlowChordPlan({ handMode: "two", bassNotesPerChord: 3, trebleNotesPerChord: 4,
    accidentals: "sharpAndFlat", seed: "wrong-chord-mapping" });
  const chordScore = chordRhythm.generateNoteFlowChordRhythmicScore(plan, { bpm: 60 });
  const chordTarget = chordScore.targets[0];
  const frozen = freeze({ target: chordTarget, staves: JSON.parse(JSON.stringify(staves)), pendingValues: [] });
  for (const value of chordTarget.expectedValues) assert.strictEqual(marker(Object.assign({ playedValue: value }, frozen)), null);
  const wrongChord = Array.from({ length: 72 }, (_, index) => 24 + index).find(value => !chordTarget.expectedValues.includes(value));
  assert.deepStrictEqual(marker(Object.assign({ playedValue: wrongChord }, frozen)),
    marker(Object.assign({ playedValue: wrongChord }, frozen)));
});

test("missing/invalid inputs and ambiguous bare two-staff targets are ignored safely", () => {
  assert.strictEqual(marker(), null);
  for (const played of [null, undefined, "", false, NaN, Infinity, 48.5, -1, 128]) assert.strictEqual(map(played), null);
  assert.strictEqual(marker({ target: {}, playedValue: 49, staves }), null);
  assert.strictEqual(marker({ target: { expectedValues: [60] }, playedValue: 49, staves }), null);
  assert.strictEqual(marker({ target: { expectedValues: [60] }, playedValue: 49, staves: [staves[0]] }).value, 49);
  assert.strictEqual(map(49, undefined, { staves: [] }), null);
});

process.stdout.write("Note Flow wrong-pitch marker tests passed.\n");

const groupMarkers = require("../src/model/NoteFlowWrongPitchMarkers").groupNoteFlowWrongPitchMarkers;

test("C4/Cis4 collisions in C/D major retain both actual values with one position and no shared accidental", () => {
  for (const keyId of ["C-major", "D-major"]) {
    const options = { tonality: tonality.getNoteFlowTonality(keyId), displayKeySignature: true };
    const notes = [{ value: 52, clef: "treble" }];
    const c = Object.assign({ id: "first", expiresAt: 200 }, map(48, notes, options));
    const cis = Object.assign({ id: "second", expiresAt: 300 }, map(49, notes, options));
    assert.strictEqual(c.y, cis.y);
    assert.strictEqual(c.writtenStep, cis.writtenStep);
    const original = freeze([cis, c]);
    const before = JSON.stringify(original);
    const groups = groupMarkers(original);
    assert.strictEqual(groups.length, 1);
    assert.deepStrictEqual(groups[0].values, [48, 49]);
    assert.deepStrictEqual(groups[0].notes, ["C4", "Cis4"]);
    assert.strictEqual(groups[0].note, "C4 / Cis4");
    assert.strictEqual(groups[0].colliding, true);
    assert.strictEqual(groups[0].accidental, null);
    assert.strictEqual(groups[0].y, c.y);
    assert.strictEqual(groups[0].writtenStep, c.writtenStep);
    assert.deepStrictEqual(groups[0].ledgerLineYs, c.ledgerLineYs);
    assert.notStrictEqual(groups[0].ledgerLineYs, c.ledgerLineYs);
    assert.strictEqual(JSON.stringify(original), before);
    assert.deepStrictEqual(groupMarkers(original.slice().reverse()), groups);
  }
});

test("duplicate played values remain a single marker; membership changes keep the position id and restore actual accidental", () => {
  const c = Object.assign({ id: "c", expiresAt: 100 }, map(48));
  const cis = Object.assign({ id: "cis", expiresAt: 200 }, map(49));
  const repeated = Object.assign({}, cis, { id: "cis-repeat", expiresAt: 300 });
  const grouped = groupMarkers([cis, repeated]);
  assert.strictEqual(grouped.length, 1);
  assert.deepStrictEqual(grouped[0].values, [49]);
  assert.deepStrictEqual(grouped[0].notes, ["Cis4"]);
  assert.strictEqual(grouped[0].colliding, false);
  assert.strictEqual(grouped[0].accidental, "sharp");
  const collision = groupMarkers([c, cis])[0];
  const remaining = groupMarkers([cis])[0];
  assert.strictEqual(collision.id, remaining.id);
  assert.strictEqual(remaining.y, cis.y);
  assert.strictEqual(remaining.accidental, cis.accidental);
  assert.strictEqual(remaining.note, cis.note);
  assert.strictEqual(c.expiresAt, 100);
  assert.strictEqual(cis.expiresAt, 200);
  assert.strictEqual(repeated.expiresAt, 300);
  const natural = map(48, undefined, { tonality: tonality.getNoteFlowTonality("D-major"), displayKeySignature: true });
  assert.strictEqual(groupMarkers([natural])[0].accidental, "nat");
});

test("staff, written step and exact y each keep groups separate; value/name ordering stays matched", () => {
  const baseline = map(48);
  const input = freeze([
    Object.assign({}, baseline, { value: 49, note: "Cis4" }),
    baseline,
    Object.assign({}, baseline, { clef: "bass" }),
    Object.assign({}, baseline, { writtenStep: baseline.writtenStep + 1 }),
    Object.assign({}, baseline, { y: baseline.y + 0.01 })
  ]);
  const before = JSON.stringify(input);
  const groups = groupMarkers(input);
  assert.strictEqual(groups.length, 4);
  assert.strictEqual(new Set(groups.map(group => group.id)).size, 4);
  assert.strictEqual(groups.filter(group => group.colliding).length, 1);
  assert.deepStrictEqual(groupMarkers(input.slice().reverse()), groups);
  groups.forEach(group => {
    assert.strictEqual(group.values.length, group.notes.length);
    group.values.forEach((value, index) => assert.strictEqual(group.notes[index], value === 49 ? "Cis4" : "C4"));
  });
  groups[0].ledgerLineYs.push(999);
  assert.strictEqual(JSON.stringify(input), before);
});

test("grouping accepts wrong MIDI zero without conflating it with empty or invalid marker data", () => {
  const zero = map(0);
  const groups = groupMarkers([null, zero, { value: 48 }, undefined]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].values, [0]);
  assert.strictEqual(groups[0].note, "C0");
  assert.strictEqual(groups[0].colliding, false);
  assert.deepStrictEqual(groupMarkers([]), []);
  assert.deepStrictEqual(groupMarkers(null), []);
});

process.stdout.write("Note Flow wrong-pitch grouping tests passed.\n");

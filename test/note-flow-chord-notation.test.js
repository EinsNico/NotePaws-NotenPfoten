const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function (loaded, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loaded, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loaded._compile(transformed.code, filename);
};
const { createNoteFlowChordNotation } = require("../src/model/NoteFlowChordNotation");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

const melodyTraining = fs.readFileSync(
  path.resolve(__dirname, "../src/components/NoteFlowGamePreview.vue"), "utf8"
);
const chordTraining = fs.readFileSync(
  path.resolve(__dirname, "../src/components/NoteFlowChordTraining.vue"), "utf8"
);
const sharedSessionStyles = fs.readFileSync(
  path.resolve(__dirname, "../src/styles/training-session.css"), "utf8"
);
assert(melodyTraining.includes('<style scoped src="../styles/training-session.css">'));
assert((sharedSessionStyles.match(/overscroll-behavior: none;/g) || []).length >= 2);
assert((chordTraining.match(/overscroll-behavior: none;/g) || []).length >= 2);

const c = createNoteFlowChordNotation({ values: [48, 52, 55], bassValue: 36 });
assert.strictEqual(c.staves.length, 2);
assert.strictEqual(c.notes[0].y, 110); // C4 below the treble staff
assert.deepStrictEqual(c.notes[0].ledgerLineYs, [110]);
assert.strictEqual(c.notes[3].y, 160); // C3 in the bass staff
const sharp = createNoteFlowChordNotation({ values: [61], bassValue: null }, true);
const flat = createNoteFlowChordNotation({ values: [61], bassValue: null }, false);
assert.strictEqual(sharp.notes[0].accidental, "sharp");
assert.strictEqual(flat.notes[0].accidental, "flat");
assert.notStrictEqual(sharp.notes[0].y, flat.notes[0].y);
const naturalPitches = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
NOTE_FLOW_TONALITIES.forEach(key => {
  [3, 4].forEach(chordSize => [false, true].forEach(bassNote => {
    const plan = createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: key.id,
      accidentals: "sharpAndFlat", chordSize, bassNote }, 1);
    plan.blocks.forEach(block => block.chords.forEach(chord => {
      const notation = createNoteFlowChordNotation(chord, { tonality: key,
        displayKeySignature: true, preferSharp: key.fifths >= 0 });
      assert.strictEqual(notation.staves.length, bassNote ? 2 : 1);
      assert(notation.staves.every(staff => staff.keySignature.length === Math.abs(key.fifths)));
      assert.deepStrictEqual(notation.notes.map(note => note.value),
        chord.trebleValues.concat(chord.bassValues));
      assert(notation.notes.every(note => note.y >= 10 && note.y <= notation.height - 10));
      notation.notes.forEach(note => {
        const octave = Math.floor(note.writtenStep / 7);
        assert.strictEqual(octave * 12 + naturalPitches[note.letter] + note.alteration, note.value);
      });
    }));
  }));
});
const sharpMinor = createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: "A-sharp-minor",
  accidentals: "sharpAndFlat", chordSize: 3 });
const sharpDominant = sharpMinor.blocks.flatMap(block => block.chords).find(chord => chord.romanNumeral === "V");
assert(createNoteFlowChordNotation(sharpDominant, { tonality: NOTE_FLOW_TONALITIES.find(key => key.id === "A-sharp-minor"),
  displayKeySignature: true }).notes.some(note => note.letter === "G" && note.accidental === "dblsharp"));
const flatMinor = createNoteFlowChordPlan({ tonalityMode: "circle", selectedKey: "C-minor",
  accidentals: "sharpAndFlat", chordSize: 3 });
const flatDominant = flatMinor.blocks.flatMap(block => block.chords).find(chord => chord.romanNumeral === "V");
assert(createNoteFlowChordNotation(flatDominant, { tonality: NOTE_FLOW_TONALITIES.find(key => key.id === "C-minor"),
  displayKeySignature: true }).notes.some(note => note.letter === "B" && note.accidental === "nat"));
assert(createNoteFlowChordNotation(flatDominant, { tonality: NOTE_FLOW_TONALITIES.find(key => key.id === "C-minor"),
  displayKeySignature: false }).staves.every(staff => staff.keySignature.length === 0));
console.log("note-flow chord notation: ok");

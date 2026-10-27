const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const model = require("../src/model/Workshop");
const tonality = require("../src/model/WorkshopTonality");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const SIGNATURE_POSITIONS = {
  treble: { sharp: ["F5", "C5", "G5", "D5", "A4", "E5", "B4"], flat: ["B4", "E5", "A4", "D5", "G4", "C5", "F4"] },
  bass: { sharp: ["F3", "C3", "G3", "D3", "A2", "E3", "B2"], flat: ["B2", "E3", "A2", "D3", "G2", "C3", "F2"] }
};
function test(name, operation) {
  operation(); process.stdout.write("✓ workshop tonality model: " + name + "\n");
}
function note(id, step, alter, octave, startSlot = 0, noteValue = "quarter") {
  return { id, kind: "note", noteValue, startSlot, pitch: { step, alter, octave } };
}
function existingScore() {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Exact pitches", 4).score, true);
  score = model.setWorkshopMeasureContext(score, 1, { meter: "3/4", clef: "bass" });
  score = model.setWorkshopMeasureContext(score, 2, { clef: "treble" }, 1);
  score.parts[0].measures[0].events = [
    Object.assign(note("remembered-sharp", "F", 1, 4, 0, "eighth"), { originalNoteValue: "whole", beamGroupId: "retained-beam" }),
    Object.assign(note("natural", "C", 0, 4, 1, "sixteenth"), { beamGroupId: "retained-beam" }),
    { id: "pause", kind: "rest", pitch: null, startSlot: 4, noteValue: "quarter" }
  ];
  score.parts[0].measures[1].events = [note("ces", "C", -1, 4)];
  score.parts[0].measures[2].events = [note("eis", "E", 1, 4)];
  score.parts[0].measures[3].events = [note("his", "B", 1, 4)];
  score.parts[1].measures[0].events = [note("b-flat", "B", -1, 2)];
  score.parts[1].measures[1].events = [note("fes", "F", -1, 3)];
  score.parts[1].measures[2].events = [note("cis", "C", 1, 3)];
  score.parts[1].measures[3].events = [note("lower-natural", "E", 0, 3, 0, "half")];
  assert(model.isValidWorkshopScore(score)); return score;
}

test("all 30 existing major and minor keys give their exact signature order, octaves and new-note baseline", () => {
  assert.strictEqual(NOTE_FLOW_TONALITIES.length, 30);
  assert.strictEqual(new Set(NOTE_FLOW_TONALITIES.map(key => key.id)).size, 30);
  for (const key of NOTE_FLOW_TONALITIES) {
    assert(tonality.isValidWorkshopKeyId(key.id));
    const type = key.fifths > 0 ? "sharp" : "flat";
    const count = Math.abs(key.fifths); const alter = Math.sign(key.fifths);
    const steps = (key.fifths > 0 ? ["F", "C", "G", "D", "A", "E", "B"] : ["B", "E", "A", "D", "G", "C", "F"]).slice(0, count);
    for (const clef of ["treble", "bass"]) {
      const expected = SIGNATURE_POSITIONS[clef][type].slice(0, count).map(position => ({
        step: position[0], alter, octave: Number(position[1])
      }));
      assert.deepStrictEqual(tonality.workshopKeySignature(key.id, clef), expected, key.id + " " + clef);
      assert.deepStrictEqual(tonality.workshopKeySignature(key.id, clef),
        tonality.workshopKeySignature(key.relativeKeyId, clef));
    }
    for (const [index, step] of LETTERS.entries()) {
      const baseline = steps.includes(step) ? alter : 0;
      assert.strictEqual(tonality.workshopKeyAlter(key.id, step), baseline, key.id + " " + step);
      const pitch = { step, alter: tonality.workshopKeyAlter(key.id, step), octave: 4 };
      assert.strictEqual(model.workshopPitchValue(pitch), 48 + NATURAL[index] + baseline);
    }
    const draft = model.createWorkshopDraft("Valid " + key.id);
    draft.score.keyId = key.id;
    assert(model.isValidWorkshopScore(draft.score));
  }
  assert.deepStrictEqual(tonality.workshopKeySignature("C-major", "treble"), []);
  assert.deepStrictEqual(tonality.workshopKeySignature("A-minor", "bass"), []);
});

test("changing to any key preserves absolute pitches, rhythm, notation metadata and playback in both active or hidden staves", () => {
  const original = existingScore(); const serialized = JSON.stringify(original);
  for (const enabled of [true, false]) {
    const score = model.setWorkshopSecondStaffEnabled(original, enabled);
    const before = model.workshopTimeline(score);
    for (const key of NOTE_FLOW_TONALITIES) {
      const changed = model.setWorkshopKey(score, key.id);
      const expected = model.cloneWorkshop(score); expected.keyId = key.id;
      assert(changed && model.isValidWorkshopScore(changed));
      assert.deepStrictEqual(changed, expected);
      assert.deepStrictEqual(model.workshopTimeline(changed), before);
      changed.parts[0].measures[0].events[0].pitch.alter = 0;
      assert.strictEqual(score.parts[0].measures[0].events[0].pitch.alter, 1);
    }
  }
  assert.strictEqual(JSON.stringify(original), serialized);
  const changed = model.setWorkshopKey(original, "G-major");
  const moved = model.moveWorkshopMeasure(changed, 3, 0);
  const inserted = model.insertWorkshopMeasures(moved, 0, 2);
  const deleted = model.removeWorkshopMeasure(inserted, 1);
  assert(deleted && model.isValidWorkshopScore(deleted));
  assert.strictEqual(deleted.keyId, "G-major");
});

test("unknown and hostile key values are rejected by score validation and the setter without mutating input", () => {
  const score = existingScore(); const before = JSON.stringify(score);
  const hostileObject = { toString() { throw new Error("must not coerce arbitrary key values"); } };
  const invalid = ["constructor", "toString", "__proto__", "prototype", "", "c-major", "C-MAJOR", "H-major", "C-major ", "C-double-sharp-major",
    undefined, null, true, 0, ["C-major"], new String("C-major"), hostileObject];
  for (const keyId of invalid) {
    assert.strictEqual(tonality.isValidWorkshopKeyId(keyId), false);
    assert.strictEqual(model.setWorkshopKey(score, keyId), null);
    const malformed = model.cloneWorkshop(score); malformed.keyId = keyId;
    assert.strictEqual(model.isValidWorkshopScore(malformed), false);
    for (const step of LETTERS) assert.strictEqual(tonality.workshopKeyAlter(keyId, step), 0);
    assert.deepStrictEqual(tonality.workshopKeySignature(keyId, "treble"), []);
  }
  assert.strictEqual(tonality.workshopKeyAlter("G-major", "constructor"), 0);
  assert.strictEqual(tonality.workshopKeyAlter("G-major", "f"), 0);
  for (const clef of ["percussion", "constructor", "toString", "__proto__", undefined, null, hostileObject]) {
    assert.deepStrictEqual(tonality.workshopKeySignature("C-sharp-major", clef), []);
  }
  const badScore = model.cloneWorkshop(score); badScore.parts[1].measures[0].events[0].pitch.octave = 8;
  assert.strictEqual(model.setWorkshopKey(badScore, "G-major"), null);
  assert.strictEqual(model.setWorkshopKey(null, "G-major"), null);
  assert.strictEqual(JSON.stringify(score), before);
});

test("key-signature results cannot mutate shared tonality definitions or subsequent results", () => {
  const before = JSON.stringify(NOTE_FLOW_TONALITIES);
  const signature = tonality.workshopKeySignature("C-flat-major", "bass");
  const expected = model.cloneWorkshop(signature);
  signature[0].step = "C"; signature[0].alter = 1; signature.push({ step: "F", alter: 1, octave: 5 });
  assert.deepStrictEqual(tonality.workshopKeySignature("C-flat-major", "bass"), expected);
  assert.strictEqual(JSON.stringify(NOTE_FLOW_TONALITIES), before);
});

test("schema-one C-major revisions stay byte-for-byte intact and every new key round-trips through saved libraries", () => {
  const draft = model.createWorkshopDraft("Legacy saved piece", 4);
  draft.score.parts[0].measures[0].events = [{ id: "legacy", kind: "note", noteValue: "quarter", pitch: { step: "C", alter: 0, octave: 4 } }];
  const oldScore = JSON.stringify(draft.score);
  const first = model.saveWorkshopDraft(null, draft, "2026-10-03T10:00:00.000Z");
  const oldRevision = JSON.stringify(first.piece.revisions[0]); const oldLibrary = JSON.stringify(first.library);
  let saved = first;
  for (const key of NOTE_FLOW_TONALITIES) {
    const opened = model.openWorkshopPiece(saved.piece);
    opened.score = model.setWorkshopKey(opened.score, key.id);
    saved = model.saveWorkshopDraft(saved.library, opened, "2026-10-03T10:01:00.000Z");
    const restored = JSON.parse(JSON.stringify(saved.library));
    assert(model.isValidWorkshopLibrary(restored));
    assert.strictEqual(model.openWorkshopPiece(restored.pieces[0]).score.keyId, key.id);
    assert.deepStrictEqual(model.openWorkshopPiece(restored.pieces[0]).score.parts, draft.score.parts);
    assert.strictEqual(JSON.stringify(saved.piece.revisions[0]), oldRevision);
    assert.strictEqual(JSON.stringify(model.openWorkshopPiece(saved.piece, first.piece.currentRevisionId).score), oldScore);
  }
  assert.strictEqual(saved.piece.revisions.length, 31);
  assert.strictEqual(saved.library.version, 1);
  assert.strictEqual(JSON.stringify(first.library), oldLibrary);
  assert.strictEqual(JSON.stringify(draft.score), oldScore);
});

process.stdout.write("Workshop tonality model tests passed.\n");

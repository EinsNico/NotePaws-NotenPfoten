const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { layoutWorkshopAccidentals } = require("../src/model/WorkshopAccidentals");
const { workshopKeyAlter } = require("../src/model/WorkshopTonality");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
Module._extensions[".js"] = originalLoader;

function test(name, operation) { operation(); process.stdout.write("✓ workshop accidentals: " + name + "\n"); }
function note(id, alter = 0, slot = 0, extra = {}) {
  return Object.assign({ id, kind: "note", noteValue: "quarter", startSlot: slot,
    pitch: { step: "F", alter, octave: 4 } }, extra);
}
function signs(events, keyId = "C-major") { return layoutWorkshopAccidentals(events, keyId).map(event => event.accidental); }
function signsById(events, keyId = "C-major") {
  return Object.fromEntries(layoutWorkshopAccidentals(events, keyId).map(event => [event.id, event.accidental]));
}

test("every existing key supplies its exact baseline without accidental duplication", () => {
  for (const key of NOTE_FLOW_TONALITIES) {
    const events = ["C", "D", "E", "F", "G", "A", "B"].map((step, index) => note(step, workshopKeyAlter(key.id, step), index,
      { pitch: { step, alter: workshopKeyAlter(key.id, step), octave: 4 } }));
    assert(signs(events, key.id).every(sign => sign === null), key.id);
  }
});

test("memory survives rests and crosses voices while keeping octaves separate", () => {
  const events = [note("first", 1), { id: "rest", kind: "rest", pitch: null, startSlot: 1, noteValue: "eighth" },
    note("other-voice", 1, 2, { voice: 2 }), note("other-octave", 1, 3, { pitch: { step: "F", alter: 1, octave: 5 } }),
    note("cancel", 0, 4), note("repeat-natural", 0, 5, { voice: 4 }), note("sharp-again", 1, 6)];
  assert.deepStrictEqual(signs(events), ["sharp", null, null, "sharp", "nat", null, "sharp"]);
});

test("a fresh measure resets memory to its own key signature", () => {
  assert.deepStrictEqual(signs([note("cancel", 0)], "G-major"), ["nat"]);
  assert.deepStrictEqual(signs([note("new-bar", 1)], "G-major"), [null]);
  assert.deepStrictEqual(signs([note("changed-key", 0)], "C-major"), [null]);
  assert.deepStrictEqual(signs([note("unkeyed", 1)], "C-major"), ["sharp"]);
});

test("simultaneous natural and sharp notes are explicit independent of storage order", () => {
  const natural = note("natural"), sharp = note("sharp", 1, 0, { voice: 2 }), later = note("later", 0, 2);
  const expected = { natural: "nat", sharp: "sharp", later: "nat" };
  for (const events of [[natural, sharp, later], [sharp, natural, later], [later, sharp, natural]]) {
    assert.deepStrictEqual(signsById(events), expected);
  }
  assert.deepStrictEqual(signsById([natural, sharp, note("later", 1, 2)]),
    { natural: "nat", sharp: "sharp", later: "sharp" });
});

test("three conflicting alterations remain explicit and do not leak a random inherited pitch", () => {
  const events = [note("flat", -1), note("sharp", 1, 0, { voice: 2 }), note("natural", 0, 0, { voice: 3 }),
    note("later", -1, 1), note("repeat", -1, 2)];
  assert.deepStrictEqual(signs(events), ["flat", "sharp", "nat", "flat", null]);
  assert.deepStrictEqual(signsById(events.slice().reverse()), signsById(events));
});

test("identical simultaneous pitches share one stable accidental", () => {
  const events = [note("second-voice", 1, 0, { voice: 2 }), note("first-voice", 1), note("repeat", 1, 2)];
  assert.deepStrictEqual(signsById(events), { "second-voice": null, "first-voice": "sharp", repeat: null });
  assert.deepStrictEqual(signsById(events.slice().reverse()), signsById(events));
});

test("a grace accidental is processed before the principal note in either storage order", () => {
  const principal = note("principal"), grace = note("grace", 1, 0, { grace: true, noteValue: "eighth" });
  for (const events of [[principal, grace], [grace, principal]]) {
    assert.deepStrictEqual(signsById(events), { principal: "nat", grace: "sharp" });
  }
  const keyed = note("keyed", 1), flatGrace = note("grace", -1, 0, { grace: true });
  assert.deepStrictEqual(signsById([keyed, flatGrace], "G-major"), { keyed: "sharp", grace: "flat" });
});

test("ordered grace phrases retain their own order before the principal onset", () => {
  const events = [note("principal"), note("second", 1, 0, { grace: { order: 2 } }),
    note("first", 0, 0, { grace: { order: 1 } })];
  assert.deepStrictEqual(signsById(events), { principal: "nat", second: "sharp", first: null });
});

test("displayed drag positions govern inheritance before committing the score", () => {
  const sharp = note("sharp", 1, 0), natural = note("natural", 0, 2);
  assert.deepStrictEqual(signsById([sharp, natural]), { sharp: "sharp", natural: "nat" });
  assert.deepStrictEqual(signsById([Object.assign({}, sharp, { displaySlot: 4 }), natural]),
    { sharp: "sharp", natural: null });
  assert.deepStrictEqual(signsById([sharp, Object.assign({}, natural, { displaySlot: -1 })]),
    { sharp: "sharp", natural: null });
  assert.deepStrictEqual(signsById([Object.assign({}, sharp, { displaySlot: 2 }), natural]),
    { sharp: "sharp", natural: "nat" });
});

test("double alterations, single alterations and naturals cancel correctly", () => {
  const events = [-2, -2, -1, 0, 2, 1, 0].map((alter, index) => note(String(index), alter, index));
  assert.deepStrictEqual(signs(events), ["dblflat", null, "flat", "nat", "dblsharp", "sharp", "nat"]);
});

test("returned order and score fields are preserved without mutating frozen input", () => {
  const events = [note("later", 0, 2, { originalNoteValue: "whole", beamGroupId: "beam" }),
    note("early", 1, 0, { voice: 2, sourcePartIndex: 1, accidental: "nat" }),
    { id: "rest", kind: "rest", pitch: null, startSlot: 3, noteValue: "quarter", implicit: true }];
  const before = JSON.stringify(events);
  events.forEach(event => { if (event.pitch) Object.freeze(event.pitch); Object.freeze(event); }); Object.freeze(events);
  const result = layoutWorkshopAccidentals(events, "C-major");
  assert.deepStrictEqual(result.map(event => event.id), ["later", "early", "rest"]);
  assert.deepStrictEqual(result.map(event => event.accidental), ["nat", "sharp", null]);
  assert.strictEqual(JSON.stringify(events), before);
  result.forEach((event, index) => { assert.notStrictEqual(event, events[index]); assert.strictEqual(event.pitch, events[index].pitch); });
  assert.strictEqual(result[0].originalNoteValue, "whole"); assert.strictEqual(result[0].beamGroupId, "beam");
  assert.strictEqual(result[1].sourcePartIndex, 1);
  assert.deepStrictEqual(layoutWorkshopAccidentals([], "C-major"), []);
});

process.stdout.write("Workshop accidentals tests passed.\n");

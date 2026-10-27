const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(loadedModule, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return loadedModule._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const tonality = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowTonality.js")
);

test("defines the full written circle of fifths for major and minor", () => {
  assert.strictEqual(tonality.NOTE_FLOW_TONALITIES.length, 30);
  assert.strictEqual(new Set(
    tonality.NOTE_FLOW_TONALITIES.map(key => key.id)
  ).size, 30);
  assert.strictEqual(tonality.NOTE_FLOW_TONALITIES.filter(
    key => key.mode === "major"
  ).length, 15);
  assert.strictEqual(tonality.NOTE_FLOW_TONALITIES.filter(
    key => key.mode === "minor"
  ).length, 15);
  assert.deepStrictEqual(
    Array.from(new Set(tonality.NOTE_FLOW_TONALITIES.map(key => key.fifths))).sort(
      (first, second) => first - second
    ),
    [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]
  );
});

test("keeps relative major and minor keys paired", () => {
  tonality.NOTE_FLOW_TONALITIES.forEach(key => {
    const relative = tonality.getNoteFlowTonality(key.relativeKeyId);
    assert(relative);
    assert.strictEqual(relative.fifths, key.fifths);
    assert.notStrictEqual(relative.mode, key.mode);
    assert.strictEqual(relative.relativeKeyId, key.id);
  });
  assert.strictEqual(
    tonality.getNoteFlowTonality("C-major").relativeKeyId,
    "A-minor"
  );
  assert.strictEqual(
    tonality.getNoteFlowTonality("E-flat-major").relativeKeyId,
    "C-minor"
  );
});

test("describes signatures and seven-note scales completely", () => {
  const eFlat = tonality.getNoteFlowTonality("E-flat-major");
  assert.deepStrictEqual(eFlat.signature, {
    type: "flat",
    count: 3,
    alteredNotes: [
      { note: "B", accidental: "flat" },
      { note: "E", accidental: "flat" },
      { note: "A", accidental: "flat" }
    ]
  });
  assert.deepStrictEqual(eFlat.scalePitchClasses, [3, 5, 7, 8, 10, 0, 2]);

  tonality.NOTE_FLOW_TONALITIES.forEach(key => {
    assert.strictEqual(key.signature.count, Math.abs(key.fifths));
    assert.strictEqual(key.signature.alteredNotes.length, Math.abs(key.fifths));
    assert.strictEqual(key.scalePitchClasses.length, 7);
    assert.strictEqual(new Set(key.scalePitchClasses).size, 7);
    assert(key.scalePitchClasses.indexOf(key.tonicPitchClass) !== -1);
  });
});

test("filters tonalities through the existing accidental choices", () => {
  const none = tonality.getAvailableNoteFlowTonalities("no");
  const sharps = tonality.getAvailableNoteFlowTonalities("onlySharp");
  const flats = tonality.getAvailableNoteFlowTonalities("onlyFlat");
  const all = tonality.getAvailableNoteFlowTonalities("sharpAndFlat");
  assert.deepStrictEqual(none.map(key => key.id).sort(), ["A-minor", "C-major"]);
  assert.strictEqual(sharps.length, 16);
  assert.strictEqual(flats.length, 16);
  assert.strictEqual(all.length, 30);
  assert(sharps.every(key => key.fifths >= 0));
  assert(flats.every(key => key.fifths <= 0));
});

test("maps enharmonic spellings onto twelve graphical circle positions", () => {
  const segments = tonality.getNoteFlowCircleSegments();
  assert.strictEqual(segments.length, 12);
  assert.deepStrictEqual(segments.map(segment => segment.circlePosition),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.strictEqual(
    segments.reduce((count, segment) => count + segment.tonalities.length, 0),
    30
  );
  const tritoneSegment = segments[6].tonalities.map(key => key.id);
  assert(tritoneSegment.indexOf("F-sharp-major") !== -1);
  assert(tritoneSegment.indexOf("G-flat-major") !== -1);
});

test("keeps a permitted circle selection and requests a key signature", () => {
  const result = tonality.resolveNoteFlowTonality({
    tonalityMode: "circle",
    selectedKey: "E-flat-major",
    accidentals: "onlyFlat",
    seed: 42
  }, 3);
  assert.strictEqual(result.key.id, "E-flat-major");
  assert.strictEqual(result.key.signature.count, 3);
  assert.strictEqual(result.displayKeySignature, true);
  assert.strictEqual(result.displayAccidentalsOnNotes, false);
  assert.strictEqual(result.fallbackReason, null);
});

test("falls back safely when a selected circle key is unavailable", () => {
  const result = tonality.resolveNoteFlowTonality({
    tonalityMode: "circle",
    selectedKey: "E-flat-major",
    accidentals: "onlySharp"
  });
  assert.strictEqual(result.key.id, "C-major");
  assert.strictEqual(result.fallbackReason, "not-allowed");
});

test("selects random cycle tonalities deterministically without signatures", () => {
  const config = {
    tonalityMode: "random",
    accidentals: "sharpAndFlat",
    seed: "quintenzirkel"
  };
  const firstRun = [];
  const secondRun = [];
  let previous = null;
  for (let cycleIndex = 0; cycleIndex < 40; cycleIndex += 1) {
    const result = tonality.resolveNoteFlowTonality(
      config,
      cycleIndex,
      previous
    );
    firstRun.push(result.key.id);
    assert.notStrictEqual(result.key.id, previous);
    assert.strictEqual(result.displayKeySignature, false);
    assert.strictEqual(result.displayAccidentalsOnNotes, true);
    previous = result.key.id;
  }
  previous = null;
  for (let cycleIndex = 0; cycleIndex < 40; cycleIndex += 1) {
    const result = tonality.resolveNoteFlowTonality(
      config,
      cycleIndex,
      previous
    );
    secondRun.push(result.key.id);
    previous = result.key.id;
  }
  assert.deepStrictEqual(firstRun, secondRun);
  assert(new Set(firstRun).size > 10);
});

test("limits random selection to C major and A minor without accidentals", () => {
  const selected = new Set();
  let previous = null;
  for (let cycleIndex = 0; cycleIndex < 20; cycleIndex += 1) {
    const result = tonality.resolveNoteFlowTonality({
      tonalityMode: "random",
      accidentals: "no",
      seed: 9876
    }, cycleIndex, previous);
    selected.add(result.key.id);
    previous = result.key.id;
  }
  assert.deepStrictEqual(Array.from(selected).sort(), ["A-minor", "C-major"]);
});

process.stdout.write("Note Flow tonality tests passed.\n");


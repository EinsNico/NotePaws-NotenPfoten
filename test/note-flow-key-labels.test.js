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

const labels = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowKeyLabels.js")
);
const tonality = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowTonality.js")
);

assert.strictEqual(
  labels.formatNoteFlowTonalityLabel(
    tonality.getNoteFlowTonality("B-major"),
    "german"
  ),
  "H"
);
assert.strictEqual(
  labels.formatNoteFlowTonalityLabel(
    tonality.getNoteFlowTonality("B-flat-major"),
    "german"
  ),
  "B"
);
assert.strictEqual(
  labels.formatNoteFlowTonalityLabel(
    tonality.getNoteFlowTonality("F-sharp-minor"),
    "german"
  ),
  "fis"
);
assert.strictEqual(
  labels.formatNoteFlowTonalityLabel(
    tonality.getNoteFlowTonality("C-flat-major"),
    "international"
  ),
  "C♭"
);
assert.strictEqual(
  labels.formatNoteFlowTonalityLabel(
    tonality.getNoteFlowTonality("A-sharp-minor"),
    "international"
  ),
  "a♯"
);

const firstKey = tonality.getNoteFlowTonality("C-major");
const followingKey = tonality.getNoteFlowTonality("G-major");
const firstCycle = { tonalityPlan: { key: firstKey } };
assert.strictEqual(labels.getActiveNoteFlowTonality(firstCycle, null), firstKey);
assert.strictEqual(
  labels.getActiveNoteFlowTonality(firstCycle, {
    tonalityPlan: { key: followingKey }
  }),
  followingKey
);
assert.strictEqual(labels.getActiveNoteFlowTonality(null, null), null);

process.stdout.write("Note Flow key label tests passed.\n");

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

const notation = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowNotation.js")
);

function cycle({
  tonic = "F-sharp",
  mode = "major",
  scalePitchClasses = [6, 8, 10, 11, 1, 3, 5],
  displayKeySignature = true,
  handMode = "single",
  clefs = ["treble"],
  events = []
} = {}) {
  return {
    config: { handMode, clefs },
    tonalityPlan: {
      key: { tonic, mode, scalePitchClasses },
      displayKeySignature,
      displayAccidentalsOnNotes: !displayKeySignature
    },
    timeline: { events }
  };
}

function event(notes) {
  return { notes };
}

test("uses the selected key signature in circle mode", () => {
  const abc = notation.createNoteFlowPreviewAbc(cycle({
    events: [
      event([{ value: 54, pitchClass: 6, scaleDegree: 1, clef: "treble" }]),
      event([{ value: 56, pitchClass: 8, scaleDegree: 2, clef: "treble" }])
    ]
  }));
  assert(abc.includes("K:F#"));
  assert(abc.includes("[V:treble] F G |]"));
  assert(!abc.includes("^F"));
});

test("writes accidentals on notes when random mode hides the key signature", () => {
  const abc = notation.createNoteFlowPreviewAbc(cycle({
    displayKeySignature: false,
    events: [
      event([{ value: 54, pitchClass: 6, scaleDegree: 1, clef: "treble" }]),
      event([{ value: 56, pitchClass: 8, scaleDegree: 2, clef: "treble" }])
    ]
  }));
  assert(abc.includes("K:C"));
  assert(abc.includes("[V:treble] ^F ^G |]"));
});

test("keeps enharmonic boundary notes in the correct written octave", () => {
  const abc = notation.createNoteFlowPreviewAbc(cycle({
    tonic: "C-flat",
    scalePitchClasses: [11, 1, 3, 4, 6, 8, 10],
    displayKeySignature: false,
    events: [
      event([{ value: 47, pitchClass: 11, scaleDegree: 1, clef: "treble" }])
    ]
  }));
  assert(abc.includes("[V:treble] _C |]"));
  assert(!abc.includes("_C,"));
});

test("renders treble and bass voices with rests at empty positions", () => {
  const abc = notation.createNoteFlowPreviewAbc(cycle({
    handMode: "two",
    clefs: ["bass", "treble"],
    tonic: "C",
    scalePitchClasses: [0, 2, 4, 5, 7, 9, 11],
    events: [
      event([
        { value: 60, pitchClass: 0, scaleDegree: 1, clef: "treble" },
        { value: 36, pitchClass: 0, clef: "bass" }
      ]),
      event([{ value: 62, pitchClass: 2, scaleDegree: 2, clef: "treble" }])
    ]
  }));
  assert(abc.includes("%%score {treble bass}"));
  assert(abc.includes("[V:treble] c d |]"));
  assert(abc.includes("[V:bass] C, z |]"));
});

process.stdout.write("Note Flow notation tests passed.\n");


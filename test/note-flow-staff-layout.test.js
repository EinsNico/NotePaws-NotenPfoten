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

const layoutModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowStaffLayout.js")
);

function note(value, pitchClass, scaleDegree, clef) {
  return { value, pitchClass, scaleDegree, clef };
}

function cycle({
  handMode = "single",
  clefs = ["treble"],
  difficulty,
  ranges,
  displayKeySignature = true,
  fifths = 0,
  signatureType = "none",
  alteredNotes = [],
  events = []
} = {}) {
  return {
    config: { handMode, clefs, difficulty, ranges },
    tonalityPlan: {
      key: {
        tonic: "C",
        mode: "major",
        fifths,
        signature: {
          type: signatureType,
          count: Math.abs(fifths),
          alteredNotes
        },
        scalePitchClasses: [0, 2, 4, 5, 7, 9, 11]
      },
      displayKeySignature,
      displayAccidentalsOnNotes: !displayKeySignature
    },
    timeline: {
      events: events.map((notes, index) => ({ id: `event-${index}`, notes }))
    }
  };
}

test("keeps staff geometry fixed and spaces moving events evenly", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    events: [
      [note(48, 0, 1, "treble")],
      [note(50, 2, 2, "treble")],
      [note(52, 4, 3, "treble")]
    ]
  }), 3);
  assert.strictEqual(layout.staves.length, 1);
  assert.strictEqual(layout.events[1].x - layout.events[0].x, 64);
  assert.strictEqual(layout.events[2].x - layout.events[1].x, 64);
  assert.strictEqual(
    layout.trackStartX - layout.trackEndX,
    layout.eventCount * 64
  );
});

test("places middle C below the treble staff with one ledger line", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    events: [[note(48, 0, 1, "treble")]]
  }));
  const staff = layout.staves[0];
  const renderedNote = layout.events[0].notes[0];
  assert.strictEqual(renderedNote.value, 48);
  assert.strictEqual(renderedNote.y, staff.bottomLineY + 10);
  assert.deepStrictEqual(renderedNote.ledgerLineYs, [staff.bottomLineY + 10]);
});

test("anchors the treble clef on the G line and bass clef on the F line", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    handMode: "two",
    clefs: ["treble", "bass"],
    events: [[note(60, 0, 1, "treble"), note(36, 0, 1, "bass")]]
  }));
  const treble = layout.staves.find(staff => staff.clef === "treble");
  const bass = layout.staves.find(staff => staff.clef === "bass");
  assert.strictEqual(treble.clefY, treble.lineYs[3]);
  assert.strictEqual(bass.clefY, bass.lineYs[1]);
});

test("uses separate treble and bass lanes and adds sparse bass rests", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    handMode: "two",
    clefs: ["bass", "treble"],
    events: [
      [note(60, 0, 1, "treble"), note(36, 0, 1, "bass")],
      [note(62, 2, 2, "treble")]
    ]
  }), 2);
  assert.deepStrictEqual(layout.staves.map(staff => staff.clef), ["treble", "bass"]);
  assert.strictEqual(layout.events[0].notes.length, 2);
  assert.strictEqual(layout.events[0].rests.length, 0);
  assert.strictEqual(layout.events[1].rests[0].clef, "bass");
});

test("keeps a circle-selected key signature fixed instead of repeating accidentals", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    fifths: 2,
    signatureType: "sharp",
    alteredNotes: [
      { note: "F", accidental: "sharp" },
      { note: "C", accidental: "sharp" }
    ],
    events: [[note(54, 6, 4, "treble")]]
  }));
  assert.strictEqual(layout.staves[0].keySignature.length, 2);
  assert.strictEqual(layout.events[0].notes[0].accidental, null);
});

test("shows note accidentals when the random-key mode hides the signature", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    displayKeySignature: false,
    events: [[note(54, 6, 4, "treble")]]
  }));
  assert.strictEqual(layout.staves[0].keySignature.length, 0);
  assert.strictEqual(layout.events[0].notes[0].accidental, "sharp");
});

test("uses each streamed cycle tonality for its moving accidentals", () => {
  const source = cycle({
    displayKeySignature: false,
    events: [[note(54, 6, 1, "treble")]]
  });
  source.timeline.events[0].tonalityPlan = {
    key: {
      tonic: "F-sharp",
      mode: "major",
      scalePitchClasses: [6, 8, 10, 11, 1, 3, 5]
    },
    displayKeySignature: false,
    displayAccidentalsOnNotes: true
  };
  const layout = layoutModel.createNoteFlowStaffLayout(source);
  assert.strictEqual(layout.events[0].notes[0].accidental, "sharp");
});

test("expands vertically for extreme custom notes instead of clipping them", () => {
  const layout = layoutModel.createNoteFlowStaffLayout(cycle({
    events: [[note(93, 9, 6, "treble")]]
  }));
  const renderedNote = layout.events[0].notes[0];
  assert(layout.height > 145);
  assert(renderedNote.y >= 0);
  assert(renderedNote.y <= layout.height);
  assert(renderedNote.ledgerLineYs.length > 3);
});

test("keeps staff height and position fixed as new events enter a configured range", () => {
  const configured = {
    difficulty: "custom",
    ranges: {
      treble: { min: 48, max: 93 },
      bass: { min: 28, max: 48 }
    }
  };
  const first = layoutModel.createNoteFlowStaffLayout(cycle({
    ...configured,
    events: [[note(48, 0, 1, "treble")]]
  }));
  const extended = layoutModel.createNoteFlowStaffLayout(cycle({
    ...configured,
    events: [
      [note(48, 0, 1, "treble")],
      [note(93, 9, 6, "treble")]
    ]
  }), 2);
  assert.strictEqual(first.height, extended.height);
  assert.deepStrictEqual(first.staves[0].lineYs, extended.staves[0].lineYs);
  assert(extended.events[1].notes[0].y >= 0);
  assert(extended.events[1].notes[0].y <= extended.height);
});

process.stdout.write("Note Flow staff layout tests passed.\n");

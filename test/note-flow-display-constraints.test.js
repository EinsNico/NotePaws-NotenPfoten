const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  return loadedModule._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
let display, menu, generator, rhythm, timeline, staff;
try {
  display = require("../src/model/NoteFlowDisplayConstraints.js");
  menu = require("../src/model/NoteFlowMenuConfig.js");
  generator = require("../src/model/NoteFlowGenerator.js");
  rhythm = require("../src/model/NoteFlowRhythmGenerator.js");
  timeline = require("../src/model/NoteFlowRhythmTimeline.js");
  staff = require("../src/model/NoteFlowRhythmStaffLayout.js");
} finally {
  Module._extensions[".js"] = originalLoader;
}

let passed = 0;
function test(name, body) {
  body();
  passed += 1;
  process.stdout.write(`\u2713 ${name}\n`);
}
function close(actual, expected) {
  assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const configurations = [
  { name: "single-treble", handMode: "single", clef: ["treble"], systems: 1 },
  { name: "single-bass", handMode: "single", clef: ["bass"], systems: 1 },
  { name: "single-piano", handMode: "single", clef: ["piano"], systems: 2 },
  { name: "single-bass-treble", handMode: "single", clef: ["bass", "treble"], systems: 2 },
  { name: "two-hands", handMode: "two", clef: ["treble"], systems: 2 }
];

test("configured systems follow hands/clefs, regardless of visible generated notes", () => {
  configurations.forEach(config => {
    const options = freeze(Object.assign({}, config, { visibleStaffCount: 1 }));
    assert.strictEqual(display.getNoteFlowConfiguredStaffCount(options), config.systems);
    assert.strictEqual(display.getNoteFlowConfiguredStaffCount(
      menu.applyNoteFlowMenuDependencies(options)), config.systems);
  });
  assert.strictEqual(display.getNoteFlowConfiguredStaffCount({ handMode: "single", clef: ["bass", "bass"] }), 1);
  assert.strictEqual(display.getNoteFlowConfiguredStaffCount(null), 0);
});

test("keyboard is available only for one hand and exactly one configured system", () => {
  configurations.forEach(config => {
    const options = freeze(Object.assign({}, config, { inputMode: "keyboard" }));
    const result = display.getNoteFlowInputAvailability(options);
    assert.strictEqual(result.keyboardAvailable, config.systems === 1);
    assert.strictEqual(result.inputAvailable, config.systems === 1);
    assert.strictEqual(result.reason, config.systems === 1 ? null : "keyboard-requires-single-hand-and-staff");
    assert.strictEqual(options.inputMode, "keyboard"); // No silent input replacement.
  });
  assert.strictEqual(display.getNoteFlowInputAvailability({ inputMode: "keyboard", handMode: "single", clef: [] }).inputAvailable, false);
});

test("MIDI and existing button input are never restricted by hand/system counts", () => {
  configurations.forEach(config => ["midi", "button"].forEach(inputMode => {
    const result = display.getNoteFlowInputAvailability(Object.assign({}, config, { inputMode }));
    assert.strictEqual(result.inputAvailable, true);
    assert.strictEqual(result.midiAvailable, true);
    assert.strictEqual(result.reason, null);
  }));
});

test("height fitting reduces the wide score width proportionally and reserves input/feedback", () => {
  const fit = display.fitNoteFlowNotation({ stageWidth: 694, stageHeight: 499,
    intrinsicHeight: 225, horizontalInset: 54, verticalInset: 54, reservedHeight: 180 });
  assert.strictEqual(fit.fits, true);
  close(fit.availableWidth, 640);
  close(fit.availableHeight, 265);
  close(fit.height, 265);
  close(fit.width, 320 * 265 / 225);
  close(fit.width / fit.height, 320 / 225);
  assert(fit.width < 640); // Former full-width SVG was 450px high.
});

test("360px reference nesting retains the current proportional notation", () => {
  const fit = display.fitNoteFlowNotation({ stageWidth: 342, stageHeight: 546,
    intrinsicHeight: 225, horizontalInset: 46, verticalInset: 46, reservedHeight: 180 });
  close(fit.width, 296);
  close(fit.scale, 0.925);
  assert.strictEqual(fit.fits, true);
});

test("short landscape retains readable minimum notation and reports actual overflow", () => {
  const fit = display.fitNoteFlowNotation({ stageWidth: 694, stageHeight: 169,
    intrinsicHeight: 247, horizontalInset: 28, verticalInset: 28, reservedHeight: 60 });
  close(fit.scale, 0.9);
  close(fit.width, 288);
  close(fit.height, 222.3);
  close(fit.availableHeight, 81);
  close(fit.overflowHeight, 141.3);
  assert.strictEqual(fit.fits, false);
  assert.strictEqual(fit.constrainedBy, "height");
  assert.strictEqual(fit.reason, "insufficient-space");
});

test("minimum staff-gap/head dimensions are a shared floor, with stronger caller floors allowed", () => {
  const floor = display.fitNoteFlowNotation({ stageWidth: 120, stageHeight: 80, intrinsicHeight: 145, minScale: 0.1 });
  close(floor.scale, 0.9);
  close(10 * floor.scale, 9);
  close(14.4 * floor.scale, 12.96);
  close(10.2 * floor.scale, 9.18);
  assert.strictEqual(floor.constrainedBy, "both");
  const larger = display.fitNoteFlowNotation({ stageWidth: 288, stageHeight: 200, intrinsicHeight: 145, minScale: 1.1 });
  close(larger.scale, 1.1);
  assert.strictEqual(larger.fits, false);
  assert.strictEqual(larger.constrainedBy, "width");
});

test("minimum-size boundary fits without integer rounding or aspect distortion", () => {
  const fit = display.fitNoteFlowNotation({ stageWidth: 288, stageHeight: 130.5, intrinsicHeight: 145 });
  assert.strictEqual(fit.fits, true);
  close(fit.width, 288);
  close(fit.height, 130.5);
  const below = display.fitNoteFlowNotation({ stageWidth: 287.9, stageHeight: 130.5, intrinsicHeight: 145 });
  assert.strictEqual(below.fits, false);
  assert.strictEqual(below.constrainedBy, "width");
});

test("actual intrinsic height including ledger lines is honored instead of assuming two-staff225", () => {
  const normal = display.fitNoteFlowNotation({ stageWidth: 640, stageHeight: 330, intrinsicHeight: 225, reservedHeight: 100 });
  const extended = display.fitNoteFlowNotation({ stageWidth: 640, stageHeight: 330, intrinsicHeight: 400, reservedHeight: 100 });
  assert.strictEqual(normal.fits, true);
  assert.strictEqual(extended.fits, false);
  close(extended.height, 360);
  close(extended.requiredHeight, 460);
});

test("missing/invalid measurements never yield NaN, Infinity or a claimed fit", () => {
  [ {}, { stageWidth: 0, stageHeight: 500, intrinsicHeight: 225 },
    { stageWidth: Infinity, stageHeight: 500, intrinsicHeight: 225 },
    { stageWidth: 640, stageHeight: 500, intrinsicHeight: NaN },
    { stageWidth: 640, stageHeight: 500, intrinsicHeight: 225, reservedHeight: NaN },
    { stageWidth: 640, stageHeight: 500, intrinsicHeight: 225, horizontalInset: -1 }
  ].forEach(options => {
    const fit = display.fitNoteFlowNotation(options);
    assert.strictEqual(fit.fits, false);
    Object.values(fit).filter(value => typeof value === "number").forEach(value => assert(Number.isFinite(value)));
    assert(["invalid-notation", "not-measured"].includes(fit.reason));
  });
});

test("space alone gives pre-start warning while MIDI remains startable", () => {
  const inputAvailability = display.getNoteFlowInputAvailability({ handMode: "two", clef: ["piano"], inputMode: "midi" });
  const notation = display.fitNoteFlowNotation({ stageWidth: 640, stageHeight: 90, intrinsicHeight: 247 });
  assert.deepStrictEqual(display.getNoteFlowStartConstraint({ inputAvailability, notation }), {
    canStart: true, warning: true, reason: "insufficient-space", preserveRound: false
  });
  assert.strictEqual(inputAvailability.midiAvailable, true);
  assert.strictEqual(display.getNoteFlowStartConstraint({ notation }).canStart, true); // MIDI-only Chord caller.
});

test("configuration restriction blocks keyboard before start even on a large display", () => {
  const inputAvailability = display.getNoteFlowInputAvailability({ handMode: "two", clef: ["bass", "treble"], inputMode: "keyboard" });
  const notation = display.fitNoteFlowNotation({ stageWidth: 1280, stageHeight: 720, intrinsicHeight: 225 });
  assert.strictEqual(notation.fits, true);
  assert.deepStrictEqual(display.getNoteFlowStartConstraint({ inputAvailability, notation }), {
    canStart: false, warning: true, reason: "keyboard-requires-single-hand-and-staff", preserveRound: false
  });
});

test("pending measurement does not fabricate a space warning or a geometry start block", () => {
  assert.deepStrictEqual(display.getNoteFlowStartConstraint(), {
    canStart: true, warning: false, reason: "not-measured", preserveRound: false
  });
});

const geometries = [
  // Real audit stage/client heights; row reservations are synthetic test inputs.
  { viewport: "1280x720", stageWidth: 694, stageHeight: 499, horizontalInset: 54, verticalInset: 54 },
  { viewport: "360x800", stageWidth: 342, stageHeight: 546, horizontalInset: 46, verticalInset: 46 },
  { viewport: "844x390", stageWidth: 694, stageHeight: 169, horizontalInset: 54, verticalInset: 54 }
];
const matrix = [];
test("30 viewport/input/configuration cases use real generated Melody intrinsic layouts", () => {
  configurations.forEach(config => ["keyboard", "midi"].forEach(inputMode => {
    const options = freeze(menu.applyNoteFlowMenuDependencies(Object.assign({}, config, { inputMode })));
    const cycle = freeze(generator.generateNoteFlowCycle(menu.createNoteFlowConfigFromMenu(options)));
    const score = freeze(rhythm.generateNoteFlowRhythmicScore(cycle, { measureCount: 2, seed: "display-constraints" }));
    const clock = freeze(timeline.createNoteFlowRhythmTimeline(score, { bpm: 90 }));
    const layout = freeze(staff.createNoteFlowRhythmStaffLayout(cycle, clock));
    const before = JSON.stringify({ options, cycle, score, clock, layout });
    assert.strictEqual(layout.width, 320);
    assert.strictEqual(layout.staves.length, config.systems);
    geometries.forEach(geometry => {
      const fit = display.fitNoteFlowNotation(Object.assign({}, geometry, {
        intrinsicHeight: layout.height, reservedHeight: inputMode === "keyboard" ? 180 : 60
      }));
      const inputAvailability = display.getNoteFlowInputAvailability(options);
      const decision = display.getNoteFlowStartConstraint({ inputAvailability, notation: fit });
      assert.strictEqual(decision.canStart, inputMode === "midi" || config.systems === 1);
      assert.strictEqual(fit.fits, geometry.viewport !== "844x390");
      if (fit.fits) {
        assert(fit.width <= fit.availableWidth + 1e-8);
        assert(fit.height <= fit.availableHeight + 1e-8);
      }
      close(fit.width / fit.height, layout.width / layout.height);
      assert(fit.scale >= 0.9);
      matrix.push({ viewport: geometry.viewport, configuration: config.name, inputMode,
        intrinsicHeight: layout.height, fits: fit.fits, canStart: decision.canStart, warning: decision.warning });
    });
    assert.strictEqual(JSON.stringify({ options, cycle, score, clock, layout }), before);
  }));
  assert.strictEqual(matrix.length, 30);
});

test("running/paused/preparing round survives repeated resize advice without input/score/timer mutation", () => {
  ["preparing", "running", "paused"].forEach(status => {
    const round = freeze({ status, elapsedMs: 9876, seed: "unchanged", bpm: 90,
      cycle: { noteIds: [1, 2, 3] }, score: { correct: 17, wrong: 2 },
      inputMode: "keyboard", menuOptions: { handMode: "single", clef: ["treble"], inputMode: "keyboard" } });
    const before = JSON.stringify(round);
    geometries.concat(geometries.slice().reverse()).forEach(geometry => {
      const notation = display.fitNoteFlowNotation(Object.assign({}, geometry, { intrinsicHeight: 145, reservedHeight: 180 }));
      const decision = display.getNoteFlowStartConstraint({
        notation, inputAvailability: display.getNoteFlowInputAvailability(round.menuOptions), roundStarted: true
      });
      assert.strictEqual(decision.canStart, true);
      assert.strictEqual(decision.preserveRound, true);
      assert.strictEqual(JSON.stringify(round), before);
    });
    const invalidInput = display.getNoteFlowInputAvailability({ handMode: "two", clef: ["piano"], inputMode: "keyboard" });
    assert.strictEqual(display.getNoteFlowStartConstraint({ inputAvailability: invalidInput, roundStarted: true }).canStart, true);
    assert.strictEqual(JSON.stringify(round), before);
  });
});

process.stdout.write(JSON.stringify({ passed, geometryCases: matrix.length }) + "\n");

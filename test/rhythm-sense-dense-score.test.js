const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");
const compiler = require("vue-template-compiler");
const modelPath = path.resolve(__dirname, "../src/model/RhythmSenseDenseLayout.js");
const modelModule = new Module(modelPath, module);
modelModule._compile(babel.transform(fs.readFileSync(modelPath, "utf8"), {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, modelPath);
const { createRhythmSenseDenseLayout: layoutFor, shouldUseRhythmDenseScore: useDense,
  rhythmDenseXAtBeat, rhythmDenseTapMarkerX, RHYTHM_DENSE_MIN_SPACING } = modelModule.exports;
const values = { whole: 4, half: 2, dottedQuarter: 1.5, quarter: 1, dottedEighth: .75,
  eighth: .5, sixteenth: .25, thirtySecond: .125, sixtyFourth: .0625 };
function events(names) {
  let beat = 0;
  return names.map((value, id) => { const event = { id, value, beat, duration: values[value] }; beat += event.duration; return event; });
}
function verifyGeometry(layout) {
  for (const [index, note] of layout.notes.entries()) {
    assert(Number.isFinite(note.x) && note.x - 15 >= 0 && note.x + 27 < layout.width);
    if (index) assert(note.x - layout.notes[index - 1].x >= RHYTHM_DENSE_MIN_SPACING);
    assert.strictEqual(note.stem, note.value !== "whole");
    for (let level = 1; level <= note.beamCount; level++) {
      const attached = note.beamed
        ? layout.beams.some(beam => beam.level === level && note.x + layout.stemOffset >= beam.x1 - .001 && note.x + layout.stemOffset <= beam.x2 + .001)
        : layout.flags.some(flag => flag.level === level && flag.index === note.index);
      assert(attached, note.value + " must have every beam or flag level");
    }
  }
  layout.beams.forEach(beam => {
    assert(beam.x2 > beam.x1 && beam.x1 > 0 && beam.x2 < layout.width);
    assert(beam.y - 2 >= 0 && beam.y + 2 < layout.headY - 15, "all four beams clear note heads and active rings");
    const first = layout.notes[beam.startIndex], last = layout.notes[beam.endIndex];
    assert.strictEqual(Math.floor((first.beat + 1e-6) / layout.pulse), Math.floor((last.beat + 1e-6) / layout.pulse), "beams cannot cross metric pulses");
    if (beam.partial) assert(beam.x2 - beam.x1 <= 12, "a partial beam cannot bridge to an unrelated stem");
  });
  const sorted = layout.beams.slice().sort((a, b) => a.y - b.y || a.x1 - b.x1);
  sorted.forEach((beam, index) => {
    if (index && beam.y === sorted[index - 1].y) assert(beam.x1 >= sorted[index - 1].x2, "same-level beam segments do not collide");
  });
}

assert(useDense(events(["whole"])), "a whole note must not be cut by the legacy mobile half-bar fold");
assert(useDense(events(["quarter", "half", "quarter"])), "a half spanning beat two needs a continuous staff");
assert(!useDense(events(["half", "half"])), "two half notes aligned at the fold retain the legacy view");
assert(!useDense(events(["half", "quarter", "quarter"])));
assert(useDense(events(Array(9).fill("eighth")), "9/8"));
assert(useDense(events(["thirtySecond"])), "32nds always receive the readable renderer");
assert(useDense(events(["sixtyFourth"])), "64ths always receive the readable renderer");
assert(useDense(events(["eighth", "sixteenth", "sixteenth", "eighth", "dottedQuarter"]), "6/8"), "tight legacy spacing uses the scrollable renderer");

for (const [meter, units] of [["4/4", 4], ["3/4", 3], ["2/4", 2], ["6/8", 3], ["9/8", 4.5]]) {
  for (const value of ["eighth", "sixteenth", "thirtySecond", "sixtyFourth"]) {
    const input = events(Array(units / values[value]).fill(value));
    const before = JSON.stringify(input), layout = layoutFor(input, meter);
    verifyGeometry(layout);
    assert.strictEqual(layout.notes.length, input.length);
    assert.strictEqual(layout.units, units);
    assert.strictEqual(layout.beams.filter(beam => beam.level === 4).length, value === "sixtyFourth" ? units / layout.pulse : 0);
    assert.strictEqual(JSON.stringify(input), before, "notation never mutates the exercise or its timing");
    assert.strictEqual(rhythmDenseXAtBeat(layout, 0), layout.notes[0].x);
    assert(rhythmDenseXAtBeat(layout, units) <= layout.width - layout.right);
  }
}
const busiest = layoutFor(events(Array(72).fill("sixtyFourth")), "9/8");
assert.strictEqual(busiest.notes.length, 72);
assert.strictEqual(busiest.beams.length, 12, "three compound pulse groups carry four beams each");
assert.strictEqual(busiest.width, 104 + 72 * 32 + 30);

for (const names of [
  ["eighth", "sixteenth", "sixteenth"],
  ["sixteenth", "eighth", "sixteenth"],
  ["dottedEighth", "sixteenth"],
  ["sixtyFourth", "thirtySecond", "sixtyFourth", "eighth", "sixteenth"],
  ["quarter", "sixtyFourth", "half", "thirtySecond", "whole"]
]) verifyGeometry(layoutFor(events(names)));
const mixed = layoutFor(events(["sixteenth", "eighth", "sixteenth"]));
const hooks = mixed.beams.filter(beam => beam.level === 2);
assert.strictEqual(hooks.length, 2);
assert(hooks.every(beam => beam.partial));
assert.strictEqual(hooks[0].x1, mixed.notes[0].x + mixed.stemOffset);
assert.strictEqual(hooks[1].x2, mixed.notes[2].x + mixed.stemOffset);
const longValues = layoutFor(events(["whole", "half"]));
assert(longValues.notes.every(note => note.hollow));
assert.deepStrictEqual(longValues.notes.map(note => note.label), ["1", "1/2"]);

const local = layoutFor(events(["sixtyFourth", "half", "sixtyFourth"]));
const unitMs = 750;
assert.strictEqual(rhythmDenseTapMarkerX(local, { targetIndex: 0, offsetMs: unitMs / 32 }), local.notes[0].x + 16);
assert.strictEqual(rhythmDenseTapMarkerX(local, { targetIndex: 1, offsetMs: unitMs }), local.notes[1].x + 72);
assert(rhythmDenseTapMarkerX(local, { targetIndex: 1, offsetMs: -unitMs }) < local.notes[1].x, "early markers can cross the target slot boundary");
assert.strictEqual(rhythmDenseTapMarkerX(local, { targetIndex: 0, offsetMs: -10000 }), 12);
assert.strictEqual(rhythmDenseTapMarkerX(local, { targetIndex: 2, offsetMs: 10000 }), local.width - 12);
assert.strictEqual(rhythmDenseTapMarkerX(local, { targetIndex: 9, offsetMs: 0 }), null);
assert.strictEqual(rhythmDenseTapMarkerX(busiest, { targetIndex: 0, offsetMs: 250 / 16 }, 80), busiest.notes[0].x + 16,
  "compound marker timing uses the shorter quarter unit, not the dotted pulse");

const componentPath = path.resolve(__dirname, "../src/components/RhythmSenseDenseScore.vue");
const parsed = compiler.parseComponent(fs.readFileSync(componentPath, "utf8"));
const compiled = compiler.compileToFunctions(parsed.template.content);
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const definitionModule = { exports: {} };
new Function("require", "module", "exports", babel.transform(parsed.script.content, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code)(() => modelModule.exports, definitionModule, definitionModule.exports);
const definition = definitionModule.exports.default;
const view = new Vue(Object.assign({}, definition, { mounted: undefined, beforeDestroy: undefined,
  propsData: { events: events(Array(72).fill("sixtyFourth")), meter: "9/8", phase: "preview", activeEvent: 40,
    results: Array(72).fill("correct"), tapMarkers: [{ id: "tap", targetIndex: 40, offsetMs: 0, result: "correct" }] },
  methods: Object.assign({}, definition.methods, { $t: key => key }),
  render: compiled.render, staticRenderFns: compiled.staticRenderFns }));
function flatten(node) { return [node].concat((node.children || []).flatMap(flatten)); }
const nodes = flatten(view._render());
assert.strictEqual(nodes.filter(node => node.tag === "ellipse").length, 72);
assert.strictEqual(nodes.filter(node => node.data && node.data.attrs && node.data.attrs["data-level"] === 4).length, 3);
assert(nodes.some(node => node.data && node.data.staticClass === "dense-tap-marker" || node.data && node.data.class && node.data.class.includes && node.data.class.includes("dense-tap-marker")));
assert(parsed.styles[0].content.includes("overflow-x: auto"));
assert(parsed.styles[0].content.includes("max-width: 100%"));
assert(parsed.styles[0].content.includes("min-width: 0"));
assert(!parsed.script.content.includes("Audio") && !parsed.script.content.includes("addEventListener(\"pointer"), "renderer has no audio or training-input side effects");

const scroller = { scrollLeft: 0, scrollWidth: busiest.width, clientWidth: 280 };
const live = Object.assign({}, definition.methods, { following: true, playheadX: 120, $refs: { scroller }, followFrame: null });
live.followPlayhead(); assert.strictEqual(scroller.scrollLeft, 0);
live.playheadX = 420; live.followPlayhead(); const followed = scroller.scrollLeft;
assert(followed > 0 && followed < 420);
live.playheadX = 400; live.followPlayhead(); assert.strictEqual(scroller.scrollLeft, followed, "minor backward time updates never bounce the score");
live.following = false; live.playheadX = 900; live.followPlayhead(); assert.strictEqual(scroller.scrollLeft, followed);
live.following = true; live.playheadX = 1200; live.followPlayhead(); assert(scroller.scrollLeft > followed, "practice and preview share the same playhead follower");
live.resetScroll(); assert.strictEqual(scroller.scrollLeft, 0);
let frameCallback, cancelled = 0;
global.requestAnimationFrame = callback => { frameCallback = callback; return 7; };
global.cancelAnimationFrame = () => { cancelled++; };
global.window = { addEventListener() {}, removeEventListener() {} };
live.followFrame = null; live.destroyed = false;
live.scheduleFollow(); live.scheduleFollow(); assert.strictEqual(live.followFrame, 7);
definition.beforeDestroy.call(live); assert.strictEqual(cancelled, 1);
const oldPosition = scroller.scrollLeft; frameCallback(); assert.strictEqual(scroller.scrollLeft, oldPosition);
console.log("Dense rhythm score: 72-note spacing, 1–4 metric beams/partials, hollow heads, local tap offsets, compact SVG and forward-only scroll lifecycle OK.");

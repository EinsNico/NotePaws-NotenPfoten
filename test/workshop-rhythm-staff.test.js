const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), compiler = require("vue-template-compiler"), Vue = require("vue");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const model = require("../src/model/Workshop"), rhythm = require("../src/model/WorkshopRhythm"), ties = require("../src/model/WorkshopTies");
function component(name) {
  const filename = path.resolve(sourceRoot, "components", name + ".vue"), parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
}
const staff = component("WorkshopStaff"), symbol = component("WorkshopSymbol"), cases = [];
function test(name, body) { cases.push([name, body]); }
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function note(value = 52, startSlot = 0, noteValue = "quarter", extra = {}) {
  return Object.assign({ id: model.workshopId("note"), kind: "note", pitch: model.workshopPitchFromValue(value), startSlot, noteValue }, extra);
}
function fixture(props = {}) {
  const view = new Vue(Object.assign({}, staff, { propsData: Object.assign({ measure: { events: [] } }, props), methods: Object.assign({}, staff.methods, { $t: key => key }) }));
  const events = [], captures = new Set();
  view.$refs.sheet = { getScreenCTM() { return { a: .8, b: 0, c: 0, d: .8, inverse() { return {}; } }; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: (this.x - 40) / .8, y: (this.y - 30) / .8 }; } }; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); } };
  for (const name of ["place", "move-note", "move-notes", "select", "select-group", "toggle-selection"]) view.$on(name, payload => events.push({ name, payload }));
  const pointer = (x, y) => ({ clientX: x * .8 + 40, clientY: y * .8 + 30, pointerId: 1, isPrimary: true, button: 0, cancelable: true, preventDefault() {} });
  return { view, events, captures, pointer, destroy() { view.$destroy(); } };
}
function heads(f) { return f.view.events.filter(event => event.kind === "note"); }
function curves(path) { return path.match(/-?\d+(?:\.\d+)?/g).map(Number); }

test("plain legacy notes keep the former paper and half-unit keyboard movement", () => {
  const event = note(), f = fixture({ measure: { events: [event] } });
  assert.strictEqual(f.view._render().data.attrs.viewBox, "0 0 360 280"); assert.strictEqual(f.view.gridStep, .5);
  assert.strictEqual(heads(f)[0].x, 105.5); assert.strictEqual(heads(f)[0].endSlot, 2);
  f.view.keyDown({ key: "ArrowRight", preventDefault() {} }, heads(f)[0]);
  assert.strictEqual(f.events.find(event => event.name === "move-note").payload.slot, .5); f.destroy();
});

test("all supported dotted notes consume the extra time and place their dot in a space", () => {
  for (const noteValue of ["whole", "half", "quarter", "eighth", "sixteenth"]) {
    const event = note(52, 0, noteValue, { dots: 1 }), measure = { meter: "3/2", events: [event] }, original = JSON.stringify(measure), f = fixture({ measure });
    const head = heads(f)[0]; assert.strictEqual(head.endSlot, rhythm.workshopEventUnits(event));
    assert.strictEqual(head.dotY, 146); assert(head.dotX > head.x + 7);
    const rests = f.view.events.filter(item => item.implicit);
    assert.strictEqual(rests.reduce((total, rest) => total + rhythm.workshopEventUnits(rest), 0) + rhythm.workshopEventUnits(event), 12);
    const dots = nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "augmentation-dot");
    assert.strictEqual(dots.length, 1); assert.strictEqual(JSON.stringify(measure), original); f.destroy();
  }
  const space = fixture({ measure: { events: [note(53, 0, "quarter", { dots: 1 })] } });
  assert.strictEqual(heads(space)[0].dotY, heads(space)[0].y); space.destroy();
});

test("dotted rests show a visible dot and fill only the remaining actual silence", () => {
  for (const noteValue of ["half", "quarter", "eighth", "sixteenth"]) {
    const rest = { id: model.workshopId("rest"), kind: "rest", pitch: null, noteValue, dots: 1, startSlot: 0 }, f = fixture({ measure: { events: [rest] } });
    const drawn = f.view.events.find(event => event.id === rest.id); assert.strictEqual(drawn.endSlot, rhythm.workshopEventUnits(rest));
    assert.strictEqual(drawn.dotY, 106); assert.strictEqual(drawn.dotX, drawn.x + 13);
    assert.strictEqual(f.view.events.reduce((total, event) => total + rhythm.workshopEventUnits(event), 0), 8); f.destroy();
  }
});

test("chord dots avoid each other and every head while mixed dotted values retain separate stems", () => {
  const events = [note(52, 0, "quarter", { dots: 1 }), note(53, 0, "quarter", { dots: 1 }), note(55)];
  const measure = { events }, original = JSON.stringify(measure), f = fixture({ measure });
  assert.strictEqual(f.view.stems.length, 2); assert.strictEqual(new Set(heads(f).slice(0, 2).map(event => event.stemX)).size, 1);
  const dotted = heads(f).filter(event => event.dots === 1), right = Math.max(...heads(f).map(event => event.x));
  assert(dotted.every(event => event.dotX >= right + 13)); assert.strictEqual(dotted[0].dotY, dotted[1].dotY);
  assert(Math.abs(dotted[0].dotX - dotted[1].dotX) >= 8); assert.deepStrictEqual(heads(f).map(event => event.endSlot), [3, 3, 2]);
  assert.strictEqual(JSON.stringify(measure), original); f.destroy();
});

test("a temporarily shortened requested dot does not remain visible on the effective undotted note", () => {
  const event = note(52, 0, "quarter", { originalNoteValue: "quarter", originalDots: 1 }), f = fixture({ measure: { events: [event] } });
  assert.strictEqual(rhythm.workshopRequestedUnits(event), 3); assert.strictEqual(heads(f)[0].endSlot, 2);
  assert.strictEqual(nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "augmentation-dot").length, 0); f.destroy();
});

test("thirty-seconds use three flags and the true rest glyph in staff and tool symbols", () => {
  const f = fixture({ measure: { events: [note(52, 0, "thirtysecond")] } });
  assert.strictEqual(f.view.gridStep, .25); assert.strictEqual(f.view.gridSlots.length, 33); assert.strictEqual(heads(f)[0].endSlot, .25);
  assert.strictEqual(nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "flag").length, 3);
  assert.strictEqual(f.view.restGlyph("thirtysecond"), "rests.32nd"); assert(f.view.glyph("rests.32nd", 110, 116, 1.1).length > 20); f.destroy();
  const flagSymbol = new Vue(Object.assign({}, symbol, { propsData: { noteValue: "thirtysecond" } }));
  assert.strictEqual(nodes(flagSymbol._render()).filter(node => node.tag === "path").length, 3); flagSymbol.$destroy();
  for (const kind of ["note", "rest"]) {
    const dotSymbol = new Vue(Object.assign({}, symbol, { propsData: { noteValue: "quarter", kind, dots: 1 } }));
    assert(dotSymbol.dotPath.length > 20); assert(nodes(dotSymbol._render()).some(node => node.tag === "path" && node.data.attrs.d === dotSymbol.dotPath)); dotSymbol.$destroy();
  }
  const restSymbol = new Vue(Object.assign({}, symbol, { propsData: { noteValue: "thirtysecond", kind: "rest" } }));
  assert(restSymbol.restPath.length > 20); assert.strictEqual(nodes(restSymbol._render()).filter(node => node.tag === "path").length, 1); restSymbol.$destroy();
});

test("fine silent gaps render exact thirty-second rests without losing a dotted sixteenth's extra quarter unit", () => {
  const event = note(52, .25, "sixteenth", { dots: 1 }), f = fixture({ measure: { events: [event] } });
  const rests = f.view.events.filter(item => item.implicit); assert.strictEqual(rests[0].noteValue, "thirtysecond");
  assert.strictEqual(rests[0].startSlot, 0); assert.strictEqual(rests[0].endSlot, .25);
  assert(!rests.some(rest => rest.startSlot < 1 && rest.endSlot > .25));
  assert.strictEqual(rests.reduce((sum, rest) => sum + rhythm.workshopEventUnits(rest), 0), 7.25); f.destroy();
});

test("dotted fine-grid drag and keyboard bounds use the full duration at the bar end", () => {
  const event = note(52, 0, "sixteenth", { dots: 1 }), f = fixture({ measure: { events: [event] } });
  const head = heads(f)[0]; f.view.keyDown({ key: "ArrowRight", preventDefault() {} }, head);
  assert.strictEqual(f.events.find(event => event.name === "move-note").payload.slot, .25);
  f.view.pointerDown(f.pointer(head.x, head.y)); f.view.pointerMove(f.pointer(head.x + 1000, head.y));
  assert.strictEqual(f.view.gesture.slot, 7.25); assert.strictEqual(f.view.gesture.units, .75); assert.strictEqual(f.view.blockedDrag, false);
  assert.strictEqual(f.view.previewEvents.find(item => item.id === event.id).dots, 1);
  f.view.pointerUp(f.pointer(head.x + 1000, head.y)); assert.strictEqual(f.events.filter(event => event.name === "move-note").pop().payload.slot, 7.25); f.destroy();
});

test("fine-grid taps reach the first and final thirty-second under every meter and the shifted seven-signature context", () => {
  for (const meter of model.WORKSHOP_METERS) for (const keyId of ["C-major", "C-sharp-major"]) {
    const f = fixture({ meter, keyId, noteValue: "thirtysecond" }), geometry = f.view.geometry;
    f.view.pointerDown(f.pointer(geometry.left + .25 * geometry.unitWidth, 156));
    assert.strictEqual(f.view.gesture.slot, 0); assert.strictEqual(f.view.gesture.x, geometry.left + .25 * geometry.unitWidth);
    f.view.pointerUp(f.pointer(geometry.left + .25 * geometry.unitWidth, 156));
    f.view.pointerDown(f.pointer(geometry.width - 22, 156)); assert.strictEqual(f.view.gesture.slot, f.view.meterUnits - .25);
    f.view.pointerUp(f.pointer(geometry.width - 22, 156));
    assert.deepStrictEqual(f.events.filter(event => event.name === "place").map(event => event.payload.slot), [0, f.view.meterUnits - .25]); f.destroy();
  }
});

test("existing beam groups correctly display three levels or a third-level hook when notes shorten to thirty-seconds", () => {
  for (const values of [["thirtysecond", "thirtysecond"], ["sixteenth", "thirtysecond", "eighth"]]) {
    let cursor = 0; const events = values.map((value, index) => {
      const event = note(52 + index * 2, cursor, value, { beamGroupId: "kept-beam" }); cursor += rhythm.workshopEventUnits(event); return event;
    });
    const f = fixture({ measure: { events } }); assert(f.view.stems.every(stem => stem.beamed));
    assert.deepStrictEqual(Array.from(new Set(f.view.beams.map(beam => beam.level))).sort(), [1, 2, 3]);
    assert.strictEqual(nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "flag").length, 0);
    assert(f.view.beams.filter(beam => beam.level === 3).every(beam => beam.points.split(" ").every(point => point.split(",").every(value => Number.isFinite(Number(value)))))); f.destroy();
  }
});

test("full ties curve opposite the stem, keep selected heads separate and include all drawing in the paper", () => {
  for (const value of [52, 64]) {
    const from = note(value), to = note(value, 2), score = model.createWorkshopDraft().score; score.parts[0].measures[0].events = [from, to];
    const tied = ties.connectWorkshopTies(score, [from.id, to.id]); assert(tied);
    const measure = model.resolveWorkshopMeasure(tied, 0), f = fixture({ measure, ties: ties.workshopMeasureTies(tied, 0, 0), selectedEventId: from.id });
    assert.strictEqual(f.view.tieCurves.length, 1); const curve = f.view.tieCurves[0], coordinates = curves(curve.path), direction = heads(f)[0].stemDirection;
    assert.strictEqual(curve.partial, false); assert((coordinates[3] - coordinates[1]) * direction > 0);
    assert.strictEqual(heads(f).length, 2); assert(curve.minimumY >= f.view.geometry.top); assert(curve.maximumY <= f.view.geometry.top + f.view.geometry.height);
    const element = nodes(f.view._render()).find(node => node.data && node.data.staticClass === "tie");
    assert.strictEqual(element.data.attrs["aria-hidden"], "true"); assert.strictEqual(element.data.class.selected, true); f.destroy();
  }
});

test("cross-bar tie segments use the current head and its clef, with key-signature spacing at both edges", () => {
  const score = model.createWorkshopDraft("", 2).score, from = note(55, 6), to = note(55);
  score.keyId = "C-sharp-major"; score.parts[0].measures[0].events = [from]; score.parts[0].measures[1].events = [to]; score.parts[0].measures[1].clef = "bass";
  const tied = ties.connectWorkshopTies(score, [from.id, to.id]); assert(tied);
  for (const barIndex of [0, 1]) {
    const measure = model.resolveWorkshopMeasure(tied, barIndex), f = fixture({ measure, barIndex, keyId: tied.keyId, ties: ties.workshopMeasureTies(tied, 0, barIndex) });
    assert.strictEqual(f.view.tieCurves.length, 1); const curve = f.view.tieCurves[0], numbers = curves(curve.path), head = heads(f)[0];
    assert.strictEqual(curve.partial, true); assert.strictEqual(numbers[1], head.y + head.stemDirection * 7); assert.strictEqual(numbers[7], numbers[1]);
    if (barIndex === 0) assert.strictEqual(numbers[6], f.view.geometry.width - 12); else assert.strictEqual(numbers[0], f.view.geometry.left);
    assert.strictEqual(head.y, barIndex === 0 ? 136 : 16); f.destroy();
  }
});

test("chord ties retain one independent curve per pitch and do not turn heads into a single editing target", () => {
  const from = [52, 55, 59].map(value => note(value)), to = [52, 55, 59].map(value => note(value, 2)), score = model.createWorkshopDraft().score;
  score.parts[0].measures[0].events = from.concat(to); const tied = ties.connectWorkshopTies(score, from.concat(to).map(event => event.id)); assert(tied);
  const f = fixture({ measure: model.resolveWorkshopMeasure(tied, 0), ties: ties.workshopMeasureTies(tied, 0, 0) });
  assert.strictEqual(f.view.tieCurves.length, 3); assert.strictEqual(new Set(f.view.tieCurves.map(curve => curve.path)).size, 3);
  const controls = nodes(f.view._render()).filter(node => node.data && node.data.attrs && node.data.attrs.role === "button" && node.data.attrs["aria-pressed"] !== undefined);
  assert.strictEqual(controls.length, 6); f.destroy();
});

test("tie-target selection can choose one chord tone by pointer or keyboard but never place, drag or move a note", () => {
  const events = [note(52), note(55), note(59)], measure = { events }, original = JSON.stringify(measure);
  const f = fixture({ measure, selectionOnly: true, selectedEventIds: events.map(event => event.id), multiSelect: true, selectionUnit: "chord" });
  const head = heads(f)[1]; f.view.pointerDown(f.pointer(head.x, head.y)); f.view.pointerMove(f.pointer(head.x + 90, head.y - 30)); f.view.pointerUp(f.pointer(head.x + 90, head.y - 30));
  assert.deepStrictEqual(f.events.map(event => [event.name, event.payload.id]), [["select", head.id]]);
  f.view.pointerDown(f.pointer(200, 216)); f.view.pointerUp(f.pointer(200, 216));
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) f.view.keyDown({ key, preventDefault() {} }, head);
  for (const key of ["Enter", " "]) f.view.keyDown({ key, preventDefault() {} }, heads(f)[0]);
  assert.deepStrictEqual(f.events.map(event => event.name), ["select", "select", "select"]);
  assert.strictEqual(f.events[1].payload.id, events[0].id); assert.strictEqual(f.events[2].payload.id, events[0].id);
  assert.strictEqual(JSON.stringify(measure), original); assert.strictEqual(f.captures.size, 0); f.destroy();
});

(async () => { for (const [name, body] of cases) { await body(); process.stdout.write("✓ " + name + "\n"); }
  process.stdout.write("Workshop rhythm staff tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), compiler = require("vue-template-compiler"), Vue = require("vue");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const model = require("../src/model/Workshop");
const filename = path.resolve(sourceRoot, "components/WorkshopStaff.vue");
const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const compiled = new Module(filename, module);
compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
const staff = Object.assign({}, compiled.exports.default, compiler.compileToFunctions(parsed.template.content));
const cases = [];
function test(name, body) { cases.push([name, body]); }
const zoomLevels = [.75, 1, 1.5, 2];

// Browser SVG coordinates include both the rendered zoom and the sheet's
// position after scrolling. Use the complete affine inverse, rather than an
// identity matrix or a fixed coordinate response, to exercise actual hit tests.
function matrix(a, b, c, d, e, f) {
  return { a, b, c, d, e, f, inverse() {
    const determinant = a * d - b * c;
    return matrix(d / determinant, -b / determinant, -c / determinant, a / determinant,
      (c * f - d * e) / determinant, (b * e - a * f) / determinant);
  } };
}
function fixture(zoom, scrollOffset, props = {}) {
  const view = new Vue(Object.assign({}, staff, {
    propsData: Object.assign({ measure: { events: [] }, noteValue: "sixteenth" }, props),
    methods: Object.assign({}, staff.methods, { $t: key => key })
  }));
  const captures = new Set(), events = [];
  let transform = matrix(zoom, 0, 0, zoom, 48 - scrollOffset, 213);
  view.$refs.sheet = {
    getScreenCTM() { return transform; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform(m) {
      return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f };
    } }; },
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); }
  };
  for (const name of ["place", "move-note", "move-notes", "select", "select-group", "change-clef", "change-meter"])
    view.$on(name, payload => events.push({ name, payload }));
  const pointer = (x, y) => ({
    clientX: transform.a * x + transform.c * y + transform.e,
    clientY: transform.b * x + transform.d * y + transform.f,
    pointerId: 17, pointerType: "touch", isPrimary: true, button: 0, cancelable: true,
    preventDefault() {}, stopPropagation() {}
  });
  const click = () => view._render().data.on.click({ detail: 1, button: 0, cancelable: true,
    preventDefault() {}, stopPropagation() {} });
  return { view, captures, events, pointer, click,
    setTransform(nextZoom, nextScrollOffset) { transform = matrix(nextZoom, 0, 0, nextZoom, 48 - nextScrollOffset, 213); },
    destroy() { view.$destroy(); }
  };
}
function note() { return { id: "zoom-note", kind: "note", pitch: model.workshopPitchFromValue(48), noteValue: "eighth", startSlot: 1.5 }; }
function tap(f, x, y) { f.view.pointerDown(f.pointer(x, y)); f.view.pointerUp(f.pointer(x, y)); f.click(); }

test("zoomed and horizontally scrolled paper places C4 at the same musical time", () => {
  for (const zoom of zoomLevels) for (const scrollOffset of [0, 137]) {
    const f = fixture(zoom, scrollOffset);
    tap(f, f.view.mappedSlotX(1.5), 176);
    assert.strictEqual(f.events.length, 1, `${zoom} / ${scrollOffset}`);
    assert.strictEqual(f.events[0].name, "place");
    assert.strictEqual(f.events[0].payload.slot, 1.5);
    assert.strictEqual(model.workshopPitchValue(f.events[0].payload.pitch), 48);
    assert.strictEqual(f.captures.size, 0); f.destroy();
  }
});

test("all zoom levels select the existing note without placing or moving another", () => {
  for (const zoom of zoomLevels) {
    const event = note(), measure = { events: [event] }, before = JSON.stringify(measure), f = fixture(zoom, 137, { measure });
    const head = f.view.events.find(item => item.id === event.id);
    tap(f, head.x, head.y);
    assert.deepStrictEqual(f.events.map(item => item.name), ["select"]);
    assert.strictEqual(f.events[0].payload.id, event.id);
    assert.strictEqual(JSON.stringify(measure), before); f.destroy();
  }
});

test("a drag on zoomed, scrolled paper moves C4 one unit later and up to D4", () => {
  for (const zoom of zoomLevels) {
    const event = note(), measure = { events: [event] }, before = JSON.stringify(measure), f = fixture(zoom, 137, { measure });
    const head = f.view.events.find(item => item.id === event.id);
    const nextX = head.x + f.view.mappedSlotX(2.5) - f.view.mappedSlotX(1.5);
    f.view.pointerDown(f.pointer(head.x, head.y));
    f.view.pointerMove(f.pointer(nextX, head.y - 10));
    f.view.pointerUp(f.pointer(nextX, head.y - 10)); f.click();
    const moves = f.events.filter(item => item.name === "move-note");
    assert.strictEqual(moves.length, 1, String(zoom));
    assert.strictEqual(moves[0].payload.id, event.id);
    assert.strictEqual(moves[0].payload.slot, 2.5);
    assert.strictEqual(model.workshopPitchValue(moves[0].payload.pitch), 50);
    assert(!f.events.some(item => item.name === "place" || item.name === "move-notes"));
    assert.strictEqual(f.captures.size, 0); assert.strictEqual(JSON.stringify(measure), before); f.destroy();
  }
});

test("the coordinate hit on the clef opens its context once at every zoom", () => {
  for (const zoom of zoomLevels) {
    const f = fixture(zoom, 19);
    tap(f, 24, 110);
    assert.deepStrictEqual(f.events.map(item => item.name), ["change-clef"]);
    assert.strictEqual(f.captures.size, 0); f.click(); assert.strictEqual(f.events.length, 1); f.destroy();
  }
});

test("canceling before a zoom change cannot turn a held note or blank-space press into an edit", () => {
  for (const zoom of zoomLevels) for (const existing of [false, true]) {
    const measure = { events: existing ? [note()] : [] }, before = JSON.stringify(measure), f = fixture(zoom, 137, { measure });
    const head = existing ? f.view.events.find(item => item.id === "zoom-note") : { x: f.view.mappedSlotX(1.5), y: 176 };
    const down = f.pointer(head.x, head.y);
    f.view.pointerDown(down); assert.strictEqual(f.captures.size, 1);
    f.view.cancelGesture(); f.setTransform(2, 219);
    f.view.pointerMove(f.pointer(f.view.mappedSlotX(4), 116));
    f.view.pointerUp(down); f.click();
    assert.deepStrictEqual(f.events, []); assert.strictEqual(f.captures.size, 0);
    assert.strictEqual(JSON.stringify(measure), before); f.destroy();
  }
});

test("a zoom change also consumes a pending context release before its later browser click", () => {
  for (const zoom of zoomLevels) {
    const f = fixture(zoom, 19);
    f.view.pointerDown(f.pointer(24, 110)); f.view.pointerUp(f.pointer(24, 110));
    assert.strictEqual(f.view.contextClickKind, "clef");
    f.view.cancelGesture(); f.setTransform(1.5, 137); f.click();
    assert.deepStrictEqual(f.events, []); assert.strictEqual(f.captures.size, 0); f.destroy();
  }
});

(async () => {
  for (const [name, body] of cases) { await body(); process.stdout.write("✓ " + name + "\n"); }
  process.stdout.write("Workshop editor zoom gesture tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });

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
function note(value, startSlot = 0, noteValue = "sixteenth") {
  return { id: model.workshopId("note"), kind: "note", pitch: model.workshopPitchFromValue(value), noteValue, startSlot };
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function fixture(props = {}) {
  const view = new Vue(Object.assign({}, staff, {
    propsData: Object.assign({ measure: { events: [] } }, props),
    methods: Object.assign({}, staff.methods, { $t: key => key })
  }));
  const captures = new Set(), events = [];
  view.$refs.sheet = {
    getScreenCTM() { return { a: .8, b: 0, c: 0, d: .8, inverse() { return {}; } }; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: (this.x - 40) / .8, y: (this.y - 30) / .8 }; } }; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); }
  };
  for (const name of ["place", "move-note", "move-notes", "select", "select-group", "change-clef", "change-meter"]) {
    view.$on(name, payload => events.push({ name, payload }));
  }
  const pointer = (x, y, extra = {}) => Object.assign({ clientX: x * .8 + 40, clientY: y * .8 + 30,
    pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, cancelable: true,
    preventDefault() {}, stopPropagation() {} }, extra);
  return { view, captures, events, pointer, destroy() { view.$destroy(); } };
}

test("the unchanged default staff retains its paper bounds, eighth-note geometry and 4/4 display", () => {
  const f = fixture();
  assert.strictEqual(f.view.effectiveClef, "treble"); assert.strictEqual(f.view.effectiveMeter, "4/4");
  assert.strictEqual(f.view.geometry.unitWidth, 31); assert.strictEqual(f.view.geometry.top, 0); assert.strictEqual(f.view.geometry.height, 280);
  assert.deepStrictEqual(f.view.meterNumbers, ["4", "4"]); assert.strictEqual(f.view.gridSlots.length, 17);
  const rendered = f.view._render(); assert.strictEqual(rendered.data.attrs.viewBox, "0 0 360 280");
  f.destroy();
});

test("clef context displays the same pitches on the correct musical lines without changing the score", () => {
  const event = note(41), measure = { events: [event], meter: "3/4", clef: "bass" }, original = JSON.stringify(measure);
  const bass = fixture({ measure });
  assert.strictEqual(bass.view.effectiveClef, "bass"); assert.strictEqual(bass.view.events.find(item => item.id === event.id).y, 96);
  assert.deepStrictEqual(bass.view.meterNumbers, ["3", "4"]);
  const treble = fixture({ measure, clef: "treble", meter: "5/4" });
  assert.strictEqual(treble.view.effectiveClef, "treble"); assert.strictEqual(treble.view.meterUnits, 10);
  assert.strictEqual(treble.view.events.find(item => item.id === event.id).y, 216);
  const path = f => nodes(f.view._render()).find(node => node.data && node.data.attrs && node.data.attrs["data-workshop-context"] === "clef").children.find(node => node.tag === "path").data.attrs.d;
  assert(path(bass).length > 20); assert.notStrictEqual(path(bass), path(treble));
  assert.strictEqual(JSON.stringify(measure), original); bass.destroy(); treble.destroy();
});

test("clef and meter controls are keyboard operable with generous targets and never place a note", () => {
  const f = fixture(), original = JSON.stringify(f.view.measure);
  const controls = nodes(f.view._render()).filter(node => node.data && node.data.attrs && node.data.attrs["data-workshop-context"]);
  assert.strictEqual(controls.length, 2);
  controls.forEach(control => {
    assert.strictEqual(control.data.attrs.role, "button"); assert.strictEqual(control.data.attrs.tabindex, "0"); assert(control.data.attrs["aria-label"]);
    const target = control.children.find(node => node.tag === "rect");
    assert(Number(target.data.attrs.width) >= 44 && Number(target.data.attrs.height) >= 44);
    const kind = control.data.attrs["data-workshop-context"];
    control.data.on.pointerdown(f.pointer(kind === "clef" ? 24 : 66, 110));
    assert.strictEqual(f.view.gesture.contextKind,kind);
    assert.strictEqual(f.captures.size,1);
    f.view.pointerUp(f.pointer(kind === "clef" ? 24 : 66, 110)); assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
    renderedClick(f);
    for (const key of ["Enter", " "]) control.data.on.keydown({ key, preventDefault() {}, stopPropagation() {} });
    control.data.on.keydown({ key: "ArrowRight", preventDefault() {}, stopPropagation() {} });
  });
  assert.deepStrictEqual(f.events.map(event => event.name), ["change-clef", "change-clef", "change-clef", "change-meter", "change-meter", "change-meter"]);
  assert.strictEqual(JSON.stringify(f.view.measure), original); f.destroy();
});

test("symbol coordinate hits bypass editor gestures and secondary mouse or touch input is ignored", () => {
  const f = fixture();
  f.view.pointerDown(f.pointer(24, 110)); f.view.pointerUp(f.pointer(24, 110)); renderedClick(f);
  f.view.pointerDown(f.pointer(66, 110)); f.view.pointerUp(f.pointer(66, 110)); renderedClick(f);
  assert.deepStrictEqual(f.events.map(event => event.name), ["change-clef", "change-meter"]);
  f.view.pointerDown(f.pointer(24, 110, { isPrimary: false }));
  f.view.contextPointerDown(f.pointer(66, 110, { button: 2 }), "meter");
  assert.strictEqual(f.events.length, 2); assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
  f.destroy();
});

function renderedClick(f,extra={}) {
  f.view._render().data.on.click(Object.assign({detail:1,button:0,cancelable:true,preventDefault(){},stopPropagation(){}},extra));
}

test("touch and mouse context gestures finish before opening any dialog and open exactly once",()=>{
  for(const pointerType of ["touch","mouse","pen"]) for(const directTarget of [false,true]) {
    const f=fixture(),before=JSON.stringify(f.view.measure);
    const down=f.pointer(66,110,{pointerType});
    if(directTarget)f.view.contextPointerDown(down,"meter");else f.view.pointerDown(down);
    assert.strictEqual(f.events.length,0,"a held pointer must not expose new choices beneath itself");
    assert.strictEqual(f.view.gesture.contextKind,"meter");assert.strictEqual(f.captures.size,1);
    f.view.pointerUp(f.pointer(66,110,{pointerType}));
    assert.strictEqual(f.events.length,0,"pointerup must not mount a dialog before its following click");
    assert.strictEqual(f.view.contextClickKind,"meter");assert.strictEqual(f.captures.size,0);
    f.view.cancelGesture({type:"lostpointercapture",pointerId:1});
    renderedClick(f);assert.deepStrictEqual(f.events.map(event=>event.name),["change-meter"]);
    renderedClick(f);assert.strictEqual(f.events.length,1,"the release click must be consumed once");
    assert.strictEqual(JSON.stringify(f.view.measure),before);f.destroy();
  }
});

test("dragged or canceled context presses never open a dialog or place notes",()=>{
  for(const cancel of ["drag","pointercancel","explicit"]) {
    const f=fixture();f.view.pointerDown(f.pointer(66,110));
    if(cancel==="drag") {
      f.view.pointerMove(f.pointer(110,180));f.view.pointerUp(f.pointer(110,180));
    } else {
      f.view.cancelGesture(cancel==="pointercancel"?{type:"pointercancel",pointerId:1}:undefined);
      f.view.pointerUp(f.pointer(66,110));
    }
    renderedClick(f);assert.strictEqual(f.events.length,0);assert.strictEqual(f.captures.size,0);f.destroy();
  }
  const f=fixture();f.view.pointerDown(f.pointer(66,110));f.view.pointerUp(f.pointer(66,110));
  f.view.pointerDown(f.pointer(180,156));f.view.pointerUp(f.pointer(180,156));renderedClick(f);
  assert.deepStrictEqual(f.events.map(event=>event.name),["place"],"an unconsumed old context tap cannot affect a later note");f.destroy();
});

test("read-only context clicks stay inactive and virtual button clicks remain accessible",()=>{
  const target={closest(){return {getAttribute(){return "meter";}};}};
  for(const readOnly of [false,true]) {
    const f=fixture({readOnly});renderedClick(f,{detail:0,target});
    assert.deepStrictEqual(f.events.map(event=>event.name),readOnly?[]:["change-meter"]);f.destroy();
  }
});

test("every supported meter fills exactly its own silent time and its right edge places the final sixteenth", () => {
  for (const meter of model.WORKSHOP_METERS) {
    const f = fixture({ meter, noteValue: "sixteenth" }), units = model.workshopMeterUnits(meter);
    assert.strictEqual(f.view.gridSlots.length, units * 2 + 1); assert.strictEqual(f.view.gridSlots[f.view.gridSlots.length - 1], units);
    const rests = f.view.events.filter(event => event.implicit);
    assert.strictEqual(rests.reduce((total, event) => total + model.WORKSHOP_NOTE_UNITS[event.noteValue], 0), units);
    assert(rests.every(event => event.startSlot >= 0 && event.endSlot <= units));
    f.view.pointerDown(f.pointer(338, 176)); f.view.pointerUp(f.pointer(338, 176));
    const placed = f.events.find(event => event.name === "place"); assert(placed, meter);
    assert.strictEqual(placed.payload.slot, units - .5, meter); assert.strictEqual(model.workshopPitchValue(placed.payload.pitch), 48);
    f.destroy();
  }
});

test("a full short or long bar has no invented rests and retains all note identities", () => {
  for (const meter of ["3/8", "3/4", "5/4", "12/8"]) {
    const units = model.workshopMeterUnits(meter), events = Array.from({ length: units * 2 }, (_, index) => note(48 + index % 12, index * .5));
    const measure = { events, meter }, original = JSON.stringify(measure), f = fixture({ measure });
    assert.strictEqual(f.view.events.filter(event => event.implicit).length, 0);
    assert.deepStrictEqual(f.view.events.filter(event => event.kind === "note").map(event => event.id), events.map(event => event.id));
    assert(f.view.events.every(event => Number.isFinite(event.x) && Number.isFinite(event.y)));
    assert.strictEqual(JSON.stringify(measure), original); f.destroy();
  }
});

test("dragging and keyboard movement obey the actual meter instead of the former eight-unit limit", () => {
  for (const meter of ["3/8", "3/4", "5/4", "12/8"]) {
    const units = model.workshopMeterUnits(meter), first = note(48, 0), f = fixture({ measure: { meter, events: [first] } });
    const head = f.view.events.find(event => event.id === first.id);
    f.view.pointerDown(f.pointer(head.x, head.y)); f.view.pointerMove(f.pointer(head.x + 1000, head.y));
    assert.strictEqual(f.view.gesture.slot, units - .5, meter);
    f.view.pointerUp(f.pointer(head.x + 1000, head.y));
    assert.strictEqual(f.events.find(event => event.name === "move-note").payload.slot, units - .5);
    f.view.measure = { meter, events: [note(48, units - .5)] };
    const edge = f.view.events.find(event => event.kind === "note");
    f.view.keyDown({ key: "ArrowRight", preventDefault() {} }, edge);
    assert.strictEqual(f.events[f.events.length - 1].payload.slot, units - .5);
    f.view.keyDown({ key: "ArrowLeft", preventDefault() {} }, edge);
    assert.strictEqual(f.events[f.events.length - 1].payload.slot, units - 1);
    f.destroy();
  }
});

test("bass placement maps F3 to its line while existing notes use the full score range", () => {
  const f = fixture({ clef: "bass", noteValue: "quarter" });
  f.view.pointerDown(f.pointer(110, 96)); f.view.pointerUp(f.pointer(110, 96));
  assert.strictEqual(model.workshopPitchValue(f.events.find(event => event.name === "place").payload.pitch), 41);
  for (const [value, key, expected] of [[24, "ArrowDown", 23], [59, "ArrowUp", 60], [71, "ArrowUp", 72], [9,"ArrowDown",9], [96,"ArrowUp",96]]) {
    f.view.measure = { clef: "bass", events: [note(value)] };
    f.view.keyDown({ key, preventDefault() {} }, f.view.events.find(event => event.kind === "note"));
    assert.strictEqual(model.workshopPitchValue(f.events[f.events.length - 1].payload.pitch), expected);
  }
  f.destroy();
});

test("moving a selected group preserves its spacing and stops its last note at the current bar end", () => {
  for (const meter of ["3/8", "5/4"]) {
    const events = [note(48, 0, "eighth"), note(52, 1, "eighth")];
    const f = fixture({ measure: { meter, events }, multiSelect: true, selectedEventIds: events.map(event => event.id) });
    const head = f.view.events.find(event => event.id === events[0].id);
    f.view.pointerDown(f.pointer(head.x, head.y)); f.view.pointerMove(f.pointer(head.x + 1000, head.y));
    assert.strictEqual(f.view.gesture.slot, model.workshopMeterUnits(meter) - 2);
    assert.strictEqual(f.view.blockedDrag, false);
    const preview = f.view.previewEvents.filter(event => event.kind === "note");
    assert.deepStrictEqual(preview.map(event => event.startSlot), [model.workshopMeterUnits(meter) - 2, model.workshopMeterUnits(meter) - 1]);
    f.view.pointerUp(f.pointer(head.x + 1000, head.y));
    const moved = f.events.find(event => event.name === "move-notes");
    assert(moved); assert.deepStrictEqual(moved.payload.ids, events.map(event => event.id));
    f.destroy();
  }
});

test("notes retained after a clef change remain visible, selectable and horizontally movable at their original pitch", () => {
  for (const [clef, value] of [["treble", 24], ["bass", 71]]) {
    const event = note(value), measure = { events: [event], clef }, original = JSON.stringify(measure), f = fixture({ measure });
    const head = f.view.events.find(item => item.id === event.id), frame = f.view.geometry;
    assert(head.y - 17 >= frame.top && head.y + 17 <= frame.top + frame.height);
    assert(f.view.stems.every(stem => Math.min(stem.y1, stem.y2) >= frame.top && Math.max(stem.y1, stem.y2) <= frame.top + frame.height));
    f.view.pointerDown(f.pointer(head.x, head.y)); assert.strictEqual(f.view.gesture.eventId, event.id);
    f.view.pointerMove(f.pointer(head.x + frame.unitWidth, head.y));
    f.view.pointerUp(f.pointer(head.x + frame.unitWidth, head.y));
    const moved = f.events.find(item => item.name === "move-note"); assert(moved);
    assert.strictEqual(model.workshopPitchValue(moved.payload.pitch), value);
    assert.strictEqual(moved.payload.slot, 1); assert.strictEqual(JSON.stringify(measure), original); f.destroy();
  }
});

test("extreme retained beamed notes fit the expanded paper without losing stems or beam groups", () => {
  const events = [note(69, 0), note(71, .5)].map(event => Object.assign(event, { beamGroupId: "retained-beam" }));
  const f = fixture({ measure: { clef: "bass", events } }), frame = f.view.geometry;
  assert(f.view.beams.length >= 2); assert(f.view.stems.every(stem => stem.beamed));
  f.view.beams.forEach(beam => beam.points.split(" ").forEach(point => {
    const y = Number(point.split(",")[1]); assert(y >= frame.top && y <= frame.top + frame.height);
  }));
  assert.deepStrictEqual(f.view.events.filter(event => event.kind === "note").map(event => event.beamGroupId), ["retained-beam", "retained-beam"]);
  f.destroy();
});

test("dragging a retained outer note toward the staff does not shrink the paper under the pointer", () => {
  for (const [clef, value, delta] of [["bass", 71, 60], ["treble", 24, -60]]) {
    const event = note(value), f = fixture({ measure: { clef, events: [event] } });
    const head = f.view.events.find(item => item.id === event.id), before = f.view.geometry;
    f.view.pointerDown(f.pointer(head.x, head.y)); f.view.pointerMove(f.pointer(head.x, head.y + delta));
    assert(f.view.previewEvents); assert(f.view.geometry.top <= before.top);
    assert(f.view.geometry.top + f.view.geometry.height >= before.top + before.height);
    f.view.cancelGesture(); f.destroy();
  }
});

test("changing clef or meter cancels an unfinished gesture without committing musical changes", async () => {
  const event = note(48), measure = { events: [event] }, original = JSON.stringify(measure), f = fixture({ measure });
  const head = f.view.events.find(item => item.id === event.id);
  f.view.pointerDown(f.pointer(head.x, head.y)); assert.strictEqual(f.captures.size, 1);
  f.view.clef = "bass"; await Vue.nextTick(); assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
  const bassHead = f.view.events.find(item => item.id === event.id);
  f.view.pointerDown(f.pointer(bassHead.x, bassHead.y)); f.view.meter = "5/4"; await Vue.nextTick();
  assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
  assert.strictEqual(f.events.length, 0); assert.strictEqual(JSON.stringify(measure), original); f.destroy();
});

(async () => {
  for (const [name, body] of cases) { await body(); process.stdout.write("✓ " + name + "\n"); }
  process.stdout.write("Workshop context staff tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });

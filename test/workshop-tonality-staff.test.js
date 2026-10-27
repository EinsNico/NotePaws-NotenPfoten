const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), compiler = require("vue-template-compiler"), Vue = require("vue");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const model = require("../src/model/Workshop"), editor = require("../src/model/WorkshopScoreEditor");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
const filename = path.resolve(sourceRoot, "components/WorkshopStaff.vue"), parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
const staff = Object.assign({}, compiled.exports.default, compiler.compileToFunctions(parsed.template.content)), cases = [];
function test(name, body) { cases.push([name, body]); }
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function note(step, alter, octave, slot = 0, noteValue = "eighth", extra = {}) {
  return Object.assign({ id: model.workshopId("note"), kind: "note", pitch: { step, alter, octave }, startSlot: slot, noteValue }, extra);
}
function fixture(props = {}) {
  const view = new Vue(Object.assign({}, staff, { propsData: Object.assign({ measure: { events: [] } }, props),
    methods: Object.assign({}, staff.methods, { $t: key => key }) }));
  const captures = new Set(), events = [];
  view.$refs.sheet = {
    getScreenCTM() { return { a: .8, b: 0, c: 0, d: .8, inverse() { return {}; } }; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: (this.x - 40) / .8, y: (this.y - 30) / .8 }; } }; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); }
  };
  for (const name of ["place", "move-note", "move-notes", "select", "change-clef", "change-meter"]) view.$on(name, payload => events.push({ name, payload }));
  const pointer = (x, y, extra = {}) => Object.assign({ clientX: x * .8 + 40, clientY: y * .8 + 30,
    pointerId: 1, isPrimary: true, button: 0, cancelable: true, preventDefault() {}, stopPropagation() {} }, extra);
  return { view, captures, events, pointer, destroy() { view.$destroy(); } };
}
function place(f, y, x = f.view.geometry.left + .5 * f.view.geometry.unitWidth) {
  f.view.pointerDown(f.pointer(x, y)); f.view.pointerUp(f.pointer(x, y));
  return f.events.filter(event => event.name === "place").pop().payload;
}
function heads(f) { return f.view.events.filter(event => event.kind === "note"); }

test("C major and A minor retain the exact former paper, time area and coordinate mapping", () => {
  assert.deepStrictEqual(editor.workshopStaffGeometry(), editor.WORKSHOP_STAFF_GEOMETRY);
  for (const keyId of ["C-major", "A-minor"]) {
    const f = fixture({ keyId }); assert.strictEqual(f.view.keySignature.length, 0);
    assert.strictEqual(f.view.signatureWidth, 0); assert.strictEqual(f.view.geometry.left, 90);
    assert.strictEqual(f.view.geometry.width, 360); assert.strictEqual(f.view.geometry.unitWidth, 31);
    assert.strictEqual(f.view._render().data.attrs.viewBox, "0 0 360 280");
    assert.strictEqual(place(f, 146).pitch.alter, 0); f.destroy();
  }
  for (const invalid of [-1, NaN, Infinity, "20"]) {
    assert.strictEqual(editor.workshopStaffGeometry(8, invalid), null);
    assert.strictEqual(editor.workshopSlotAtStaffX(120, 8, invalid), null);
  }
});

test("all 30 keys render their ordered signature at the standard treble and bass positions", () => {
  const sharpSteps = ["F", "C", "G", "D", "A", "E", "B"], flatSteps = ["B", "E", "A", "D", "G", "C", "F"];
  const octaves = { treble: { sharp: [5, 5, 5, 5, 4, 5, 4], flat: [4, 5, 4, 5, 4, 5, 4] },
    bass: { sharp: [3, 3, 3, 3, 2, 3, 2], flat: [2, 3, 2, 3, 2, 3, 2] } };
  for (const key of NOTE_FLOW_TONALITIES) for (const clef of ["treble", "bass"]) {
    const f = fixture({ keyId: key.id, clef }), alter = Math.sign(key.fifths), count = Math.abs(key.fifths);
    const expected = (alter > 0 ? sharpSteps : flatSteps).slice(0, count)
      .map((step, index) => ({ step, alter, octave: octaves[clef][alter > 0 ? "sharp" : "flat"][index] }));
    assert.deepStrictEqual(f.view.keySignature, expected, key.id + " " + clef);
    const group = nodes(f.view._render()).find(node => node.data && node.data.staticClass === "key-signature");
    assert.strictEqual(group.data.attrs["aria-hidden"], "true"); assert.strictEqual(group.children.filter(node => node.tag === "path").length, count);
    group.children.filter(node => node.tag === "path").forEach((node, index) => {
      assert.strictEqual(node.data.attrs.d, f.view.glyph(alter > 0 ? "accidentals.sharp" : "accidentals.flat", 54 + index * 12, editor.workshopStaffY(expected[index], clef), .85));
      assert(Number.isFinite(editor.workshopStaffY(expected[index], clef)));
    }); f.destroy();
  }
});

test("automatic new notes follow the key in either clef and explicit natural, sharp or flat overrides remain absolute", () => {
  for (const [clef, y, step, octave] of [["treble", 146, "F", 4], ["bass", 96, "F", 3]]) {
    const f = fixture({ keyId: "G-major", clef, followKeySignature: true });
    assert.deepStrictEqual(place(f, y).pitch, { step, alter: 1, octave }); f.destroy();
    for (const alter of [-1, 0, 1]) {
      const manual = fixture({ keyId: "G-major", clef, alter, followKeySignature: false });
      assert.deepStrictEqual(place(manual, y).pitch, { step, alter, octave }); manual.destroy();
    }
  }
  for (const [clef, y, octave] of [["treble", 116, 4], ["bass", 136, 2]]) {
    const f = fixture({ keyId: "F-major", clef, followKeySignature: true });
    assert.deepStrictEqual(place(f, y).pitch, { step: "B", alter: -1, octave }); f.destroy();
  }
});

test("automatic C-flat and B-sharp edge notes choose the nearest valid pitch with its own signature alteration", () => {
  for (const [clef, keyId, y, expected] of [
    ["treble", "C-flat-major", 1000, { step: "B", alter: -1, octave: 0 }],
    ["bass", "C-flat-major", 1000, { step: "B", alter: -1, octave: 0 }],
    ["treble", "C-sharp-major", -1000, { step: "B", alter: 1, octave: 7 }],
    ["bass", "C-sharp-major", -1000, { step: "B", alter: 1, octave: 7 }]
  ]) {
    const f = fixture({ clef, keyId, followKeySignature: true }), pitch = f.view.placementPitch(y);
    assert.deepStrictEqual(pitch, expected);
    const value = model.workshopPitchValue(pitch); assert(value >= model.WORKSHOP_MIN_PITCH); assert(value <= model.WORKSHOP_MAX_PITCH);
    assert(model.isValidWorkshopMeasure({ events: [note(pitch.step, pitch.alter, pitch.octave)] })); f.destroy();
  }
});

test("accidental memory distinguishes a saved natural from the key baseline and is scoped to each octave and bar", () => {
  const events = [note("F", 0, 4, 0), note("F", 0, 4, 1), note("F", 1, 4, 2), note("F", 1, 4, 3),
    note("F", 1, 5, 4), note("F", 0, 5, 5), note("F", 0, 5, 6)];
  const measure = { events }, original = JSON.stringify(measure), f = fixture({ keyId: "G-major", measure });
  assert.deepStrictEqual(heads(f).map(event => event.accidental), ["nat", null, "sharp", null, null, "nat", null]);
  assert.strictEqual(JSON.stringify(measure), original);
  f.view.measure = { events: [note("F", 0, 4)] }; assert.strictEqual(heads(f)[0].accidental, "nat");
  f.view.measure = { events: [note("F", 1, 4)] }; assert.strictEqual(heads(f)[0].accidental, null); f.destroy();
  const flats = fixture({ keyId: "F-major", measure: { events: [note("B", -1, 4, 0), note("B", 0, 4, 1), note("B", 0, 4, 2), note("B", -1, 4, 3)] } });
  assert.deepStrictEqual(heads(flats).map(event => event.accidental), [null, "nat", null, "flat"]); flats.destroy();
});

test("seven-accidental keys preserve enharmonic spelling instead of converting C-flat, F-flat, E-sharp or B-sharp", () => {
  for (const [keyId, events] of [
    ["C-flat-major", [note("C", -1, 4, 0), note("F", -1, 4, 1)]],
    ["C-sharp-major", [note("E", 1, 4, 0), note("B", 1, 4, 1)]]
  ]) {
    const measure = { events }, original = JSON.stringify(measure), f = fixture({ keyId, measure });
    assert.deepStrictEqual(heads(f).map(event => event.pitch), events.map(event => event.pitch));
    assert(heads(f).every(event => event.accidental === null)); assert.strictEqual(JSON.stringify(measure), original); f.destroy();
  }
});

test("signature spacing shifts the entire beamed notation together without changing pitch, timing or useful time width", () => {
  const events = [note("C", 0, 4, 0, "sixteenth", { beamGroupId: "beam" }), note("D", 0, 4, .5, "sixteenth", { beamGroupId: "beam" })];
  const measure = { events }, original = JSON.stringify(measure), plain = fixture({ measure }), keyed = fixture({ measure, keyId: "G-major" });
  const offset = keyed.view.signatureWidth; assert(offset > 0); assert.strictEqual(keyed.view.geometry.width - plain.view.geometry.width, offset);
  assert.strictEqual(keyed.view.geometry.left - plain.view.geometry.left, offset); assert.strictEqual(keyed.view.geometry.unitWidth, plain.view.geometry.unitWidth);
  heads(keyed).forEach((event, index) => {
    for (const field of ["x", "stemX", "accidentalX"]) assert.strictEqual(event[field] - heads(plain)[index][field], offset);
    assert.strictEqual(event.startSlot, events[index].startSlot); assert.deepStrictEqual(event.pitch, events[index].pitch);
  });
  keyed.view.stems.forEach((stem, index) => assert.strictEqual(stem.x - plain.view.stems[index].x, offset));
  keyed.view.beams.forEach((beam, index) => {
    const base = plain.view.beams[index].points.split(" ").map(point => point.split(",").map(Number));
    beam.points.split(" ").forEach((point, pointIndex) => {
      const [x, y] = point.split(",").map(Number); assert.strictEqual(x - base[pointIndex][0], offset); assert.strictEqual(y, base[pointIndex][1]);
    });
  });
  assert.strictEqual(JSON.stringify(measure), original); plain.destroy(); keyed.destroy();
});

test("dense chord naturals remain clear of a seven-sign signature and the time signature at either time-area edge", () => {
  for (const slot of [0, 7.5]) {
    const events = [note("C", 0, 4, slot, "sixteenth"), note("D", 0, 4, slot, "sixteenth"), note("E", 0, 4, slot, "sixteenth")];
    const f = fixture({ keyId: "C-sharp-major", measure: { events } }), offset = f.view.signatureWidth;
    assert.strictEqual(offset, 92); assert.strictEqual(f.view.geometry.width, 452);
    assert(heads(f).every(event => event.accidental === "nat" && event.accidentalX >= 84 + offset));
    assert(heads(f).every(event => event.x <= 331 + offset)); assert.strictEqual(new Set(heads(f).map(event => event.accidentalX)).size, 3);
    f.destroy();
  }
});

test("all keys and meters map scaled pointer input to the same first and final sixteenth slots", () => {
  for (const key of NOTE_FLOW_TONALITIES) for (const meter of model.WORKSHOP_METERS) {
    const f = fixture({ keyId: key.id, meter, noteValue: "sixteenth", followKeySignature: true }), geometry = f.view.geometry;
    assert.strictEqual(place(f, 156).slot, 0);
    assert.strictEqual(place(f, 156, geometry.width - 22).slot, f.view.meterUnits - .5);
    for (let slot = 0; slot < f.view.meterUnits; slot += .5) {
      const x = geometry.left + (slot + .5) * geometry.unitWidth;
      assert.strictEqual(editor.workshopSlotAtStaffX(x, f.view.meterUnits, f.view.signatureWidth), slot);
    } f.destroy();
  }
});

test("key-signature clicks stay outside the editor while the shifted meter retains pointer and keyboard activation", () => {
  const f = fixture({ keyId: "C-sharp-major", followKeySignature: true });
  for (const x of [54, 90, 126]) { f.view.pointerDown(f.pointer(x, 116)); f.view.pointerUp(f.pointer(x, 116)); }
  assert.strictEqual(f.events.length, 0); assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
  f.view.pointerDown(f.pointer(66 + f.view.signatureWidth, 110));
  assert.strictEqual(f.events.length,0,"the held meter gesture must not open a picker");
  f.view.pointerUp(f.pointer(66 + f.view.signatureWidth, 110));
  assert.strictEqual(f.events.length,0,"the release must finish before any new dialog choices exist");
  f.view._render().data.on.click({detail:1,button:0,cancelable:true,preventDefault(){},stopPropagation(){}});
  const control = nodes(f.view._render()).find(node => node.data && node.data.attrs && node.data.attrs["data-workshop-context"] === "meter");
  assert.strictEqual(Number(control.children.find(node => node.tag === "rect").data.attrs.x), 46 + f.view.signatureWidth);
  control.data.on.keydown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(f.events.map(event => event.name), ["change-meter", "change-meter"]); f.destroy();
});

test("moving existing notes retains their absolute alteration even when the automatic tool follows another key", () => {
  for (const [clef, event] of [["treble", note("F", 0, 4)], ["bass", note("B", -1, 2)]]) {
    const measure = { events: [event] }, original = JSON.stringify(measure), f = fixture({ keyId: "G-major", clef, measure, followKeySignature: true });
    const head = heads(f)[0]; f.view.pointerDown(f.pointer(head.x, head.y));
    f.view.pointerMove(f.pointer(head.x + f.view.geometry.unitWidth, head.y)); f.view.pointerUp(f.pointer(head.x + f.view.geometry.unitWidth, head.y));
    const moved = f.events.find(item => item.name === "move-note"); assert.strictEqual(moved.payload.slot, 1); assert.deepStrictEqual(moved.payload.pitch, event.pitch);
    f.view.keyDown({ key: "ArrowUp", preventDefault() {} }, head);
    assert.strictEqual(f.events[f.events.length - 1].payload.pitch.alter, event.pitch.alter);
    assert.strictEqual(JSON.stringify(measure), original); f.destroy();
  }
});

test("changing key or automatic placement cancels a gesture without changing saved notes", async () => {
  const event = note("F", 0, 4), measure = { events: [event] }, original = JSON.stringify(measure), f = fixture({ measure });
  const head = heads(f)[0]; f.view.pointerDown(f.pointer(head.x, head.y)); assert.strictEqual(f.captures.size, 1);
  f.view.keyId = "G-major"; await Vue.nextTick(); assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0);
  assert.strictEqual(heads(f)[0].accidental, "nat");
  f.view.pointerDown(f.pointer(heads(f)[0].x, heads(f)[0].y)); f.view.followKeySignature = true; await Vue.nextTick();
  assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.captures.size, 0); assert.strictEqual(f.events.length, 0);
  assert.strictEqual(JSON.stringify(measure), original); f.destroy();
});

test("grace and conflicting simultaneous alterations render identically in either storage order", () => {
  const main=note("F",0,4,0,"quarter"),grace=note("F",1,4,0,"eighth",{grace:true});
  for (const events of [[main,grace],[grace,main]]) {
    const before=JSON.stringify(events),f=fixture({measure:{events}}),drawn=heads(f);
    assert.strictEqual(drawn.find(event => event.id === main.id).accidental,"nat");
    assert.strictEqual(drawn.find(event => event.id === grace.id).accidental,"sharp");
    assert(drawn.find(event => event.id === grace.id).x < drawn.find(event => event.id === main.id).x);
    assert.strictEqual(JSON.stringify(events),before);f.destroy();
  }
  const sharp=note("F",1,4,0,"quarter",{voice:2}),later=note("F",0,4,2,"quarter");
  for (const events of [[main,sharp,later],[sharp,main,later]]) {
    const f=fixture({measure:{events}});
    assert.deepStrictEqual(Object.fromEntries(heads(f).map(event => [event.id,event.accidental])),
      {[main.id]:"nat",[sharp.id]:"sharp",[later.id]:"nat"});f.destroy();
  }
});

test("a grace phrase keeps each accidental beside its own head and a separate stem", () => {
  const events=[note("F",1,4,0,"eighth",{grace:true}),note("G",1,4,0,"eighth",{grace:true}),note("F",0,4,0,"quarter")];
  const before=JSON.stringify(events),f=fixture({measure:{events}}),graces=heads(f).filter(event => event.grace);
  assert.strictEqual(f.view.stems.filter(stem => stem.grace).length,2);
  const stemNodes=nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "notation-stem");
  assert.strictEqual(new Set(stemNodes.map(node => node.key)).size,stemNodes.length);
  assert(graces[0].x < graces[1].x);
  graces.forEach(event => {
    const stem=f.view.stems.find(stem => stem.eventIds.includes(event.id));
    assert.deepStrictEqual(stem.eventIds,[event.id]);assert.strictEqual(stem.y1,event.y);
    assert(event.accidentalX < event.x);assert(event.x-event.accidentalX < 35);
  });
  assert.strictEqual(JSON.stringify(events),before);f.destroy();
});

test("a dragged accidental crossing another tone updates the preview and cancels without changing saved pitches", () => {
  const sharp=note("F",1,4,0),natural=note("F",0,4,2),measure={events:[sharp,natural]},before=JSON.stringify(measure);
  const f=fixture({measure}),head=heads(f).find(event => event.id === sharp.id),width=f.view.geometry.width;
  f.view.pointerDown(f.pointer(head.x,head.y));
  f.view.pointerMove(f.pointer(head.x+3*f.view.geometry.unitWidth,head.y));
  assert.strictEqual(f.view.gesture.slot,3);
  assert.strictEqual(heads(f).find(event => event.id === natural.id).accidental,null);
  assert.strictEqual(heads(f).find(event => event.id === sharp.id).accidental,"sharp");
  assert.strictEqual(f.view.geometry.width,width);
  f.view.cancelGesture();
  assert.strictEqual(heads(f).find(event => event.id === natural.id).accidental,"nat");
  assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test("dense alternating accidentals reserve paper width and keep pointer selection on the displayed note", () => {
  const events=Array.from({length:16},(_,index) => note("F",index%2 ? 0 : 1,4,index*.5,"sixteenth")),before=JSON.stringify(events);
  const f=fixture({measure:{events},noteValue:"sixteenth"}),drawn=heads(f);
  assert(f.view.geometry.width > 360);
  assert(drawn.every(event => event.x+10 < f.view.geometry.width-12));
  const late=drawn.find(event => event.startSlot === 6);
  assert.strictEqual(place(f,156,late.x).slot,6);
  const next=drawn.find(event => event.startSlot === 6.5);
  f.view.pointerDown(f.pointer(late.x,late.y));f.view.pointerMove(f.pointer(next.x,late.y));
  assert.strictEqual(f.view.gesture.slot,6.5);f.view.cancelGesture();
  const last=drawn[drawn.length-1];f.view.pointerDown(f.pointer(last.x,last.y));f.view.pointerUp(f.pointer(last.x,last.y));
  assert(f.events.some(event => event.name === "select" && event.payload.id === last.id));
  assert.strictEqual(f.events.filter(event => event.name === "place").length,1);
  assert.strictEqual(JSON.stringify(events),before);f.destroy();
});

(async () => {
  for (const [name, body] of cases) { await body(); process.stdout.write("✓ " + name + "\n"); }
  process.stdout.write("Workshop tonality staff tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });

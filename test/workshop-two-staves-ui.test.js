const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), compiler = require("vue-template-compiler"), Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const entries = new Map();
global.localStorage = { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
  getItem(key) { return entries.has(key) ? entries.get(key) : null; }, setItem(key, value) { entries.set(key, String(value)); }, removeItem(key) { entries.delete(key); } };
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
const model = require("../src/model/Workshop");
function component(name) {
  const filename = path.resolve(sourceRoot, "components", name + ".vue"), parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
}
const staff = component("WorkshopStaff"), definition = component("Workshop");
function nodes(node) { return [node].concat(...(node.children || (node.componentOptions && node.componentOptions.children) || []).map(nodes)); }
function note(value, slot = 0, noteValue = "quarter") { return { id: model.workshopId("note"), kind: "note", pitch: model.workshopPitchFromValue(value), noteValue, startSlot: slot }; }
function bars(view, part = 0) { return view.draft.score.parts[part].measures; }
function editor() {
  const view = new Vue(Object.assign({}, definition, { created: undefined, mounted: undefined, beforeDestroy: undefined,
    components: Object.assign({}, definition.components, { WorkshopStaff: staff }),
    methods: Object.assign({}, definition.methods, { $t: key => key }) }));
  view.$i18n = { locale: "de" }; view.player = { play() {}, stopAll() {} }; view.newPiece(); return view;
}
function staffNodes(view) { return nodes(view._render()).filter(node => node.componentOptions && node.componentOptions.tag === "WorkshopStaff"); }
function wrappers(view) { return nodes(view._render()).filter(node => node.data && node.data.staticClass === "staff-row"); }
function childFixture(parent, index) {
  const view = new Vue(Object.assign({}, staff, { propsData: { measure: parent.editorBars[index], clef: parent.staffContexts[index].clef,
    meter: parent.staffContexts[index].meter, noteLabel: parent.eventLabel,staffIndex:index,companionMeasure:parent.editorBars[index === 0 ? 1 : 0] }, methods: Object.assign({}, staff.methods, { $t: key => key }) }));
  const captures = new Set();
  view.$refs.sheet = { getScreenCTM() { return { a: 1, b: 0, c: 0, d: 1, inverse() { return {}; } }; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); } };
  return { view, captures, pointer(x, y) { return { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, cancelable: true, preventDefault() {} }; } };
}
function pairFixture(parent) {
  const children = [childFixture(parent, 0), childFixture(parent, 1)]; parent.$refs.sheet = children.map(child => child.view);
  const sync = () => children.forEach((child, index) => {
    child.view.measure = parent.editorBars[index]; child.view.clef = parent.staffContexts[index].clef; child.view.meter = parent.staffContexts[index].meter;
    child.view.selectedEventId = parent.selectedEventId;
    child.view.selectedEventIds = parent.staffSelectedIds(index); child.view.companionMeasure=parent.editorBars[index === 0 ? 1 : 0];
    child.view.noteValue = parent.tool.noteValue; child.view.alter = parent.tool.alter;
    child.view.multiSelect = parent.multiSelect; child.view.selectionUnit = parent.selectionUnit;
  });
  children.forEach((child, index) => {
    for (const [event, method] of [["place", "placeOnSheet"], ["move-note", "moveSheetNote"], ["move-notes", "moveSheetNotes"],
      ["select", "selectEvent"], ["select-group", "selectGroup"], ["toggle-selection", "toggleSelection"], ["extend-selection", "extendSelection"]]) {
      child.view.$on(event, payload => { parent.onStaffEvent(index, method, payload); sync(); });
    }
  });
  sync(); return { children, sync, destroy() { parent.$refs.sheet = []; children.forEach(child => child.view.$destroy()); } };
}
function test(name, body) { body(); process.stdout.write("✓ " + name + "\n"); }

test("enabling a second staff keeps the existing right part and creates matching independent bars", () => {
  const view = editor(); view.currentBar.events = [note(60)]; view.addBarCount = 2; view.addBars();
  const right = JSON.stringify(view.draft.score.parts[0]), undo = view.undoStack.length;
  assert.strictEqual(staffNodes(view).length, 1); view.toggleSecondStaff();
  assert.strictEqual(view.partIndex, 1); assert.strictEqual(view.activeParts.length, 2); assert.strictEqual(staffNodes(view).length, 2);
  assert.strictEqual(view.undoStack.length, undo + 1); assert.strictEqual(JSON.stringify(view.draft.score.parts[0]), right);
  assert.strictEqual(view.currentPart.id, "left"); assert.strictEqual(view.currentContext.clef, "bass");
  assert.strictEqual(bars(view, 1).length, 3); assert(bars(view, 1).every(bar => bar.events.length === 0));
  assert.strictEqual(new Set(view.draft.score.parts.flatMap(part => part.measures.map(bar => bar.id))).size, 6);
  assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test("notes route to their staff, and disabling, undoing and re-enabling keep the hidden notes", () => {
  const view = editor(); view.toggleSecondStaff();
  view.onStaffEvent(0, "placeOnSheet", { slot: 0, pitch: model.workshopPitchFromValue(60) });
  const right = JSON.stringify(bars(view, 0));
  view.onStaffEvent(1, "placeOnSheet", { slot: 0, pitch: model.workshopPitchFromValue(36) });
  const left = JSON.stringify(bars(view, 1)), id = bars(view, 1)[0].events.find(event => event.kind === "note").id;
  assert.strictEqual(JSON.stringify(bars(view, 0)), right); assert.strictEqual(view.partIndex, 1);
  view.toggleSecondStaff(); assert.strictEqual(view.partIndex, 0); assert.strictEqual(view.activeParts.length, 1);
  assert.strictEqual(JSON.stringify(bars(view, 1)), left);
  const before = JSON.stringify(view.draft.score), undo = view.undoStack.length;
  view.onStaffEvent(1, "placeOnSheet", { slot: 2, pitch: model.workshopPitchFromValue(40) });
  assert.strictEqual(JSON.stringify(view.draft.score), before); assert.strictEqual(view.undoStack.length, undo);
  view.undo(); assert.strictEqual(view.secondStaffEnabled, true); assert.strictEqual(view.partIndex, 1);
  view.redo(); assert.strictEqual(view.secondStaffEnabled, false); assert.strictEqual(view.partIndex, 0);
  view.toggleSecondStaff(); assert.strictEqual(JSON.stringify(bars(view, 1)), left);
  assert.strictEqual(bars(view, 1)[0].events.find(event => event.kind === "note").id, id); view.$destroy();
});

test("selecting the same part preserves chord selection and cached measures while switching cancels both gestures", () => {
  const view = editor(); view.toggleSecondStaff(); view.selectPart(0);
  bars(view, 0)[0].events = [note(60), note(64), note(67)]; view.selectGroup({ anchorId: bars(view, 0)[0].events[0].id });
  const ids = view.selectedEventIds.slice(), contexts = view.staffContexts, measures = view.editorBars;
  let cancelled = 0; const fake = () => ({ gesture: {}, cancelGesture() { this.gesture = null; cancelled++; } });
  view.$refs.sheet = [fake(), fake()]; const undo = view.undoStack.length;
  view.selectPart(0); assert.deepStrictEqual(view.selectedEventIds, ids); assert.strictEqual(cancelled, 0);
  view.selectPart(1); assert.strictEqual(view.selectedEventIds.length, 0); assert.strictEqual(cancelled, 2);
  assert.strictEqual(view.staffContexts, contexts); assert.strictEqual(view.editorBars, measures);
  assert.strictEqual(view.editorBars[0], measures[0]); assert.strictEqual(view.editorBars[1], measures[1]);
  assert.strictEqual(view.undoStack.length, undo); view.$refs.sheet = []; view.$destroy();
});

test("pointer capture activates the intended staff before a gesture and keyboard focus routes note movement", () => {
  const view = editor(); view.toggleSecondStaff(); view.selectPart(0);
  bars(view, 0)[0].events = [note(60)]; bars(view, 1)[0].events = [note(36)];
  const pair = pairFixture(view), first = pair.children[0], second = pair.children[1];
  const originalHead = first.view.events.find(event => event.kind === "note");
  first.view.pointerDown(first.pointer(originalHead.x, originalHead.y)); assert.strictEqual(first.captures.size, 1);
  const capture = wrappers(view)[1].data.on["!pointerdown"]; assert.strictEqual(typeof capture, "function"); capture({}); pair.sync();
  assert.strictEqual(view.partIndex, 1); assert.strictEqual(first.view.gesture, null); assert.strictEqual(first.captures.size, 0);
  const leftHead = second.view.events.find(event => event.kind === "note");
  second.view.pointerDown(second.pointer(leftHead.x, leftHead.y)); second.view.pointerUp(second.pointer(leftHead.x, leftHead.y));
  assert.strictEqual(view.selectedEventId, bars(view, 1)[0].events[0].id);
  wrappers(view)[0].data.on["!focusin"]({}); pair.sync(); assert.strictEqual(view.partIndex, 0);
  const unchangedLeft = JSON.stringify(bars(view, 1));
  first.view.keyDown({ key: "ArrowRight", preventDefault() {} }, first.view.events.find(event => event.kind === "note"));
  assert.strictEqual(bars(view, 0)[0].events.find(event => event.kind === "note").startSlot, .5);
  assert.strictEqual(JSON.stringify(bars(view, 1)), unchangedLeft); pair.destroy(); view.$destroy();
});

test("both rendered staves receive selection IDs but highlight only the visible matching note", () => {
  const view = editor(); view.toggleSecondStaff();
  bars(view, 0)[0].events = [note(60)]; bars(view, 1)[0].events = [note(36)];
  const rightId = bars(view, 0)[0].events[0].id, leftId = bars(view, 1)[0].events[0].id;
  view.selectEvent(bars(view, 1)[0].events[0]); view.activeEventIds = [rightId, leftId];
  const children = staffNodes(view); assert.strictEqual(children.length, 2);
  assert.strictEqual(children[0].componentOptions.propsData.selectedEventId, leftId);
  assert.strictEqual(children[1].componentOptions.propsData.selectedEventId, leftId);
  children.forEach(child => assert.deepStrictEqual(child.componentOptions.propsData.activeEventIds, [rightId, leftId]));
  const pair=pairFixture(view); pair.sync();
  const selectedHeads=pair.children.map(child=>nodes(child.view._render()).filter(node=>node.data && node.data.attrs && node.data.attrs.role==='button' && node.data.class && node.data.class.selected).map(node=>node.data.attrs['aria-label']));
  assert.deepStrictEqual(selectedHeads,[[],[view.eventLabel(bars(view,1)[0].events[0])]]);pair.destroy();
  assert.notStrictEqual(rightId, leftId); view.$destroy();
});

test("captured clicks and focus on relocated notes preserve multiselection before a group edit and drag", () => {
  const view=editor();view.toggleSecondStaff();view.selectPart(0);view.multiSelect=true;
  const first=note(36),second=note(40,2);first.displayStaff=1;second.displayStaff=1;bars(view,0)[0].events=[first,second];
  const pair=pairFixture(view),child=pair.children[1];
  function capturedPointer(id) {
    const head=child.view.events.find(event=>event.id===id),pointer=child.pointer(head.x,head.y);
    const rendered=nodes(child.view._render()).find(node=>node.data && node.data.attrs && node.data.attrs['aria-label']===view.eventLabel(head));
    assert(rendered);pointer.target={closest(selector){return selector==='[data-source-staff]' ? {getAttribute(name){return rendered.data.attrs[name];}} : null;}};
    wrappers(view)[1].data.on['!pointerdown'](pointer);pair.sync();return pointer;
  }
  for(const id of [first.id,second.id]) {const pointer=capturedPointer(id);child.view.pointerDown(pointer);child.view.pointerUp(pointer);}
  assert.deepStrictEqual(view.selectedEventIds,[first.id,second.id]);assert.strictEqual(view.partIndex,0);
  const focus=capturedPointer(first.id);wrappers(view)[1].data.on['!focusin'](focus);pair.sync();
  assert.deepStrictEqual(view.selectedEventIds,[first.id,second.id]);
  view.chooseActiveAlter(-.5);pair.sync();assert(view.selectedNotes.every(event=>event.pitch.alter===-.5));
  view.changeAccidentalDisplay('bracket');pair.sync();assert(view.selectedNotes.every(event=>event.accidentalDisplay.enclosure==='bracket'));
  const pointer=capturedPointer(first.id),start=child.view.events.find(event=>event.id===first.id),destination=child.pointer(start.x+child.view.geometry.unitWidth*.5,start.y);
  child.view.pointerDown(pointer);child.view.pointerMove(destination);child.view.pointerUp(destination);
  assert.deepStrictEqual(view.selectedEventIds,[first.id,second.id]);
  assert.deepStrictEqual(bars(view,0)[0].events.filter(event=>event.kind==='note').map(event=>event.startSlot),[.5,2.5]);
  assert.strictEqual(bars(view,1)[0].events.length,0);assert(model.isValidWorkshopScore(view.draft.score));
  pair.destroy();view.$destroy();
});

test("every clef pairing renders independently in both languages and changing meter applies to both parts", () => {
  for (const [rightClef, leftClef] of [["treble", "treble"], ["treble", "bass"], ["bass", "bass"], ["bass", "treble"]]) {
    const view = editor(); view.toggleSecondStaff(); bars(view, 0)[0].events = [note(48)]; bars(view, 1)[0].events = [note(48)];
    const pitches = view.draft.score.parts.map(part => part.measures[0].events[0].pitch);
    view.openContextPicker("clef", 0); assert.strictEqual(view.applyBarContext(rightClef), true);
    view.openContextPicker("clef", 1); assert.strictEqual(view.applyBarContext(leftClef), true);
    assert.deepStrictEqual(view.staffContexts.map(context => context.clef), [rightClef, leftClef]);
    view.openContextPicker("meter", 1); assert.strictEqual(view.applyBarContext("3/4"), true);
    assert.deepStrictEqual(view.staffContexts.map(context => context.meter), ["3/4", "3/4"]);
    assert.deepStrictEqual(view.draft.score.parts.map(part => part.measures[0].events[0].pitch), pitches);
    for (const locale of ["de", "en"]) {
      const strings = require("../src/resources/" + locale).default; view.$i18n.locale = locale;
      view.$t = (key, values = {}) => {
        assert(strings[key], locale + ": " + key);
        return strings[key].replace(/\{(\w+)\}/g, (match, name) => values[name] === undefined ? match : String(values[name]));
      };
      const children = staffNodes(view); assert.strictEqual(children.length, 2);
      assert.deepStrictEqual(children.map(child => child.componentOptions.propsData.clef), [rightClef, leftClef]);
      assert(children.every(child => child.componentOptions.propsData.meter === "3/4"));
    }
    view.$destroy();
  }
});

test("bar insert, copy, move and delete keep hidden and active parts aligned and preserve each following clef", () => {
  const view = editor(); view.toggleSecondStaff(); view.addBarCount = 2; view.addBars(); view.selectBar(0);
  bars(view, 0)[0].events = [note(60)]; bars(view, 1)[0].events = [note(36)];
  view.openContextPicker("clef", 0); view.applyBarContext("bass"); view.openContextPicker("clef", 1); view.applyBarContext("treble");
  view.selectBar(2); view.openContextPicker("clef", 0); view.applyBarContext("treble"); view.openContextPicker("clef", 1); view.applyBarContext("bass");
  view.selectBar(0); view.toggleSecondStaff(); assert.strictEqual(view.secondStaffEnabled, false);
  const following = view.draft.score.parts.map((part, index) => model.workshopMeasureContext(view.draft.score, 2, index));
  view.copyTarget = 1; view.copyBar();
  view.draft.score.parts.forEach((part, index) => {
    assert.strictEqual(model.workshopPitchValue(part.measures[1].events.find(event => event.kind === "note").pitch), index === 0 ? 60 : 36);
    assert.notStrictEqual(part.measures[0].events[0].id, part.measures[1].events[0].id);
    assert.deepStrictEqual(model.workshopMeasureContext(view.draft.score, 2, index), following[index]);
  });
  const oldFirst = view.draft.score.parts.map(part => part.measures[0].id);
  view.moveBar(1); assert.deepStrictEqual(view.draft.score.parts.map(part => part.measures[1].id), oldFirst);
  view.deleteBar(); assert(view.draft.score.parts.every(part => part.measures.length === 2));
  view.undo(); assert(view.draft.score.parts.every(part => part.measures.length === 3));
  view.addBarCount = 1; view.addBars(); assert(view.draft.score.parts.every(part => part.measures.length === 4));
  assert.strictEqual(view.secondStaffEnabled, false); assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test("revision selection and history retain both notes while safely returning to a legacy one-part version", () => {
  const view = editor(); view.draft.title = "Two-staff revision"; view.currentBar.events = [note(60)]; assert.strictEqual(view.savePiece(), true);
  const oldId = view.selectedRevisionId, oldRevision = JSON.stringify(view.currentPiece.revisions[0]);
  view.toggleSecondStaff(); view.onStaffEvent(1, "placeOnSheet", { slot: 0, pitch: model.workshopPitchFromValue(36) });
  assert.strictEqual(view.savePiece(), true); const twoId = view.selectedRevisionId;
  assert.strictEqual(view.currentPiece.revisions.length, 2); assert.strictEqual(JSON.stringify(view.currentPiece.revisions[0]), oldRevision);
  view.selectPart(1); view.chooseRevision(oldId); assert.strictEqual(view.activeParts.length, 1); assert.strictEqual(view.partIndex, 0);
  view.undo(); assert.strictEqual(view.selectedRevisionId, twoId); assert.strictEqual(view.partIndex, 1);
  assert.strictEqual(model.workshopPitchValue(bars(view, 1)[0].events.find(event => event.kind === "note").pitch), 36);
  view.redo(); assert.strictEqual(view.partIndex, 0); assert.strictEqual(view.activeParts.length, 1); view.$destroy();
});

test("back navigation cancels either sheet gesture, and a hidden-only staff does not make audition available", () => {
  const view = editor(); view.toggleSecondStaff(); bars(view, 1)[0].events = [note(36)];
  assert.strictEqual(view.hasNotes, true); assert.strictEqual(view.hasCurrentBarNotes, true); view.toggleSecondStaff();
  assert.strictEqual(view.hasNotes, false); assert.strictEqual(view.hasCurrentBarNotes, false);
  let cancelled = 0; view.$refs.sheet = [{ gesture: null, cancelGesture() { cancelled++; } },
    { gesture: {}, cancelGesture() { this.gesture = null; cancelled++; } }];
  assert.strictEqual(view.handleBack(), true); assert.strictEqual(cancelled, 2); assert.strictEqual(view.confirmExit, false); assert(view.draft);
  view.$refs.sheet = { gesture: {}, cancelGesture() { this.gesture = null; } };
  assert.strictEqual(view.handleBack(), true); assert.strictEqual(view.$refs.sheet.gesture, null);
  view.$refs.sheet = []; view.$destroy();
});

process.stdout.write("Workshop two-staff UI tests passed.\n");

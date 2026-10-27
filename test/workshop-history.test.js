const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); }
  };
}

global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
global.localStorage = storage();

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJsLoader = Module._extensions[".js"];
const originalVueLoader = Module._extensions[".vue"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJsLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };

const model = require("../src/model/Workshop");
const scoreEditor = require("../src/model/WorkshopScoreEditor");
const workshopStore = require("../src/model/WorkshopStorage");
const strings = {
  de: require("../src/resources/de").default,
  en: require("../src/resources/en").default
};
const filename = path.resolve(sourceRoot, "components/Workshop.vue");
const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const componentModule = new Module(filename, module);
componentModule.filename = filename;
componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule._compile(babel.transform(parsed.script.content, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, filename);
const definition = Object.assign({}, componentModule.exports.default,
  compiler.compileToFunctions(parsed.template.content));
Module._extensions[".js"] = originalJsLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

function editor(language = "de") {
  global.localStorage = storage();
  const view = new Vue(Object.assign({}, definition, {
    created: undefined,
    methods: Object.assign({}, definition.methods, {
      $t(key, values = {}) {
        return Object.keys(values).reduce((text, name) => text.replace("{" + name + "}", values[name]),
          strings[language][key] || key);
      },
      $tc(key, count, values) { return this.$t(key, values).split(" | ")[count === 1 ? 0 : 1]; }
    })
  }));
  view.$i18n = { locale: language };
  view.newPiece();
  view.player = { play() {}, stopAll() {} };
  return view;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function state(view) {
  return clone({ draft: view.draft, revisionId: view.selectedRevisionId,
    barIndex: view.barIndex, copyTarget: view.copyTarget, historyAction: view.historyAction });
}
function assertState(view, expected) {
  assert.deepStrictEqual(state(view), expected);
  assert(model.isValidWorkshopScore(view.draft.score));
}
const failures = [];
function test(name, callback) {
  try {
    callback();
    process.stdout.write("✓ " + name + "\n");
  } catch (error) {
    failures.push(error);
    process.stderr.write("✗ " + name + "\n" + error.stack + "\n");
  }
}
function note(pitch, noteValue, startSlot) {
  return { id: model.workshopId("note"), kind: "note", noteValue, startSlot,
    pitch: model.workshopPitchFromValue(pitch) };
}
function richDraft() {
  const draft = model.createWorkshopDraft("History score", 3);
  const bar = draft.score.parts[0].measures[0];
  const events = [note(48, "whole", 0), note(52, "eighth", 1), note(55, "sixteenth", 2)];
  for (const event of events) {
    bar.events = scoreEditor.placeWorkshopEvent(bar, event.startSlot, event);
    assert(bar.events);
  }
  const rest = { id: model.workshopId("rest"), kind: "rest", noteValue: "quarter", startSlot: 4, pitch: null };
  bar.events = scoreEditor.placeWorkshopEvent(bar, rest.startSlot, rest);
  bar.events = scoreEditor.joinWorkshopNotes(bar, events.map(event => event.id));
  assert(bar.events);
  draft.score = model.setWorkshopMeasureContext(draft.score, 1, { clef: "bass", meter: "3/4" });
  draft.score.parts[0].measures[1].events = [note(24, "half", 0)];
  draft.score = model.setWorkshopMeasureContext(draft.score, 2, { clef: "treble", meter: "6/8" });
  draft.score.parts[0].measures[2].events = [note(71, "sixteenth", 5.5)];
  assert(model.isValidWorkshopScore(draft.score));
  return { draft, noteIds: events.map(event => event.id), restId: rest.id };
}
function renderedNodes(view) {
  const nodes = [];
  function collect(node) {
    if (!node) return;
    nodes.push(node);
    (node.children || []).forEach(collect);
  }
  collect(view._render());
  return nodes;
}

function run() {
  failures.length = 0;
  test("direct history jumps restore exact notation, IDs, remembered durations and bar navigation in both directions", () => {
    const view = editor();
    const fixture = richDraft();
    view.draft = fixture.draft;
    view.resetEditor();
    const expected = [];
    expected.push(state(view));
    view.setTempo({ target: { value: "80" } });
    view.selectBar(1); view.copyTarget = 2;
    expected.push(state(view));
    view.openContextPicker("meter"); assert(view.applyBarContext("6/4"));
    view.selectBar(0); view.copyTarget = 2;
    expected.push(state(view));
    view.moveSheetNote({ id: fixture.noteIds[2], slot: 3, pitch: model.workshopPitchFromValue(57) });
    view.selectBar(1); view.copyTarget = 0;
    expected.push(state(view));
    view.addBarCount = 2; view.addBars();
    expected.push(state(view));
    view.moveBar(-1);
    expected.push(state(view));
    assert.strictEqual(view.historyEntries.length, expected.length);
    assert(view.draft.score.parts[0].measures.some(bar => bar.events.some(event => event.originalNoteValue === "whole")));
    assert(view.draft.score.parts[0].measures.some(bar => bar.events.some(event => event.id === fixture.restId)));
    assert(view.draft.score.parts[0].measures.some(bar => bar.events.some(event => event.beamGroupId)));
    for (const index of [0, 4, 1, 5, 2, 3, 0, 5]) {
      view.jumpToHistory(index);
      assertState(view, expected[index]);
      assert.strictEqual(view.historyPosition, index);
      assert.strictEqual(view.undoStack.length, index);
      assert.strictEqual(view.redoStack.length, expected.length - index - 1);
      assert.deepStrictEqual(view.historyEntries.map(entry => ({ index: entry.index,
        current: entry.current, future: entry.future })), expected.map((_, position) => ({
        index: position, current: position === index, future: position > index
      })));
      assert(view.historyEntries.every(entry => !Object.prototype.hasOwnProperty.call(entry, "draft")));
    }
    view.undo(); assertState(view, expected[4]);
    view.redo(); assertState(view, expected[5]);
    view.$destroy();
  });

  test("editing after a jump discards only the future branch and cannot mutate retained snapshots", () => {
    const view = editor();
    view.setTitle({ target: { value: "Before branching" } });
    view.setTempo({ target: { value: "80" } });
    const branchPoint = state(view);
    view.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) });
    view.setTempo({ target: { value: "100" } });
    const oldEnd = state(view);
    view.jumpToHistory(2); assertState(view, branchPoint);
    const future = JSON.stringify(view.redoStack);
    view.draft.title = "temporary live change";
    assert.strictEqual(JSON.stringify(view.redoStack), future);
    view.draft.title = branchPoint.draft.title;
    view.setTempo({ target: { value: "90" } });
    assert.strictEqual(view.redoStack.length, 0);
    assert.strictEqual(view.historyEntries.length, 4);
    assert.strictEqual(view.draft.score.bpm, 90);
    assert.notDeepStrictEqual(state(view), oldEnd);
    view.undo(); assertState(view, branchPoint);
    view.redo(); assert.strictEqual(view.draft.score.bpm, 90);
    view.$destroy();
  });

  test("the 50-change limit keeps the oldest available state reachable across jumps and undo/redo", () => {
    const view = editor();
    const expected = [state(view)];
    for (let index = 0; index < 65; index++) {
      view.setTempo({ target: { value: String(index % 2 ? 60 : 61) } });
      expected.push(state(view));
    }
    assert.strictEqual(view.undoStack.length, 50);
    assert.strictEqual(view.historyEntries.length, 51);
    view.jumpToHistory(0); assertState(view, expected[15]);
    assert.strictEqual(view.redoStack.length, 50);
    view.undo(); assertState(view, expected[15]);
    view.jumpToHistory(50); assertState(view, expected[65]);
    view.jumpToHistory(10); assertState(view, expected[25]);
    view.setTempo({ target: { value: "75" } });
    assert.strictEqual(view.redoStack.length, 0);
    assert.strictEqual(view.historyEntries.length, 12);
    view.jumpToHistory(0); assertState(view, expected[15]);
    view.$destroy();
  });

  test("pending title commits keep history targets stable when the limit shifts rows or a new branch removes them", () => {
    function fullHistory() {
      const view = editor(); const states = [state(view)];
      for (let bpm = 61; bpm <= 110; bpm++) {
        view.setTempo({ target: { value: String(bpm) } }); states.push(state(view));
      }
      assert.strictEqual(view.undoStack.length, 50);
      return { view, states };
    }
    function renamedState(before, title) {
      const expected = clone(before); expected.draft.title = title;
      expected.historyAction = { key: "WORKSHOP_HISTORY_TITLE_EDIT", values: {} };
      return expected;
    }

    const inner = fullHistory();
    const renamedEnd = renamedState(inner.states[50], "Pending recent title");
    inner.view.beginTitleEdit(); inner.view.draft.title = renamedEnd.draft.title;
    inner.view.jumpToHistory(10);
    assertState(inner.view, inner.states[10]);
    assert.strictEqual(inner.view.historyPosition, 9);
    assert.strictEqual(inner.view.historyEntries.length, 51);
    inner.view.jumpToHistory(50); assertState(inner.view, renamedEnd);
    inner.view.$destroy();

    const oldest = fullHistory();
    const keptTitle = renamedState(oldest.states[50], "Keep this pending title");
    oldest.view.beginTitleEdit(); oldest.view.draft.title = keptTitle.draft.title;
    oldest.view.jumpToHistory(0);
    assertState(oldest.view, keptTitle);
    assert.strictEqual(oldest.view.historyPosition, 50);
    assert.strictEqual(oldest.view.titleEditStart, null);
    oldest.view.undo(); assertState(oldest.view, oldest.states[50]);
    oldest.view.redo(); assertState(oldest.view, keptTitle);
    oldest.view.$destroy();

    const future = editor();
    for (const bpm of [80, 100, 120]) future.setTempo({ target: { value: String(bpm) } });
    future.jumpToHistory(1);
    const newBranch = renamedState(state(future), "New branch title");
    future.beginTitleEdit(); future.draft.title = newBranch.draft.title;
    future.jumpToHistory(3);
    assertState(future, newBranch);
    assert.strictEqual(future.historyPosition, 2);
    assert.strictEqual(future.redoStack.length, 0);
    assert.strictEqual(future.historyEntries.length, 3);
    future.$destroy();

    const current = editor();
    current.setTempo({ target: { value: "80" } });
    const beforeRename = state(current);
    const currentRenamed = renamedState(beforeRename, "Current row title");
    const clickedCurrentIndex = current.historyPosition;
    current.beginTitleEdit(); current.draft.title = currentRenamed.draft.title;
    current.jumpToHistory(clickedCurrentIndex);
    assertState(current, beforeRename);
    assert.strictEqual(current.historyPosition, clickedCurrentIndex);
    assert.strictEqual(current.redoStack.length, 1);
    current.redo(); assertState(current, currentRenamed);
    current.undo(); assertState(current, beforeRename);
    current.$destroy();
  });

  test("pending tempo keeps the clicked current or older history row reachable and leaves the new value redoable", () => {
    for (const targetIndex of [0,2]) {
      const view = editor(), states = [state(view)];
      for (const bpm of [80,100]) { view.setTempo({target:{value:String(bpm)}}); states.push(state(view)); }
      view.tempoInput='120';view.jumpToHistory(targetIndex);assertState(view,states[targetIndex]);
      assert.strictEqual(view.tempoInput,null);assert.strictEqual(view.redoStack[0].draft.score.bpm,120);
      view.jumpToHistory(view.historyEntries.length-1);assert.strictEqual(view.draft.score.bpm,120);
      view.undo();assertState(view,states[2]);view.$destroy();
    }
  });

  test("invalid jumps, unchanged operations and rejected edits do not add history or discard its future", () => {
    const view = editor();
    view.placeOnSheet({ slot: 6, pitch: model.workshopPitchFromValue(48) });
    view.setTempo({ target: { value: "80" } });
    view.undo();
    const before = state(view);
    const history = JSON.stringify({ undo: view.undoStack, redo: view.redoStack });
    for (const index of [-1, 1.5, "0", NaN, Infinity, view.historyEntries.length, view.historyPosition]) view.jumpToHistory(index);
    view.setTempo({ target: { value: "60" } });
    view.copyTarget = 0; view.copyBar(); view.deleteBar(); view.moveBar(-1);
    view.change(() => {});
    const event = view.currentBar.events.find(entry => entry.kind === "note");
    view.selectEvent(event); view.changeSelectedValue("quarter"); view.changeSelectedAlter(0);
    view.moveSheetNote({ id: event.id, slot: 6, pitch: event.pitch });
    view.placeOnSheet({ slot: 8, pitch: model.workshopPitchFromValue(52) });
    view.openContextPicker("meter"); assert.strictEqual(view.applyBarContext("3/4"), false);
    view.closeContextPicker();
    assertState(view, before);
    assert.strictEqual(JSON.stringify({ undo: view.undoStack, redo: view.redoStack }), history);
    view.$destroy();
  });

  test("a history jump cancels editing gestures and playback and clears stale dialogs and note selection", () => {
    const view = editor();
    view.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) });
    const event = view.currentBar.events.find(entry => entry.kind === "note");
    view.selectEvent(event);
    view.setTempo({ target: { value: "80" } });
    let gestureCancels = 0, playbackStops = 0, voiceStops = 0;
    view.$refs.sheet = { gesture: {}, cancelGesture() { gestureCancels++; this.gesture = null; } };
    view.playback = { stop() { playbackStops++; } };
    view.player = { play() {}, stopAll() { voiceStops++; } };
    view.playing = true; view.playingBar = 0; view.playbackBarIndex = 0;
    view.activeEventId = event.id; view.activeEventIds = [event.id];
    view.contextPicker = "meter"; view.contextError = "WORKSHOP_METER_BLOCKED";
    view.placementError = "WORKSHOP_MOVE_BLOCKED"; view.saveError = "WORKSHOP_SAVE_ERROR";
    view.toggleHistory(); assert(view.historyOpen);
    view.jumpToHistory(0);
    assert(gestureCancels > 0); assert.strictEqual(playbackStops, 1); assert(voiceStops > 0);
    assert.strictEqual(view.playback, null); assert.strictEqual(view.playing, false);
    assert.strictEqual(view.playingBar, null); assert.strictEqual(view.playbackBarIndex, null);
    assert.strictEqual(view.activeEventId, null); assert.deepStrictEqual(view.activeEventIds, []);
    assert.strictEqual(view.contextPicker, null); assert.strictEqual(view.contextError, null);
    assert.strictEqual(view.placementError, null); assert.strictEqual(view.saveError, null);
    assert.strictEqual(view.hasSelection, false);
    assert.strictEqual(view.historyOpen, true);
    view.$destroy();
  });

  test("live title typing is one undoable step when undoing, branching, saving or leaving the editor", () => {
    const view = editor(); const initialTitle = view.draft.title;
    view.beginTitleEdit(); view.draft.title = "N"; view.draft.title = "New title";
    assert.strictEqual(view.undoStack.length, 0);
    view.undo(); assert.strictEqual(view.draft.title, initialTitle);
    assert.strictEqual(view.redoStack.length, 1); assert.strictEqual(view.titleEditStart, null);
    view.redo(); assert.strictEqual(view.draft.title, "New title");
    view.setTempo({ target: { value: "80" } }); view.jumpToHistory(1);
    view.beginTitleEdit(); view.draft.title = "B"; view.draft.title = "Branch title";
    view.setTempo({ target: { value: "90" } });
    assert.strictEqual(view.redoStack.length, 0);
    assert.strictEqual(view.undoStack.length, 3);
    view.undo(); assert.strictEqual(view.draft.title, "Branch title"); assert.strictEqual(view.draft.score.bpm, 60);
    view.undo(); assert.strictEqual(view.draft.title, "New title");
    view.redo();
    view.beginTitleEdit(); view.draft.title = "Save title";
    assert(view.savePiece()); assert.strictEqual(view.currentPiece.title, "Save title");
    assert.strictEqual(view.titleEditStart, null); assert.strictEqual(view.undoStack.length, 3);
    view.beginTitleEdit(); view.draft.title = "Leave title";
    view.handleBack(); assert.strictEqual(view.confirmExit, true);
    assert.strictEqual(view.undoStack.length, 4); assert.strictEqual(view.titleEditStart, null);
    view.undo(); assert.strictEqual(view.draft.title, "Save title");
    view.$destroy();
  });

  test("saved versions and title edits remain independent while history restores the selected revision", () => {
    const view = editor();
    view.setTitle({ target: { value: "Saved title" } });
    view.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) });
    assert(view.savePiece());
    const firstRevision = view.currentPiece.currentRevisionId;
    view.setTempo({ target: { value: "80" } }); assert(view.savePiece());
    const piece = clone(view.currentPiece); const persisted = JSON.stringify(workshopStore.readWorkshopLibrary());
    const secondRevision = piece.currentRevisionId;
    view.openPiece(piece); assert.strictEqual(view.historyEntries.length, 1);
    assert.strictEqual(view.historyOpen, false); assert.strictEqual(view.dirty, false);
    const initial = state(view);
    view.setTitle({ target: { value: "Unsaved title" } }); const renamed = state(view);
    view.chooseRevision(firstRevision); const oldRevision = state(view);
    assert.strictEqual(view.draft.title, "Unsaved title"); assert.strictEqual(view.draft.score.bpm, 60);
    assert.strictEqual(view.selectedRevisionId, firstRevision);
    for (const [index, expected] of [[0, initial], [2, oldRevision], [1, renamed], [2, oldRevision]]) {
      view.jumpToHistory(index); assertState(view, expected);
    }
    view.undo(); assert.strictEqual(view.selectedRevisionId, secondRevision);
    assert.strictEqual(JSON.stringify(workshopStore.readWorkshopLibrary()), persisted);
    assert.deepStrictEqual(view.currentPiece, piece);
    view.openPiece(piece); view.chooseRevision(firstRevision); assert(view.savePiece());
    const thirdRevision = view.currentPiece.currentRevisionId;
    assert.notStrictEqual(thirdRevision, firstRevision);
    const equalScoreState = state(view);
    const retainedHistory=view.undoStack.length;
    view.chooseRevision(firstRevision);
    assert.strictEqual(view.undoStack.length, retainedHistory+1);
    assert.strictEqual(view.selectedRevisionId, firstRevision);
    assert.deepStrictEqual(view.draft.score, equalScoreState.draft.score);
    view.undo(); assertState(view, equalScoreState);
    view.redo(); assert.strictEqual(view.selectedRevisionId, firstRevision);
    view.$destroy();
  });

  test("save retains the current editing history; new, reopen and close reset it and a failed save preserves it", () => {
    const view = editor();
    view.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) });
    view.toggleHistory(); assert(view.historyOpen);
    const before = state(view); const history = JSON.stringify(view.undoStack);
    const savedStorage = global.localStorage;
    global.localStorage = Object.assign({}, savedStorage, { setItem() { throw new Error("full"); } });
    assert.strictEqual(view.savePiece(), false); assertState(view, before);
    assert.strictEqual(JSON.stringify(view.undoStack), history); assert.strictEqual(view.historyOpen, true);
    global.localStorage = savedStorage;
    assert(view.savePiece()); const piece = clone(view.currentPiece);
    assert.strictEqual(view.historyOpen, true); assert.strictEqual(view.historyEntries.length, 2);
    assert.strictEqual(view.undoStack.length, 1);
    assert.strictEqual(view.dirty, false);
    const identity=view.draft.pieceId;
    view.undo();assert.strictEqual(view.dirty,true);assert.strictEqual(view.draft.pieceId,identity);
    view.redo();assert.strictEqual(view.dirty,false);assert.strictEqual(view.draft.pieceId,identity);
    view.undo();assert(view.savePiece());assert.strictEqual(view.library.pieces.length,1);assert.strictEqual(view.draft.pieceId,identity);
    view.setTempo({ target: { value: "80" } }); view.toggleHistory(); view.openPiece(piece);
    assert.strictEqual(view.undoStack.length, 0); assert.strictEqual(view.redoStack.length, 0);
    assert.strictEqual(view.historyOpen, false);
    view.setTempo({ target: { value: "80" } }); view.toggleHistory(); view.newPiece();
    assert.strictEqual(view.historyOpen, false); assert.strictEqual(view.historyEntries.length, 1);
    assert.strictEqual(view.historyAction.key, "WORKSHOP_HISTORY_START");
    view.setTempo({ target: { value: "80" } }); view.toggleHistory(); view.closeEditor();
    assert.strictEqual(view.draft, null); assert.strictEqual(view.historyOpen, false);
    assert.strictEqual(view.undoStack.length, 0); assert.strictEqual(view.redoStack.length, 0);
    view.$destroy();
  });

  test("German and English history labels render every action and identify only the current step", () => {
    for (const language of ["de", "en"]) {
      const view = editor(language); const actionKeys = Object.keys(strings[language]).filter(key => key.startsWith("WORKSHOP_HISTORY_"));
      assert(actionKeys.length > 5);
      for (const key of actionKeys) {
        const label = view.historyEntryLabel({ action: { key, values: {
          number: 2, bar: 2, count: 3, from: 1, to: 2, value: "sixteenth", clef: "bass", meter: "3/4", bpm: 80, note: "C4", keyId: "G-major", voice: 2, dynamic: "p"
        } } });
        assert(label && !label.includes("WORKSHOP_"), key + " must be translated");
        assert(!/\{[^}]+\}/.test(label), key + " must interpolate all values");
      }
      view.setTitle({ target: { value: "Visible history" } });
      view.setTempo({ target: { value: "80" } });
      view.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) });
      view.jumpToHistory(1); view.toggleHistory();
      const nodes = renderedNodes(view);
      const text = nodes.map(node => node.text || "").join(" ");
      assert(!text.includes("WORKSHOP_")); assert(!/\{[^}]+\}/.test(text));
      const marked = nodes.filter(node => node.data && node.data.attrs && node.data.attrs["aria-current"] === "step");
      assert.strictEqual(marked.length, 1);
      assert.strictEqual(view.historyEntries.find(entry => entry.current).index, 1);
      for (const entry of view.historyEntries) assert(text.includes(view.historyEntryLabel(entry)));
      view.toggleHistory(); assert.strictEqual(view.historyOpen, false);
      view.$destroy();
    }
  });
  test("unsaved state updates immediately without forwarding all note dependencies to animation renders", () => {
    const view=editor();view.draft=richDraft().draft;view.baseline=JSON.stringify(view.draft);
    const header=renderedNodes(view).find(node=>node.tag==='header');
    assert.strictEqual(header.data.class['editing-header'],true);
    assert.strictEqual(view.dirty,false);
    assert(view._computedWatchers.dirty.deps.length<=4);
    const pitch=view.draft.score.parts[0].measures[0].events[0].pitch;
    pitch.alter=1;assert.strictEqual(view.dirty,true);
    assert(view._computedWatchers.dirty.deps.length<=4);
    pitch.alter=0;assert.strictEqual(view.dirty,false);
    view.draft.title="Unsaved";assert.strictEqual(view.dirty,true);
    view.baseline=JSON.stringify(view.draft);assert.strictEqual(view.dirty,false);
    view.playbackPosition=3000;view.activeEventIds=['animation-only'];assert.strictEqual(view.dirty,false);
    view.draft=null;assert.strictEqual(view.dirty,false);view.$destroy();
  });
  assert.strictEqual(failures.length, 0, failures.length + " history test groups failed");
}

module.exports = run;
if (require.main === module) {
  try { run(); } catch (error) { console.error(error); process.exitCode = 1; }
}

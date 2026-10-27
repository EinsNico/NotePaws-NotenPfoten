const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; }, setItem(key,value) { entries.set(key,String(value)); }, removeItem(key) { entries.delete(key); } };
}
global.window = { scrollTo() {},addEventListener() {},removeEventListener() {} };
global.document = { addEventListener() {},removeEventListener() {} };
global.localStorage = storage();
const sourceRoot = path.resolve(__dirname,"../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{ babelrc:false,presets:[["env",{ modules:"commonjs" }]] }).code,filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
const model = require("../src/model/Workshop");
const editorModel = require("../src/model/WorkshopScoreEditor");
const store = require("../src/model/WorkshopStorage");
const backup = require("../src/model/SaveDataBackup");
const imports = require("../src/model/SaveDataImport");
const files = require("../src/model/SaveDataFiles");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader");
const { prepareStagedLocalSaveDataPlan } = require("../src/model/SaveDataShadowLocalPlan");
const { prepareMergedLocalSaveDataPlan } = require("../src/model/SaveDataLargeMergeLocalPlan");
function component() {
  const filename = path.resolve(sourceRoot,"components/Workshop.vue");
  const parsed = compiler.parseComponent(fs.readFileSync(filename,"utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod = new Module(filename,module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content,{ babelrc:false,presets:[["env",{ modules:"commonjs" }]] }).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
function editor(language = "de") {
  const definition = component(); const strings = require("../src/resources/"+language).default;
  const view = new Vue(Object.assign({},definition,{ created:undefined, methods:Object.assign({},definition.methods,{
    $t(key,values = {}) { return Object.keys(values).reduce((text,name) => text.replace("{"+name+"}",values[name]),strings[key] || key); },
    $tc(key,count,values) { return this.$t(key,values).split(" | ")[count === 1 ? 0 : 1]; }
  }) }));
  view.$i18n = { locale:language }; view.newPiece(); view.player = { play() {},stopAll() {} };
  return view;
}
function note(value,noteValue,startSlot) {
  return { id:model.workshopId("note"),kind:"note",noteValue,startSlot,pitch:model.workshopPitchFromValue(value) };
}
function test(name,callback) { callback(); process.stdout.write("✓ "+name+"\n"); }
function context(view,index) { return model.workshopMeasureContext(view.draft.score,index); }

async function run() {
  test("clef and meter dialogs apply at the selected bar, inherit to new bars and undo independently",() => {
    const view = editor(); view.addBarCount = 3; view.addBars(); view.selectBar(1);
    const before = JSON.stringify(view.draft); const history = view.undoStack.length;
    view.openContextPicker("clef"); assert(view.contextPickerTitle.includes("2")); assert.strictEqual(view.hasContextOverride,false);
    assert.strictEqual(view.applyBarContext("bass"),true); assert.strictEqual(view.contextPicker,null);
    assert.strictEqual(view.undoStack.length,history+1); assert.strictEqual(context(view,0).clef,"treble");
    assert.strictEqual(context(view,1).clef,"bass"); assert.strictEqual(context(view,3).clef,"bass");
    view.undo(); assert.strictEqual(JSON.stringify(view.draft),before); view.redo();
    view.openContextPicker("meter"); assert(view.applyBarContext("3/4")); assert.strictEqual(view.freeSlots,12);
    assert.deepStrictEqual(view.bars.map((bar,index) => view.barSlots(index)),[16,12,12,12]);
    view.selectBar(3); view.addBars(); assert.deepStrictEqual(context(view,4),{ meter:"3/4",clef:"bass",units:6, keyId:"C-major", dynamic:"mf" });
    view.openContextPicker("clef"); assert(view.applyBarContext("treble"));
    view.openContextPicker("clef"); assert(view.hasContextOverride); assert(view.applyBarContext(null)); assert.strictEqual(context(view,4).clef,"bass");
    view.$destroy();
  });
  test("a shorter meter rejects overflowing later bars without changing the draft, selection or undo history",() => {
    const view = editor(); view.addBars(); view.selectBar(1); view.currentBar.events = [note(55,"quarter",6)];
    const id = view.currentBar.events[0].id; view.selectEvent(view.currentBar.events[0]);
    const before = JSON.stringify(view.draft); const history = view.undoStack.length;
    view.selectBar(0); view.openContextPicker("meter"); assert.strictEqual(view.applyBarContext("3/4"),false);
    assert.strictEqual(view.contextPicker,"meter"); assert.strictEqual(view.contextError,"WORKSHOP_METER_BLOCKED");
    assert.strictEqual(view.undoStack.length,history); assert.strictEqual(JSON.stringify(view.draft),before);
    assert.strictEqual(view.currentBar.events.length,0); assert(view.bars[1].events.some(event => event.id === id));
    assert(view.handleBack()); assert.strictEqual(view.contextPicker,null); assert.strictEqual(view.confirmExit,false); view.$destroy();
  });
  test("a longer inherited meter is used by placement, chords, duration editing and deletion",() => {
    const view = editor(); view.addBars(); view.selectBar(0); view.openContextPicker("meter"); assert(view.applyBarContext("6/4"));
    view.selectBar(1); assert.strictEqual(view.editorBar.meter,"6/4"); assert.strictEqual(view.freeSlots,24);
    view.tool.noteValue = "sixteenth"; view.placeOnSheet({ slot:11.5,pitch:model.workshopPitchFromValue(48) });
    assert.strictEqual(view.placementError,null); assert.strictEqual(view.freeSlots,23);
    view.placeOnSheet({ slot:11.5,pitch:model.workshopPitchFromValue(52) }); assert(view.chordSelected);
    assert.strictEqual(view.selectedNotes.length,2); const ids = view.selectedNotes.map(event => event.id);
    view.changeSelectedAlter(1); assert(ids.every(id => view.currentBar.events.find(event => event.id === id).pitch.alter === 1));
    view.eraseSelectedEvent(); assert.strictEqual(view.currentBar.events.filter(event => event.kind === "note").length,0);
    assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
  });
  test("copying and moving bars retain their notation without changing following bars or their sounded pitches",() => {
    const view = editor(); view.addBarCount = 3; view.addBars(); view.selectBar(1);
    view.openContextPicker("meter"); assert(view.applyBarContext("6/4"));
    view.openContextPicker("clef"); assert(view.applyBarContext("bass"));
    view.currentBar.events = [note(24,"quarter",10)]; const sourceId = view.currentBar.id;
    const before = view.bars.map((bar,index) => context(view,index));
    view.copyTarget = 0; view.copyBar(); assert.strictEqual(context(view,0).meter,"6/4"); assert.strictEqual(context(view,0).clef,"bass");
    assert.deepStrictEqual(view.bars.slice(1).map((bar,index) => context(view,index+1)),before.slice(1));
    assert.notStrictEqual(view.bars[0].events[0].id,view.bars[1].events[0].id);
    assert.strictEqual(model.workshopPitchValue(view.bars[0].events[0].pitch),24);
    const contexts = new Map(view.bars.map((bar,index) => [bar.id,context(view,index)]));
    view.moveBar(1); assert.strictEqual(view.currentBar.id,sourceId);
    view.bars.forEach((bar,index) => assert.deepStrictEqual(context(view,index),contexts.get(bar.id)));
    assert(model.isValidWorkshopScore(view.draft.score)); view.undo(); assert.strictEqual(view.currentBar.id,sourceId); view.$destroy();
  });
  test("explicitly choosing a remembered long value unlinks that note even when overlap keeps its effective duration short",() => {
    const view = editor(); const notes = [note(48,"eighth",0),note(52,"eighth",1),note(55,"eighth",2)];
    notes[0].originalNoteValue = "whole";
    view.currentBar.events = notes;
    view.currentBar.events = editorModel.joinWorkshopNotes(view.editorBar,notes.map(event => event.id));
    const first = view.currentBar.events.find(event => event.id === notes[0].id); assert(first.beamGroupId);
    view.selectEvent(first); const history = view.undoStack.length; view.changeSelectedValue("whole");
    const after = view.currentBar.events.find(event => event.id === notes[0].id);
    assert.strictEqual(after.beamGroupId,undefined); assert.strictEqual(after.originalNoteValue,"whole");
    assert.strictEqual(after.noteValue,"eighth"); assert.strictEqual(view.undoStack.length,history+1);
    assert(view.currentBar.events.filter(event => notes.slice(1).some(note => note.id === event.id)).every(event => event.beamGroupId));
    view.undo(); assert(view.currentBar.events.find(event => event.id === notes[0].id).beamGroupId); view.$destroy();
  });
  test("localized dialogs show all supported meters and clefs with clear inheritance and blocked-change feedback",() => {
    for (const language of ["de","en"]) {
      const view = editor(language); view.openContextPicker("meter"); view.contextError = "WORKSHOP_METER_BLOCKED";
      const rendered = view._render(); const nodes = [];
      function collect(node) { if (!node) return; nodes.push(node); (node.children || []).forEach(collect); }
      collect(rendered); const text = nodes.map(node => node.text || "").join(" ");
      assert(!text.includes("WORKSHOP_")); assert(!text.includes("{number}"));
      for (const meter of model.WORKSHOP_METERS) assert(text.includes(meter));
      view.openContextPicker("clef"); assert(view._render());
      const resource = require("../src/resources/"+language).default;
      for (const key of ["WORKSHOP_CHANGE_CLEF","WORKSHOP_CHANGE_METER","WORKSHOP_CONTEXT_APPLIES","WORKSHOP_CONTEXT_INHERIT","WORKSHOP_METER_BLOCKED"]) assert(resource[key]);
      for (const meter of ["3/4","6/4"]) {
        view.openContextPicker("meter"); assert(view.applyBarContext(meter));
        nodes.length = 0; collect(view._render());
        const capacity = model.workshopMeterUnits(meter)*2;
        assert(nodes.some(node => node.text === view.$t("WORKSHOP_SPACE",{ count:capacity,total:capacity })));
      }
      view.$destroy();
    }
  });

  const persisted = storage(); const legacyDraft = model.createWorkshopDraft("Mixed notation",4);
  legacyDraft.score.parts[0].measures[0].events = [note(48,"eighth",0),note(52,"sixteenth",1),note(55,"sixteenth",1.5)];
  legacyDraft.score.parts[0].measures[0].events = editorModel.joinWorkshopNotes(legacyDraft.score.parts[0].measures[0],legacyDraft.score.parts[0].measures[0].events.map(event => event.id));
  const first = store.storeWorkshopDraft(legacyDraft,persisted); const oldJson = JSON.stringify(first.piece.revisions[0].score);
  const changed = model.openWorkshopPiece(first.piece);
  changed.score = model.setWorkshopMeasureContext(changed.score,1,{ meter:"3/4",clef:"bass" });
  changed.score = model.setWorkshopMeasureContext(changed.score,2,{ meter:"6/8" });
  changed.score = model.setWorkshopMeasureContext(changed.score,3,{ meter:"2/4",clef:"treble" });
  changed.score = model.insertWorkshopMeasures(changed.score,3,196);
  changed.score.parts[0].measures[1].events = [note(24,"half",0)];
  changed.score.parts[0].measures[199].events = [note(60,"sixteenth",3.5)];
  const saved = store.storeWorkshopDraft(changed,persisted); const expected = store.readWorkshopLibrary(persisted);
  assert.strictEqual(JSON.stringify(saved.piece.revisions[0].score),oldJson);
  assert.strictEqual(model.workshopMeasureContext(model.openWorkshopPiece(saved.piece).score,199).meter,"2/4");
  const exported = backup.createSaveDataBackup(persisted); assert(backup.validateSaveDataBackup(exported).valid);
  test("app imports leave local mixed notation intact and still validate legacy backup scores",() => {
    const target = storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); target.setItem("unrelated","keep");
    for (const mode of ["replace","merge","merge"]) {
      imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));
      assert.deepStrictEqual(store.readWorkshopLibrary(target),expected); assert.strictEqual(target.getItem("unrelated"),"keep");
    }
    const invalid = model.cloneWorkshop(exported); invalid.version=5; invalid.data.workshopLibrary=model.cloneWorkshop(expected); invalid.data.workshopLibrary.pieces[0].revisions[1].score.parts[0].measures[1].meter = "4/3";
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid,false);
    const before = target.getItem(model.WORKSHOP_STORAGE_KEY); assert.throws(() => imports.prepareSaveDataImport(target,invalid,"replace"));
    assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
  });
  const exportOptions = {
    learningStorage: {
      async flush() {},getStatus() { return { failedWrites:0 }; },async verifyHistoryReady() { return { saved:true,verified:true }; },
      async migrateLegacyHistory() { return { saved:true,verified:true }; },async synchronizeProgress() { return { saved:true }; },
      async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot() { return { saved:true,progress:{ version:3,notes:{} },attempts:[] }; },
      async readProgress() { return { saved:true,progress:{ version:3,notes:{} } }; },
      async readBackupAttemptsPage() { return { saved:true,page:{ records:[],done:true } }; }
    },
    noteFlowStorage: { async flush() {},async readRoundsForExport() { return { saved:true,rounds:[] }; },async readRoundsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    rhythmStorage: { async flush() {},async readBarsForExport() { return { saved:true,bars:[] }; },async readBarsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    includeNoteFlowRounds:true,includeRhythmSenseBars:true
  };
  const full = await files.createIndexedDbSaveDataBackup(persisted,exportOptions); assert.strictEqual(full.data.workshopLibrary,undefined);
  const chunks = []; await files.streamIndexedDbSaveDataBackup(async chunk => { chunks.push(chunk); },persisted,exportOptions);
  const json = chunks.join(""); const streamed = JSON.parse(json); assert(backup.validateSaveDataBackup(streamed).valid);
  assert.strictEqual(streamed.data.workshopLibrary,undefined);
  const reader = new SaveDataStreamReader(() => { throw new Error("No large collections expected"); });
  for (let index=0;index<json.length;index+=17) reader.push(json.slice(index,index+17));
  const read = reader.finish(); const metadata = { key:"ready",shell:read.backup,counts:read.counts };
  const summary = { source:{ createdAt:read.backup.createdAt,fileSize:null },
    rounds:{ "screen:note-flow":0,"midi:note-flow":0,"midi:note-flow-chords":0,"rhythm:taktgefuehl":0 },
    attempts:{ "screen:single-notes":0,"midi:single-notes":0 },progress:{},activeGuard:"test" };
  const marker = { state:"database-verified",summary };
  const staging = { async readMetadata() { return metadata; },async readBatch() { return { records:[],nextIndex:0,total:0,done:true }; } };
  const shadow = { name:"noten-pfoten-learning-import-workshop-context-test",database:{ async readImportGenerationMarker() { return marker; },async readProgressSnapshot() { return []; } } };
  const replacement = await prepareStagedLocalSaveDataPlan(staging,shadow);
  assert.strictEqual(replacement.values[model.WORKSHOP_STORAGE_KEY],undefined);
  const target = storage(); store.storeWorkshopDraft(model.createWorkshopDraft("Local"),target); marker.state = "preparing";
  const merged = await prepareMergedLocalSaveDataPlan(staging,shadow,summary,target);
  assert.strictEqual(merged.values[model.WORKSHOP_STORAGE_KEY],undefined);
  assert.strictEqual(store.readWorkshopLibrary(target).pieces.length,1);
  process.stdout.write("✓ complete and streamed exports plus local plans exclude Workshop notation\n");
}
module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });

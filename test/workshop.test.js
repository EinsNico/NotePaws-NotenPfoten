const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); }, removeItem(key) { entries.delete(key); } };
}
global.localStorage = storage();
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
const model = require("../src/model/Workshop");
const store = require("../src/model/WorkshopStorage");
const sheetModel = require("../src/model/WorkshopScoreEditor");
const { recognizeWorkshopChord } = require("../src/model/WorkshopChordNames");
const { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");
const backup = require("../src/model/SaveDataBackup");
const imports = require("../src/model/SaveDataImport");
const files = require("../src/model/SaveDataFiles");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader");
const { summarizeStagedSaveData } = require("../src/model/SaveDataStagedPreview");
const { prepareStagedLocalSaveDataPlan } = require("../src/model/SaveDataShadowLocalPlan");
const { prepareMergedLocalSaveDataPlan } = require("../src/model/SaveDataLargeMergeLocalPlan");
const { deleteAllLearningData } = require("../src/model/LearningDataReset");
function component(name) {
  const filename = path.resolve(sourceRoot, "components", name + ".vue");
  const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
}
function note(value = 48, noteValue = "quarter") {
  return { id: model.workshopId("event"), kind: "note", noteValue, pitch: model.workshopPitchFromValue(value) };
}
function timedNote(value, noteValue, startSlot) { return Object.assign(note(value,noteValue),{ startSlot }); }
function test(name, callback) { callback(); process.stdout.write("✓ " + name + "\n"); }

(async () => {
  test("stores explicit pitch spelling, validates bar lengths and leaves empty time silent", () => {
    for (let value = 9; value <= 96; value++) assert.strictEqual(model.workshopPitchValue(model.workshopPitchFromValue(value)), value);
    assert.deepStrictEqual(model.workshopPitchFromValue(53), { step: "F", alter: 0, octave: 4 });
    const draft = model.createWorkshopDraft("First piece", 4);
    assert(model.isValidWorkshopScore(draft.score));
    draft.score.parts[0].measures[0].events = [note(48, "whole"), note()];
    assert(!model.isValidWorkshopScore(draft.score));
    draft.score.parts[0].measures[0].events.pop();
    assert(model.isValidWorkshopScore(draft.score));
    const timeline = model.workshopTimeline(draft.score);
    assert.strictEqual(timeline.durationMs, 16000);
    assert.deepStrictEqual(timeline.events.map(event => event.value), [48, null, null, null]);
    const invalid = model.cloneWorkshop(draft.score); invalid.parts[0].measures[1].id = invalid.parts[0].measures[0].id;
    assert(!model.isValidWorkshopScore(invalid));
    const malformed = model.cloneWorkshop(draft.score); malformed.parts[0].measures[0].events = [null];
    assert.strictEqual(model.isValidWorkshopScore(malformed), false);
  });

  test("retains score versions under a stable piece identity; renaming does not add a score version", () => {
    const draft = model.createWorkshopDraft("First piece", 4);
    draft.score.parts[0].measures[0].events.push(note());
    const first = model.saveWorkshopDraft(null, draft, "2026-10-02T10:00:00.000Z");
    const edited = model.openWorkshopPiece(first.piece); edited.title = "Renamed";
    const renamed = model.saveWorkshopDraft(first.library, edited, "2026-10-02T10:01:00.000Z");
    assert.strictEqual(renamed.piece.revisions.length, 1);
    edited.score.parts[0].measures[0].events[0].pitch = model.workshopPitchFromValue(55);
    const changed = model.saveWorkshopDraft(renamed.library, edited, "2026-10-02T10:02:00.000Z");
    assert.strictEqual(changed.piece.id, first.piece.id);
    assert.strictEqual(changed.piece.revisions.length, 2);
    assert.strictEqual(model.workshopPitchValue(model.openWorkshopPiece(changed.piece, first.piece.currentRevisionId).score.parts[0].measures[0].events[0].pitch), 48);
    const duplicate = model.mergeWorkshopLibraries(changed.library, changed.library);
    assert.strictEqual(duplicate.pieces.length, 1); assert.strictEqual(duplicate.pieces[0].revisions.length, 2);
    const conflict = model.cloneWorkshop(changed.library); conflict.pieces[0].revisions[0].score.bpm = 99;
    assert.throws(() => model.mergeWorkshopLibraries(changed.library, conflict), /Conflicting workshop revision/);
    assert.strictEqual(changed.piece.revisions[0].score.bpm, 60);
  });

  test("sixteenth notes fill sixteen exact subdivisions and play with their real quarter-second durations", () => {
    assert.strictEqual(model.WORKSHOP_SLOT_STEP,.5); assert.strictEqual(model.WORKSHOP_NOTE_UNITS.sixteenth,.5);
    const draft = model.createWorkshopDraft("Sixteenths", 4);
    const notes = Array.from({ length:16 },(_,index) => timedNote(48+index%12,"sixteenth",index*.5));
    draft.score.parts[0].measures[0].events = notes;
    assert(model.isValidWorkshopScore(draft.score));
    assert.strictEqual(model.workshopMeasureUnits({ events:notes }),8);
    assert.strictEqual(model.workshopOccupiedSlots({ events:notes }),8);
    const timeline = model.workshopTimeline(draft.score).events.filter(event => event.value !== null);
    assert.deepStrictEqual(timeline.map(event => [event.startMs,event.durationMs]),
      notes.map((event,index) => [index*250,250]));
    assert.strictEqual(model.workshopTimeline(draft.score).durationMs,16000);
    const legacy = model.createWorkshopDraft("Legacy sequential sixteenths");
    legacy.score.parts[0].measures[0].events = Array.from({ length:16 },() => note(48,"sixteenth"));
    assert(model.isValidWorkshopScore(legacy.score));
    legacy.score.parts[0].measures[0].events.push(note(48,"sixteenth"));
    assert(!model.isValidWorkshopScore(legacy.score));
    assert.strictEqual(model.workshopOccupiedSlots({ events:[timedNote(48,"eighth",0),timedNote(52,"sixteenth",.5),timedNote(55,"sixteenth",1)] }),1.5);
    for (const startSlot of [-.5,1/11,5/13,7.75,8,".5",NaN]) {
      assert(!model.isValidWorkshopMeasure({ events:[timedNote(48,"sixteenth",startSlot)] }));
    }
    for (const startSlot of [.125,.25,.375,.75,7.25]) {
      assert(model.isValidWorkshopMeasure({ events:[timedNote(48,"sixteenth",startSlot)] }));
    }
    assert(model.isValidWorkshopMeasure({ events:[timedNote(48,"thirtysecond",7.75)] }));
    assert(model.isValidWorkshopMeasure({ events:[timedNote(48,"sixteenth",7.5)] }));
    assert(!model.isValidWorkshopMeasure({ events:[timedNote(48,"eighth",7.5)] }));
  });
  test("sixteenth placement snaps to head centres, fills fractional silence and restores shortened intent", () => {
    for (let start = 0; start <= 7.5; start += .5) {
      const centre = 90+(start+.5)*31;
      assert.strictEqual(sheetModel.workshopSlotAtStaffX(centre),start);
      if (start < 7.5) {
        assert.strictEqual(sheetModel.workshopSlotAtStaffX(centre+7.5),start);
        assert.strictEqual(sheetModel.workshopSlotAtStaffX(centre+8),start+.5);
      }
    }
    assert.strictEqual(sheetModel.workshopSlotAtStaffX(-100),0);
    assert.strictEqual(sheetModel.workshopSlotAtStaffX(1000),7.5);
    assert.strictEqual(sheetModel.workshopSlotAtStaffX(NaN),null);
    const placed = sheetModel.placeWorkshopEvent({ events:[] },.5,note(55,"sixteenth"));
    assert.deepStrictEqual(placed.map(event => [event.kind,event.noteValue,event.startSlot]),[["rest","sixteenth",0],["note","sixteenth",.5]]);
    assert.strictEqual(sheetModel.placeWorkshopEvent({ events:[] },7.5,note(48,"eighth")),null);
    const held = timedNote(48,"whole",0); const next = note(55,"sixteenth");
    let events = sheetModel.placeWorkshopEvent({ events:[held] },.5,next);
    assert.strictEqual(events.find(event => event.id === held.id).noteValue,"sixteenth");
    assert.strictEqual(events.find(event => event.id === held.id).originalNoteValue,"whole");
    events = sheetModel.moveWorkshopNote({ events },next.id,1,next.pitch);
    assert.strictEqual(events.find(event => event.id === held.id).noteValue,"eighth");
    events = sheetModel.removeWorkshopEvent({ events },next.id);
    assert.strictEqual(events.find(event => event.id === held.id).noteValue,"whole");
    assert(!Object.prototype.hasOwnProperty.call(events.find(event => event.id === held.id),"originalNoteValue"));
    assert(model.isValidWorkshopMeasure({ events:[Object.assign(timedNote(48,"sixteenth",7.5),{ originalNoteValue:"whole" })] }));
  });

  // These editor fixtures are synchronous; library installation has its own
  // async storage tests and must not race their explicit draft setup.
  const definition = Object.assign({}, component("Workshop"), { created: undefined });
  const staff = component("WorkshopStaff");
  component("WorkshopSymbol");
  component("WorkshopSheet");
  test("chord names distinguish exact basic, suspended, extended and altered pitch-class sets", () => {
    const patterns = [
      [[0,4,7],""],[[0,3,7],"m"],[[0,3,6],"dim"],[[0,4,8],"aug"],
      [[0,2,7],"sus2"],[[0,5,7],"sus4"],[[0,4,7,10],"7"],[[0,4,7,11],"maj7"],
      [[0,3,7,10],"m7"],[[0,3,6,10],"m7(b5)"],[[0,4,7,2],"add9"],
      [[0,4,7,10,2],"9"],[[0,4,7,11,2],"maj9"],[[0,3,7,10,2],"m9"],
      [[0,4,7,10,2,5],"11"],[[0,4,7,10,2,5,9],"13"],[[0,3,7,10,2,5,9],"m13"],
      [[0,5,7,10],"7sus4"],[[0,2,5,7,10],"9sus4"],
      [[0,4,6,10],"7(b5)"],[[0,4,8,10],"7(#5)"],[[0,4,7,10,1],"7(b9)"],
      [[0,4,7,10,3],"7(#9)"],[[0,4,7,10,2,6],"9(#11)"],[[0,4,8,10,1],"7(#5,b9)"]
    ];
    for (const [intervals,suffix] of patterns) {
      const notes = intervals.map(interval => note(48+interval)); const before = JSON.stringify(notes);
      const chord = recognizeWorkshopChord(notes);
      assert(chord && chord.recognized,suffix || "major");
      assert.strictEqual(chord.root,0); assert.strictEqual(chord.bass,0); assert.strictEqual(chord.suffix,suffix);
      assert.deepStrictEqual(chord.pitchClasses,intervals.slice().sort((a,b) => a-b));
      assert.strictEqual(JSON.stringify(notes),before);
    }
    const unknown = recognizeWorkshopChord(Array.from({ length:12 },(_,index) => note(48+index)));
    assert(unknown); assert.strictEqual(unknown.recognized,false); assert.strictEqual(unknown.root,0);
    assert.deepStrictEqual(unknown.intervals,Array.from({ length:12 },(_,index) => index));
    assert.deepStrictEqual(unknown.alternatives,[]);
    assert.strictEqual(recognizeWorkshopChord([note(48),note(60)]),null);
    assert.strictEqual(recognizeWorkshopChord([note(48)]),null);
  });
  test("chord recognition preserves inversions, octave doublings and ambiguous alternatives", () => {
    const inversion = [note(52),note(55),note(60),note(64),note(67)]; const before = JSON.stringify(inversion);
    const major = recognizeWorkshopChord(inversion);
    assert(major.recognized); assert.strictEqual(major.root,0); assert.strictEqual(major.bass,4);
    assert.strictEqual(major.suffix,""); assert.deepStrictEqual(major.pitchClasses,[0,4,7]);
    const sixth = recognizeWorkshopChord([48,52,55,57].map(value => note(value)));
    assert.strictEqual(sixth.root,0); assert.strictEqual(sixth.suffix,"6");
    assert(sixth.alternatives.some(chord => chord.root === 9 && chord.suffix === "m7"));
    const minorSeventh = recognizeWorkshopChord([45,48,52,55].map(value => note(value)));
    assert.strictEqual(minorSeventh.root,9); assert.strictEqual(minorSeventh.suffix,"m7");
    assert(minorSeventh.alternatives.some(chord => chord.root === 0 && chord.suffix === "6"));
    assert.strictEqual(JSON.stringify(inversion),before);
  });
  test("score tapping preserves time positions, fills gaps and safely replaces rests", () => {
    const original = { events: [] };
    const late = note(55);
    const events = sheetModel.placeWorkshopEvent(original, 4, late);
    assert.deepStrictEqual(original.events, []);
    assert.deepStrictEqual(events.map(event => [event.kind, event.noteValue]), [["rest", "half"], ["note", "quarter"]]);
    const early = note(48);
    const filled = sheetModel.placeWorkshopEvent({ events }, 0, early);
    assert.deepStrictEqual(filled.map(event => event.noteValue), ["quarter", "quarter", "quarter"]);
    assert.strictEqual(filled[2].id, late.id);
    const overlapping = sheetModel.placeWorkshopEvent({ events: filled }, 3, note(60));
    assert.strictEqual(startOf(overlapping, late.id), 4);
    assert.strictEqual(overlapping.filter(event => event.kind === "note").length, 3);
    assert.strictEqual(sheetModel.placeWorkshopEvent({ events: filled }, 7, note()), null);
    const timeline = model.workshopTimeline(Object.assign(model.createWorkshopDraft().score, {
      parts: [{ id: "right", clef: "treble", measures: [{ id: "a", events: filled }, { id: "b", events: [] }, { id: "c", events: [] }, { id: "d", events: [] }] }]
    }));
    assert.strictEqual(timeline.events.find(event => event.id === late.id).startMs, 2000);
    for (const alter of [-1, 0, 1]) {
      for (const y of [-100, 46, 156, 246, 1000]) {
        const pitch = sheetModel.workshopPitchAtStaffY(y, alter);
        assert.strictEqual(pitch.alter, alter);
        assert(model.workshopPitchValue(pitch) >= 9 && model.workshopPitchValue(pitch) <= 96);
      }
    }
    assert.deepStrictEqual(sheetModel.workshopPitchAtStaffY(156), model.workshopPitchFromValue(52));
    assert.deepStrictEqual(sheetModel.workshopPitchAtStaffY(166), model.workshopPitchFromValue(50));
  });
  test("notation cancels accidentals within a bar and keeps high-note stems inside the preview", () => {
    const geometry = staff.computed.notation.call({ measure: { events: [note(49), note(48), note(53), note(71)] } }).events;
    assert.deepStrictEqual(geometry.map(event => event.accidental), ["sharp", "nat", null, null]);
    assert(geometry.every(event => event.stemEndY >= 0 && event.stemEndY <= 178));
    assert.strictEqual(geometry[3].stemDirection, -1);
  });
  test("chords share notation by time and duration without changing score data", () => {
    for (const noteValue of ["whole","half","quarter","eighth","sixteenth"]) {
      for (const size of [3,4,5,6,7]) {
        const notes = [48,52,55,59,62,65,69].slice(0,size).map(value => Object.assign(note(value,noteValue),{ startSlot:0 }));
        const measure = { events:notes }; const before = JSON.stringify(measure);
        const notation = staff.computed.notation.call({ measure });
        assert.strictEqual(notation.stems.length,1);
        assert.deepStrictEqual(notation.stems[0].eventIds.slice().sort(),notes.map(event => event.id).sort());
        assert.strictEqual(notation.stems[0].noteValue,noteValue);
        const heads = notation.events.filter(event => event.kind === "note");
        assert.strictEqual(new Set(heads.map(event => event.x)).size,1);
        assert.strictEqual(new Set(heads.map(event => event.stemX)).size,1);
        assert.strictEqual(new Set(heads.map(event => event.stemEndY)).size,1);
        assert.strictEqual(JSON.stringify(measure),before);
        const repeated = staff.computed.notation.call({ measure });
        assert.deepStrictEqual(repeated,notation); assert.strictEqual(JSON.stringify(measure),before);
        const rendered = new Vue(Object.assign({},staff,{ propsData:{ measure },
          methods:Object.assign({},staff.methods,{ $t:key => key }) }));
        const classes=[];
        function visit(node) {
          if (node.data && node.data.staticClass) classes.push(...node.data.staticClass.split(" "));
          (node.children || []).forEach(visit);
        }
        visit(rendered._render());
        assert.strictEqual(classes.filter(name => name === "stem").length,noteValue === "whole" ? 0 : 1);
        assert.strictEqual(classes.filter(name => name === "flag").length,noteValue === "sixteenth" ? 2 : noteValue === "eighth" ? 1 : 0);
        assert.strictEqual(classes.filter(name => name === "note-head").length,size);
        rendered.$destroy();
      }
    }
    const mixed = { events:[Object.assign(note(48,"half"),{ startSlot:0 }), Object.assign(note(52,"eighth"),{ startSlot:0 }),
      Object.assign(note(55,"eighth"),{ startSlot:1 })] };
    const separate = staff.computed.notation.call({ measure:mixed });
    assert.strictEqual(separate.stems.length,3);
    assert(separate.stems.every(stem => stem.eventIds.length === 1));
    const extremes = { events:[Object.assign(note(36,"half"),{ startSlot:0 }),Object.assign(note(71,"eighth"),{ startSlot:0 })] };
    assert(staff.computed.notation.call({ measure:extremes }).stems.every(stem => stem.y2 >= 8 && stem.y2 <= 270));
    const chromatic = { events:[Object.assign(note(49,"quarter"),{ startSlot:0 }),Object.assign(note(51,"quarter"),{ startSlot:0 })] };
    const chromaticHeads = staff.computed.notation.call({ measure:chromatic }).events.filter(event => event.kind === "note");
    assert(chromaticHeads.every(event => event.accidental === "sharp"));
    assert.notStrictEqual(chromaticHeads[0].accidentalX,chromaticHeads[1].accidentalX);
    for (const slot of [0,7]) {
      const seconds = [48,50,52].map(value => Object.assign(note(value,"eighth"),{ startSlot:slot }));
      const notation = staff.computed.notation.call({ measure:{ events:seconds } });
      const heads = notation.events.filter(event => event.kind === "note");
      assert.strictEqual(notation.stems.length,1);
      assert(heads.every(event => event.x >= 97 && event.x <= 331));
      assert.notStrictEqual(heads[0].x,heads[1].x); assert.notStrictEqual(heads[1].x,heads[2].x);
    }
  });
  test("dense chords cover every natural pitch without losing note identities or stem connections", () => {
    const pitches = [36,38,40,41,43,45,47,48,50,52,53,55,57,59,60,62,64,65,67,69,71];
    for (const startSlot of [0,7]) {
      const measure = { events:pitches.map(value => Object.assign(note(value,"eighth"),{ startSlot })) };
      const before = JSON.stringify(measure);
      assert(model.isValidWorkshopMeasure(measure));
      const notation = staff.computed.notation.call({ measure });
      const heads = notation.events.filter(event => event.kind === "note");
      assert.strictEqual(heads.length,21);
      assert.strictEqual(notation.stems.length,1);
      assert.strictEqual(notation.stems[0].eventIds.length,21);
      assert(heads.every(event => event.x >= 97 && event.x <= 331));
      assert(heads.every(event => Math.abs(event.x - event.stemX) === 6));
      for (let index = 1; index < heads.length; index++) assert.notStrictEqual(heads[index-1].x,heads[index].x);
      assert.deepStrictEqual(heads.map(event => [event.id,event.startSlot,event.noteValue,event.pitch]),
        measure.events.map(event => [event.id,event.startSlot,event.noteValue,event.pitch]));
      assert.strictEqual(JSON.stringify(measure),before);
    }
  });
  test("dense chord accidentals keep clear of the time signature at either bar edge", () => {
    for (const startSlot of [0,7]) {
      const measure = { events:["C","D","E"].map(step => Object.assign(note(60,"eighth"),{
        startSlot,pitch:{ step,alter:1,octave:5 }
      })) };
      const before = JSON.stringify(measure);
      assert(model.isValidWorkshopMeasure(measure));
      const notation = staff.computed.notation.call({ measure });
      const heads = notation.events.filter(event => event.kind === "note");
      assert.strictEqual(notation.stems.length,1);
      assert(heads.every(event => event.accidental === "sharp" && event.accidentalX >= 84));
      assert.strictEqual(new Set(heads.map(event => event.accidentalX)).size,3);
      assert(heads.every(event => event.x >= 97 && event.x <= 331));
      assert(heads.every(event => Math.abs(event.x - event.stemX) === 6));
      assert.strictEqual(JSON.stringify(measure),before);
    }
  });
  test("neighbouring onsets avoid occupied heads while preserving their musical times", () => {
    const measure = { events:["half","quarter","eighth"].map(noteValue => Object.assign(note(48,noteValue),{ startSlot:0 }))
      .concat(Object.assign(note(48,"eighth"),{ startSlot:1 })) };
    const before = JSON.stringify(measure);
    const notation = staff.computed.notation.call({ measure });
    const heads = notation.events.filter(event => event.kind === "note");
    assert.strictEqual(heads.length,4);
    assert.strictEqual(notation.stems.length,4);
    heads.forEach((head,index) => heads.slice(index+1).forEach(other => assert(Math.abs(head.x-other.x) >= 14)));
    assert.deepStrictEqual(heads.map(event => [event.id,event.startSlot,event.noteValue,event.pitch]),
      measure.events.map(event => [event.id,event.startSlot,event.noteValue,event.pitch]));
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("successive seven-note chords remain in time order on a densely filled bar", () => {
    const measure = { events:[] };
    for (let startSlot = 0; startSlot < 8; startSlot++) {
      ["C","D","E","F","G","A","B"].forEach(step => measure.events.push(Object.assign(note(60,"eighth"),{
        startSlot,pitch:{ step,alter:startSlot === 0 && step !== "B" ? 1 : 0,octave:5 }
      })));
    }
    assert(model.isValidWorkshopMeasure(measure));
    const before = JSON.stringify(measure);
    const notation = staff.computed.notation.call({ measure });
    const heads = notation.events.filter(event => event.kind === "note");
    assert.strictEqual(heads.length,56);
    assert.strictEqual(notation.stems.length,8);
    assert(notation.stems.every(stem => stem.eventIds.length === 7));
    notation.stems.slice(1).forEach((stem,index) => assert(stem.x > notation.stems[index].x));
    assert(notation.width > 360);
    assert(heads.every(event => event.x >= 97 && event.x+11 <= notation.width-12));
    heads.forEach((head,index) => heads.slice(index+1).filter(other => other.startSlot !== head.startSlot
      && Math.abs(other.y-head.y) <= 10).forEach(other => assert(Math.abs(other.x-head.x) >= 14)));
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("explicit positions validate overlapping values while preserving legacy revisions and rejecting malformed times", () => {
    const legacy = model.createWorkshopDraft("Legacy"); legacy.score.parts[0].measures[0].events = [note(48), note(55)];
    const saved = model.saveWorkshopDraft(null, legacy); const oldRevision = JSON.stringify(saved.piece.revisions[0]);
    const draft = model.openWorkshopPiece(saved.piece);
    draft.score.parts[0].measures[0].events = [Object.assign(note(48, "half"), { startSlot:0 }),
      Object.assign(note(52, "eighth"), { startSlot:0 }), Object.assign(note(55, "quarter"), { startSlot:1 })];
    assert(model.isValidWorkshopScore(draft.score));
    assert.strictEqual(model.workshopOccupiedSlots(draft.score.parts[0].measures[0]), 4);
    assert.strictEqual(model.workshopMeasureUnits(draft.score.parts[0].measures[0]), 4);
    const changed = model.saveWorkshopDraft(saved.library, draft);
    assert.strictEqual(JSON.stringify(changed.piece.revisions[0]), oldRevision);
    const timeline = model.workshopTimeline(draft.score);
    assert.deepStrictEqual(timeline.events.filter(event => event.value !== null).map(event => [event.startMs,event.durationMs]), [[0,2000],[0,500],[500,1000]]);
    const malformed = model.cloneWorkshop(draft.score);
    delete malformed.parts[0].measures[0].events[0].startSlot;
    assert.strictEqual(model.isValidWorkshopScore(malformed), false);
    for (const slot of [-1, 1/11, 5/13, 5, 8, "0"]) {
      const invalid = model.cloneWorkshop(draft.score); invalid.parts[0].measures[0].events[0].startSlot = slot;
      assert.strictEqual(model.isValidWorkshopScore(invalid), false);
    }
    for (const slot of [.125,.25,.375]) {
      const finePosition = model.cloneWorkshop(draft.score);
      finePosition.parts[0].measures[0].events[0].startSlot = slot;
      assert(model.isValidWorkshopScore(finePosition));
    }
    const full = { events:Array.from({ length:64 }, () => Object.assign(note(48,"eighth"),{ startSlot:0 })) };
    assert(model.isValidWorkshopMeasure(full));
    assert.strictEqual(sheetModel.placeWorkshopEvent(full, 0, note(52,"eighth")), null);
    assert.strictEqual(full.events.length, 64);
  });
  function startOf(events, id) {
    const event = model.workshopMeasureEvents({ events }).find(entry => entry.id === id);
    return event ? event.startSlot : null;
  }
  test("moving notes preserves neighbours, allows overlap and rejects invalid destinations", () => {
    const moving = note(48); const neighbour = note(55);
    const measure = { events: sheetModel.placeWorkshopEvent({ events: [moving] }, 6, neighbour) };
    const before = JSON.stringify(measure);
    const shifted = sheetModel.moveWorkshopNote(measure, moving.id, 2, moving.pitch);
    assert.strictEqual(startOf(shifted, moving.id), 2);
    assert.strictEqual(startOf(shifted, neighbour.id), 6);
    assert.deepStrictEqual(shifted.find(event => event.id === moving.id), Object.assign({}, moving, { startSlot:2 }));
    assert.deepStrictEqual(shifted.find(event => event.id === neighbour.id), Object.assign({}, neighbour, { startSlot:6 }));
    assert.strictEqual(shifted[0].kind, "rest");
    const overlappingSelf = sheetModel.moveWorkshopNote(measure, moving.id, 1, model.workshopPitchFromValue(53));
    assert.strictEqual(startOf(overlappingSelf, moving.id), 1);
    assert.strictEqual(startOf(overlappingSelf, neighbour.id), 6);
    const back = sheetModel.moveWorkshopNote({ events: shifted }, moving.id, 0, moving.pitch);
    assert.strictEqual(startOf(back, moving.id), 0); assert.strictEqual(startOf(back, neighbour.id), 6);
    const overlap = sheetModel.moveWorkshopNote(measure, moving.id, 5, model.workshopPitchFromValue(60));
    assert.strictEqual(startOf(overlap, moving.id), 5); assert.strictEqual(startOf(overlap, neighbour.id), 6);
    for (const slot of [-1, 1/11, 5/13, 7, 8, NaN]) assert.strictEqual(sheetModel.moveWorkshopNote(measure, moving.id, slot, moving.pitch), null);
    for (const slot of [.125,.25,.375]) {
      const fineShift = sheetModel.moveWorkshopNote(measure, moving.id, slot, moving.pitch);
      assert.strictEqual(startOf(fineShift, moving.id), slot);
      assert.strictEqual(startOf(fineShift, neighbour.id), 6);
      assert(model.isValidWorkshopMeasure({ events:fineShift }));
    }
    assert.strictEqual(sheetModel.moveWorkshopNote({ events: [moving, Object.assign({}, moving)] }, moving.id, 0, moving.pitch), null);
    assert.strictEqual(sheetModel.moveWorkshopNote({ events: [note(48, "whole"), moving] }, moving.id, 8, moving.pitch), null);
    assert.strictEqual(JSON.stringify(measure), before);
    const vertical = sheetModel.moveWorkshopNote({ events: shifted }, moving.id, 2, model.workshopPitchFromValue(60));
    assert.deepStrictEqual(vertical.map(event => event.id), shifted.map(event => event.id));
    for (const value of ["whole", "half", "quarter", "eighth", "sixteenth"]) {
      const event = note(48, value); const lastSlot = 8 - model.WORKSHOP_NOTE_UNITS[value];
      const tail = sheetModel.moveWorkshopNote({ events: [event] }, event.id, lastSlot, event.pitch);
      assert.strictEqual(startOf(tail, event.id), lastSlot);
      assert.strictEqual(tail.find(entry => entry.id === event.id).noteValue, value);
      assert.strictEqual(sheetModel.moveWorkshopNote({ events: [event] }, event.id, lastSlot + 1, event.pitch), null);
    }
  });
  test("chord membership includes mixed durations at one onset and excludes neighbouring notes and rests", () => {
    const chord = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:2 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:3 });
    const rest = { id:model.workshopId("rest"),kind:"rest",noteValue:"eighth",pitch:null,startSlot:0 };
    const measure = { events:chord.concat([neighbour,rest]) }; const before = JSON.stringify(measure);
    for (const event of chord) assert.deepStrictEqual(sheetModel.workshopChordEvents(measure,event.id).map(entry => entry.id),chord.map(entry => entry.id));
    assert.deepStrictEqual(sheetModel.workshopChordEvents(measure,neighbour.id).map(event => event.id),[neighbour.id]);
    assert.deepStrictEqual(sheetModel.workshopChordEvents(measure,rest.id),[]);
    assert.deepStrictEqual(sheetModel.workshopChordEvents(measure,"missing"),[]);
    const legacy = { events:[note(48),note(52)] };
    assert.deepStrictEqual(sheetModel.workshopChordEvents(legacy,legacy.events[1].id).map(event => event.startSlot),[2]);
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("moving a mixed-duration chord preserves chromatic intervals and neighbours and rejects bounds atomically", () => {
    const chord = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:2 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:6 });
    const rest = { id:model.workshopId("rest"),kind:"rest",noteValue:"eighth",pitch:null,startSlot:0 };
    const measure = { events:chord.concat([neighbour,rest]) }; const before = JSON.stringify(measure);
    const ids = chord.map(event => event.id); const anchor = chord[0].id;
    const shifted = sheetModel.moveWorkshopNotes(measure,ids,anchor,4,{ step:"C",alter:1,octave:4 });
    assert(shifted); assert(model.isValidWorkshopMeasure({ events:shifted }));
    assert.deepStrictEqual(ids.map(id => {
      const event = shifted.find(entry => entry.id === id);
      return [event.id,event.startSlot,event.noteValue,model.workshopPitchValue(event.pitch)];
    }),chord.map(event => [event.id,4,event.noteValue === "half" ? "quarter" : event.noteValue,model.workshopPitchValue(event.pitch)+1]));
    assert.strictEqual(shifted.find(event => event.id === anchor).originalNoteValue,"half");
    assert.deepStrictEqual(shifted.find(event => event.id === neighbour.id),neighbour);
    assert.deepStrictEqual(shifted.find(event => event.id === anchor).pitch,{ step:"C",alter:1,octave:4 });
    const respelled = sheetModel.moveWorkshopNotes(measure,ids,anchor,2,{ step:"B",alter:1,octave:3 });
    assert.deepStrictEqual(respelled.find(event => event.id === anchor).pitch,{ step:"B",alter:1,octave:3 });
    assert.deepStrictEqual(respelled.find(event => event.id === chord[1].id).pitch,chord[1].pitch);
    assert.deepStrictEqual(respelled.find(event => event.id === chord[2].id).pitch,chord[2].pitch);
    for (const slot of [-1,1/11,5/13,5,8,NaN]) assert.strictEqual(sheetModel.moveWorkshopNotes(measure,ids,anchor,slot,chord[0].pitch),null);
    for (const slot of [.125,.25,.375]) {
      const fineShift = sheetModel.moveWorkshopNotes(measure,ids,anchor,slot,chord[0].pitch);
      assert.deepStrictEqual(ids.map(id => startOf(fineShift,id)),[slot,slot,slot]);
      assert.strictEqual(startOf(fineShift,neighbour.id),6);
      assert(model.isValidWorkshopMeasure({ events:fineShift }));
    }
    assert.strictEqual(sheetModel.moveWorkshopNotes(measure,ids,anchor,2,model.workshopPitchFromValue(95)),null);
    assert.strictEqual(sheetModel.moveWorkshopNotes(measure,ids,chord[1].id,2,model.workshopPitchFromValue(10)),null);
    for (const invalidIds of [[],[anchor,anchor],[anchor,"missing"],[anchor,rest.id]]) {
      assert.strictEqual(sheetModel.moveWorkshopNotes(measure,invalidIds,anchor,2,chord[0].pitch),null);
    }
    assert.strictEqual(sheetModel.moveWorkshopNotes(measure,ids,"missing",2,chord[0].pitch),null);
    const spaced = { events:[Object.assign(note(48,"eighth"),{ startSlot:1 }),Object.assign(note(55,"quarter"),{ startSlot:3 })] };
    const translated = sheetModel.moveWorkshopNotes(spaced,spaced.events.map(event => event.id),spaced.events[0].id,2,model.workshopPitchFromValue(50));
    assert.deepStrictEqual(spaced.events.map(event => startOf(translated,event.id)),[2,4]);
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("batch note resizing and removal are all-or-nothing and preserve unaffected event identities", () => {
    const chord = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:2 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:7 });
    const measure = { events:chord.concat(neighbour) }; const before = JSON.stringify(measure);
    const updates = chord.map(event => Object.assign({},event,{ noteValue:"quarter" }));
    const changed = sheetModel.replaceWorkshopEvents(measure,updates);
    assert(changed); assert(model.isValidWorkshopMeasure({ events:changed }));
    assert.deepStrictEqual(chord.map(event => changed.find(entry => entry.id === event.id)),updates);
    assert.deepStrictEqual(changed.find(event => event.id === neighbour.id),neighbour);
    const invalid = updates.slice(); invalid[1] = Object.assign({},invalid[1],{ noteValue:"whole" });
    assert.strictEqual(sheetModel.replaceWorkshopEvents(measure,invalid),null);
    assert.strictEqual(sheetModel.replaceWorkshopEvents(measure,[updates[0],updates[0]]),null);
    assert.strictEqual(sheetModel.replaceWorkshopEvents(measure,[Object.assign({},updates[0],{ id:"missing" })]),null);
    const erased = sheetModel.removeWorkshopEvents(measure,chord.map(event => event.id));
    assert(erased); assert(model.isValidWorkshopMeasure({ events:erased }));
    assert.deepStrictEqual(erased.filter(event => event.kind === "note"),[neighbour]);
    for (const ids of [[],[chord[0].id,chord[0].id],[chord[0].id,"missing"]]) assert.strictEqual(sheetModel.removeWorkshopEvents(measure,ids),null);
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("rest resizing keeps its identity and deleting a held note works at the event limit", () => {
    const rest = { id:model.workshopId("rest"),kind:"rest",noteValue:"eighth",pitch:null,startSlot:0 };
    const other = { id:model.workshopId("rest"),kind:"rest",noteValue:"quarter",pitch:null,startSlot:1 };
    const resized = sheetModel.replaceWorkshopEvent({ events:[rest,other] },rest.id,Object.assign({},rest,{ noteValue:"half" }));
    assert.deepStrictEqual(resized,[Object.assign({},rest,{ noteValue:"half",autoRest:false })]);
    const placed = sheetModel.placeWorkshopEvent({ events:[other] },0,rest);
    assert(placed.some(event => event.id === rest.id));
    const held = Object.assign(note(48,"whole"),{ startSlot:0 });
    const crowded = { events:[held].concat(Array.from({ length:63 },(_,index) => Object.assign(note(52,"eighth"),{ startSlot:[1,3,5,7][index%4] }))) };
    const erased = sheetModel.removeWorkshopEvent(crowded,held.id);
    assert(erased); assert.strictEqual(erased.length,63); assert(model.isValidWorkshopMeasure({ events:erased }));
    assert.strictEqual(model.workshopOccupiedSlots({ events:erased }),4);
    assert(!erased.some(event => event.id === held.id));
  });
  test("later note onsets shorten requested durations and moving or removing them restores the original value", () => {
    const held = Object.assign(note(48,"whole"),{ startSlot:0 }); const later = note(55,"eighth");
    const original = { events:[held] }; const before = JSON.stringify(original);
    let events = sheetModel.placeWorkshopEvent(original,4,later);
    const value = () => events.find(event => event.id === held.id);
    assert.strictEqual(value().noteValue,"half"); assert.strictEqual(value().originalNoteValue,"whole");
    events = sheetModel.moveWorkshopNote({ events },later.id,2,later.pitch);
    assert.strictEqual(value().noteValue,"quarter"); assert.strictEqual(value().originalNoteValue,"whole");
    events = sheetModel.moveWorkshopNote({ events },later.id,1,later.pitch);
    assert.strictEqual(value().noteValue,"eighth"); assert.strictEqual(value().originalNoteValue,"whole");
    events = sheetModel.moveWorkshopNote({ events },later.id,5,later.pitch);
    assert.strictEqual(value().noteValue,"half"); assert.strictEqual(value().originalNoteValue,"whole");
    events = sheetModel.moveWorkshopNote({ events },later.id,0,later.pitch);
    assert.strictEqual(value().noteValue,"whole"); assert(!Object.prototype.hasOwnProperty.call(value(),"originalNoteValue"));
    assert.strictEqual(events.find(event => event.id === later.id).noteValue,"eighth");
    events = sheetModel.moveWorkshopNote({ events },later.id,1,later.pitch);
    assert.strictEqual(value().noteValue,"eighth");
    events = sheetModel.removeWorkshopEvent({ events },later.id);
    assert.strictEqual(value().noteValue,"whole"); assert(!Object.prototype.hasOwnProperty.call(value(),"originalNoteValue"));
    assert.strictEqual(value().id,held.id); assert.strictEqual(value().startSlot,0); assert.strictEqual(JSON.stringify(original),before);
  });
  test("same-onset chord durations remain independent and automatic shortening restores through group movement and backup", () => {
    const held = Object.assign(note(48,"whole"),{ startSlot:0 });
    const middle = Object.assign(note(52,"half"),{ startSlot:0 });
    const short = Object.assign(note(55,"eighth"),{ startSlot:0 });
    const measure = { events:[held,middle,short] }; const before = JSON.stringify(measure);
    let events = sheetModel.replaceWorkshopEvents(measure,model.workshopMeasureEvents(measure));
    assert.deepStrictEqual(events.filter(event => event.kind === "note").map(event => event.noteValue),["whole","half","eighth"]);
    assert(events.every(event => !Object.prototype.hasOwnProperty.call(event,"originalNoteValue")));
    const later = note(60,"eighth"); events = sheetModel.placeWorkshopEvent({ events },3,later);
    assert.strictEqual(events.find(event => event.id === held.id).noteValue,"quarter");
    assert.strictEqual(events.find(event => event.id === held.id).originalNoteValue,"whole");
    assert.strictEqual(events.find(event => event.id === middle.id).noteValue,"quarter");
    assert.strictEqual(events.find(event => event.id === middle.id).originalNoteValue,"half");
    assert.strictEqual(events.find(event => event.id === short.id).noteValue,"eighth");
    const draft = model.createWorkshopDraft("Automatic duration"); draft.score.parts[0].measures[0].events = events;
    const savedStorage = storage(); const saved = store.storeWorkshopDraft(draft,savedStorage);
    const originalRevision = JSON.stringify(saved.piece.revisions[0]);
    const exported = backup.createSaveDataBackup(savedStorage); assert(backup.validateSaveDataBackup(exported).valid);
    const restoredStorage = storage(); restoredStorage.setItem(model.WORKSHOP_STORAGE_KEY,savedStorage.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(restoredStorage,imports.prepareSaveDataImport(restoredStorage,exported,"replace"));
    const reopened = model.openWorkshopPiece(store.readWorkshopLibrary(restoredStorage).pieces[0]);
    assert.deepStrictEqual(reopened.score,draft.score);
    assert.strictEqual(model.workshopTimeline(reopened.score).events.find(event => event.id === held.id).durationMs,1000);
    const ids = [held.id,middle.id,short.id];
    const restored = sheetModel.removeWorkshopEvents(reopened.score.parts[0].measures[0],[later.id]);
    assert.deepStrictEqual(ids.map(id => restored.find(event => event.id === id).noteValue),["whole","half","eighth"]);
    assert(restored.every(event => !Object.prototype.hasOwnProperty.call(event,"originalNoteValue")));
    const shortened = sheetModel.placeWorkshopEvent({ events:restored },1,later);
    assert.deepStrictEqual(ids.map(id => shortened.find(event => event.id === id).noteValue),["eighth","eighth","eighth"]);
    const moved = sheetModel.moveWorkshopNotes({ events:shortened },ids,held.id,4,held.pitch);
    assert(moved); assert.deepStrictEqual(ids.map(id => moved.find(event => event.id === id).noteValue),["half","half","eighth"]);
    assert.strictEqual(moved.find(event => event.id === held.id).originalNoteValue,"whole");
    const home = sheetModel.moveWorkshopNotes({ events:moved },ids,held.id,0,held.pitch);
    assert.deepStrictEqual(ids.map(id => home.find(event => event.id === id).noteValue),["eighth","eighth","eighth"]);
    const full = sheetModel.removeWorkshopEvent({ events:home },later.id);
    assert.deepStrictEqual(ids.map(id => full.find(event => event.id === id).noteValue),["whole","half","eighth"]);
    reopened.score.parts[0].measures[0].events = full;
    const changed = model.saveWorkshopDraft(saved.library,reopened);
    assert.strictEqual(JSON.stringify(changed.piece.revisions[0]),originalRevision);
    assert.strictEqual(JSON.stringify(measure),before);
  });
  test("automatic-duration metadata validates only original values of explicitly timed notes and never changes legacy revisions", () => {
    const event = Object.assign(note(48,"eighth"),{ startSlot:7,originalNoteValue:"whole" });
    assert(model.isValidWorkshopMeasure({ events:[event] }));
    assert(model.isValidWorkshopMeasure({ events:[Object.assign({},event,{ originalNoteValue:"eighth" })] }));
    for (const originalNoteValue of ["invalid",null,2]) assert(!model.isValidWorkshopMeasure({ events:[Object.assign({},event,{ originalNoteValue })] }));
    assert(!model.isValidWorkshopMeasure({ events:[Object.assign({},event,{ noteValue:"half",startSlot:0,originalNoteValue:"quarter" })] }));
    const untimed = Object.assign({},event); delete untimed.startSlot;
    assert(!model.isValidWorkshopMeasure({ events:[untimed] }));
    assert(!model.isValidWorkshopMeasure({ events:[Object.assign({},event,{ kind:"rest",pitch:null })] }));
    const legacy = model.createWorkshopDraft("Legacy overlap");
    legacy.score.parts[0].measures[0].events = [Object.assign(note(48,"whole"),{ startSlot:0 }),Object.assign(note(55,"eighth"),{ startSlot:2 })];
    const saved = model.saveWorkshopDraft(null,legacy); const oldRevision = JSON.stringify(saved.piece.revisions[0]);
    const edit = model.openWorkshopPiece(saved.piece); const measure = edit.score.parts[0].measures[0];
    assert.strictEqual(model.workshopTimeline(edit.score).events.find(event => event.id === measure.events[0].id).durationMs,4000);
    measure.events = sheetModel.moveWorkshopNote(measure,measure.events[1].id,3,measure.events[1].pitch);
    assert.strictEqual(measure.events.find(event => event.kind === "note" && event.startSlot === 0).noteValue,"quarter");
    const changed = model.saveWorkshopDraft(saved.library,edit);
    assert.strictEqual(JSON.stringify(changed.piece.revisions[0]),oldRevision);
    assert(!oldRevision.includes("originalNoteValue"));
  });
  test("manual beams join complete nearby eighth or sixteenth onsets and reject quarters, large gaps and missing chord tones", () => {
    const notes = [timedNote(48,"eighth",0),timedNote(50,"sixteenth",1),timedNote(52,"sixteenth",1.5),timedNote(55,"eighth",2)];
    const measure = { events:notes }; const ids = notes.map(event => event.id); const before = JSON.stringify(measure);
    assert.strictEqual(sheetModel.canJoinWorkshopNotes(measure,ids),true);
    const joined = sheetModel.joinWorkshopNotes(measure,ids); assert(joined); assert(model.isValidWorkshopMeasure({ events:joined }));
    const beamId = joined[0].beamGroupId; assert(beamId); assert(joined.every(event => event.beamGroupId === beamId));
    assert.deepStrictEqual(joined.map(({ beamGroupId,...event }) => event),notes);
    assert.strictEqual(sheetModel.canJoinWorkshopNotes({ events:joined },ids),false);
    assert.strictEqual(sheetModel.joinWorkshopNotes({ events:joined },ids),null);
    assert.strictEqual(JSON.stringify(measure),before);
    const chord = [timedNote(48,"eighth",0),timedNote(52,"sixteenth",0),timedNote(55,"eighth",1),timedNote(59,"sixteenth",1)];
    const chordIds = chord.map(event => event.id);
    assert(sheetModel.canJoinWorkshopNotes({ events:chord },chordIds));
    assert.strictEqual(sheetModel.canJoinWorkshopNotes({ events:chord },[chordIds[0],chordIds[2]]),false);
    assert.strictEqual(sheetModel.canJoinWorkshopNotes({ events:chord },chordIds.slice(0,2)),false);
    const quarter = { events:[timedNote(48,"quarter",0),timedNote(50,"eighth",2)] };
    const gap = { events:[timedNote(48,"sixteenth",0),timedNote(50,"sixteenth",2)] };
    const skipped = { events:[timedNote(48,"sixteenth",0),timedNote(50,"sixteenth",.5),timedNote(52,"sixteenth",1)] };
    const pause = { events:notes.concat({ id:model.workshopId("rest"),kind:"rest",noteValue:"sixteenth",pitch:null,startSlot:.5 }) };
    for (const candidate of [quarter,gap,pause]) {
      const selected = candidate.events.filter(event => event.kind === "note").map(event => event.id);
      assert.strictEqual(sheetModel.canJoinWorkshopNotes(candidate,selected),false);
      assert.strictEqual(sheetModel.joinWorkshopNotes(candidate,selected),null);
    }
    assert.strictEqual(sheetModel.canJoinWorkshopNotes(skipped,[skipped.events[0].id,skipped.events[2].id]),false);
    for (const invalidIds of [[],[ids[0]],[ids[0],ids[0]],[ids[0],"missing"]]) assert.strictEqual(sheetModel.joinWorkshopNotes(measure,invalidIds),null);
    const invalidTagged = Object.assign({},notes[0],{ beamGroupId:"single-beam" });
    assert(!model.isValidWorkshopMeasure({ events:[invalidTagged] }));
    assert(!model.isValidWorkshopMeasure({ events:notes.map(event => Object.assign({},event,{ beamGroupId:12 })) }));
    assert(!model.isValidWorkshopMeasure({ events:[Object.assign(note(48,"eighth"),{ beamGroupId:"legacy-beam" }),note(50,"eighth")] }));
    assert.strictEqual(sheetModel.placeWorkshopEvent({ events:[] },0,joined[0]),null);
  });
  test("beams preserve their identity through full transport and suitable partial edits while unlinking dissolves the group", () => {
    const notes = [timedNote(48,"eighth",0),timedNote(50,"sixteenth",1),timedNote(52,"sixteenth",1.5),timedNote(55,"eighth",2)];
    const ids = notes.map(event => event.id); const joined = sheetModel.joinWorkshopNotes({ events:notes },ids);
    const before = JSON.stringify(joined); const beamId = joined[0].beamGroupId;
    const fullMove = sheetModel.moveWorkshopNotes({ events:joined },ids,ids[0],.5,model.workshopPitchFromValue(50));
    assert(fullMove); assert(model.isValidWorkshopMeasure({ events:fullMove }));
    assert(fullMove.filter(event => event.kind === "note").every(event => event.beamGroupId === beamId));
    assert.deepStrictEqual(ids.map(id => {
      const event = fullMove.find(entry => entry.id === id);
      return [event.startSlot,event.noteValue,model.workshopPitchValue(event.pitch)];
    }),notes.map(event => [event.startSlot+.5,event.noteValue,model.workshopPitchValue(event.pitch)+2]));
    const partialMove = sheetModel.moveWorkshopNote({ events:joined },ids[1],1,model.workshopPitchFromValue(53));
    const partialResize = sheetModel.replaceWorkshopEvent({ events:joined },ids[0],Object.assign({},joined[0],{ noteValue:"sixteenth" }));
    const partialDelete = sheetModel.removeWorkshopEvent({ events:joined },ids[1]);
    const unlinked = sheetModel.splitWorkshopBeams({ events:joined },[ids[1]]);
    for (const result of [partialMove,partialResize,partialDelete]) {
      assert(result); assert(model.isValidWorkshopMeasure({ events:result }));
      assert(result.filter(event => event.kind === "note").every(event => event.beamGroupId === beamId));
    }
    assert(unlinked); assert(model.isValidWorkshopMeasure({ events:unlinked }));
    assert(unlinked.every(event => !Object.prototype.hasOwnProperty.call(event,"beamGroupId")));
    assert.deepStrictEqual(unlinked,notes);
    assert.strictEqual(sheetModel.splitWorkshopBeams({ events:unlinked },ids),null);
    assert.strictEqual(sheetModel.splitWorkshopBeams({ events:joined },["missing"]),null);
    assert.strictEqual(sheetModel.moveWorkshopNotes({ events:joined },ids,ids[0],7,notes[0].pitch),null);
    assert.strictEqual(JSON.stringify(joined),before);
    const inserted = sheetModel.placeWorkshopEvent({ events:joined },.5,note(59,"sixteenth"));
    assert(inserted); assert(model.isValidWorkshopMeasure({ events:inserted }));
    assert(inserted.find(event => event.id === ids[0]).beamGroupId === undefined);
    assert(ids.slice(1).every(id => inserted.find(event => event.id === id).beamGroupId === beamId));
  });
  test("beam notation derives one or two common beams, isolated secondary hooks and safe chord stems without mutating music", () => {
    const { workshopBeamStemDirections,layoutWorkshopBeams } = require("../src/model/WorkshopBeamLayout");
    const { layoutWorkshopChords } = require("../src/model/WorkshopChordLayout");
    const render = notes => {
      const events = sheetModel.joinWorkshopNotes({ events:notes },notes.map(event => event.id)); assert(events);
      const before = JSON.stringify(events);
      const notation = staff.computed.notation.call({ measure:{ events } });
      assert.strictEqual(JSON.stringify(events),before);
      const all = notation.events.filter(event => event.kind === "note");
      assert.deepStrictEqual(all.map(event => [event.id,event.startSlot,event.noteValue,event.pitch,event.beamGroupId]),
        events.map(event => [event.id,event.startSlot,event.noteValue,event.pitch,event.beamGroupId]));
      const raw = all.map(event => Object.assign({},event)); const rawBefore = JSON.stringify(raw);
      const directions = workshopBeamStemDirections(raw);
      assert.strictEqual(directions.size,notes.length);
      const chordNotation = layoutWorkshopChords(raw,directions); const chordBefore = JSON.stringify(chordNotation);
      const beams = layoutWorkshopBeams(chordNotation);
      assert.strictEqual(JSON.stringify(raw),rawBefore); assert.strictEqual(JSON.stringify(chordNotation),chordBefore);
      assert(beams.stems.every(stem => stem.beamed));
      assert.strictEqual(new Set(beams.stems.map(stem => stem.direction)).size,1);
      beams.beams.forEach(beam => {
        const points = beam.points.split(" ").map(point => point.split(",").map(Number));
        assert.strictEqual(points.length,4); assert(points.every(point => point.length === 2 && point.every(Number.isFinite)));
        assert(points.every(([x,y]) => x >= 0 && x <= notation.width && y >= 8 && y <= 270));
        assert(points[1][0] > points[0][0]);
        const rise = Math.abs(points[1][1]-points[0][1]); const width = points[1][0]-points[0][0];
        assert(rise <= 12+.000001); assert(rise/width <= .18+.000001);
      });
      const rendered = new Vue(Object.assign({},staff,{ propsData:{ measure:{ events },selectedEventIds:events.map(event => event.id) },
        methods:Object.assign({},staff.methods,{ $t:key => key }) }));
      const nodes = node => [node].concat(...(node.children || (node.componentOptions && node.componentOptions.children) || []).map(nodes));
      const drawn = nodes(rendered._render());
      const hasClass = (node,name) => node.data && (node.data.staticClass || "").split(" ").includes(name);
      assert.strictEqual(drawn.filter(node => hasClass(node,"flag")).length,0);
      assert.strictEqual(drawn.filter(node => hasClass(node,"beam")).length,beams.beams.length);
      assert(drawn.filter(node => hasClass(node,"beam")).every(node => node.data.class.selected));
      assert(drawn.filter(node => node.data && node.data.attrs && node.data.attrs.role === "button" && !node.data.attrs["data-workshop-context"]).every(node => node.data.attrs["aria-pressed"]));
      rendered.$destroy();
      return beams;
    };
    const eighth = render([timedNote(48,"eighth",0),timedNote(52,"eighth",1),timedNote(55,"eighth",2)]);
    assert.strictEqual(eighth.beams.length,1); assert.strictEqual(eighth.beams[0].level,1);
    const sixteenth = render([timedNote(60,"sixteenth",0),timedNote(64,"sixteenth",.5),timedNote(67,"sixteenth",1)]);
    assert.strictEqual(sixteenth.beams.length,2); assert.deepStrictEqual(sixteenth.beams.map(beam => beam.level),[1,2]);
    const fullBar = render(Array.from({ length:16 },(_,index) => timedNote(48,"sixteenth",index*.5)));
    assert.strictEqual(fullBar.stems.length,16); assert.strictEqual(fullBar.beams.length,2);
    assert(fullBar.events.filter(event => event.kind === "note").every(event =>
      Number.isFinite(event.x) && event.x >= 97 && Number.isFinite(event.stemEndY)));
    fullBar.stems.slice(1).forEach((stem,index) => assert(stem.x > fullBar.stems[index].x));
    assert.notStrictEqual(eighth.stems[0].direction,sixteenth.stems[0].direction);
    const mixed = render([timedNote(48,"eighth",0),timedNote(52,"sixteenth",1),timedNote(55,"eighth",1.5)]);
    assert.strictEqual(mixed.beams.filter(beam => beam.level === 1).length,1);
    assert.strictEqual(mixed.beams.filter(beam => beam.level === 2).length,1);
    const chord = render([timedNote(48,"eighth",0),timedNote(52,"sixteenth",0),timedNote(55,"eighth",1),timedNote(59,"sixteenth",1)]);
    assert.strictEqual(chord.stems.length,4); assert(chord.beams.some(beam => beam.level === 2));
    for (const notes of [[timedNote(36,"sixteenth",0),timedNote(71,"sixteenth",.5)],
      [timedNote(71,"eighth",0),timedNote(36,"eighth",1)]]) render(notes);
    const unjoined = staff.computed.notation.call({ measure:{ events:[timedNote(48,"sixteenth",0),timedNote(52,"sixteenth",.5)] } });
    assert.deepStrictEqual(unjoined.beams,[]); assert(unjoined.stems.every(stem => !stem.beamed));
  });
  const strings = require("../src/resources/de").default;
  const view = new Vue(Object.assign({}, definition, { methods: Object.assign({}, definition.methods, {
    $tc(key, count, values) { return this.$t(key, values).split(" | ")[count === 1 ? 0 : 1]; },
    $t(key, values = {}) { return Object.keys(values).reduce((text, name) => text.replace(`{${name}}`, values[name]), strings[key] || key); }
  }) }));
  view.$i18n = { locale: "de" };
  view.player = { play() {}, stopAll() {} };
  function groupEditorFixture(events) {
    const editor = new Vue(Object.assign({},definition,{ methods:Object.assign({},definition.methods,{ $t:view.$t }) }));
    editor.$i18n = { locale:"de" }; editor.newPiece(); editor.player = { play() {},stopAll() {} };
    editor.currentBar.events = model.cloneWorkshop(events);
    const sheet = new Vue(Object.assign({},staff,{ propsData:{ measure:editor.currentBar,noteLabel:editor.eventLabel } }));
    const captures = new Set();
    sheet.$refs.sheet = {
      getScreenCTM() { return { a:.8,b:0,c:0,d:.8,inverse() { return {}; } }; },
      createSVGPoint() { return { x:0,y:0,matrixTransform() { return { x:(this.x-40)/.8,y:(this.y-30)/.8 }; } }; },
      setPointerCapture(id) { captures.add(id); },hasPointerCapture(id) { return captures.has(id); },releasePointerCapture(id) { captures.delete(id); }
    };
    editor.$refs.sheet = sheet;
    const sync = () => {
      sheet.measure = editor.currentBar; sheet.selectedEventId = editor.selectedEventId;
      sheet.selectedEventIds = editor.selectedEventIds.slice(); sheet.kind = editor.tool.kind;
      sheet.noteValue = editor.tool.noteValue; sheet.alter = editor.tool.alter;
      sheet.multiSelect = editor.multiSelect; sheet.selectionUnit = editor.selectionUnit;
    };
    for (const [event,method] of [["select","selectEvent"],["select-group","selectGroup"],["toggle-selection","toggleSelection"],
      ["extend-selection","extendSelection"],["move-note","moveSheetNote"],["move-notes","moveSheetNotes"],["place","placeOnSheet"]]) {
      sheet.$on(event,payload => { editor[method](payload); sync(); });
    }
    const pointer = (x,y,extra = {}) => Object.assign({ clientX:x*.8+40,clientY:y*.8+30,pointerId:1,
      pointerType:"touch",isPrimary:true,button:0,cancelable:true,preventDefault() {} },extra);
    const tap = id => {
      const head = sheet.events.find(event => event.id === id);
      sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerUp(pointer(head.x,head.y));
    };
    sync();
    return { editor,sheet,pointer,tap,sync,captures,destroy() { sheet.$destroy(); editor.$destroy(); } };
  }
  test("sixteenth tools place at half slots, drag and keyboard move one subdivision, and respect the right bar edge", () => {
    const fixture = groupEditorFixture([]); const { editor,sheet,pointer,sync } = fixture;
    editor.chooseToolValue("sixteenth"); sync();
    const empty = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    sheet.pointerDown(pointer(121,176)); sheet.pointerUp(pointer(121,176));
    const id = editor.selectedEventId; assert(id);
    assert.strictEqual(startOf(editor.currentBar.events,id),.5);
    assert.strictEqual(editor.currentBar.events.find(event => event.id === id).noteValue,"sixteenth");
    assert.strictEqual(editor.freeSlots,15);
    assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert(editor.currentBar.events.some(event => event.kind === "rest" && event.noteValue === "sixteenth" && event.startSlot === 0));
    const placed = JSON.stringify(editor.draft); const head = sheet.events.find(event => event.id === id);
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+15.5,head.y-10));
    assert.strictEqual(JSON.stringify(editor.draft),placed);
    assert.strictEqual(sheet.gesture.slot,1);
    assert.strictEqual(sheet.events.find(event => event.id === id).noteValue,"sixteenth");
    sheet.pointerUp(pointer(head.x+15.5,head.y-10));
    assert.strictEqual(startOf(editor.currentBar.events,id),1);
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events.find(event => event.id === id).pitch),50);
    assert.strictEqual(editor.undoStack.length,undoCount+2);
    sheet.keyDown({ key:"ArrowRight",preventDefault() {} },sheet.events.find(event => event.id === id));
    assert.strictEqual(startOf(editor.currentBar.events,id),1.5);
    sheet.keyDown({ key:"ArrowLeft",preventDefault() {} },sheet.events.find(event => event.id === id));
    assert.strictEqual(startOf(editor.currentBar.events,id),1);
    editor.undo(); sync(); assert.strictEqual(startOf(editor.currentBar.events,id),1.5);
    editor.undo(); sync(); assert.strictEqual(startOf(editor.currentBar.events,id),1);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),placed);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),empty);
    editor.newPiece(); editor.chooseToolValue("sixteenth"); sync();
    sheet.pointerDown(pointer(338,176)); sheet.pointerUp(pointer(338,176));
    const edgeId = editor.selectedEventId;
    assert.strictEqual(startOf(editor.currentBar.events,edgeId),7.5);
    assert.strictEqual(editor.freeSlots,15);
    const edge = sheet.events.find(event => event.id === edgeId);
    sheet.pointerDown(pointer(edge.x,edge.y)); sheet.pointerMove(pointer(edge.x+500,edge.y));
    assert.strictEqual(sheet.gesture.slot,7.5); sheet.cancelGesture();
    const before = JSON.stringify(editor.draft);
    sheet.keyDown({ key:"ArrowRight",preventDefault() {} },sheet.events.find(event => event.id === edgeId));
    assert.strictEqual(JSON.stringify(editor.draft),before);
    fixture.destroy();
  });
  test("connecting and unlinking the exact multiple selection is one undo operation and keeps quarter notes excluded", () => {
    const notes = [timedNote(48,"eighth",0),timedNote(50,"sixteenth",1),timedNote(52,"sixteenth",1.5),timedNote(55,"eighth",2)];
    const fixture = groupEditorFixture(notes); const { editor,sheet,pointer,sync } = fixture;
    editor.toggleMultiSelect(); const ids = notes.map(event => event.id);
    ids.forEach(id => editor.extendSelection({ ids:[id],anchorId:id })); sync();
    const selected = () => editor.selectedNotes.map(event => event.id).sort();
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    assert.strictEqual(editor.canConnectSelection,true); assert.strictEqual(editor.canUnlinkSelection,false);
    editor.connectSelection(); sync();
    assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert.deepStrictEqual(selected(),ids.slice().sort());
    assert.strictEqual(editor.canConnectSelection,false); assert.strictEqual(editor.canUnlinkSelection,true);
    assert(sheet.beams.length >= 2); assert(sheet.stems.every(stem => stem.beamed));
    const joined = JSON.stringify(editor.draft);
    editor.connectSelection(); assert.strictEqual(editor.undoStack.length,undoCount+1);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),before); assert.deepStrictEqual(sheet.beams,[]);
    editor.redo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),joined);
    ids.forEach(id => editor.extendSelection({ ids:[id],anchorId:id })); sync();
    const transportUndo = editor.undoStack.length; const head = sheet.events.find(event => event.id === ids[0]);
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+15.5,head.y-10));
    assert.strictEqual(JSON.stringify(editor.draft),joined); assert(sheet.beams.length >= 2);
    assert(sheet.previewEvents.filter(event => event.kind === "note").every(event => event.beamGroupId));
    sheet.pointerUp(pointer(head.x+15.5,head.y-10));
    assert.strictEqual(editor.undoStack.length,transportUndo+1); assert.deepStrictEqual(selected(),ids.slice().sort());
    assert(editor.currentBar.events.filter(event => event.kind === "note").every(event => event.beamGroupId));
    assert.deepStrictEqual(ids.map(id => startOf(editor.currentBar.events,id)),notes.map(event => event.startSlot+.5));
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),joined);
    ids.forEach(id => editor.extendSelection({ ids:[id],anchorId:id })); sync();
    const unlinkUndo = editor.undoStack.length;
    editor.unlinkSelection(); sync();
    assert.strictEqual(editor.undoStack.length,unlinkUndo+1); assert.deepStrictEqual(selected(),ids.slice().sort());
    assert.deepStrictEqual(sheet.beams,[]);
    assert(editor.currentBar.events.every(event => !Object.prototype.hasOwnProperty.call(event,"beamGroupId")));
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),joined);
    editor.newPiece(); editor.currentBar.events = [timedNote(48,"quarter",0),timedNote(52,"quarter",2)];
    editor.toggleMultiSelect(); editor.currentBar.events.forEach(event => editor.extendSelection({ ids:[event.id],anchorId:event.id })); sync();
    const quarters = JSON.stringify(editor.draft); const quarterUndo = editor.undoStack.length;
    assert.strictEqual(editor.canConnectSelection,false); editor.connectSelection();
    assert.strictEqual(JSON.stringify(editor.draft),quarters); assert.strictEqual(editor.undoStack.length,quarterUndo);
    fixture.destroy();
  });
  test("a chord tap selects the group, a second tap selects one tone, and dragging commits the intended selection once", () => {
    const chord = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:1 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:7 });
    const fixture = groupEditorFixture(chord.concat(neighbour)); const { editor,sheet,pointer,tap,sync } = fixture;
    const ids = chord.map(event => event.id); const anchor = ids[0];
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    editor.baseline = before;
    tap(anchor);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    assert.strictEqual(editor.selectedEventId,null); assert.strictEqual(editor.selectedAnchorId,anchor);
    assert.strictEqual(editor.dirty,false);
    assert.strictEqual(JSON.stringify(editor.draft),before); assert.strictEqual(editor.undoStack.length,undoCount);
    tap(ids[2]);
    assert.strictEqual(editor.selectedEventId,ids[2]); assert.deepStrictEqual(editor.selectedEventIds,[]);
    assert.strictEqual(editor.dirty,false);
    editor.clearSelection(); sync(); tap(anchor);
    const head = sheet.events.find(event => event.id === anchor);
    sheet.pointerDown(pointer(head.x,head.y));
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    sheet.pointerMove(pointer(head.x+62,head.y-10));
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids); assert.strictEqual(editor.selectedEventId,null);
    assert.strictEqual(JSON.stringify(editor.draft),before);
    assert.deepStrictEqual(ids.map(id => {
      const event = sheet.events.find(entry => entry.id === id);
      return [event.startSlot,model.workshopPitchValue(event.pitch)];
    }),[[3,50],[3,54],[3,57]]);
    sheet.pointerUp(pointer(head.x+62,head.y-10));
    assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids); assert.strictEqual(editor.selectedEventId,null);
    assert.deepStrictEqual(editor.currentBar.events.find(event => event.id === neighbour.id),neighbour);
    const moved = JSON.stringify(editor.draft);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),before);
    assert.deepStrictEqual(editor.selectedEventIds,[]); assert.strictEqual(editor.selectedEventId,null);
    editor.redo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),moved);
    assert.deepStrictEqual(editor.selectedEventIds,[]); assert.strictEqual(editor.selectedEventId,null);
    tap(anchor); tap(anchor);
    assert.strictEqual(editor.selectedEventId,anchor); assert.deepStrictEqual(editor.selectedEventIds,[]);
    const neighboursBefore = editor.currentBar.events.filter(event => event.kind === "note" && event.id !== anchor).map(model.cloneWorkshop);
    const single = sheet.events.find(event => event.id === anchor); const singleUndo = editor.undoStack.length;
    sheet.pointerDown(pointer(single.x,single.y)); sheet.pointerMove(pointer(single.x+31,single.y-10));
    sheet.pointerUp(pointer(single.x+31,single.y-10));
    assert.strictEqual(editor.undoStack.length,singleUndo+1);
    assert.strictEqual(startOf(editor.currentBar.events,anchor),4);
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events.find(event => event.id === anchor).pitch),52);
    const expectedNeighbours = neighboursBefore.map(event => event.id === ids[1]
      ? Object.assign({},event,{ noteValue:"eighth",originalNoteValue:"quarter" }) : event);
    assert.deepStrictEqual(editor.currentBar.events.filter(event => event.kind === "note" && event.id !== anchor),expectedNeighbours);
    assert.strictEqual(fixture.captures.size,0); fixture.destroy();
  });
  test("group editing is atomic, one undo step per command, and persists only musical score data", () => {
    const chord = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:1 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:7 });
    const fixture = groupEditorFixture(chord.concat(neighbour)); const { editor,sync } = fixture;
    const ids = chord.map(event => event.id); const anchorId = ids[0];
    editor.selectGroup({ ids,anchorId }); sync();
    const resizeBefore = JSON.stringify(editor.draft); const initialUndo = editor.undoStack.length;
    editor.chooseToolValue("quarter"); sync();
    assert.deepStrictEqual(ids.map(id => editor.currentBar.events.find(event => event.id === id).noteValue),["quarter","quarter","quarter"]);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    assert.strictEqual(editor.undoStack.length,initialUndo+1);
    const resized = JSON.stringify(editor.draft);
    editor.chooseToolValue("quarter"); assert.strictEqual(editor.undoStack.length,initialUndo+1);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),resizeBefore);
    editor.redo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),resized);
    editor.selectGroup({ ids,anchorId }); sync();
    editor.changeSelectedAlter(1); sync();
    assert.deepStrictEqual(ids.map(id => editor.currentBar.events.find(event => event.id === id).pitch.alter),[1,1,1]);
    assert.strictEqual(editor.undoStack.length,initialUndo+2);
    assert.deepStrictEqual(editor.currentBar.events.find(event => event.id === neighbour.id),neighbour);
    const beforeRejected = JSON.stringify(editor.draft); const rejectedUndo = editor.undoStack.length;
    editor.chooseToolValue("whole");
    assert.strictEqual(JSON.stringify(editor.draft),beforeRejected); assert.strictEqual(editor.undoStack.length,rejectedUndo);
    assert(editor.placementError); assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    editor.moveSheetNotes({ ids,anchorId,slot:7,pitch:model.workshopPitchFromValue(49) });
    assert.strictEqual(JSON.stringify(editor.draft),beforeRejected); assert.strictEqual(editor.undoStack.length,rejectedUndo);
    assert(editor.placementError); assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    const savedStorage = storage(); const saved = store.storeWorkshopDraft(editor.draft,savedStorage);
    const exported = backup.createSaveDataBackup(savedStorage); assert(backup.validateSaveDataBackup(exported).valid);
    const restoredStorage = storage(); restoredStorage.setItem(model.WORKSHOP_STORAGE_KEY,savedStorage.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(restoredStorage,imports.prepareSaveDataImport(restoredStorage,exported,"replace"));
    const reopened = model.openWorkshopPiece(store.readWorkshopLibrary(restoredStorage).pieces[0]);
    assert.deepStrictEqual(reopened.score,saved.piece.revisions[0].score);
    assert.deepStrictEqual(reopened.score,editor.draft.score);
    assert(!/selectedEvent|selectedAnchor|anchorId|eventIds|groupSelected/.test(JSON.stringify(saved.library)));
    const eraseBefore = JSON.stringify(editor.draft); const eraseUndo = editor.undoStack.length;
    editor.eraseSelectedEvent(); sync();
    assert.strictEqual(editor.undoStack.length,eraseUndo+1);
    assert.deepStrictEqual(editor.currentBar.events.filter(event => event.kind === "note"),[neighbour]);
    assert.deepStrictEqual(editor.selectedEventIds,[]); assert.strictEqual(editor.selectedEventId,null);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),eraseBefore);
    editor.redo(); sync(); assert.deepStrictEqual(editor.currentBar.events.filter(event => event.kind === "note"),[neighbour]);
    fixture.destroy();
  });
  test("multiple selection adds and removes notes or chords without changing score data or losing selection on unit changes", () => {
    const first = [48,52,55].map(value => Object.assign(note(value),{ startSlot:0 }));
    const second = [50,53,57].map(value => Object.assign(note(value,"eighth"),{ startSlot:3 }));
    const rest = { id:model.workshopId("rest"),kind:"rest",noteValue:"eighth",pitch:null,startSlot:6 };
    const fixture = groupEditorFixture(first.concat(second,rest)); const { editor,sheet,pointer,tap,sync } = fixture;
    const selected = () => editor.selectedEvents.map(event => event.id).sort();
    const before = JSON.stringify(editor.draft); editor.baseline = before; const undoCount = editor.undoStack.length;
    editor.toggleMultiSelect(); editor.setSelectionUnit("note"); sync(); assert.strictEqual(editor.multiSelect,true);
    tap(first[0].id); assert.deepStrictEqual(selected(),[first[0].id]);
    tap(second[0].id); assert.deepStrictEqual(selected(),[first[0].id,second[0].id].sort());
    assert.strictEqual(editor.selectionChord,null); assert.strictEqual(editor.chordSelected,false);
    assert.strictEqual(editor.selectionTitle,editor.$t("WORKSHOP_CHORD_COUNT",{ count:2 }));
    editor.setSelectionUnit("chord"); sync();
    assert.deepStrictEqual(selected(),[first[0].id,second[0].id].sort());
    tap(first[1].id); assert.deepStrictEqual(selected(),first.map(event => event.id).concat(second[0].id).sort());
    tap(first[2].id); assert.deepStrictEqual(selected(),[second[0].id]);
    tap(second[1].id); assert.deepStrictEqual(selected(),second.map(event => event.id).sort());
    tap(second[2].id); assert.deepStrictEqual(selected(),[]);
    editor.setSelectionUnit("note"); sync(); tap(first[0].id);
    const picked = selected();
    sheet.pointerDown(pointer(322.5,156)); sheet.pointerUp(pointer(322.5,156));
    assert.deepStrictEqual(selected(),picked); assert.strictEqual(sheet.gesture,null);
    editor.tool.kind = "rest"; sync(); tap(rest.id); assert.deepStrictEqual(selected(),picked.concat(rest.id).sort());
    assert.strictEqual(editor.chordSelected,false); tap(rest.id); assert.deepStrictEqual(selected(),picked);
    assert.strictEqual(JSON.stringify(editor.draft),before); assert.strictEqual(editor.undoStack.length,undoCount);
    assert.strictEqual(editor.dirty,false); assert.strictEqual(fixture.captures.size,0);
    editor.toggleMultiSelect(); sync(); assert.strictEqual(editor.multiSelect,false); assert.strictEqual(editor.hasSelection,false);
    fixture.destroy();
  });
  test("multiple-selection dragging preserves time offsets, intervals, lengths and identities in one undo step", () => {
    const first = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:0 }));
    const second = [note(50,"quarter"),note(53,"eighth")].map(event => Object.assign(event,{ startSlot:4 }));
    const neighbour = Object.assign(note(60,"eighth"),{ startSlot:7 });
    const fixture = groupEditorFixture(first.concat(second,neighbour)); const { editor,sheet,pointer,tap,sync } = fixture;
    const notes = first.concat(second); const ids = notes.map(event => event.id); const anchorId = first[0].id;
    editor.toggleMultiSelect(); editor.setSelectionUnit("chord"); sync(); tap(anchorId); tap(second[0].id);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),ids.slice().sort());
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    const head = sheet.events.find(event => event.id === anchorId);
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+31,head.y-10));
    assert.strictEqual(JSON.stringify(editor.draft),before);
    assert.deepStrictEqual(ids.map(id => {
      const event = sheet.events.find(entry => entry.id === id);
      return [event.startSlot,event.noteValue,model.workshopPitchValue(event.pitch)];
    }),notes.map(event => [event.startSlot+1,event.noteValue,model.workshopPitchValue(event.pitch)+2]));
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),ids.slice().sort());
    sheet.pointerUp(pointer(head.x+31,head.y-10));
    assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),ids.slice().sort());
    assert.strictEqual(editor.selectionChord,null);
    assert.deepStrictEqual(editor.currentBar.events.find(event => event.id === neighbour.id),neighbour);
    const moved = JSON.stringify(editor.draft);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),before);
    editor.redo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),moved);
    ids.forEach(id => editor.extendSelection({ ids:[id],anchorId:id })); sync();
    const rejectedUndo = editor.undoStack.length;
    editor.moveSheetNotes({ ids,anchorId,slot:5,pitch:model.workshopPitchFromValue(50) });
    assert.strictEqual(JSON.stringify(editor.draft),moved); assert.strictEqual(editor.undoStack.length,rejectedUndo);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),ids.slice().sort());
    assert(editor.placementError);
    const later = sheet.events.find(event => event.id === second[0].id);
    sheet.pointerDown(pointer(later.x,later.y)); sheet.pointerMove(pointer(later.x-500,later.y));
    assert.strictEqual(sheet.gesture.slot,4); // Grabbing the later onset keeps the earliest selected onset inside the bar.
    sheet.cancelGesture({ pointerId:1 }); assert.strictEqual(JSON.stringify(editor.draft),moved);
    const savedStorage = storage(); const saved = store.storeWorkshopDraft(editor.draft,savedStorage);
    const exported = backup.createSaveDataBackup(savedStorage); const restoredStorage = storage(); restoredStorage.setItem(model.WORKSHOP_STORAGE_KEY,savedStorage.getItem(model.WORKSHOP_STORAGE_KEY));
    imports.applyPreparedSaveDataImport(restoredStorage,imports.prepareSaveDataImport(restoredStorage,exported,"replace"));
    assert.deepStrictEqual(model.openWorkshopPiece(store.readWorkshopLibrary(restoredStorage).pieces[0]).score,saved.piece.revisions[0].score);
    assert(!/selectedEvent|selectedAnchor|anchorId|eventIds|groupSelected|multiSelect|selectionUnit/.test(JSON.stringify(saved.library)));
    fixture.destroy();
  });
  test("multiple-selection commands keep the exact selected set after resizing, accidentals and adding a drag target", () => {
    const first = [note(48,"half"),note(52,"quarter"),note(55,"eighth")].map(event => Object.assign(event,{ startSlot:0 }));
    const second = [note(50,"quarter"),note(53,"eighth")].map(event => Object.assign(event,{ startSlot:3 }));
    const fixture = groupEditorFixture(first.concat(second)); const { editor,sheet,pointer,tap,sync } = fixture;
    editor.toggleMultiSelect(); editor.setSelectionUnit("note"); sync(); tap(first[0].id); tap(second[0].id);
    const selectedIds = [first[0].id,second[0].id]; const undoCount = editor.undoStack.length;
    const untouched = [first[1],first[2],second[1]];
    editor.chooseToolValue("eighth"); sync();
    assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),selectedIds.slice().sort());
    assert(selectedIds.every(id => editor.currentBar.events.find(event => event.id === id).noteValue === "eighth"));
    editor.changeSelectedAlter(1); sync();
    assert.strictEqual(editor.undoStack.length,undoCount+2);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),selectedIds.slice().sort());
    assert(selectedIds.every(id => editor.currentBar.events.find(event => event.id === id).pitch.alter === 1));
    untouched.forEach(original => assert.deepStrictEqual(editor.currentBar.events.find(event => event.id === original.id),original));
    const newTarget = first[2]; const head = sheet.events.find(event => event.id === newTarget.id);
    const beforeDrag = JSON.stringify(editor.draft); const beforeUndo = editor.undoStack.length;
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+31,head.y));
    const extendedIds = selectedIds.concat(newTarget.id);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),extendedIds.slice().sort());
    assert.strictEqual(JSON.stringify(editor.draft),beforeDrag);
    sheet.pointerUp(pointer(head.x+31,head.y));
    assert.strictEqual(editor.undoStack.length,beforeUndo+1);
    assert.deepStrictEqual(editor.selectedEvents.map(event => event.id).sort(),extendedIds.slice().sort());
    assert.deepStrictEqual(extendedIds.map(id => startOf(editor.currentBar.events,id)),[1,4,1]);
    editor.eraseSelectedEvent(); sync();
    assert(!editor.currentBar.events.some(event => extendedIds.includes(event.id)));
    assert.deepStrictEqual(editor.currentBar.events.filter(event => event.kind === "note").map(event => event.id).sort(),[first[1].id,second[1].id].sort());
    fixture.destroy();
  });
  test("the selection names simultaneous chords, alternatives and inversions but never merges different onsets into one name", () => {
    const fixture = groupEditorFixture([48,52,55].map(value => Object.assign(note(value),{ startSlot:0 })));
    const { editor,sync } = fixture;
    const selectAll = () => { editor.selectGroup({ anchorId:editor.currentBar.events[0].id }); sync(); };
    selectAll(); assert(editor.selectionChord.recognized); assert.strictEqual(editor.selectionChord.root,0);
    assert.strictEqual(editor.selectionTitle,strings.WORKSHOP_CHORD_MAJOR.replace("{root}","C"));
    const oldTitle = editor.selectionTitle; editor.changeSelectedAlter(1); sync();
    assert.strictEqual(editor.selectionChord.root,1); assert.notStrictEqual(editor.selectionTitle,oldTitle);
    editor.newPiece(); editor.currentBar.events = [52,55,60].map(value => Object.assign(note(value),{ startSlot:0 })); selectAll();
    assert.strictEqual(editor.selectionTitle,strings.WORKSHOP_CHORD_MAJOR.replace("{root}","C")+"/E");
    editor.newPiece(); editor.currentBar.events = [48,52,55,57].map(value => Object.assign(note(value),{ startSlot:0 })); selectAll();
    assert.strictEqual(editor.selectionTitle,"C6"); assert(editor.selectionAlternatives.some(label => label.includes("Am7")));
    editor.newPiece(); editor.currentBar.events = Array.from({ length:12 },(_,index) => Object.assign(note(48+index),{ startSlot:0 })); selectAll();
    assert.strictEqual(editor.selectionChord.recognized,false); assert.strictEqual(editor.selectionTitle,strings.WORKSHOP_CHORD_UNKNOWN);
    editor.newPiece(); editor.currentBar.events = [Object.assign(note(48),{ startSlot:0 }),Object.assign(note(52),{ startSlot:2 })];
    editor.toggleMultiSelect(); editor.currentBar.events.forEach(event => editor.extendSelection({ ids:[event.id],anchorId:event.id })); sync();
    assert.strictEqual(editor.selectionChord,null); assert.deepStrictEqual(editor.selectionAlternatives,[]);
    assert.strictEqual(editor.selectionTitle,strings.WORKSHOP_CHORD_COUNT.replace("{count}","2")); fixture.destroy();
    for (const [locale,root] of [["de","H"],["en","B"]]) {
      const localized = require("../src/resources/"+locale).default;
      const named = groupEditorFixture([59,63,66].map(value => Object.assign(note(value),{ startSlot:0 })));
      named.editor.$i18n = { locale };
      named.editor.$t = (key,values = {}) => Object.keys(values).reduce((text,name) => text.replace(`{${name}}`,values[name]),localized[key] || key);
      named.editor.selectGroup({ anchorId:named.editor.currentBar.events[0].id });
      assert.strictEqual(named.editor.selectionTitle,localized.WORKSHOP_CHORD_MAJOR.replace("{root}",root)); named.destroy();
    }
  });
  test("choosing the current automatically shortened value commits a new duration intent and undo preserves restoration", () => {
    const held = Object.assign(note(48,"whole"),{ startSlot:0 }); const later = note(55,"eighth");
    const events = sheetModel.placeWorkshopEvent({ events:[held] },2,later);
    const fixture = groupEditorFixture(events); const { editor,sync } = fixture;
    editor.selectEvent(editor.currentBar.events.find(event => event.id === held.id)); sync();
    const shortened = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    assert.strictEqual(editor.selectedEvent.noteValue,"quarter"); assert.strictEqual(editor.selectedEvent.originalNoteValue,"whole");
    editor.chooseToolValue("whole"); assert.strictEqual(JSON.stringify(editor.draft),shortened);
    assert.strictEqual(editor.undoStack.length,undoCount);
    editor.chooseToolValue("quarter"); sync(); assert.strictEqual(editor.undoStack.length,undoCount+1);
    assert.strictEqual(editor.selectedEvent.noteValue,"quarter"); assert(!Object.prototype.hasOwnProperty.call(editor.selectedEvent,"originalNoteValue"));
    const manual = JSON.stringify(editor.draft);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),shortened);
    editor.redo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),manual);
    editor.selectEvent(editor.currentBar.events.find(event => event.id === later.id)); editor.eraseSelectedEvent(); sync();
    const heldAfterManual = editor.currentBar.events.find(event => event.id === held.id);
    assert.strictEqual(heldAfterManual.noteValue,"quarter"); assert(!Object.prototype.hasOwnProperty.call(heldAfterManual,"originalNoteValue"));
    editor.undo(); sync(); editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),shortened);
    editor.selectEvent(editor.currentBar.events.find(event => event.id === later.id)); editor.eraseSelectedEvent(); sync();
    assert.strictEqual(editor.currentBar.events.find(event => event.id === held.id).noteValue,"whole");
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),shortened); fixture.destroy();
  });
  test("an invalid group preview or accidental rejects the whole chord without undo or partial movement", () => {
    const chord = [note(48,"half"),note(96,"eighth")].map(event => Object.assign(event,{ startSlot:0 }));
    const fixture = groupEditorFixture(chord); const { editor,sheet,pointer,tap,sync } = fixture;
    const ids = chord.map(event => event.id); const anchorId = ids[0]; tap(anchorId);
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    editor.changeSelectedAlter(1); sync();
    assert.strictEqual(JSON.stringify(editor.draft),before); assert.strictEqual(editor.undoStack.length,undoCount);
    assert(editor.placementError); assert.deepStrictEqual(editor.selectedEventIds.slice(),ids);
    const head = sheet.events.find(event => event.id === anchorId);
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+31,head.y-10));
    assert.strictEqual(sheet.previewEvents,null); assert.strictEqual(sheet.blockedDrag,true);
    assert.deepStrictEqual(sheet.events.filter(event => event.kind === "note").map(event => [event.id,event.startSlot,event.pitch]),
      chord.map(event => [event.id,event.startSlot,event.pitch]));
    assert.strictEqual(JSON.stringify(editor.draft),before);
    sheet.pointerUp(pointer(head.x+31,head.y-10));
    assert.strictEqual(JSON.stringify(editor.draft),before); assert.strictEqual(editor.undoStack.length,undoCount);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids); assert(editor.placementError);
    sheet.pointerDown(pointer(head.x,head.y)); sheet.pointerMove(pointer(head.x+500,head.y));
    assert.strictEqual(sheet.gesture.slot,4); // The half note controls the entire chord's right boundary.
    sheet.cancelGesture({ pointerId:1 });
    assert.strictEqual(JSON.stringify(editor.draft),before); assert.strictEqual(editor.undoStack.length,undoCount);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),ids); assert.strictEqual(fixture.captures.size,0);
    fixture.destroy();
  });
  test("bar changes, history, revisions, a new piece and closing clear every selection identity", () => {
    const chord = [note(48),note(52),note(55)].map(event => Object.assign(event,{ startSlot:0 }));
    const fixture = groupEditorFixture(chord); const { editor,sync } = fixture;
    const ids = chord.map(event => event.id); const anchorId = ids[0];
    const select = () => { editor.selectGroup({ ids,anchorId }); sync(); assert(editor.groupSelected); };
    const clear = () => {
      assert.deepStrictEqual(editor.selectedEventIds,[]); assert.strictEqual(editor.selectedEventId,null);
      assert.strictEqual(editor.selectedAnchorId,null); assert.strictEqual(editor.hasSelection,false);
    };
    editor.addBars(); editor.selectBar(0); sync();
    select(); editor.selectBar(1); sync(); clear(); editor.selectBar(0); sync();
    select(); editor.changeSelectedValue("eighth"); sync(); editor.undo(); sync(); clear();
    select(); editor.redo(); sync(); clear();
    const original = store.storeWorkshopDraft(editor.draft,storage());
    const edited = model.openWorkshopPiece(original.piece); edited.score.bpm = 75;
    const revised = model.saveWorkshopDraft(original.library,edited);
    editor.library = revised.library; editor.openPiece(revised.piece); sync();
    select(); editor.chooseRevision(original.piece.currentRevisionId); sync(); clear();
    select(); editor.closeEditor(); clear();
    editor.openPiece(revised.piece); sync(); select(); editor.newPiece(); sync(); clear();
    fixture.destroy();
  });
  test("rest duration editing and deletion remain independent of chord selection", () => {
    const fixture = groupEditorFixture([]); const { editor,sync } = fixture;
    editor.chooseToolKind("rest"); editor.placeOnSheet({ slot:2,pitch:null }); sync();
    const id = editor.selectedEventId; assert(id); assert.strictEqual(editor.selectedEvent.kind,"rest");
    assert.deepStrictEqual(editor.selectedEventIds,[]); assert.strictEqual(editor.selectedNotes.length,0);
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    editor.chooseToolValue("half"); sync();
    assert.strictEqual(editor.selectedEvent.id,id); assert.strictEqual(editor.selectedEvent.noteValue,"half");
    assert.strictEqual(startOf(editor.currentBar.events,id),2); assert.strictEqual(editor.undoStack.length,undoCount+1);
    editor.changeSelectedAlter(1); assert.strictEqual(editor.undoStack.length,undoCount+1);
    editor.undo(); sync(); assert.strictEqual(JSON.stringify(editor.draft),before);
    editor.selectEvent(editor.currentBar.events.find(event => event.id === id)); sync();
    editor.eraseSelectedEvent(); sync();
    assert(!editor.currentBar.events.some(event => event.id === id)); assert.strictEqual(editor.hasSelection,false);
    assert(editor.currentBar.events.every(event => event.kind === "rest"));
    assert(model.isValidWorkshopScore(editor.draft.score)); fixture.destroy();
  });
  test("the selection panel stays directly below the score and is empty without a selection in both languages and fallback", () => {
    const fallback = fs.readFileSync(path.join(sourceRoot,"main.js"),"utf8").match(/fallbackLocale:\s*["']([^"']+)["']/)[1];
    const dictionaries = { de:require("../src/resources/de").default,en:require("../src/resources/en").default };
    assert(dictionaries[fallback]);
    const nodes = node => [node].concat(...(node.children || (node.componentOptions && node.componentOptions.children) || []).map(nodes));
    const hasClass = (node,name) => !!(node.data && (node.data.staticClass || "").split(" ").includes(name));
    for (const locale of ["de","en","fr"]) {
      const fixture = groupEditorFixture([48,52,55].map(value => Object.assign(note(value),{ startSlot:0 })));
      const { editor } = fixture; const localized = dictionaries[locale] || dictionaries[fallback];
      editor.$i18n = { locale };
      editor.$t = (key,values = {}) => Object.keys(values).reduce((text,name) => text.replace(`{${name}}`,values[name]),localized[key] || key);
      const check = empty => {
        const root = editor._render(); const all = nodes(root);
        const parent = all.find(node => (node.children || []).some(child => (child.componentOptions && child.componentOptions.tag === "WorkshopZoomViewport")));
        assert(parent);
        const children = parent.children.filter(node => node.tag);
        const index = children.findIndex(node => (node.componentOptions && node.componentOptions.tag === "WorkshopZoomViewport"));
        assert(nodes(children[index]).some(node => node.componentOptions && node.componentOptions.tag === "WorkshopStaff"));
        assert(hasClass(children[index+1],"toolbox"));
        const panel = children[index+2]; assert(hasClass(panel,"selection-panel")); assert.notStrictEqual(panel.tag,"details");
        assert.strictEqual(panel.data.attrs["aria-label"],localized.WORKSHOP_SELECTION);
        if (empty) {
          assert(!(panel.children || []).some(node => node.tag));
          assert.strictEqual(nodes(panel).map(node => node.text || "").join("").trim(),"");
        } else {
          const identity = nodes(panel).find(node => hasClass(node,"selection-identity")); assert(identity);
          const identityText = nodes(identity).map(node => node.text || "").join("").trim();
          const controls = nodes(panel).filter(node => node.tag === "button"); assert.strictEqual(controls.length,2);
          const label = node => nodes(node).map(child => child.text || "").join("").trim();
          assert.deepStrictEqual(controls.map(label),[localized.WORKSHOP_DESELECT,localized.WORKSHOP_REMOVE_CHORD]);
          const advanced = all.find(node => hasClass(node,"note-more")); assert(advanced);
          assert.strictEqual(advanced.tag,"details");
          const beamControls = nodes(advanced).find(node => hasClass(node,"beam-controls")); assert(beamControls);
          const beamButtons = nodes(beamControls).filter(node => node.tag === "button");
          assert.deepStrictEqual(beamButtons.map(node => !!node.data.attrs.disabled),[!editor.canConnectSelection,!editor.canUnlinkSelection]);
          const tieControls = nodes(advanced).find(node => hasClass(node,"tie-controls")); assert(tieControls);
          const tieButtons = nodes(tieControls).filter(node => node.tag === "button");
          assert.deepStrictEqual(tieButtons.map(node => !!node.data.attrs.disabled),[!editor.canTieSelection,!editor.hasSelectedTies]);
          const slurControls = nodes(advanced).find(node => hasClass(node,"slur-controls")); assert(slurControls);
          const slurButtons = nodes(slurControls).filter(node => node.tag === "button");
          assert.deepStrictEqual(slurButtons.map(node => !!node.data.attrs.disabled),[!editor.canSlurSelection,!editor.hasSelectedSlurs]);
          const tripletControls = nodes(advanced).find(node => hasClass(node,"triplet-controls")); assert(tripletControls);
          const tripletButtons = nodes(tripletControls).filter(node => node.tag === "button");
          assert.deepStrictEqual(tripletButtons.map(node => !!node.data.attrs.disabled),[!editor.canTripletSelection,!editor.hasSelectedTriplets]);
          assert(identityText.includes(editor.selectionTitle));
          assert(controls.every(node => !node.data.attrs.disabled));
          assert(!identityText.includes("WORKSHOP_")); assert(!identityText.includes("{count}"));
        }
      };
      editor.clearSelection(); check(true);
      editor.selectGroup({ ids:editor.currentBar.events.map(event => event.id),anchorId:editor.currentBar.events[0].id }); check(false);
      editor.clearSelection(); check(true); fixture.destroy();
    }
  });
  test("touch and mouse gestures snap to the score, commit once and cancel without changing notes", () => {
    const editor = new Vue(Object.assign({}, definition, { methods: Object.assign({}, definition.methods, { $t: view.$t }) }));
    editor.$i18n = { locale: "de" }; editor.newPiece();
    editor.player = { play() {}, stopAll() {} };
    const sheet = new Vue(Object.assign({}, staff, { propsData: { measure: editor.currentBar, noteLabel: editor.eventLabel } }));
    const captures = new Set();
    sheet.$refs.sheet = {
      getScreenCTM() { return { a: .8, b: 0, c: 0, d: .8, inverse() { return {}; } }; },
      createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: (this.x - 40) / .8, y: (this.y - 30) / .8 }; } }; },
      setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); }
    };
    editor.$refs.sheet = sheet;
    sheet.$on("select", editor.selectEvent); sheet.$on("place", editor.placeOnSheet); sheet.$on("move-note", editor.moveSheetNote);
    const pointer = (x, y, extra = {}) => Object.assign({ clientX: x * .8 + 40, clientY: y * .8 + 30,
      pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra);
    sheet.pointerDown(pointer(105.5, 176)); sheet.pointerUp(pointer(105.5, 176));
    assert.strictEqual(editor.currentBar.events.length, 1);
    assert.deepStrictEqual(editor.currentBar.events[0].pitch, model.workshopPitchFromValue(48));
    const eventId = editor.currentBar.events[0].id;
    const before = editor.undoStack.length;
    sheet.pointerDown(pointer(105.5, 176));
    sheet.pointerMove(pointer(105.5, 156)); sheet.pointerMove(pointer(105.5, 136));
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events[0].pitch), 48);
    assert.strictEqual(model.workshopPitchValue(sheet.events[0].pitch), 55);
    sheet.pointerUp(pointer(105.5, 136));
    assert.strictEqual(editor.undoStack.length, before + 1);
    assert.strictEqual(editor.currentBar.events[0].id, eventId);
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events[0].pitch), 55);
    editor.undo(); assert.strictEqual(model.workshopPitchValue(editor.currentBar.events[0].pitch), 48);
    editor.redo(); assert.strictEqual(model.workshopPitchValue(editor.currentBar.events[0].pitch), 55);
    sheet.measure = editor.currentBar;
    sheet.pointerDown(pointer(105.5, 136)); sheet.pointerMove(pointer(105.5, 96)); sheet.cancelGesture({ pointerId: 1 });
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events[0].pitch), 55);
    const afterCancel = editor.undoStack.length;
    sheet.pointerDown(pointer(105.5, 136)); sheet.pointerUp(pointer(105.5, 136));
    assert.strictEqual(editor.undoStack.length, afterCancel);
    sheet.pointerDown(pointer(260, 146, { isPrimary: false, pointerId: 2 }));
    sheet.pointerDown(pointer(260, 146, { pointerType: "mouse", button: 2 })); assert.strictEqual(sheet.gesture, null);
    sheet.pointerDown(pointer(260, 146)); sheet.pointerUp(pointer(400, 146));
    assert.strictEqual(editor.currentBar.events.length, 1); assert.strictEqual(captures.size, 0);
    editor.tool.noteValue = "eighth"; sheet.noteValue = "eighth";
    editor.currentBar.events[0].noteValue = "eighth";
    sheet.pointerDown(pointer(136.5, 136)); assert.strictEqual(sheet.gesture.eventId, null);
    sheet.cancelGesture(); // A large note hit target must not steal the empty neighbouring slot.
    sheet.pointerDown(pointer(105.5, 156)); assert.strictEqual(sheet.gesture.eventId, null);
    sheet.pointerUp(pointer(105.5, 156));
    const chordNote = editor.selectedAnchorId;
    assert.notStrictEqual(chordNote, eventId);
    assert.strictEqual(editor.selectedEventId,null);
    assert.deepStrictEqual(editor.selectedEventIds.slice(),[eventId,chordNote]);
    assert.strictEqual(editor.currentBar.events.filter(event => event.kind === "note").length, 2);
    assert.strictEqual(sheet.stems.length,1); assert.strictEqual(sheet.stems[0].eventIds.length,2);
    editor.selectEvent(editor.currentBar.events.find(event => event.id === chordNote));
    const beforeResize = JSON.stringify(editor.draft);
    editor.chooseToolValue("half");
    assert.strictEqual(editor.selectedEventId, chordNote); assert.strictEqual(editor.selectedEvent.noteValue, "half");
    assert.strictEqual(editor.currentBar.events.find(event => event.id === eventId).noteValue, "eighth");
    assert.strictEqual(startOf(editor.currentBar.events, eventId), 0); assert.strictEqual(startOf(editor.currentBar.events, chordNote), 0);
    assert.strictEqual(editor.tool.noteValue, "half");
    assert.strictEqual(sheet.stems.length,2);
    editor.undo(); assert.strictEqual(JSON.stringify(editor.draft), beforeResize); editor.redo();
    editor.clearSelection(); editor.chooseToolValue("quarter");
    assert.strictEqual(editor.tool.noteValue, "quarter");
    assert.strictEqual(editor.currentBar.events.find(event => event.id === chordNote).noteValue, "half");
    const savedStorage = storage(); const result = store.storeWorkshopDraft(editor.draft, savedStorage);
    assert.strictEqual(model.workshopPitchValue(model.openWorkshopPiece(result.piece).score.parts[0].measures[0].events[0].pitch), 55);
    const exported = backup.createSaveDataBackup(savedStorage); assert(backup.validateSaveDataBackup(exported).valid);
    const restoredStorage = storage(); restoredStorage.setItem(model.WORKSHOP_STORAGE_KEY,savedStorage.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(restoredStorage, imports.prepareSaveDataImport(restoredStorage, exported, "replace"));
    assert.deepStrictEqual(store.readWorkshopLibrary(restoredStorage), result.library);
    for (const slot of [0,7]) {
      const unisons = Array.from({ length:4 },() => Object.assign(note(48,"eighth"),{ startSlot:slot }));
      sheet.measure = { events:unisons };
      assert(sheet.events.filter(event => event.kind === "note").every(event => event.x >= 97 && event.x <= 331));
      for (const event of sheet.events.filter(event => event.kind === "note")) {
        sheet.pointerDown(pointer(event.x,event.y)); assert.strictEqual(sheet.gesture.eventId,event.id);
        sheet.cancelGesture();
      }
    }
    sheet.$destroy(); editor.$destroy();
  });
  test("editing note lengths and erasing preserve the placed times of following notes", () => {
    const editor = new Vue(Object.assign({}, definition, { methods: Object.assign({}, definition.methods, { $t: view.$t }) }));
    editor.$i18n = { locale: "de" }; editor.newPiece(); editor.player = { play() {}, stopAll() {} };
    editor.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) }); const early = editor.selectedEventId;
    editor.placeOnSheet({ slot: 4, pitch: model.workshopPitchFromValue(55) }); const late = editor.selectedEventId;
    editor.selectEvent(editor.currentBar.events.find(event => event.id === early));
    editor.changeSelectedValue("half");
    assert.deepStrictEqual(editor.currentBar.events.map(event => event.noteValue), ["half", "quarter"]);
    const rejectedControl = { value: "whole" };
    editor.selectEvent(editor.currentBar.events.find(event => event.id === late));
    editor.changeSelectedValue("whole", rejectedControl); assert(editor.placementError);
    assert.strictEqual(rejectedControl.value, "quarter");
    assert.strictEqual(editor.currentBar.events[0].noteValue, "half");
    editor.selectEvent(editor.currentBar.events.find(event => event.id === early));
    editor.chooseToolValue("whole");
    assert.strictEqual(editor.selectedEvent.noteValue, "half"); assert.strictEqual(editor.selectedEvent.originalNoteValue,"whole");
    assert.strictEqual(startOf(editor.currentBar.events, late), 4);
    editor.chooseToolValue("eighth");
    editor.eraseSelectedEvent();
    assert.strictEqual(startOf(editor.currentBar.events, late), 4);
    assert.strictEqual(editor.freeSlots, 12);
    assert(model.isValidWorkshopScore(editor.draft.score)); editor.$destroy();
  });
  test("horizontal and diagonal dragging previews safely, commits once and survives undo, saving and backup", () => {
    const editor = new Vue(Object.assign({}, definition, { methods: Object.assign({}, definition.methods, { $t: view.$t }) }));
    editor.$i18n = { locale: "de" }; editor.newPiece(); editor.player = { play() {}, stopAll() {} };
    editor.placeOnSheet({ slot: 0, pitch: model.workshopPitchFromValue(48) }); const id = editor.selectedEventId;
    editor.placeOnSheet({ slot: 6, pitch: model.workshopPitchFromValue(55) }); const neighbour = editor.selectedEventId;
    const sheet = new Vue(Object.assign({}, staff, { propsData: { measure: editor.currentBar, noteLabel: editor.eventLabel } }));
    const captures = new Set();
    sheet.$refs.sheet = {
      getScreenCTM() { return { a: .8, b: 0, c: 0, d: .8, inverse() { return {}; } }; },
      createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: (this.x - 40) / .8, y: (this.y - 30) / .8 }; } }; },
      setPointerCapture(value) { captures.add(value); }, hasPointerCapture(value) { return captures.has(value); }, releasePointerCapture(value) { captures.delete(value); }
    };
    editor.$refs.sheet = sheet; sheet.$on("select", editor.selectEvent); sheet.$on("move-note", editor.moveSheetNote);
    const pointer = (x, y, extra = {}) => Object.assign({ clientX: x * .8 + 40, clientY: y * .8 + 30,
      pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra);
    const before = JSON.stringify(editor.draft); const undoCount = editor.undoStack.length;
    sheet.pointerDown(pointer(105.5, 176));
    sheet.pointerMove(pointer(136.5, 166)); sheet.pointerMove(pointer(167.5, 136));
    assert.strictEqual(JSON.stringify(editor.draft), before);
    assert.strictEqual(sheet.blockedDrag, false);
    assert.strictEqual(sheet.events.find(event => event.id === id).x, 167.5);
    assert.strictEqual(sheet.events.find(event => event.id === neighbour).x, 291.5);
    sheet.pointerUp(pointer(167.5, 136));
    assert.strictEqual(startOf(editor.currentBar.events, id), 2);
    assert.strictEqual(model.workshopPitchValue(editor.currentBar.events.find(event => event.id === id).pitch), 55);
    assert.strictEqual(editor.undoStack.length, undoCount + 1);
    const after = JSON.stringify(editor.draft);
    editor.undo(); assert.strictEqual(JSON.stringify(editor.draft), before);
    editor.redo(); assert.strictEqual(JSON.stringify(editor.draft), after); sheet.measure = editor.currentBar;
    sheet.pointerDown(pointer(167.5, 136)); sheet.pointerMove(pointer(291.5, 96));
    assert.strictEqual(sheet.blockedDrag, false); assert.strictEqual(JSON.stringify(editor.draft), after);
    assert.strictEqual(sheet.stems.length,1); assert.strictEqual(sheet.stems[0].eventIds.length,2);
    sheet.pointerUp(pointer(291.5, 96));
    assert.strictEqual(startOf(editor.currentBar.events, id), 6); assert.strictEqual(startOf(editor.currentBar.events, neighbour), 6);
    assert.strictEqual(editor.undoStack.length, undoCount + 2);
    editor.undo(); sheet.measure = editor.currentBar; assert.strictEqual(JSON.stringify(editor.draft), after);
    assert.strictEqual(sheet.stems.length,2);
    sheet.pointerDown(pointer(167.5, 136)); sheet.pointerMove(pointer(105.5, 176));
    sheet.cancelGesture({ pointerId: 2 }); assert(sheet.gesture);
    sheet.pointerUp(pointer(105.5, 176, { pointerId: 2 })); assert(sheet.gesture);
    sheet.cancelGesture({ pointerId: 1 }); assert.strictEqual(JSON.stringify(editor.draft), after);
    assert.strictEqual(captures.size, 0);
    const savedStorage = storage(); const saved = store.storeWorkshopDraft(editor.draft, savedStorage);
    const exported = backup.createSaveDataBackup(savedStorage); const restoredStorage = storage(); restoredStorage.setItem(model.WORKSHOP_STORAGE_KEY,savedStorage.getItem(model.WORKSHOP_STORAGE_KEY));
    imports.applyPreparedSaveDataImport(restoredStorage, imports.prepareSaveDataImport(restoredStorage, exported, "replace"));
    const reopened = model.openWorkshopPiece(store.readWorkshopLibrary(restoredStorage).pieces[0]);
    assert.deepStrictEqual(reopened.score, saved.piece.revisions[0].score);
    const timeline = model.workshopTimeline(reopened.score);
    assert.strictEqual(timeline.events.find(event => event.id === id).startMs, 1000);
    assert.strictEqual(timeline.events.find(event => event.id === neighbour).startMs, 3000);
    assert.strictEqual(timeline.events.find(event => event.id === id).value, 55);
    for (const value of ["whole", "half", "quarter", "eighth", "sixteenth"]) {
      editor.newPiece(); const event = note(48, value); editor.currentBar.events = [event]; sheet.measure = editor.currentBar;
      const grip = value === "half" ? 205.5 : 105.5;
      sheet.pointerDown(pointer(grip, 176)); sheet.pointerMove(pointer(grip, 166));
      assert.strictEqual(sheet.gesture.slot, 0); // Grabbing inside a long note must not move it horizontally.
      sheet.pointerMove(pointer(grip + 500, 176));
      assert.strictEqual(sheet.gesture.slot, 8 - model.WORKSHOP_NOTE_UNITS[value]);
      sheet.pointerUp(pointer(grip + 500, 176));
      assert.strictEqual(startOf(editor.currentBar.events, event.id), 8 - model.WORKSHOP_NOTE_UNITS[value]);
      sheet.pointerDown(pointer(105.5 + (8 - model.WORKSHOP_NOTE_UNITS[value]) * 31, 176));
      sheet.pointerMove(pointer(-500, 176)); assert.strictEqual(sheet.gesture.slot, 0);
      sheet.pointerUp(pointer(-500, 176)); assert.strictEqual(startOf(editor.currentBar.events, event.id), 0);
    }
    editor.newPiece(); editor.currentBar.events = [note()]; sheet.measure = editor.currentBar;
    sheet.keyDown({ key: "ArrowRight", preventDefault() {} }, sheet.events[0]);
    assert.strictEqual(startOf(editor.currentBar.events, editor.selectedEventId), .5);
    sheet.keyDown({ key: "ArrowLeft", preventDefault() {} }, sheet.events.find(event => event.id === editor.selectedEventId));
    assert.strictEqual(startOf(editor.currentBar.events, editor.selectedEventId), 0);
    sheet.$destroy(); editor.$destroy();
  });
  test("the editor enforces capacity and supports changes, bar copying, movement, undo and redo", () => {
    view.newPiece(); view.addBarCount = 3; view.addBars(); view.selectBar(0);
    for (let index = 0; index < 4; index++) view.placeOnSheet({ slot: index * 2, pitch: model.workshopPitchFromValue(48 + index * 2) });
    assert.strictEqual(view.units(view.currentBar), 8); assert.strictEqual(view.freeSlots, 0);
    view.placeOnSheet({ slot: 7, pitch: model.workshopPitchFromValue(48) }); assert.strictEqual(view.currentBar.events.length, 4);
    view.selectEvent(view.currentBar.events[0]); view.changeSelectedValue("half");
    assert.strictEqual(view.placementError, null); assert.strictEqual(view.currentBar.events[0].noteValue, "quarter");
    assert.strictEqual(view.currentBar.events[0].originalNoteValue,"half");
    view.changeSelectedValue("eighth"); assert.strictEqual(view.freeSlots, 2);
    view.undo(); assert.strictEqual(view.units(view.currentBar), 8);
    view.redo(); assert.strictEqual(view.freeSlots, 2);
    view.copyTarget = 1; view.copyBar();
    assert.strictEqual(view.bars[1].events.length, 5);
    assert.notStrictEqual(view.bars[0].events[0].id, view.bars[1].events[0].id);
    const firstId = view.currentBar.id; view.moveBar(1); assert.strictEqual(view.currentBar.id, firstId);
    // Shared complete and streamed backup fixtures include fractional times,
    // manual beam membership and a remembered automatically shortened value.
    const beamNotes = [timedNote(48,"eighth",0),timedNote(52,"sixteenth",1),timedNote(55,"sixteenth",1.5),timedNote(59,"eighth",2)];
    beamNotes[1].originalNoteValue = "eighth";
    view.bars[3].events = sheetModel.joinWorkshopNotes({ events:beamNotes },beamNotes.map(event => event.id));
    assert(view.bars[3].events);
    assert(model.isValidWorkshopScore(view.draft.score));
    assert.strictEqual(view.savePiece(), true); assert.strictEqual(view.dirty, false);
    view.selectEvent(view.currentBar.events[0]); view.eraseSelectedEvent(); assert(view.dirty);
    assert.strictEqual(view.handleBack(), true); assert.strictEqual(view.confirmExit, true);
    view.saveAndClose(); assert.strictEqual(view.draft, null);
    const reopened = store.readWorkshopLibrary(); assert.strictEqual(reopened.pieces[0].revisions.length, 2);
    view.openPiece(reopened.pieces[0]); assert.strictEqual(view.bars[1].events.filter(event => event.kind === "note").length, 3);
    view.chooseRevision(reopened.pieces[0].revisions[0].id); assert.strictEqual(view.bars[1].events.filter(event => event.kind === "note").length, 4);
    view.undo(); assert.strictEqual(view.bars[1].events.filter(event => event.kind === "note").length, 3);
    assert.strictEqual(view.selectedRevisionId, reopened.pieces[0].currentRevisionId);
    view.redo(); assert.strictEqual(view.bars[1].events.filter(event => event.kind === "note").length, 4);
    assert.strictEqual(view.selectedRevisionId, reopened.pieces[0].revisions[0].id);
    view._render();
    const geometry = staff.computed.notation.call({ measure: view.bars[2] }).events;
    assert(geometry.some(event => event.implicit));
    assert(geometry.every(event => Number.isFinite(event.x) && Number.isFinite(event.y)));
  });

  test("failed or corrupted storage never overwrites saved pieces or clears the current draft", () => {
    const previous = localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
    const realSet = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("quota"); };
    assert.strictEqual(view.savePiece(), false); assert(view.draft); assert(view.dirty);
    assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), previous);
    localStorage.setItem = realSet;
    const bad = storage(); bad.setItem(model.WORKSHOP_STORAGE_KEY, '{"data":{"version":999}}');
    const badValue = bad.getItem(model.WORKSHOP_STORAGE_KEY);
    assert.throws(() => store.storeWorkshopDraft(view.draft, bad));
    assert.strictEqual(bad.getItem(model.WORKSHOP_STORAGE_KEY), badValue);
  });

  test("playback respects tempo, rests, note lengths, app volume and cancels every scheduled callback", () => {
    const draft = model.createWorkshopDraft("Playback");
    draft.score.bpm = 120; draft.score.parts[0].measures[0].events = [note(), { id: model.workshopId("rest"), kind: "rest", noteValue: "quarter", pitch: null }, note(55, "half")];
    const timers = new Map(); let counter = 0; const played = []; const progress = [];
    const player = { play(value, volume) { played.push([value, volume]); }, stopAll() {} };
    const playback = createWorkshopPlayback(draft.score, player, { appVolume: 37,
      setTimeoutFn(callback, time) {
        const id = ++counter;
        timers.set(id, { callback() { timers.delete(id); callback(); }, time }); return id;
      }, clearTimeoutFn(id) { timers.delete(id); }, onStep(event) { progress.push(event); } });
    playback.start(); assert.deepStrictEqual(played, [[48, 37]]);
    const next = Array.from(timers.values()).sort((a, b) => a.time - b.time);
    assert.strictEqual(next[0].time, 500); next[0].callback(); assert.strictEqual(progress[1].value, null);
    assert.strictEqual(next[1].time, 1000); next[1].callback(); assert.deepStrictEqual(played[1], [55, 37]);
    playback.stop(); assert.strictEqual(timers.size, 0); assert.strictEqual(playback.isPlaying(), false);
    const playedBefore = played.length; next[2].callback(); assert.strictEqual(played.length, playedBefore);
  });
  test("simultaneous notes keep independent durations and rests never stop a held note", () => {
    const draft = model.createWorkshopDraft("Polyphony");
    const long = Object.assign(note(48,"half"),{ startSlot:0 }); const short = Object.assign(note(52,"eighth"),{ startSlot:0 });
    const later = Object.assign(note(55),{ startSlot:2 });
    draft.score.parts[0].measures[0].events = [long,short,later,
      { id:model.workshopId("rest"),kind:"rest",noteValue:"eighth",pitch:null,startSlot:1 }];
    const timers = new Map(); let timerId = 0; const voices = []; let stops = 0; const active = [];
    const player = { play(value, volume) {
      const sample = { value,volume,paused:0,currentTime:1,pause() { this.paused++; } }; voices.push(sample); return sample;
    },stopAll() { stops++; } };
    const playback = createWorkshopPlayback(draft.score,player,{ appVolume:37,
      setTimeoutFn(callback,time) {
        const id = ++timerId;
        timers.set(id, { callback() { timers.delete(id); callback(); }, time }); return id;
      }, clearTimeoutFn(id) { timers.delete(id); },
      onActiveNotes(ids) { active.push(ids); } });
    playback.start(); assert.deepStrictEqual(voices.map(voice => voice.value),[48,52]);
    assert.deepStrictEqual(active[active.length-1],[long.id,short.id]);
    const at = time => Array.from(timers.values()).find(timer => timer.time === time).callback();
    at(500); assert.strictEqual(voices[0].paused,0); assert.strictEqual(voices[1].paused,1);
    assert.deepStrictEqual(active[active.length-1],[long.id]); assert.strictEqual(stops,1);
    at(1000); assert.deepStrictEqual(voices.map(voice => voice.value),[48,52,55]); assert.strictEqual(voices[0].paused,0);
    at(2000); assert.strictEqual(voices[0].paused,1); assert.strictEqual(voices[2].paused,1);
    assert.strictEqual(stops,1); assert.deepStrictEqual(active[active.length-1],[]);
    const stale = Array.from(timers.values()); playback.stop(); assert.strictEqual(timers.size,0);
    const count = voices.length; stale.forEach(timer => timer.callback()); assert.strictEqual(voices.length,count);
    playback.start(); stale.forEach(timer => timer.callback()); assert.strictEqual(voices.length,count+2);
    playback.stop(); assert.strictEqual(timers.size,0);
  });
  test("sixteenth playback stops each voice after 250 ms and distinguishes a sixteenth rest", () => {
    const draft = model.createWorkshopDraft("Sixteenth playback");
    const first = timedNote(48,"sixteenth",0); const next = timedNote(52,"sixteenth",1);
    draft.score.parts[0].measures[0].events = [first,
      { id:model.workshopId("rest"),kind:"rest",noteValue:"sixteenth",pitch:null,startSlot:.5 },next];
    const timers = new Map(); let timerId = 0; const voices = [];
    const player = { play(value,volume) {
      const voice = { value,volume,paused:0,pause() { this.paused++; },currentTime:1 }; voices.push(voice); return voice;
    },stopAll() {} };
    const playback = createWorkshopPlayback(draft.score,player,{ appVolume:23,
      setTimeoutFn(callback,time) {
        const id = ++timerId;
        timers.set(id, { callback() { timers.delete(id); callback(); }, time }); return id;
      },clearTimeoutFn(id) { timers.delete(id); } });
    const at = time => { const timer = Array.from(timers.values()).find(timer => timer.time === time); assert(timer,time); timer.callback(); };
    playback.start(); assert.deepStrictEqual(voices.map(voice => [voice.value,voice.volume]),[[48,23]]);
    at(250); assert.strictEqual(voices[0].paused,1); assert.strictEqual(voices.length,1);
    at(500); assert.deepStrictEqual(voices.map(voice => [voice.value,voice.volume]),[[48,23],[52,23]]);
    at(750); assert.strictEqual(voices[1].paused,1);
    const stale = Array.from(timers.values()); playback.stop(); assert.strictEqual(timers.size,0);
    stale.forEach(timer => timer.callback()); assert.strictEqual(voices.length,2);
  });

  test("saving 200 bars preserves earlier four-bar versions for complete and streamed backups", () => {
    const library = store.readWorkshopLibrary();
    const piece = library.pieces[0]; const draft = model.openWorkshopPiece(piece);
    assert.strictEqual(draft.score.parts[0].measures.length,4);
    const oldIds = draft.score.parts[0].measures.map(measure => measure.id);
    draft.score = model.insertWorkshopMeasures(draft.score,3,196);
    draft.score.parts[0].measures[199].events = [timedNote(67,"sixteenth",7.5)];
    const saved = store.storeWorkshopDraft(draft);
    assert(saved.piece.revisions.some(revision => revision.score.parts[0].measures.length === 4));
    assert.strictEqual(model.openWorkshopPiece(saved.piece).score.parts[0].measures.length,200);
    assert.deepStrictEqual(draft.score.parts[0].measures.slice(0,4).map(measure => measure.id),oldIds);
  });

  const exported = backup.createSaveDataBackup(localStorage);
  const expected = store.readWorkshopLibrary();
  const backedNotes = expected.pieces.reduce((notes,piece) => notes.concat(...piece.revisions.map(revision =>
    revision.score.parts[0].measures.reduce((events,measure) => events.concat(measure.events.filter(event => event.kind === "note")),[]))),[]);
  assert(backedNotes.some(event => event.noteValue === "sixteenth" && event.startSlot % 1 !== 0 && event.beamGroupId));
  assert(backedNotes.some(event => event.noteValue === "sixteenth" && event.originalNoteValue === "eighth" && event.beamGroupId));
  test("app backups exclude Workshop pieces and versions while legacy imports leave local data untouched", () => {
    assert.strictEqual(exported.version, 2); assert(backup.validateSaveDataBackup(exported).valid);
    assert.strictEqual(exported.data.workshopLibrary, undefined);
    assert.strictEqual(backup.summarizeSaveDataBackup(exported).workshopPieces, undefined);
    const legacy = model.cloneWorkshop(exported); legacy.version=5; legacy.data.workshopLibrary=model.cloneWorkshop(expected);
    assert(backup.validateSaveDataBackup(legacy).valid);
    assert.strictEqual(backup.summarizeSaveDataBackup(legacy).workshopPieces, undefined);
    const target = storage(); target.setItem(model.WORKSHOP_STORAGE_KEY, JSON.stringify({data:expected})); target.setItem("unrelated", "keep");
    for (const incoming of [exported,legacy]) for (const mode of ["replace","merge","merge"]) {
      const before=target.getItem(model.WORKSHOP_STORAGE_KEY);
      imports.applyPreparedSaveDataImport(target, imports.prepareSaveDataImport(target, incoming, mode));
      assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);assert.strictEqual(target.getItem("unrelated"),"keep");
    }
    const extra = model.createWorkshopDraft("Another piece"); store.storeWorkshopDraft(extra, target);
    const previous = target.getItem(model.WORKSHOP_STORAGE_KEY);
    const corrupt = model.cloneWorkshop(legacy); corrupt.data.workshopLibrary.pieces[0].revisions[0].score.bpm = 999;
    assert.strictEqual(backup.validateSaveDataBackup(corrupt).valid, false);
    const malformed = model.cloneWorkshop(legacy); malformed.data.workshopLibrary.pieces[0].revisions = [null];
    assert.strictEqual(backup.validateSaveDataBackup(malformed).valid, false);
    const collision = model.cloneWorkshop(legacy); collision.data.workshopLibrary.pieces[0].revisions[0].score.bpm = 90;
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,collision,"merge"));
    assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),previous,'Workshop revision collisions are outside an app merge');
    imports.applyPreparedSaveDataImport(target, imports.prepareSaveDataImport(target, backup.createSaveDataBackup(storage()), "replace"));
    assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),previous);
    const preserved = storage(); preserved.setItem(model.WORKSHOP_STORAGE_KEY, JSON.stringify({ data: expected }));
    deleteAllLearningData(preserved); assert.deepStrictEqual(store.readWorkshopLibrary(preserved), expected);
  });

  const exportOptions = {
    learningStorage: {
      async flush() {}, getStatus() { return { failedWrites: 0 }; },
      async verifyHistoryReady() { return { saved: true, verified: true }; },
      async migrateLegacyHistory() { return { saved: true, verified: true }; },
      async synchronizeProgress() { return { saved: true }; },
      async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot() { return { saved: true, progress: { version: 3, notes: {} }, attempts: [] }; },
      async readProgress() { return { saved: true, progress: { version: 3, notes: {} } }; },
      async readBackupAttemptsPage() { return { saved: true, page: { records: [], done: true } }; }
    },
    noteFlowStorage: {
      async flush() {}, async readRoundsForExport() { return { saved: true, rounds: [] }; },
      async readRoundsPage() { return { saved: true, page: { records: [], done: true } }; }
    },
    rhythmStorage: {
      async flush() {}, async readBarsForExport() { return { saved: true, bars: [] }; },
      async readBarsPage() { return { saved: true, page: { records: [], done: true } }; }
    }, includeNoteFlowRounds: true, includeRhythmSenseBars: true
  };
  const fullExport = await files.createIndexedDbSaveDataBackup(localStorage, exportOptions);
  assert.strictEqual(fullExport.version, 4);
  assert.strictEqual(fullExport.data.workshopLibrary, undefined);
  const chunks = [];
  await files.streamIndexedDbSaveDataBackup(async chunk => { chunks.push(chunk); }, localStorage, exportOptions);
  const streamedExport = JSON.parse(chunks.join(""));
  assert.strictEqual(streamedExport.version, 4);
  assert(backup.validateSaveDataBackup(streamedExport).valid);
  assert.strictEqual(streamedExport.data.workshopLibrary, undefined);
  process.stdout.write("✓ complete and streamed database exports exclude Workshop pieces and score versions\n");

  const reader = new SaveDataStreamReader(() => { throw new Error("No large collections expected"); });
  const json = JSON.stringify(exported);
  for (let index = 0; index < json.length; index += 7) reader.push(json.slice(index, index + 7));
  const streamed = reader.finish();
  const metadata = { key: "ready", shell: streamed.backup, counts: streamed.counts };
  assert.strictEqual(metadata.shell.data.workshopLibrary, undefined);
  assert.strictEqual(summarizeStagedSaveData(metadata).workshopPieces, undefined);
  const summary = { source: { createdAt: exported.createdAt, fileSize: null },
    rounds: { "screen:note-flow": 0, "midi:note-flow": 0, "midi:note-flow-chords": 0, "rhythm:taktgefuehl": 0 },
    attempts: { "screen:single-notes": 0, "midi:single-notes": 0 }, progress: {}, activeGuard: "test" };
  const marker = { state: "database-verified", summary };
  const staging = { async readMetadata() { return metadata; }, async readBatch() { return { records: [], nextIndex: 0, total: 0, done: true }; } };
  const shadow = { name: "noten-pfoten-learning-import-workshop-test", database: {
    async readImportGenerationMarker() { return marker; }, async readProgressSnapshot() { return []; }
  } };
  const plan = await prepareStagedLocalSaveDataPlan(staging, shadow);
  assert.strictEqual(plan.values[model.WORKSHOP_STORAGE_KEY], undefined);
  const mergeTarget = storage(); store.storeWorkshopDraft(model.createWorkshopDraft("Local piece"), mergeTarget);
  marker.state = "preparing";
  const mergedPlan = await prepareMergedLocalSaveDataPlan(staging, shadow, summary, mergeTarget);
  assert.strictEqual(mergedPlan.values[model.WORKSHOP_STORAGE_KEY], undefined);assert.strictEqual(store.readWorkshopLibrary(mergeTarget).pieces.length,1);
  process.stdout.write("✓ streamed backups and replacement/merge plans leave Workshop outside their ownership\n");

  for (const language of ["de", "en"]) {
    const localized = require("../src/resources/" + language).default;
    const text = ["Workshop", "WorkshopStaff", "WorkshopSheet"].map(name => fs.readFileSync(path.join(sourceRoot, "components", name + ".vue"), "utf8")).join("\n");
    const keys = text.match(/WORKSHOP_[A-Z_]+/g).filter(key => !["WORKSHOP_DEMO_PIECES", "WORKSHOP_NOTE_UNITS", "WORKSHOP_STAFF_GEOMETRY", "WORKSHOP_SLOT_STEP", "WORKSHOP_TICKS_PER_UNIT", "WORKSHOP_MAX_SCORE_MEASURES", "WORKSHOP_MAX_PIECE_REVISIONS", "WORKSHOP_METERS", "WORKSHOP_CLEFS", "WORKSHOP_DYNAMIC_", "WORKSHOP_ARTICULATION_", "WORKSHOP_XML_WARNING_", "WORKSHOP_MIDI_WARNING_", "WORKSHOP_MIDI_ERROR_", "WORKSHOP_VALUE_", "WORKSHOP_CLEF_", "WORKSHOP_ACCIDENTAL_"].includes(key))
      .concat(model.WORKSHOP_DYNAMICS.map(value => "WORKSHOP_DYNAMIC_" + value.toUpperCase()),
        model.WORKSHOP_ARTICULATIONS.map(value => "WORKSHOP_ARTICULATION_" + value.toUpperCase().replace(/-/g,"_")),
        ["cautionary","editorial"].map(value => "WORKSHOP_ACCIDENTAL_"+value.toUpperCase()),
        ["unsupported-notation","extra-parts","unsupported-rhythm","layout-approximate","source-preserved","edited-source-preserved","archive-assets-preserved"]
          .map(value => definition.methods.xmlWarningKey(value)),
        Object.keys(model.WORKSHOP_NOTE_UNITS).map(value => definition.methods.durationLabel.call({ $t:key => key },value)),
        model.WORKSHOP_CLEFS.map(value => definition.methods.clefLabel.call({ $t:key => key },value)));
    keys.forEach(key => assert(localized[key], language + ": " + key));
    view.$i18n.locale = language;
    view.$t = key => localized[key] || key;
    view._render();
  }
  view.$destroy();
  process.stdout.write("✓ all editor components compile and all visible workshop labels exist in German and English\n");
  require("./workshop-bars.test");
  require("./workshop-context-model.test");
  require("./workshop-context-editor.test");
  require("./workshop-context-staff.test");
  await require("./workshop-context.test")();
})().catch(error => { console.error(error); process.exitCode = 1; });

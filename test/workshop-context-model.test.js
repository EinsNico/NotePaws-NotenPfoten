const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const model = require("../src/model/Workshop");
const { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");
Module._extensions[".js"] = originalLoader;

function test(name, operation) {
  operation();
  process.stdout.write("✓ workshop context model: " + name + "\n");
}

function note(id, startSlot = 0, noteValue = "eighth", value = 24) {
  return { id, kind: "note", noteValue, startSlot, pitch: model.workshopPitchFromValue(value) };
}

function mixedScore() {
  let score = model.createWorkshopDraft("Mixed measures", 6).score;
  score = model.setWorkshopMeasureContext(score, 1, { meter: "3/4" });
  score = model.setWorkshopMeasureContext(score, 2, { clef: "bass" });
  score = model.setWorkshopMeasureContext(score, 3, { meter: "6/8" });
  score = model.setWorkshopMeasureContext(score, 4, { meter: "2/2", clef: "treble" });
  score = model.setWorkshopMeasureContext(score, 5, { meter: "3/2" });
  score.parts[0].measures[4].events = [note("original", 0, "quarter", 48)];
  score.parts[0].measures[5].events = [note("late", 11.5, "sixteenth", 71)];
  return score;
}

function contextsById(score) {
  return new Map(score.parts[0].measures.map((bar, index) => [
    bar.id, model.workshopMeasureContext(score, index)
  ]));
}

function assertContextsPreserved(score, expected) {
  assert(model.isValidWorkshopScore(score));
  score.parts[0].measures.forEach((bar, index) => {
    assert.deepStrictEqual(model.workshopMeasureContext(score, index), expected.get(bar.id), bar.id);
  });
}

test("all supported meters enforce their exact duration and the extended pitch bounds", () => {
  const expected = {
    "2/4": 4, "3/4": 6, "4/4": 8, "5/4": 10, "6/4": 12,
    "3/8": 3, "5/8": 5, "6/8": 6, "7/8": 7, "9/8": 9,
    "12/8": 12, "2/2": 8, "3/2": 12
  };
  assert.deepStrictEqual(model.WORKSHOP_METERS, Object.keys(expected));
  assert.deepStrictEqual(model.WORKSHOP_CLEFS, ["treble", "bass", "alto", "tenor"]);
  assert.strictEqual(model.WORKSHOP_MIN_PITCH, 9);
  assert.strictEqual(model.WORKSHOP_MAX_PITCH, 96);
  Object.entries(expected).forEach(([meter, units]) => {
    assert.strictEqual(model.workshopMeterUnits(meter), units);
    assert.strictEqual(model.workshopMeasureUnitsLimit({ meter }), units);
    assert.strictEqual(model.workshopMeasureUnitsLimit({ events: [] }, meter), units);
    assert(model.isValidWorkshopMeasure({ meter, clef: "bass", events: [note("edge", units - .5, "sixteenth")] }));
    assert(!model.isValidWorkshopMeasure({ meter, events: [note("overflow", units - .5)] }));
    const score = model.createWorkshopDraft().score;
    score.meter = meter;
    score.parts[0].clef = "bass";
    assert(model.isValidWorkshopScore(score));
  });
  for (const value of [9, 24, 36, 71, 96]) assert(model.isValidWorkshopMeasure({ events: [note("pitch", 0, "quarter", value)] }));
  for (const value of [8, 97]) assert(!model.isValidWorkshopMeasure({ events: [note("pitch", 0, "quarter", value)] }));
  for (const meter of [null, "11/3", "4/128", 4]) assert.strictEqual(model.workshopMeterUnits(meter), null);
  assert(!model.isValidWorkshopMeasure({ meter: null, events: [] }));
  assert(!model.isValidWorkshopMeasure({ clef: "percussion", events: [] }));
});

test("meter and clef inherit independently, can reset to inheritance, and resolve as a clone", () => {
  const score = mixedScore();
  const before = JSON.stringify(score);
  assert.deepStrictEqual(score.parts[0].measures.map((bar, index) => model.workshopMeasureContext(score, index)), [
    { meter: "4/4", clef: "treble", units: 8, keyId:"C-major", dynamic:"mf" },
    { meter: "3/4", clef: "treble", units: 6, keyId:"C-major", dynamic:"mf" },
    { meter: "3/4", clef: "bass", units: 6, keyId:"C-major", dynamic:"mf" },
    { meter: "6/8", clef: "bass", units: 6, keyId:"C-major", dynamic:"mf" },
    { meter: "2/2", clef: "treble", units: 8, keyId:"C-major", dynamic:"mf" },
    { meter: "3/2", clef: "treble", units: 12, keyId:"C-major", dynamic:"mf" }
  ]);
  const resolved = model.resolveWorkshopMeasure(score, 2);
  assert.strictEqual(resolved.meter, "3/4");
  assert.strictEqual(resolved.clef, "bass");
  resolved.events.push(note("local"));
  assert.strictEqual(score.parts[0].measures[2].events.length, 0);
  const reset = model.setWorkshopMeasureContext(score, 1, { meter: null });
  assert.strictEqual(model.workshopMeasureContext(reset, 2).meter, "4/4");
  assert.strictEqual(model.workshopMeasureContext(reset, 2).clef, "bass");
  assert.strictEqual(model.workshopMeasureContext(reset, 3).meter, "6/8");
  const resetClef = model.setWorkshopMeasureContext(score, 2, { clef: null });
  assert.strictEqual(model.workshopMeasureContext(resetClef, 3).clef, "treble");
  assert.strictEqual(JSON.stringify(score), before);
  for (const index of [-1, 6, .5, null]) assert.strictEqual(model.workshopMeasureContext(score, index), null);
  assert.strictEqual(model.resolveWorkshopMeasure(score, 6), null);
  for (const changes of [{ tempo: 2 }, { meter: "unknown" }, { clef: "percussion" }, null]) {
    assert.strictEqual(model.setWorkshopMeasureContext(score, 1, changes), null);
  }
});

test("a shorter inherited meter rejects sounding notes atomically and trims silent rest tails", () => {
  for (const kind of ["note", "rest"]) {
    const score = model.createWorkshopDraft("Overflow", 3).score;
    score.parts[0].measures[2].events = [kind === "note"
      ? note("whole", 0, "whole", 48)
      : { id: "whole-rest", kind: "rest", noteValue: "whole", pitch: null, startSlot: 0 }];
    const before = JSON.stringify(score);
    const shortened = model.setWorkshopMeasureContext(score, 1, { meter: "3/4" });
    if (kind === "note") assert.strictEqual(shortened, null);
    else {
      assert(shortened); assert(model.isValidWorkshopScore(shortened));
      assert.strictEqual(shortened.parts[0].measures[2].events[0].id, "whole-rest");
      assert.strictEqual(model.workshopMeasureUnits(shortened.parts[0].measures[2]), 6);
      assert(shortened.parts[0].measures[2].events.every(event => event.kind === "rest"));
    }
    assert.strictEqual(JSON.stringify(score), before);
    const clefChanged = model.setWorkshopMeasureContext(score, 1, { clef: "bass" });
    assert.deepStrictEqual(clefChanged.parts[0].measures[2].events, score.parts[0].measures[2].events);
    assert.strictEqual(model.workshopMeasureContext(clefChanged, 2).clef, "bass");
    score.parts[0].measures[2].meter = "4/4";
    assert(model.setWorkshopMeasureContext(score, 1, { meter: "3/4" }), "an explicit later meter ends inheritance");
  }
  const score = model.createWorkshopDraft("Inherited long bar", 2).score;
  score.parts[0].measures[0].meter = "3/2";
  score.parts[0].measures[1].events = [note("end", 11.5, "sixteenth")];
  assert(model.isValidWorkshopScore(score));
  assert.strictEqual(model.setWorkshopMeasureContext(score, 0, { meter: null }), null);
});

test("every move and delete position preserves each remaining bar's effective context and notes", () => {
  const score = mixedScore();
  const before = JSON.stringify(score);
  const contexts = contextsById(score);
  const originalEvents = new Map(score.parts[0].measures.map(bar => [bar.id, bar.events]));
  const originalOverrides = new Map(score.parts[0].measures.map(bar => [bar.id, {
    meter: Object.prototype.hasOwnProperty.call(bar, "meter"),
    clef: Object.prototype.hasOwnProperty.call(bar, "clef")
  }]));
  for (let from = 0; from < 6; from++) for (let to = 0; to < 6; to++) {
    if (from === to) continue;
    const moved = model.moveWorkshopMeasure(score, from, to);
    assertContextsPreserved(moved, contexts);
    assert.strictEqual(moved.parts[0].measures[to].id, score.parts[0].measures[from].id);
    let inherited = { meter: moved.meter, clef: moved.parts[0].clef };
    moved.parts[0].measures.forEach(bar => {
      assert.deepStrictEqual(bar.events, originalEvents.get(bar.id));
      for (const key of ["meter", "clef"]) {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(bar, key),
          originalOverrides.get(bar.id)[key] || contexts.get(bar.id)[key] !== inherited[key], "retain explicit " + key + " boundaries and add required changes");
      }
      inherited = contexts.get(bar.id);
    });
  }
  for (let index = 0; index < 6; index++) {
    const removed = model.removeWorkshopMeasure(score, index);
    assertContextsPreserved(removed, contexts);
    assert(!removed.parts[0].measures.some(bar => bar.id === score.parts[0].measures[index].id));
    removed.parts[0].measures.forEach(bar => assert.deepStrictEqual(bar.events, originalEvents.get(bar.id)));
  }
  assert.strictEqual(model.moveWorkshopMeasure(score, 1, 1), null);
  assert.strictEqual(model.moveWorkshopMeasure(score, 0, 6), null);
  assert.strictEqual(model.removeWorkshopMeasure(model.createWorkshopDraft().score, 0), null);
  assert.strictEqual(JSON.stringify(score), before);
});

test("moving a bar retains explicit boundaries that become temporarily redundant", () => {
  let score = model.createWorkshopDraft("Explicit boundaries", 4).score;
  score = model.setWorkshopMeasureContext(score, 1, { clef: "bass", meter: "3/4" });
  score = model.setWorkshopMeasureContext(score, 2, { clef: "treble", meter: "4/4" });
  const boundaryId = score.parts[0].measures[2].id;
  const before = JSON.stringify(score);
  const moved = model.moveWorkshopMeasure(score, 1, 3);
  assert.strictEqual(moved.parts[0].measures[1].id, boundaryId);
  assert.strictEqual(moved.parts[0].measures[1].clef, "treble");
  assert.strictEqual(moved.parts[0].measures[1].meter, "4/4");
  const edited = model.setWorkshopMeasureContext(moved, 0, { clef: "bass", meter: "6/8" });
  assert.deepStrictEqual(model.workshopMeasureContext(edited, 0), { meter: "6/8", clef: "bass", units: 6, keyId:"C-major", dynamic:"mf" });
  for (const index of [1, 2]) {
    assert.deepStrictEqual(model.workshopMeasureContext(edited, index), { meter: "4/4", clef: "treble", units: 8, keyId:"C-major", dynamic:"mf" });
  }
  assert.strictEqual(JSON.stringify(score), before);
});

test("inserted bars inherit their position without changing existing bar contexts", () => {
  const score = mixedScore();
  const before = JSON.stringify(score);
  const expected = contextsById(score);
  const inserted = model.insertWorkshopMeasures(score, 2, 2);
  assert.strictEqual(inserted.parts[0].measures.length, 8);
  for (const index of [3, 4]) {
    assert.deepStrictEqual(model.workshopMeasureContext(inserted, index), { meter: "3/4", clef: "bass", units: 6, keyId:"C-major", dynamic:"mf" });
    assert.deepStrictEqual(inserted.parts[0].measures[index].events, []);
  }
  inserted.parts[0].measures.forEach((bar, index) => {
    if (expected.has(bar.id)) assert.deepStrictEqual(model.workshopMeasureContext(inserted, index), expected.get(bar.id));
  });
  const prepended = model.insertWorkshopMeasures(score, -1);
  assert.deepStrictEqual(model.workshopMeasureContext(prepended, 0), { meter: "4/4", clef: "treble", units: 8, keyId:"C-major", dynamic:"mf" });
  assert.strictEqual(JSON.stringify(score), before);
});

test("mixed meters use cumulative time boundaries including the final incomplete bar", () => {
  const score = mixedScore();
  const before = JSON.stringify(score);
  const timeline = model.workshopTimeline(score);
  assert.deepStrictEqual(timeline.measures.map(bar => [bar.index, bar.startMs, bar.endMs]), [
    [0, 0, 4000], [1, 4000, 7000], [2, 7000, 10000],
    [3, 10000, 13000], [4, 13000, 17000], [5, 17000, 23000]
  ]);
  assert.strictEqual(timeline.durationMs, 23000);
  assert.deepStrictEqual(timeline.events.find(event => event.id === "late"), {
    id: "late", barIndex: 5, startMs: 22750, durationMs: 250, value: 71
  });
  assert.deepStrictEqual(timeline.events.find(event => event.id === null && event.barIndex === 5), {
    id: null, barIndex: 5, startMs: 17000, durationMs: 5750, value: null
  });
  timeline.measures.forEach((bar, index) => {
    assert.strictEqual(bar.units, model.workshopMeasureContext(score, index).units);
    assert.strictEqual(bar.clef, model.workshopMeasureContext(score, index).clef);
  });
  assert.strictEqual(JSON.stringify(score), before);
});

function clockedPlayback(score, barIndex) {
  const tasks = new Map();
  const starts = [];
  const steps = [];
  const stopped = [];
  let nextId = 0;
  let time = 0;
  const playback = createWorkshopPlayback(score, {
    play(value) { starts.push([time, value]); return { pause() {}, currentTime: 0 }; },
    stopAll() {}
  }, {
    barIndex, nowFn: () => time,
    setTimeoutFn(callback, delay) { const id = ++nextId; tasks.set(id, { callback, due: time + delay }); return id; },
    clearTimeoutFn(id) { tasks.delete(id); },
    onStep(event) { steps.push({ time, event }); },
    onStop() { stopped.push(time); }
  });
  return { playback, starts, steps, stopped, tasks, finish() {
    let callbacks = 0;
    while (playback.isPlaying()) {
      assert(++callbacks < 50);
      const [id, task] = Array.from(tasks).sort((left, right) => left[1].due - right[1].due)[0];
      tasks.delete(id); time = task.due; task.callback();
    }
  } };
}

test("one-bar playback rebases the selected meter's real length while retaining original identities", () => {
  const score = mixedScore();
  score.parts[0].measures[1].events = [note("middle", .5, "eighth", 36)];
  const before = JSON.stringify(score);
  for (const [index, duration, noteId, attack, value] of [[1, 3000, "middle", 250, 36], [5, 6000, "late", 5750, 71]]) {
    const run = clockedPlayback(score, index);
    assert(run.playback.start());
    run.finish();
    assert.deepStrictEqual(run.starts, [[attack, value]]);
    const sounding = run.steps.find(step => step.event.id === noteId);
    assert.strictEqual(sounding.time, attack);
    assert.strictEqual(sounding.event.startMs, attack);
    assert.strictEqual(sounding.event.barIndex, index);
    assert(run.steps.every(step => step.event.barIndex === index));
    assert.strictEqual(run.stopped[run.stopped.length - 1], duration);
    assert.strictEqual(run.tasks.size, 0);
  }
  assert.strictEqual(JSON.stringify(score), before);
});

test("optional contexts preserve schema one and old saved revisions byte for byte", () => {
  const draft = model.createWorkshopDraft("Legacy four bars", 4);
  draft.score.parts[0].measures[0].events = [{
    id: "legacy-note", kind: "note", noteValue: "quarter", pitch: { step: "C", alter: 0, octave: 4 }
  }];
  const originalScore = JSON.stringify(draft.score);
  const first = model.saveWorkshopDraft(null, draft, "2026-10-02T10:00:00.000Z");
  const originalRevision = JSON.stringify(first.piece.revisions[0]);
  const edit = model.openWorkshopPiece(first.piece);
  edit.score = model.setWorkshopMeasureContext(edit.score, 1, { meter: "3/4", clef: "bass" });
  const updated = model.saveWorkshopDraft(first.library, edit, "2026-10-02T10:01:00.000Z");
  assert.strictEqual(updated.piece.revisions.length, 2);
  assert.strictEqual(updated.piece.revisions[1].score.version, 1);
  assert.strictEqual(JSON.stringify(updated.piece.revisions[0]), originalRevision);
  assert.strictEqual(JSON.stringify(first.piece.revisions[0].score), originalScore);
  assert.strictEqual(JSON.stringify(model.openWorkshopPiece(updated.piece, first.piece.currentRevisionId).score), originalScore);
  const restored = JSON.parse(JSON.stringify(updated.library));
  assert(model.isValidWorkshopLibrary(restored));
  assert.deepStrictEqual(model.openWorkshopPiece(restored.pieces[0]).score, edit.score);
  assert.deepStrictEqual(model.mergeWorkshopLibraries(updated.library, restored), updated.library);
});

process.stdout.write("Workshop context model tests passed.\n");

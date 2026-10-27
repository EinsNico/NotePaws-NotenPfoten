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
Module._extensions[".js"] = originalLoader;

function test(name, operation) {
  operation(); process.stdout.write("✓ workshop two staves model: " + name + "\n");
}
function note(id, pitch = 48, startSlot = 0, noteValue = "quarter") {
  return { id, kind: "note", pitch: model.workshopPitchFromValue(pitch), startSlot, noteValue };
}
function contexts(score) {
  return new Map(score.parts.flatMap((part, partIndex) => part.measures.map((bar, index) => [
    bar.id, model.workshopMeasureContext(score, index, partIndex)
  ])));
}
function mixedScore() {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Two independent staves", 6).score, true);
  for (const [index, meter] of [[1, "3/4"], [3, "6/8"], [4, "2/2"], [5, "3/2"]]) {
    score = model.setWorkshopMeasureContext(score, index, { meter });
  }
  for (const [index, clef, partIndex] of [[2, "bass", 0], [4, "treble", 0], [1, "treble", 1], [3, "bass", 1]]) {
    score = model.setWorkshopMeasureContext(score, index, { clef }, partIndex);
  }
  score.parts.forEach((part, partIndex) => part.measures.forEach((bar, index) => {
    bar.events = [note("staff-" + partIndex + "-bar-" + index, partIndex ? 24 : 60, .5, "sixteenth")];
  }));
  score.parts[0].measures[0].events = [
    Object.assign(note("remembered", 48, 0, "eighth"), { originalNoteValue: "whole", beamGroupId: "first-beam" }),
    Object.assign(note("beamed", 52, 1, "sixteenth"), { beamGroupId: "first-beam" }),
    { id: "first-rest", kind: "rest", pitch: null, startSlot: 4, noteValue: "quarter" }
  ];
  assert(model.isValidWorkshopScore(score)); return score;
}

test("legacy schema-one scores and saved versions stay byte-for-byte unchanged when the second staff is added", () => {
  const draft = model.createWorkshopDraft("Legacy score", 4);
  draft.score.parts[0].measures[0].events = [{ id: "legacy-note", kind: "note", noteValue: "quarter",
    pitch: { step: "C", alter: 0, octave: 4 } }];
  const original = JSON.stringify(draft.score);
  const first = model.saveWorkshopDraft(null, draft, "2026-10-02T10:00:00.000Z");
  const before = JSON.stringify(first.library);
  const oldRevision = JSON.stringify(first.piece.revisions[0]);
  const opened = model.openWorkshopPiece(first.piece);
  opened.score = model.setWorkshopSecondStaffEnabled(opened.score, true);
  const second = model.saveWorkshopDraft(first.library, opened, "2026-10-02T10:01:00.000Z");
  assert.strictEqual(JSON.stringify(first.library), before);
  assert.strictEqual(JSON.stringify(second.piece.revisions[0]), oldRevision);
  assert.strictEqual(JSON.stringify(draft.score), original);
  assert.strictEqual(JSON.stringify(model.openWorkshopPiece(second.piece, first.piece.currentRevisionId).score), original);
  assert.strictEqual(second.piece.revisions.length, 2);
  assert.strictEqual(second.piece.revisions[1].score.version, 1);
  assert.deepStrictEqual(second.piece.revisions[1].score.parts[0], draft.score.parts[0]);
  const timeline = model.workshopTimeline(draft.score);
  assert.deepStrictEqual(timeline.events[0], { id: "legacy-note", barIndex: 0, startMs: 0, durationMs: 1000, value: 48 });
  assert(timeline.events.every(event => !Object.prototype.hasOwnProperty.call(event, "partIndex")));
});

test("enabling creates an empty bass staff with copied meters and hiding preserves all notes and clef choices", () => {
  let score = model.createWorkshopDraft("Toggle", 3).score;
  score = model.setWorkshopMeasureContext(score, 1, { meter: "6/8", clef: "bass" });
  const original = JSON.stringify(score);
  assert.deepStrictEqual(model.setWorkshopSecondStaffEnabled(score, false), score);
  assert.strictEqual(model.setWorkshopSecondStaffEnabled(score, "true"), null);
  const enabled = model.setWorkshopSecondStaffEnabled(score, true);
  assert.strictEqual(JSON.stringify(score), original);
  assert.deepStrictEqual(enabled.parts[0], score.parts[0]);
  assert.strictEqual(enabled.parts[1].id, "left"); assert.strictEqual(enabled.parts[1].clef, "bass");
  assert(enabled.parts[1].measures.every(bar => bar.events.length === 0));
  enabled.parts[1].measures.forEach((bar, index) => {
    assert.notStrictEqual(bar.id, enabled.parts[0].measures[index].id);
    assert.strictEqual(model.workshopMeasureContext(enabled, index, 1).meter,
      model.workshopMeasureContext(enabled, index).meter);
  });
  let changed = model.setWorkshopMeasureContext(enabled, 1, { clef: "treble" }, 1);
  changed.parts[1].measures[1].events = [note("second-note", 55, 1.5, "sixteenth")];
  const hidden = model.setWorkshopSecondStaffEnabled(changed, false);
  assert.deepStrictEqual(hidden.parts[1].measures, changed.parts[1].measures);
  assert.strictEqual(model.workshopMeasureContext(hidden, 1, 1).clef, "treble");
  assert.deepStrictEqual(model.workshopActiveParts(hidden).map(part => part.id), ["right"]);
  const restored = model.setWorkshopSecondStaffEnabled(hidden, true);
  assert.deepStrictEqual(restored.parts, changed.parts);
  assert.deepStrictEqual(model.workshopActiveParts(restored).map(part => part.id), ["right", "left"]);
  const withoutFlag = model.cloneWorkshop(restored); delete withoutFlag.parts[1].enabled;
  assert(model.isValidWorkshopScore(withoutFlag)); assert.strictEqual(model.workshopActiveParts(withoutFlag).length, 2);
});

test("all four clef combinations and per-staff inheritance preserve pitches while meters remain shared", () => {
  const original = mixedScore(); const source = JSON.stringify(original);
  for (const upper of model.WORKSHOP_CLEFS) for (const lower of model.WORKSHOP_CLEFS) {
    let score = model.setWorkshopMeasureContext(original, 0, { clef: upper }, 0);
    score = model.setWorkshopMeasureContext(score, 0, { clef: lower }, 1);
    assert.strictEqual(model.workshopMeasureContext(score, 0, 0).clef, upper);
    assert.strictEqual(model.workshopMeasureContext(score, 0, 1).clef, lower);
    score.parts.forEach((part, partIndex) => part.measures.forEach((bar, index) => {
      assert.deepStrictEqual(bar.events, original.parts[partIndex].measures[index].events);
    }));
  }
  let score = model.setWorkshopMeasureContext(original, 1, { clef: "bass" }, 1);
  score = model.setWorkshopMeasureContext(score, 1, { clef: null }, 1);
  assert.strictEqual(model.workshopMeasureContext(score, 2, 1).clef, "bass");
  const upperBefore = score.parts[0].measures.map((_, index) => model.workshopMeasureContext(score, index).clef);
  score = model.setWorkshopSecondStaffEnabled(score, false);
  score = model.setWorkshopMeasureContext(score, 1, { meter: "6/4" }, 1);
  for (let index = 1; index < 3; index++) {
    assert.strictEqual(model.workshopMeasureContext(score, index, 0).meter, "6/4");
    assert.strictEqual(model.workshopMeasureContext(score, index, 1).meter, "6/4");
  }
  assert.deepStrictEqual(score.parts[0].measures.map((_, index) => model.workshopMeasureContext(score, index).clef), upperBefore);
  const resolved = model.resolveWorkshopMeasure(score, 2, 1);
  assert.strictEqual(resolved.clef, "bass"); assert.strictEqual(resolved.meter, "6/4");
  resolved.events[0].pitch.step = "E";
  assert.notDeepStrictEqual(resolved.events, score.parts[1].measures[2].events);
  assert.strictEqual(model.workshopMeasureContext(score, 0, 2), null);
  assert.strictEqual(model.resolveWorkshopMeasure(score, 0, -1), null);
  assert.strictEqual(model.setWorkshopMeasureContext(score, 0, { clef: "bass" }, 2), null);
  assert.strictEqual(JSON.stringify(original), source);
});

test("shared meter changes reject hidden overflowing notes atomically and tolerate redundant imported boundaries", () => {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Overflow", 3).score, true);
  score.parts[1].measures[2].events = [note("hidden-overflow", 24, 6, "quarter")];
  score = model.setWorkshopSecondStaffEnabled(score, false);
  const before = JSON.stringify(score);
  assert.strictEqual(model.setWorkshopMeasureContext(score, 0, { meter: "3/4" }), null);
  assert.strictEqual(JSON.stringify(score), before);
  score.parts[1].measures[2].events = [];
  score.parts[1].measures[1].meter = "4/4";
  assert(model.isValidWorkshopScore(score));
  const changed = model.setWorkshopMeasureContext(score, 0, { meter: "3/4" }, 1);
  assert(changed);
  changed.parts[0].measures.forEach((_, index) => {
    assert.strictEqual(model.workshopMeasureContext(changed, index, 0).meter, "3/4");
    assert.strictEqual(model.workshopMeasureContext(changed, index, 1).meter, "3/4");
  });
});

test("insert, delete and every move synchronize whole bars and preserve independent contexts, IDs and beam data", () => {
  const score = mixedScore(); const before = JSON.stringify(score); const expectedContexts = contexts(score);
  const events = new Map(score.parts.flatMap(part => part.measures.map(bar => [bar.id, bar.events])));
  function check(next) {
    assert(next && model.isValidWorkshopScore(next));
    assert.strictEqual(next.parts[0].measures.length, next.parts[1].measures.length);
    next.parts.forEach((part, partIndex) => part.measures.forEach((bar, index) => {
      if (expectedContexts.has(bar.id)) {
        assert.deepStrictEqual(model.workshopMeasureContext(next, index, partIndex), expectedContexts.get(bar.id));
        assert.deepStrictEqual(bar.events, events.get(bar.id));
      }
      assert.strictEqual(model.workshopMeasureContext(next, index, partIndex).meter,
        model.workshopMeasureContext(next, index).meter);
    }));
  }
  for (let index = 0; index < 6; index++) check(model.removeWorkshopMeasure(score, index));
  for (let from = 0; from < 6; from++) for (let to = 0; to < 6; to++) {
    if (from === to) continue;
    const moved = model.moveWorkshopMeasure(score, from, to); check(moved);
    for (let partIndex = 0; partIndex < 2; partIndex++) {
      const ordered = score.parts[partIndex].measures.map(bar => bar.id);
      ordered.splice(to, 0, ordered.splice(from, 1)[0]);
      assert.deepStrictEqual(moved.parts[partIndex].measures.map(bar => bar.id), ordered);
    }
  }
  for (const after of [-1, 1, 5]) {
    const inserted = model.insertWorkshopMeasures(score, after, 2); check(inserted);
    inserted.parts.forEach((part, partIndex) => {
      for (let index = after + 1; index <= after + 2; index++) {
        const inherited = after >= 0 ? model.workshopMeasureContext(score, after, partIndex)
          : { meter: score.meter, clef: score.parts[partIndex].clef, units: model.workshopMeterUnits(score.meter), keyId:score.keyId, dynamic:"mf" };
        assert.deepStrictEqual(model.workshopMeasureContext(inserted, index, partIndex), inherited);
        assert.strictEqual(part.measures[index].events.length, 0);
      }
    });
  }
  const hidden = model.setWorkshopSecondStaffEnabled(score, false);
  check(model.moveWorkshopMeasure(hidden, 5, 0)); check(model.removeWorkshopMeasure(hidden, 1));
  assert.strictEqual(JSON.stringify(score), before);
});

test("simultaneous notes share cumulative mixed-meter timing and a hidden staff contributes no events", () => {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Timing", 3).score, true);
  score = model.setWorkshopMeasureContext(score, 1, { meter: "3/4" });
  score = model.setWorkshopMeasureContext(score, 2, { meter: "6/8" });
  for (let partIndex = 0; partIndex < 2; partIndex++) {
    score.parts[partIndex].measures[0].events = [note("together-" + partIndex, partIndex ? 24 : 60)];
    score.parts[partIndex].measures[1].events = [note("middle-" + partIndex, partIndex ? 28 : 64, 1, "eighth")];
    score.parts[partIndex].measures[2].events = [note("last-" + partIndex, partIndex ? 31 : 67, 5.5, "sixteenth")];
  }
  const timeline = model.workshopTimeline(score);
  assert.strictEqual(timeline.durationMs, 10000);
  assert.deepStrictEqual(timeline.measures.map(bar => [bar.startMs, bar.endMs]), [[0, 4000], [4000, 7000], [7000, 10000]]);
  assert.strictEqual(timeline.measures.length, 3);
  for (const [prefix, time, barIndex] of [["together", 0, 0], ["middle", 4500, 1], ["last", 9750, 2]]) {
    const attacks = timeline.events.filter(event => event.id && event.id.startsWith(prefix));
    assert.strictEqual(attacks.length, 2);
    assert.deepStrictEqual(attacks.map(event => event.partIndex), [0, 1]);
    assert(attacks.every(event => event.startMs === time && event.barIndex === barIndex));
  }
  assert(timeline.events.every(event => [0, 1].includes(event.partIndex)));
  const hidden = model.workshopTimeline(model.setWorkshopSecondStaffEnabled(score, false));
  assert.strictEqual(hidden.durationMs, timeline.durationMs);
  assert.deepStrictEqual(hidden.measures, timeline.measures);
  assert(hidden.events.every(event => event.partIndex === 0));
  assert.deepStrictEqual(hidden.events, timeline.events.filter(event => event.partIndex === 0));
});

test("validation rejects malformed hidden data, mismatched meter/counts and cross-staff duplicate IDs", () => {
  const score = mixedScore(); const before = JSON.stringify(score);
  const invalid = [
    next => next.parts.push(model.cloneWorkshop(next.parts[1])),
    next => { next.parts[1].enabled = "false"; },
    next => { next.parts[0].enabled = false; },
    next => { next.parts[1].id = "right"; },
    next => { next.parts[1].extra = true; },
    next => next.parts[1].measures.pop(),
    next => { next.parts[1].measures[0].meter = "3/4"; },
    next => { next.parts[1].measures[0].id = next.parts[0].measures[0].id; },
    next => { next.parts[1].measures[0].events[0].id = next.parts[0].measures[0].events[0].id; },
    next => { next.parts[1].enabled = false; next.parts[1].measures[0].events[0].pitch.octave = 9; },
    next => { next.parts[1].enabled = false; next.parts[1].measures[1].events[0].startSlot = 6; }
  ];
  for (const mutate of invalid) {
    const next = model.cloneWorkshop(score); mutate(next);
    assert.strictEqual(model.isValidWorkshopScore(next), false);
    assert.strictEqual(model.setWorkshopSecondStaffEnabled(next, true), null);
    assert.throws(() => model.workshopTimeline(next), /invalid-piece/);
  }
  assert.strictEqual(JSON.stringify(score), before);
});

test("200-bar pieces save both staves and 1000-bar scores retain their bounded synchronous operations", () => {
  const draft = model.createWorkshopDraft("Two staves, 200 bars", 200);
  draft.score = model.setWorkshopSecondStaffEnabled(draft.score, true);
  draft.score.parts.forEach((part, partIndex) => part.measures.forEach((bar, index) => {
    bar.events = [0, 2, 4, 6].map(slot => note("dense-" + partIndex + "-" + index + "-" + slot,
      partIndex ? 24 : 60, slot));
  }));
  const first = model.saveWorkshopDraft(null, draft);
  const opened = model.openWorkshopPiece(first.piece);
  opened.score = model.setWorkshopSecondStaffEnabled(opened.score, false);
  const second = model.saveWorkshopDraft(first.library, opened);
  assert(model.isValidWorkshopLibrary(second.library));
  const restored = JSON.parse(JSON.stringify(second.library));
  assert(model.isValidWorkshopLibrary(restored));
  assert.deepStrictEqual(model.openWorkshopPiece(restored.pieces[0]).score, opened.score);
  assert.deepStrictEqual(restored.pieces[0].revisions[0], first.piece.revisions[0]);
  let maximum = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("1000", 1000).score, true);
  assert(model.isValidWorkshopScore(maximum));
  assert.strictEqual(model.workshopTimeline(maximum).durationMs, 4000000);
  assert.strictEqual(model.insertWorkshopMeasures(maximum, 999, 1), null);
  maximum = model.moveWorkshopMeasure(maximum, 999, 0); assert(maximum);
  maximum = model.removeWorkshopMeasure(maximum, 999); assert(maximum);
  maximum = model.insertWorkshopMeasures(maximum, 998, 1); assert(maximum);
  assert.deepStrictEqual(maximum.parts.map(part => part.measures.length), [1000, 1000]);
  assert(model.isValidWorkshopScore(maximum));
});

process.stdout.write("Workshop two staves model tests passed.\n");

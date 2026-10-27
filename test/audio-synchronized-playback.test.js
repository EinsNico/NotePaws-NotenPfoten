const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const root = path.resolve(__dirname, "../src") + path.sep;
const original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(root)) return original(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { createNoteFlowPreviewAudition } = require("../src/model/NoteFlowPreviewAudition");
const { createNoteFlowChordAudition } = require("../src/model/NoteFlowChordAudition");
const { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");
const workshop = require("../src/model/Workshop");
Module._extensions[".js"] = original;

function clock() {
  let now = 0, id = 0;
  const pending = new Map(), callbacks = [], played = [], visuals = [], stopped = [];
  const player = {
    play(value) { const sample = { value, live: true }; played.push([now, value]); return sample; },
    stop(sample) { if (sample.live) { stopped.push([now, sample.value]); sample.live = false; } },
    stopAll() { stopped.push([now, "all"]); }
  };
  const options = {
    player, delayMs: 500,
    nowFn: () => now,
    setTimeoutFn(fn, ms) { const next = ++id; pending.set(next, { fn, due: now + ms }); callbacks.push(fn); return next; },
    clearTimeoutFn(key) { pending.delete(key); },
    onActiveNotes(ids, bar) { visuals.push([now, "notes", ids, bar]); },
    onStep(event, index, total) { visuals.push([now, "step", event.id, index, total]); },
    onRest() { visuals.push([now, "rest"]); },
    onStop() { visuals.push([now, "stop"]); }
  };
  return { options, player, pending, callbacks, played, visuals, stopped,
    advance(target) {
      assert(target >= now);
      let safety = 10000;
      while (true) {
        const ready = Array.from(pending).filter(([, timer]) => timer.due <= target)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
        if (!ready.length) break;
        assert(--safety > 0);
        const [key, timer] = ready[0]; pending.delete(key); now = timer.due; timer.fn();
      }
      now = target;
    }
  };
}
const melody = { durationMs: 1000, events: [
  { kind: "note", startMs: 0, endMs: 1000, note: { value: 36 } },
  { kind: "note", startMs: 0, endMs: 200, note: { value: 60 } },
  { kind: "note", startMs: 400, endMs: 600, note: { value: 62 } }
] };
const chords = { blocks: [{ chords: [
  { id: "one", values: [48, 52, 55] }, { id: "two", values: [50, 53, 57] }
] }] };
const rhythmScore = { measures: [{ events: [
  { kind: "note", chord: chords.blocks[0].chords[0], startMs: 0, endMs: 200 },
  { kind: "rest", startMs: 200, endMs: 400 },
  { kind: "note", chord: chords.blocks[0].chords[1], startMs: 400, endMs: 600 }
] }] };
function score(bars = 2) {
  const result = workshop.createWorkshopDraft("Audio test", bars).score;
  result.bpm = 60;
  result.parts[0].measures.forEach((bar, index) => {
    bar.events = [{ id: `n-${index}`, kind: "note", noteValue: "whole", startSlot: 0,
      pitch: workshop.workshopPitchFromValue(48 + index % 2) }];
  });
  return result;
}

{
  const c = clock(), audition = createNoteFlowPreviewAudition(melody, c.options);
  assert(audition.start());
  assert.deepStrictEqual(c.played, [[0, 36], [0, 60]]);
  assert(!c.visuals.some(row => row[1] === "notes" && row[2].length));
  c.advance(200); assert(c.stopped.some(row => row[0] === 200 && row[1] === 60));
  c.advance(499); assert(!c.visuals.some(row => row[1] === "notes" && row[2].length));
  c.advance(500); assert.deepStrictEqual(c.visuals.slice(-1)[0].slice(0, 3), [500, "notes", [0, 1]]);
  c.advance(700); assert.deepStrictEqual(c.visuals.slice(-1)[0].slice(0, 3), [700, "notes", [0]]);
  c.advance(1000); assert(audition.isPlaying(), "UI stays alive through the final output buffer");
  assert(c.stopped.some(row => row[0] === 1000 && row[1] === 36));
  c.advance(1500); assert(!audition.isPlaying()); assert.strictEqual(c.pending.size, 0);
  assert.deepStrictEqual(c.visuals.slice(-1)[0], [1500, "stop"]);
}
{
  const c = clock(), audition = createNoteFlowChordAudition(chords, Object.assign({}, c.options, { rhythmScore }));
  assert(audition.start());
  c.advance(600); assert(audition.isPlaying());
  assert.deepStrictEqual(c.visuals.filter(row => row[1] === "step"), [[500, "step", "one", 1, 2]]);
  assert(c.stopped.some(row => row[0] === 600));
  c.advance(900);
  assert.deepStrictEqual(c.visuals.filter(row => row[1] !== "stop"), [
    [500, "step", "one", 1, 2], [700, "rest"], [900, "step", "two", 2, 2]
  ]);
  c.advance(1100); assert(!audition.isPlaying()); assert.strictEqual(c.pending.size, 0);
}
{
  const c = clock(), playback = createWorkshopPlayback(score(), c.player, c.options);
  assert(playback.start()); assert.deepStrictEqual(c.played, [[0, 48]]);
  c.advance(499); assert(!c.visuals.some(row => row[1] === "step"));
  c.advance(500); assert.deepStrictEqual(c.visuals.slice(-1)[0], [500, "notes", ["n-0"], 0]);
  c.advance(4000); assert.deepStrictEqual(c.played, [[0, 48], [4000, 49]]);
  assert.strictEqual(c.visuals.slice(-1)[0][3], 0, "bar moves with audible output");
  c.advance(4500); assert.deepStrictEqual(c.visuals.slice(-1)[0], [4500, "notes", ["n-1"], 1]);
  c.advance(8000); assert(playback.isPlaying());
  assert(c.stopped.some(row => row[0] === 8000 && row[1] === 49));
  c.advance(8500); assert(!playback.isPlaying()); assert.strictEqual(c.pending.size, 0);
}
for (const create of [
  c => createNoteFlowPreviewAudition(melody, c.options),
  c => createNoteFlowChordAudition(chords, Object.assign({}, c.options, { rhythmScore })),
  c => createWorkshopPlayback(score(), c.player, c.options)
]) {
  const c = clock(), playback = create(c);
  playback.start(); c.advance(100);
  const stale = c.callbacks.slice(); playback.stop();
  assert.strictEqual(c.pending.size, 0);
  const visuals = c.visuals.length, played = c.played.length;
  stale.forEach(fn => fn()); assert.strictEqual(c.visuals.length, visuals); assert.strictEqual(c.played.length, played);
  playback.start(); const restarted = c.visuals.length, restartedPlayed = c.played.length;
  stale.forEach(fn => fn()); assert.strictEqual(c.visuals.length, restarted); assert.strictEqual(c.played.length, restartedPlayed);
  playback.stop(); assert.strictEqual(c.pending.size, 0);
}
{
  const c = clock(), playback = createWorkshopPlayback(score(200), c.player, c.options);
  playback.start();
  assert(c.pending.size <= 3, "long scores keep a bounded source/visual queue");
  c.advance(400500); assert(c.pending.size <= 3);
  playback.stop(); assert.strictEqual(c.pending.size, 0);
}
console.log("Audible-time playback: melody/chord/workshop source timing, delayed UI/end, cancellation, and bounded long-score queue OK.");

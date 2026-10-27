const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function load(module, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(module, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] });
  return module._compile(transformed.code, filename);
};
const { createAudioSynchronization, estimateOutputDelay, AUDIO_SYNC_STORAGE_KEY } = require("../src/model/AudioSynchronization");
const { createPianoSamplePlayer } = require("../src/model/PianoAudio");
const Options = require("../src/model/Options").default;
const {refreshAppSound} = require("../src/model/AppSound");
Module._extensions[".js"] = originalLoader;

function events(target = {}) {
  const listeners = {};
  return Object.assign(target, {
    addEventListener(name, handler) { (listeners[name] || (listeners[name] = [])).push(handler); },
    removeEventListener(name, handler) { listeners[name] = (listeners[name] || []).filter(item => item !== handler); },
    emit(name) { (listeners[name] || []).slice().forEach(handler => handler()); }
  });
}
function memory(saved = {}) {
  const values = { [AUDIO_SYNC_STORAGE_KEY]: saved };
  return { get(key, fallback) { return values[key] || fallback; }, set(key, value) { values[key] = value; }, values };
}
class Context {
  constructor(options) {
    events(this);
    this.options = options;
    this.state = "suspended";
    this.baseLatency = 0.01;
    this.outputLatency = 0.19;
    this.destination = {};
    this.sources = [];
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  createMediaElementSource(sample) {
    const source = { sample, destination: null, disconnected: false, connect(to) { this.destination = to; }, disconnect() { this.disconnected = true; } };
    this.sources.push(source);
    return source;
  }
}
function make(options = {}) {
  return createAudioSynchronization(Object.assign({ storage: memory(), AudioContext: Context }, options));
}
function routePlugin() {
  return {
    queries: 0, watches: 0,
    watch(success, error) { this.success = success; this.error = error; this.watches++; },
    getState(success, error) { this.queries++; this.success = success; this.error = error; },
    send(route, key, changed = false, reliable = true) { this.success({ route, key, changed, reliable }); },
    unwatch() { this.stopped = true; }
  };
}
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("requires outputLatency before describing an estimate as available", () => {
  assert.strictEqual(estimateOutputDelay({ baseLatency: 0.01 }), null);
  assert.strictEqual(estimateOutputDelay({ baseLatency: 0.01, outputLatency: NaN }), null);
  assert.strictEqual(estimateOutputDelay({ baseLatency: 0.01, outputLatency: -1 }), null);
  assert.strictEqual(estimateOutputDelay({ outputLatency: 0.3 }), 300);
  assert.strictEqual(estimateOutputDelay({ baseLatency: 0.01, outputLatency: 0.2 }), 210);
  assert.strictEqual(estimateOutputDelay({ outputLatency: 5 }), 1000);
});
test("creates one interactive context lazily, and does not revise timing on estimate jitter", async () => {
  let count = 0;
  class CountedContext extends Context { constructor(options) { super(options); count++; } }
  const sync = make({ AudioContext: CountedContext });
  assert.deepStrictEqual(sync.getSettings(), { automatic: true, manualMs: null, feedbackSound: true });
  assert.strictEqual(count, 0);
  assert.strictEqual(sync.getState().source, "unavailable");
  const context = sync.getContext();
  assert.strictEqual(sync.getContext(), context);
  assert.strictEqual(count, 1);
  assert.strictEqual(context.options.latencyHint, "interactive");
  assert.strictEqual(await sync.resume(), true);
  const revision = sync.getState().revision;
  context.outputLatency = 0.21;
  assert.strictEqual(sync.getDelayMs(), 220);
  assert.strictEqual(sync.getState().revision, revision);
});
test("normalizes manual delay, preserves unrelated settings on reset, and notifies feedback changes without revising timing", () => {
  const storage = memory();
  const sync = make({ storage });
  const revisions = [];
  const unsubscribe = sync.subscribe(state => revisions.push(state.revision));
  assert.deepStrictEqual(revisions, [0]);
  sync.updateSettings({ manualMs: 1200, feedbackSound: false, automatic: false });
  assert.strictEqual(sync.getDelayMs(), 1000);
  const revision = sync.getState().revision;
  sync.updateSettings({ feedbackSound: true });
  assert.strictEqual(sync.getState().revision, revision);
  sync.reset();
  assert.deepStrictEqual(sync.getSettings(), { automatic: false, manualMs: null, feedbackSound: true });
  assert.deepStrictEqual(Object.keys(storage.values), [AUDIO_SYNC_STORAGE_KEY]);
  unsubscribe();
  const count = revisions.length;
  sync.updateSettings({ manualMs: -10 });
  assert.strictEqual(sync.getDelayMs(), 0);
  assert.strictEqual(revisions.length, count);
});
test("revises timing when running audio is interrupted, but not for initial unlock or resumed playback", async () => {
  for (const interruptedState of ["suspended", "interrupted", "closed"]) {
    const sync = make();
    const notifications = [];
    sync.subscribe(state => notifications.push(state.revision));
    const context = sync.getContext();
    context.emit("statechange");
    assert.strictEqual(sync.getState().revision, 0, "initial suspended context must not abort its own start");
    await sync.resume();
    context.emit("statechange");
    assert.strictEqual(sync.getState().revision, 0, "unlocking a context is not an interruption");
    context.state = interruptedState;
    context.emit("statechange");
    assert.strictEqual(sync.getState().revision, 1, "running to " + interruptedState + " must stop timer-based playback");
    assert.strictEqual(notifications[notifications.length - 1], 1);
    context.emit("statechange");
    assert.strictEqual(sync.getState().revision, 1, "a repeated state event is not another interruption");
    if (interruptedState !== "closed") {
      await sync.resume();
      context.emit("statechange");
      assert.strictEqual(sync.getState().revision, 1, "resuming the same output does not cancel preparation");
    }
  }
});
test("discards automatic calibration after restart even if a session-local device ID is reused", () => {
  const plugin = routePlugin();
  const storage = memory({ automatic: true, manualMs: 400, routeKey: "headphones:7" });
  const sync = make({ storage, routePlugin: plugin });
  assert.strictEqual(sync.getSettings().manualMs, null);
  plugin.send("headphones", "headphones:7");
  assert.strictEqual(sync.getSettings().manualMs, null);
  const fixed = make({ storage: memory({ automatic: false, manualMs: 400 }) });
  assert.strictEqual(fixed.getDelayMs(), 400);
});
test("detects real native route changes and clears automatic but retains fixed overrides", () => {
  const plugin = routePlugin();
  const sync = make({ routePlugin: plugin });
  sync.getContext();
  const initialRevision = sync.getState().revision;
  plugin.send("headphones", "headphones:7");
  assert.strictEqual(sync.getState().revision, initialRevision, "initial route discovery is not a changed output");
  sync.updateSettings({ manualMs: 350 });
  const revision = sync.getState().revision;
  plugin.send("headphones", "headphones:7");
  assert.strictEqual(sync.getDelayMs(), 350);
  assert.strictEqual(sync.getState().revision, revision);
  plugin.send("speaker", "speaker:1", true);
  assert.strictEqual(sync.getSettings().manualMs, null);
  assert.strictEqual(sync.getDelayMs(), 200);
  assert(sync.getState().revision > revision);
  sync.updateSettings({ automatic: false, manualMs: 450 });
  plugin.send("headphones", "headphones:8", true);
  assert.strictEqual(sync.getDelayMs(), 450);
  sync.dispose();
  assert(plugin.stopped);
});
test("takes back unreliable route claims and invalidates automatic calibration on lost certainty", () => {
  const plugin = routePlugin();
  const sync = make({ routePlugin: plugin });
  plugin.send("headphones", "headphones:7");
  sync.updateSettings({ manualMs: 300 });
  plugin.send("unknown", "unknown", false, false);
  assert.strictEqual(sync.getState().route, "unknown");
  assert.strictEqual(sync.getState().routeReliable, false);
  assert.strictEqual(sync.getSettings().manualMs, null);
  sync.updateSettings({ manualMs: 280 });
  plugin.send("unknown", "unknown", false, false);
  assert.strictEqual(sync.getDelayMs(), 280, "repeated unknown state must not erase a fresh same-session measurement");
  plugin.send("headphones", "headphones:7");
  sync.updateSettings({ automatic: false, manualMs: 320 });
  plugin.error(new Error("No active output"));
  assert.strictEqual(sync.getState().routeReliable, false);
  assert.strictEqual(sync.getDelayMs(), 320);
  sync.updateSettings({ automatic: true, manualMs: 300 });
  plugin.send("unknown", "unknown", true, false);
  assert.strictEqual(sync.getSettings().manualMs, null, "a native device-change event invalidates an unknown route too");
});
test("browser availability changes never claim headphones and conservatively invalidate unknown routes", () => {
  const mediaDevices = events();
  const sync = make({ navigator: { mediaDevices } });
  sync.updateSettings({ manualMs: 300 });
  mediaDevices.emit("devicechange");
  assert.strictEqual(sync.getSettings().manualMs, null);
  assert.strictEqual(sync.getState().route, "unknown");
  sync.updateSettings({ automatic: false, manualMs: 310 });
  mediaDevices.emit("devicechange");
  assert.strictEqual(sync.getDelayMs(), 310);
  const native = routePlugin();
  const known = make({ navigator: { mediaDevices }, routePlugin: native });
  native.send("speaker", "speaker:1");
  known.updateSettings({ manualMs: 90 });
  mediaDevices.emit("devicechange");
  assert.strictEqual(known.getDelayMs(), 90, "an unused available device is not a proven route change");
  known.getContext().emit("sinkchange");
  assert.strictEqual(known.getSettings().manualMs, null);
});
test("queries native output on app resume rather than starting a probe on every piano note", async () => {
  const document = events();
  const plugin = routePlugin();
  const sync = make({ document, routePlugin: plugin });
  assert.strictEqual(plugin.watches, 1);
  await sync.resume();
  const queries = plugin.queries;
  await sync.resume();
  await sync.resume();
  assert.strictEqual(plugin.queries, queries);
  document.emit("resume");
  assert.strictEqual(plugin.queries, queries + 1);
});
test("contains synchronous and asynchronous context resume failures", async () => {
  class Rejected extends Context { resume() { return Promise.reject(new Error("denied")); } }
  class Throws extends Context { resume() { throw new Error("denied"); } }
  assert.strictEqual(await make({ AudioContext: Rejected }).resume(), false);
  assert.strictEqual(await make({ AudioContext: Throws }).resume(), false);
  assert.strictEqual(await createAudioSynchronization({ window: {}, storage: memory() }).resume(), false);
  const noStorage = make({ storage: { get() { throw new Error("denied"); }, set() { throw new Error("full"); } } });
  assert.strictEqual(noStorage.updateSettings({ manualMs: 200 }).delayMs, 200);
});

class Sample {
  constructor() { events(this); this.currentTime = 0; this.played = 0; }
  play() { this.played++; return Promise.resolve(); }
  pause() { this.paused = true; }
}
test("piano input and previews follow the same master instead of the obsolete feedback setting", async () => {
  const sync = make();
  sync.updateSettings({ feedbackSound: false });
  const player = createPianoSamplePlayer({ AudioConstructor: Sample, audioSynchronization: sync });
  Options.sound=true; refreshAppSound();
  const sample = player.play(48, 35, {feedback:true});
  assert(sample);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(sample.played, 1);
  assert.strictEqual(sample.volume, 0.35);
  assert.strictEqual(sample.muted,false);
  const source = sync.getContext().sources[0];
  assert.strictEqual(source.sample, sample);
  assert.strictEqual(source.destination, sync.getContext().destination);
  sample.emit("ended");
  assert.strictEqual(source.disconnected, true);
  assert.strictEqual(player.getActiveVoiceCount(), 0);
  const feedbackPlayer = createPianoSamplePlayer({ AudioConstructor: Sample, audioSynchronization: sync, feedback: true });
  const feedback=feedbackPlayer.play(48,100);
  Options.sound=false; refreshAppSound(); assert.strictEqual(feedback.muted,true);
  const preview=feedbackPlayer.play(48,100,{feedback:false}); assert.strictEqual(preview.muted,true);
  feedbackPlayer.stopAll();
});
test("stopping a piano sample while resume is pending prevents delayed playback", async () => {
  let finish;
  const context = new Context({});
  const sync = { getContext: () => context, getSettings: () => ({ feedbackSound: true }), resume: () => new Promise(resolve => { finish = resolve; }) };
  const player = createPianoSamplePlayer({ AudioConstructor: Sample, audioSynchronization: sync });
  const sample = player.play(48, 100);
  player.stopAll();
  finish(true);
  await Promise.resolve();
  assert.strictEqual(sample.played, 0);
  assert.strictEqual(context.sources[0].disconnected, true);
});
test("piano keeps an HTMLAudio fallback when Web Audio routing is unsupported", () => {
  const sync = { getContext: () => null, getSettings: () => ({ feedbackSound: true }) };
  const player = createPianoSamplePlayer({ AudioConstructor: Sample, audioSynchronization: sync });
  assert.strictEqual(player.play(48, 100).played, 1);
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    process.stdout.write(`✓ ${entry.name}\n`);
  }
  process.stdout.write("Audio synchronization tests passed.\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });

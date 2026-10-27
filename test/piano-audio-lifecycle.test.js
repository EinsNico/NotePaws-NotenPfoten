const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function load(module, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(module, filename);
  return module._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { createPianoSamplePlayer } = require("../src/model/PianoAudio");
Module._extensions[".js"] = originalLoader;

const tests = [];
function test(name, run) { tests.push({ name, run }); }
async function settle() { await Promise.resolve(); await Promise.resolve(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mediaEnvironment(options = {}) {
  const elements = [], starts = [], decoders = new Set(), contexts = [];
  const bound = new WeakSet();
  let peakDecoders = 0;
  class NativeMedia {}
  class Sample extends NativeMedia {
    constructor(src) {
      super();
      this.listeners = new Map(); this.paused = true; this.currentTime = 0;
      this.volume = 1; this.playbackRate = 1; this.preservesPitch = true;
      this.playQueue = []; this.pauses = 0; this.loads = 0;
      elements.push(this); this.src = src;
    }
    get src() { return this.url; }
    set src(url) {
      this.url = url; this.error = null; this.ended = false; this.currentTime = 0;
      this.readyState = options.deferMetadata ? 0 : 1;
      this.duration = options.deferMetadata ? NaN : (options.duration || 8);
      if (url) decoders.add(this);
      peakDecoders = Math.max(peakDecoders, decoders.size);
      assert(decoders.size <= (options.decoderLimit || 32), "native media decoder resource ceiling exceeded");
    }
    removeAttribute(name) { assert.strictEqual(name, "src"); this.url = ""; }
    load() {
      this.loads++;
      if (!this.src) {
        decoders.delete(this); this.readyState = 0; this.duration = NaN; this.error = null;
      }
    }
    addEventListener(name, handler) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(handler);
    }
    removeEventListener(name, handler) { if (this.listeners.has(name)) this.listeners.get(name).delete(handler); }
    emit(name) { Array.from(this.listeners.get(name) || []).forEach(handler => handler()); }
    play() {
      this.paused = false; this.ended = false;
      starts.push({ sample: this, src: this.src, offset: this.currentTime, volume: this.volume, rate: this.playbackRate });
      return this.playQueue.length ? this.playQueue.shift() : Promise.resolve();
    }
    pause() { this.paused = true; this.pauses++; }
    finish() { this.ended = true; this.emit("ended"); }
    metadata(duration = 8) { this.readyState = 1; this.duration = duration; this.emit("loadedmetadata"); }
    fail() { this.error = { code: 3 }; this.emit("error"); }
  }
  function createContext() {
    const context = {
      state: "running", destination: {}, sources: [], closed: 0,
      close() { this.closed++; this.state = "closed"; },
      createMediaElementSource(sample) {
        assert(!bound.has(sample), "a native media element must only be bound once");
        bound.add(sample);
        const source = {
          sample, connections: 0, connected: false,
          connect(destination) { assert.strictEqual(destination, context.destination); this.connections++; this.connected = true; },
          disconnect() { this.connected = false; }
        };
        this.sources.push(source); return source;
      }
    };
    contexts.push(context); return context;
  }
  let context = createContext(), resumeCalls = 0;
  const sync = {
    getContext: () => context,
    getSettings: () => ({ feedbackSound: true }),
    resume() { resumeCalls++; context.state = "running"; return Promise.resolve(true); }
  };
  return {
    NativeMedia, Sample, elements, starts, decoders, contexts, sync,
    get context() { return context; }, get peakDecoders() { return peakDecoders; }, get resumeCalls() { return resumeCalls; },
    replaceContext() { context = createContext(); return context; },
    player(settings = {}) { return createPianoSamplePlayer(Object.assign({ AudioConstructor: Sample, audioSynchronization: sync }, settings)); }
  };
}

test("1603 piano attacks keep native media elements and source nodes bounded by concurrent voices", () => {
  const env = mediaEnvironment(), prior = global.HTMLMediaElement;
  global.HTMLMediaElement = env.NativeMedia;
  try {
    const player = env.player({ maxVoices: 128 }), held = [];
    for (let index = 0; index < 1603; index++) {
      if (held.length === 4) player.stop(held.shift());
      held.push(player.play(24 + index % 48, 75));
      assert(player.getActiveVoiceCount() <= 4);
    }
    assert.strictEqual(env.starts.length, 1603);
    assert.strictEqual(env.elements.length, 4);
    assert.strictEqual(env.context.sources.length, 4);
    assert.strictEqual(env.peakDecoders, 4);
    assert.strictEqual(env.resumeCalls, 0, "a running context should not enqueue a resume for every note");
    player.stopAll();
    assert.strictEqual(player.getActiveVoiceCount(), 0);
    assert.strictEqual(env.decoders.size, 0);
    assert(env.elements.every(sample => sample.paused && sample.src === "" && sample.loads > 0));
    assert(env.context.sources.every(source => !source.connected));
    assert.strictEqual(env.context.closed, 0, "the shared AudioContext belongs to the synchronization service");
  } finally { global.HTMLMediaElement = prior; }
});

test("old ended, stolen and pedalled note handles cannot stop or alter a reused voice", () => {
  const env = mediaEnvironment(), player = env.player({ maxVoices: 1, reuseSamples: true });
  const first = player.play(48, 80), element = env.elements[0];
  const ended = Array.from(element.listeners.get("ended"))[0];
  element.finish();
  const second = player.play(55, 45);
  assert.notStrictEqual(first, second); assert.strictEqual(env.elements.length, 1);
  player.stop(first); first.pause(); first.volume = 0; first.currentTime = 5; ended();
  assert.strictEqual(second.paused, false); assert.strictEqual(second.volume, 0.45);
  assert.strictEqual(second.currentTime, 0); assert.strictEqual(player.getActiveVoiceCount(), 1);
  // Even a browser-queued native event is harmless after src/currentTime reset.
  element.emit("ended"); element.emit("error");
  assert.strictEqual(player.getActiveVoiceCount(), 1);
  const third = player.play(60, 90);
  assert.strictEqual(second.paused, true);
  player.stop(second); second.volume = 0;
  assert.strictEqual(third.paused, false); assert.strictEqual(third.volume, 0.9);
  assert.strictEqual(env.context.sources.length, 1);
  player.stop(third); player.stop(third); player.stopAll();
  assert.strictEqual(player.getActiveVoiceCount(), 0); assert.strictEqual(env.decoders.size, 0);
});

test("repeated stop/start clears native media resources while reusing each source binding", () => {
  const env = mediaEnvironment(), player = env.player({ reuseSamples: true });
  for (let index = 0; index < 100; index++) {
    player.play(48 + index % 12, 35); player.play(60 + index % 12, 35);
    player.stopAll();
    assert.strictEqual(env.decoders.size, 0); assert.strictEqual(player.getActiveVoiceCount(), 0);
  }
  assert.strictEqual(env.starts.length, 200); assert.strictEqual(env.elements.length, 2);
  assert.strictEqual(env.context.sources.length, 2); assert.strictEqual(env.context.closed, 0);
});

test("a reused sample resets fractional pitch and retains isolated per-note expression", () => {
  const env = mediaEnvironment(), player = env.player({ reuseSamples: true, allowFractionalPitch: true });
  const quarterTone = player.play(48.5, 35);
  assert.strictEqual(quarterTone.src, "static/samples/piano/48.mp3");
  assert(Math.abs(quarterTone.playbackRate - Math.pow(2, 0.5 / 12)) < 1e-12);
  assert.strictEqual(quarterTone.preservesPitch, false);
  player.stop(quarterTone);
  const ordinary = player.play(55, 80);
  assert.strictEqual(env.elements.length, 1); assert.strictEqual(ordinary.playbackRate, 1);
  assert.strictEqual(ordinary.preservesPitch, true); assert.strictEqual(ordinary.mozPreservesPitch, true);
  assert.strictEqual(ordinary.webkitPreservesPitch, true);
  ordinary.volume = 0.3; quarterTone.volume = 0.1;
  assert.strictEqual(env.elements[0].volume, 0.3); player.stopAll();
});

test("a pending resume cannot start a stopped or replaced note later", async () => {
  const env = mediaEnvironment(), pending = [];
  env.context.state = "suspended";
  env.sync.resume = () => { const task = deferred(); pending.push(task); return task.promise; };
  const player = env.player({ reuseSamples: true, maxVoices: 1 });
  const first = player.play(48, 100); player.stop(first);
  const second = player.play(55, 100);
  pending[0].resolve(true); await settle();
  assert.strictEqual(env.starts.length, 0);
  env.context.state = "running"; pending[1].resolve(true); await settle();
  assert.deepStrictEqual(env.starts.map(start => start.src), ["static/samples/piano/55.mp3"]);
  player.stop(second); player.stopAll();
});

test("failed context resumes and stale play promise rejections release only their own lease", async () => {
  const env = mediaEnvironment(), player = env.player({ reuseSamples: true, maxVoices: 1 });
  env.context.state = "suspended"; env.sync.resume = () => Promise.resolve(false);
  const denied = player.play(48, 100); await settle();
  assert.strictEqual(denied.paused, true); assert.strictEqual(env.starts.length, 0);
  assert.strictEqual(player.getActiveVoiceCount(), 0); assert.strictEqual(env.decoders.size, 0);
  env.context.state = "running";
  const oldPlay = deferred(); env.elements[0].playQueue.push(oldPlay.promise);
  const old = player.play(48, 100); player.stop(old);
  const current = player.play(52, 100);
  oldPlay.reject(new Error("interrupted by src change")); await settle();
  assert.strictEqual(current.paused, false); assert.strictEqual(player.getActiveVoiceCount(), 1);
  env.elements[0].fail();
  assert.strictEqual(current.paused, true); assert.strictEqual(player.getActiveVoiceCount(), 0);
  assert.strictEqual(env.decoders.size, 0); player.stopAll();
});

test("resume offsets wait for metadata and keep the recorded decay without repeating the attack", () => {
  const env = mediaEnvironment({ deferMetadata: true }), player = env.player({ reuseSamples: true, allowFractionalPitch: true });
  const offset = 2.5 * Math.pow(2, 0.5 / 12);
  const sample = player.play(48.5, 40, { offsetSeconds: offset });
  assert.strictEqual(env.starts.length, 0);
  env.elements[0].metadata(8);
  assert.strictEqual(env.starts.length, 1); assert.strictEqual(env.starts[0].offset, offset);
  assert.strictEqual(env.starts[0].volume, 0.4); assert.strictEqual(sample.currentTime, offset);
  env.elements[0].emit("loadedmetadata");
  assert.strictEqual(env.starts.length, 1, "metadata updates must not retrigger a sample");
  player.stopAll();
});

test("an already decayed note stays silent at and beyond the media duration", () => {
  for (const deferMetadata of [false, true]) {
    const env = mediaEnvironment({ deferMetadata, duration: 8 }), player = env.player({ reuseSamples: true });
    for (const offsetSeconds of [8, 12, 100]) {
      const sample = player.play(48, 100, { offsetSeconds });
      if (deferMetadata) env.elements[0].metadata(8);
      assert.strictEqual(env.starts.length, 0); assert.strictEqual(sample.paused, true);
      assert.strictEqual(player.getActiveVoiceCount(), 0);
    }
    player.stopAll(); assert.strictEqual(env.decoders.size, 0);
  }
});

test("metadata and resume may arrive in either order, and late metadata cannot revive cancelled playback", async () => {
  for (const metadataFirst of [false, true]) {
    const env = mediaEnvironment({ deferMetadata: true }), task = deferred();
    env.context.state = "suspended"; env.sync.resume = () => task.promise;
    const player = env.player({ reuseSamples: true });
    player.play(48, 60, { offsetSeconds: 1.5 });
    if (metadataFirst) env.elements[0].metadata();
    task.resolve(true); await settle();
    if (!metadataFirst) env.elements[0].metadata();
    assert.strictEqual(env.starts.length, 1); assert.strictEqual(env.starts[0].offset, 1.5);
    player.stopAll();
  }
  const env = mediaEnvironment({ deferMetadata: true }), player = env.player({ reuseSamples: true });
  const cancelled = player.play(48, 100, { offsetSeconds: 2 });
  const staleMetadata = Array.from(env.elements[0].listeners.get("loadedmetadata"))[0];
  player.stopAll();
  const current = player.play(52, 100, { offsetSeconds: 3 });
  staleMetadata();
  assert.strictEqual(env.starts.length, 0); assert.strictEqual(cancelled.paused, true);
  env.elements[0].metadata();
  assert.strictEqual(env.starts.length, 1); assert.strictEqual(current.currentTime, 3);
  player.stopAll();
});

test("a replaced shared context receives a fresh element instead of a forbidden second source binding", () => {
  const env = mediaEnvironment(), player = env.player({ reuseSamples: true });
  player.play(48, 100); player.stopAll();
  const original = env.context, replacement = env.replaceContext();
  player.play(52, 100);
  assert.strictEqual(env.elements.length, 2); assert.strictEqual(env.decoders.size, 1);
  assert.strictEqual(original.sources.length, 1); assert.strictEqual(replacement.sources.length, 1);
  assert.strictEqual(original.closed, 0); assert.strictEqual(replacement.closed, 0);
  player.stopAll();
});

test("custom immutable sample constructors retain separate per-note instances and explicit media release", () => {
  const env = mediaEnvironment(), prior = global.HTMLMediaElement;
  delete global.HTMLMediaElement;
  try {
    const player = env.player();
    const first = player.play(48, 50); player.stop(first);
    const second = player.play(55, 50);
    assert.strictEqual(first, env.elements[0]); assert.strictEqual(second, env.elements[1]);
    assert.strictEqual(env.elements.length, 2); assert.strictEqual(env.decoders.size, 1);
    player.stopAll(); assert.strictEqual(env.decoders.size, 0);
  } finally { global.HTMLMediaElement = prior; }
});

(async () => {
  for (const { name, run } of tests) {
    try { await run(); process.stdout.write(`✓ ${name}\n`); }
    catch (error) { process.stderr.write(`✗ ${name}\n`); throw error; }
  }
  process.stdout.write("Piano audio lifecycle tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });

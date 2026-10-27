const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(module, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(module, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return module._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const piano = loadEsModule(
  path.resolve(__dirname, "../src/model/PianoAudio.js")
);

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.volume = null;
    this.paused = false;
    this.currentTime = 4;
    this.listeners = {};
    FakeAudio.instances.push(this);
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  play() {
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}
FakeAudio.instances = [];

test("moves unavailable octaves into the existing piano sample range", () => {
  assert.strictEqual(piano.normalizePianoSampleValue(84), 60);
  assert.strictEqual(piano.normalizePianoSampleValue(-3), 9);
  assert.strictEqual(piano.normalizePianoSampleValue(69), 69);
});

test("plays samples with the global app volume", () => {
  const player = piano.createPianoSamplePlayer({
    AudioConstructor: FakeAudio
  });
  const sample = player.play(84, 35);
  assert.strictEqual(sample.src, "static/samples/piano/60.mp3");
  assert.strictEqual(sample.volume, 0.35);
  assert.strictEqual(player.getActiveVoiceCount(), 1);
});

test("supports short polyphony and stops every active sample", () => {
  const player = piano.createPianoSamplePlayer({
    AudioConstructor: FakeAudio,
    maxVoices: 2
  });
  const first = player.play(48, 100);
  const second = player.play(52, 100);
  const third = player.play(55, 100);
  assert.strictEqual(first.paused, true);
  assert.strictEqual(player.getActiveVoiceCount(), 2);
  player.stopAll();
  assert.strictEqual(second.paused, true);
  assert.strictEqual(third.paused, true);
  assert.strictEqual(player.getActiveVoiceCount(), 0);
});

process.stdout.write("Piano audio tests passed.\n");

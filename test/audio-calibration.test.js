const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const filename = path.resolve(__dirname, "../src/model/AudioCalibration.js");
const transformed = babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] });
const exported = { exports: {} };
new Function("module", "exports", "require", transformed.code)(exported, exported.exports,
  name => name === "./AppSound" ? { getAppAudioDestination:context=>context.destination } : require(name));
const { analyzeCalibrationOffsets, createAudioCalibration, audioTimeToPerformanceTime } = exported.exports;
function test(name, run) { run(); process.stdout.write(`✓ ${name}\n`); }

test("uses robust median and MAD to exclude a few accidental taps", () => {
  const values = Array.from({ length: 18 }, (_, index) => 240 + (index % 5 - 2) * 4).concat([710, 950]);
  const result = analyzeCalibrationOffsets(values);
  assert.strictEqual(result.ok, true);
  assert(Math.abs(result.delayMs - 240) <= 4);
  assert.strictEqual(result.acceptedCount, 18);
  assert(result.spreadMs <= 8);
});
test("rejects too few taps, invalid delays, broad scatter, and an entire beat of error", () => {
  assert.strictEqual(analyzeCalibrationOffsets(Array(13).fill(200)).reason, "too-few-samples");
  assert.strictEqual(analyzeCalibrationOffsets(Array(20).fill(1200)).ok, false);
  assert.strictEqual(analyzeCalibrationOffsets(Array(20).fill(-50)).ok, false);
  assert.strictEqual(analyzeCalibrationOffsets(Array.from({ length: 20 }, (_, index) => index * 50)).reason, "unstable");
  assert.strictEqual(analyzeCalibrationOffsets(Array(14).fill(200).concat(Array(6).fill(NaN))).ok, false);
  assert.strictEqual(analyzeCalibrationOffsets(Array(14).fill(200)).ok, true);
  assert.strictEqual(analyzeCalibrationOffsets(Array(20).fill(1000)).delayMs, 1000);
});
test("maps scheduled source time without adding or subtracting hardware latency", () => {
  const context = { currentTime: 8, outputLatency: 0.4, getOutputTimestamp() { throw new Error("must not use post-output clock"); } };
  assert.strictEqual(audioTimeToPerformanceTime(context, 8.25, () => 1500), 1750);
});

function fixture() {
  let clock = 1000;
  const pending = new Map();
  const tones = [];
  let id = 0;
  const context = {
    currentTime: 10, state: "running", destination: {}, outputLatency: 0.4,
    createOscillator() {
      const tone = { frequency: { setValueAtTime(value) { tone.pitch = value; } }, connect() {}, disconnect() { tone.disconnected = true; }, start(time) { tone.time = time; }, stop() { tone.stopped = true; } };
      tones.push(tone);
      return tone;
    },
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  };
  const updates = [];
  const session = createAudioCalibration({ context, now: () => clock, setTimeout(callback, delay) { pending.set(++id, { callback, at: clock + delay }); return id; }, clearTimeout(timer) { pending.delete(timer); }, onUpdate: state => updates.push(state) });
  return { session, context, pending, tones, updates,
    setClock(value) { clock = value; },
    finish() { const final = Array.from(pending.values()).sort((a, b) => b.at - a.at)[0]; clock = final.at; final.callback(); }
  };
}
test("schedules four warmup clicks and twenty measurement clicks and reports measured source offset", () => {
  const f = fixture();
  assert.strictEqual(f.session.start(), true);
  assert.strictEqual(f.tones.length, 24);
  assert.strictEqual(f.tones[0].pitch, 660);
  assert.strictEqual(f.tones[4].pitch, 880);
  f.session.tap(1300);
  assert.strictEqual(f.session.getState().samplesTaken, 0);
  const firstMeasured = 1000 + (f.tones[4].time - 10) * 1000;
  for (let index = 0; index < 20; index++) f.session.tap(firstMeasured + index * 1100 + 260 + (index % 3 - 1) * 4);
  assert.strictEqual(f.session.getState().phase, "complete");
  assert.strictEqual(f.session.getResult().ok, true);
  assert.strictEqual(f.session.getResult().delayMs, 260);
  assert.strictEqual(f.pending.size, 0);
  assert(f.tones.every(tone => tone.disconnected));
});
test("does not wrap consistently one-beat-late taps onto a different beat", () => {
  const f = fixture();
  f.session.start();
  const reference = 1000 + (f.tones[4].time - 10) * 1000;
  for (let index = 0; index < 20; index++) f.session.tap(reference + index * 1100 + 1250);
  assert.strictEqual(f.session.getResult().ok, false);
});
test("timeout rejects incomplete measurements and stop cancels all scheduled audio", () => {
  const f = fixture();
  f.session.start();
  f.finish();
  assert.strictEqual(f.session.getResult().reason, "too-few-samples");
  f.session.start();
  f.session.stop();
  assert.strictEqual(f.pending.size, 0);
  assert.strictEqual(f.session.getState().running, false);
  assert.strictEqual(f.session.getState().phase, "stopped");
  f.context.state = "suspended";
  assert.strictEqual(f.session.start(), false);
  assert.strictEqual(f.session.getResult(), null);
  assert.strictEqual(f.session.getState().running, false);
});
process.stdout.write("Audio calibration tests passed.\n");

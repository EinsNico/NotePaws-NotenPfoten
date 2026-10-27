const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

const filename = path.resolve(__dirname, "../src/model/MusicParallax.js");
const backdrop = fs.readFileSync(
  path.resolve(__dirname, "../src/components/HomeMusicBackdrop.vue"), "utf8"
);
const source = babel.transform(fs.readFileSync(filename, "utf8"), {
  babelrc: false,
  presets: [["env", { modules: "commonjs" }]]
}).code;
const model = { exports: {} };
new Function("module", "exports", source)(model, model.exports);
const { getMusicParallaxOffsets } = model.exports;

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

test("starts every scroll layer at its resting position", () => {
  const offsets = getMusicParallaxOffsets(0);
  Object.keys(offsets).forEach(key => assert.strictEqual(offsets[key], 0));
});

test("moves the complete decoration together behind the foreground", () => {
  const before = getMusicParallaxOffsets(200);
  const after = getMusicParallaxOffsets(800);
  assert.notDeepStrictEqual(after, before);
  assert(after.sceneY < before.sceneY);
  assert.strictEqual(after.sceneY, -144);
  assert(Math.abs(after.sceneY) < 800);
  assert.strictEqual((backdrop.match(/class="music-scroll-layer"/g) || []).length, 1);
  assert(backdrop.includes('ref="sceneLayer"'));
  assert(backdrop.includes('class="music-ornament music-ornament-upper"'));
  assert(backdrop.includes('class="music-ornament music-ornament-lower"'));
  assert.strictEqual((backdrop.match(/<g class="music-staff /g) || []).length, 2);
  assert(backdrop.includes('.music-ornament-upper { animation: home-ornament-drift 44s'));
  assert(backdrop.includes('.music-ornament-lower { animation: home-ornament-drift 52s'));
  assert(!backdrop.includes("home-clef-drift"));
  assert(!backdrop.includes("home-note-track-lower"));
});

test("keeps the decoration bounded and accepts invalid scroll positions", () => {
  assert.deepStrictEqual(getMusicParallaxOffsets(-30), getMusicParallaxOffsets(0));
  assert.deepStrictEqual(getMusicParallaxOffsets("invalid"), getMusicParallaxOffsets(0));
  [1000, 10000, 100000].forEach(scrollY => {
    const offsets = getMusicParallaxOffsets(scrollY);
    assert(Math.abs(offsets.sceneY) <= 216);
  });
  assert.deepStrictEqual(getMusicParallaxOffsets(1200), getMusicParallaxOffsets(100000));
});

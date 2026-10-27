const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
const source = fs.readFileSync(path.join(__dirname, "../src/model/PrestigeProgress.js"), "utf8");
const compiled = babel.transform(source, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { createPrestigeProgress: project } = mod.exports;
for (const [count, available, remainder, remaining] of [
  [0, 0, 0, 100000], [99999, 0, 99999, 1],
  [100000, 1, 0, 100000], [350000, 3, 50000, 50000],
  [505000, 5, 5000, 95000], [1050000, 10, 50000, 50000]
]) {
  const value = project({ notes: count });
  assert.strictEqual(value.currentPrestige, 0);
  assert.strictEqual(value.availablePrestiges, available);
  assert.strictEqual(value.remainder, remainder);
  assert.strictEqual(value.entriesUntilNextPrestige, remaining);
  assert.strictEqual(value.archivableEntries + value.remainder, count);
}
const mixed = { screen: 304000, midi: 0, rhythm: 201000, chords: 0 };
assert.strictEqual(project(mixed).detailEntries, 505000);
assert.deepStrictEqual(mixed, { screen: 304000, midi: 0, rhythm: 201000, chords: 0 });
const after = project({ remaining: 50000 }, 3);
assert.strictEqual(after.currentPrestige, 3);
assert.strictEqual(after.availablePrestiges, 0);
assert.strictEqual(after.nextPrestige, 4);
const repeated = project({ notes: 150000 }, 3);
assert.strictEqual(repeated.prestigeAfterArchiving, 4);
assert.strictEqual(repeated.remainder, 50000);
for (const counts of [{ notes: -1 }, { notes: 1.5 }, { notes: NaN },
  { notes: Number.MAX_SAFE_INTEGER, rhythm: 1 }]) assert.throws(() => project(counts));
assert.throws(() => project({}, -1));
assert.throws(() => project({}, Number.MAX_SAFE_INTEGER));
process.stdout.write("Prestige counter tests passed. No archive writes or deletions.\n");

const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function loadProjectModule(mod, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(mod, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return mod._compile(transformed.code, filename);
};
const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader.js");
Module._extensions[".js"] = originalLoader;

const storage = { length: 0, key: () => null, getItem: () => null };
const backup = createSaveDataBackup(storage, { createdAt: "2026-09-28T12:00:00.000Z" });
backup.version = 4;
backup.data.adaptiveHistory = {
  version: 1,
  baselines: [],
  evaluations: [{ id: "note-1", exercise: { clef: "bass" }, text: 'Klammer ] und "' }]
};
backup.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
backup.data.rhythmSenseBars = [{ id: "bar-1", notes: [{ beat: 0, value: "whole" }] }];

const json = JSON.stringify(backup, null, 2);
for (const size of [1, 2, 7, 64, 4096]) {
  const items = [];
  const reader = new SaveDataStreamReader((section, item) => items.push({ section, item }));
  for (let index = 0; index < json.length; index += size) {
    reader.push(json.slice(index, index + size));
  }
  const result = reader.finish();
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items.map(entry => entry.section), [
    "data.adaptiveHistory.evaluations", "data.rhythmSenseBars"
  ]);
  assert.deepStrictEqual(items[0].item, backup.data.adaptiveHistory.evaluations[0]);
  assert.deepStrictEqual(items[1].item, backup.data.rhythmSenseBars[0]);
  assert.deepStrictEqual(result.backup.data.adaptiveHistory.evaluations, []);
  assert.deepStrictEqual(result.backup.data.rhythmSenseBars, []);
  assert.strictEqual(result.counts["data.rhythmSenseBars"], 1);
}

const malformed = JSON.stringify(backup).replace('"rhythmSenseBars":[{', '"rhythmSenseBars":[,{');
const badReader = new SaveDataStreamReader(() => {});
assert.throws(() => badReader.push(malformed), SyntaxError);
const truncated = new SaveDataStreamReader(() => {});
truncated.push(json.slice(0, -1));
assert.throws(() => truncated.finish(), SyntaxError);

if (process.argv.includes("--stress")) {
  const stress = createSaveDataBackup(storage, { createdAt: "2026-09-28T12:00:00.000Z" });
  stress.version = 4;
  stress.data.adaptiveHistory = { version: 1, baselines: [], evaluations: ["__NOTES__"] };
  stress.data.rhythmSenseBars = ["__BARS__"];
  const source = JSON.stringify(stress);
  const firstMarker = '"__NOTES__"';
  const secondMarker = '"__BARS__"';
  const first = source.indexOf(firstMarker);
  const second = source.indexOf(secondMarker);
  assert(first >= 0 && second > first);
  let count = 0;
  const reader = new SaveDataStreamReader(() => { count += 1; });
  const feed = part => {
    for (let offset = 0; offset < part.length; offset += 65536) {
      reader.push(part.slice(offset, offset + 65536));
    }
  };
  feed(source.slice(0, first));
  const note = JSON.stringify({ id: "n", completedAt: 1, exercise: { clef: "bass" } });
  for (let index = 0; index < 100000; index += 1) feed(`${index ? "," : ""}${note}`);
  feed(source.slice(first + firstMarker.length, second));
  const bar = JSON.stringify({ id: "b", sessionId: "s", notes: [{ beat: 0, value: "whole" }] });
  for (let index = 0; index < 80000; index += 1) feed(`${index ? "," : ""}${bar}`);
  feed(source.slice(second + secondMarker.length));
  const result = reader.finish();
  assert.strictEqual(count, 180000);
  assert.strictEqual(result.counts["data.adaptiveHistory.evaluations"], 100000);
  assert.strictEqual(result.counts["data.rhythmSenseBars"], 80000);
  process.stdout.write(`Stress reader processed ${count} items.\n`);
}

const fileFlag = process.argv.indexOf("--file");
if (fileFlag !== -1) {
  const filePath = process.argv[fileFlag + 1];
  if (!filePath) throw new Error("--file requires a backup path.");
  const expectedNotes = Number(process.argv[fileFlag + 2]) || 100000;
  const expectedBars = Number(process.argv[fileFlag + 3]) || 80000;
  (async () => {
    const counts = Object.create(null);
    const reader = new SaveDataStreamReader(section => {
      counts[section] = (counts[section] || 0) + 1;
    });
    const decoder = new TextDecoder();
    for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 65536 })) {
      reader.push(decoder.decode(chunk, { stream: true }));
    }
    reader.push(decoder.decode());
    reader.finish();
    assert.strictEqual(counts["data.adaptiveHistory.evaluations"], expectedNotes);
    assert.strictEqual(counts["data.rhythmSenseBars"], expectedBars);
    process.stdout.write(`File reader processed ${fs.statSync(filePath).size} bytes.\n`);
    process.stdout.write("Save-data stream reader tests passed.\n");
  })().catch(error => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
} else {
  process.stdout.write("Save-data stream reader tests passed.\n");
}

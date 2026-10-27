const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, file) => {
  if (!file.startsWith(sourceRoot)) return original(mod, file);
  mod._compile(babel.transform(fs.readFileSync(file, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, file);
};
const model = require("../src/model/Workshop"), store = require("../src/model/WorkshopStorage");
const backup = require("../src/model/SaveDataBackup"), imports = require("../src/model/SaveDataImport");
Module._extensions[".js"] = original;
const optionsValue = '{"data":{"language":"de"}}';

function storage() {
  const data = new Map(), writes = [];
  let failure = null;
  return {
    get length() { return data.size; },
    key(index) { return Array.from(data.keys())[index] || null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      writes.push({ key, value: String(value) });
      const mode = failure;
      failure = null;
      if (mode === "throw-before") throw new Error("storage-write-failed");
      if (mode === "ignore") return;
      data.set(key, mode === "corrupt" ? "incorrect write" : String(value));
      if (mode === "throw-after") throw new Error("storage-write-failed");
    },
    removeItem(key) { writes.push({ key, remove: true }); data.delete(key); },
    failNext(mode) { failure = mode; },
    writes,
    snapshot() { return Array.from(data.entries()); }
  };
}

function fixture() {
  const persisted = storage();
  persisted.setItem("learning-progress", "unchanged progress");
  persisted.setItem("options", optionsValue);
  const first = store.storeWorkshopDraft(model.createWorkshopDraft("First piece"), persisted).piece;
  const changed = model.openWorkshopPiece(first);
  changed.score.bpm = 90;
  const revised = store.storeWorkshopDraft(changed, persisted).piece;
  const second = store.storeWorkshopDraft(model.createWorkshopDraft("Second piece"), persisted).piece;
  return { persisted, first: revised, second };
}

function test(name, run) { run(); process.stdout.write("✓ Workshop piece deletion: " + name + "\n"); }

test("removes only the selected piece with all its saved revisions", () => {
  const { persisted, first, second } = fixture();
  assert.strictEqual(first.revisions.length, 2);
  const writesBefore = persisted.writes.length;
  const result = store.deleteStoredWorkshopPiece(first.id, persisted);
  assert.deepStrictEqual(result.removedPiece, first);
  assert.deepStrictEqual(result.library, { version: 1, pieces: [second] });
  assert.deepStrictEqual(store.readWorkshopLibrary(persisted), result.library);
  assert.strictEqual(persisted.getItem("learning-progress"), "unchanged progress");
  assert.strictEqual(persisted.getItem("options"), optionsValue);
  assert(persisted.writes.slice(writesBefore).every(write => write.key === model.WORKSHOP_STORAGE_KEY));
  const last = store.deleteStoredWorkshopPiece(second.id, persisted);
  assert.deepStrictEqual(last.library, { version: 1, pieces: [] });
  assert(model.isValidWorkshopLibrary(last.library));
  assert.strictEqual(persisted.length, 3);
});

test("rereads current storage and preserves additions and edits made after the displayed library", () => {
  const { persisted, first, second } = fixture();
  const displayedLibrary = store.readWorkshopLibrary(persisted);
  const newlyAdded = store.storeWorkshopDraft(model.createWorkshopDraft("Newer save"), persisted).piece;
  const updatedDraft = model.openWorkshopPiece(second);
  updatedDraft.title = "Newer title";
  updatedDraft.score.bpm = 110;
  const updatedPiece = store.storeWorkshopDraft(updatedDraft, persisted).piece;
  const result = store.deleteStoredWorkshopPiece(first.id, persisted);
  assert.deepStrictEqual(result.library.pieces, [updatedPiece, newlyAdded]);
  assert.deepStrictEqual(displayedLibrary.pieces, [first, second]);
  assert.deepStrictEqual(store.readWorkshopLibrary(persisted), result.library);
});

test("unknown IDs and already deleted pieces do not write storage", () => {
  const { persisted, first } = fixture();
  for (const id of ["missing-piece", "", null, undefined, {}, "__proto__"]) {
    const before = persisted.snapshot(), writesBefore = persisted.writes.length;
    assert.throws(() => store.deleteStoredWorkshopPiece(id, persisted), /missing-piece/);
    assert.deepStrictEqual(persisted.snapshot(), before);
    assert.strictEqual(persisted.writes.length, writesBefore);
  }
  store.deleteStoredWorkshopPiece(first.id, persisted);
  const before = persisted.snapshot(), writesBefore = persisted.writes.length;
  assert.throws(() => store.deleteStoredWorkshopPiece(first.id, persisted), /missing-piece/);
  assert.deepStrictEqual(persisted.snapshot(), before);
  assert.strictEqual(persisted.writes.length, writesBefore);
});

test("a missing or invalid library is never replaced while attempting deletion", () => {
  for (const raw of [null, "not-json", "{}", '{"data":{"version":1,"pieces":[null]}}', '{"data":null}']) {
    const persisted = storage();
    persisted.setItem("unrelated", "keep");
    if (raw !== null) persisted.setItem(model.WORKSHOP_STORAGE_KEY, raw);
    const before = persisted.snapshot(), writesBefore = persisted.writes.length;
    assert.throws(() => store.deleteStoredWorkshopPiece("unknown", persisted));
    assert.deepStrictEqual(persisted.snapshot(), before);
    assert.strictEqual(persisted.writes.length, writesBefore);
  }
});

test("failed and unverifiable writes preserve the complete original library", () => {
  for (const mode of ["throw-before", "throw-after", "ignore", "corrupt"]) {
    const { persisted, first } = fixture(), before = persisted.snapshot();
    const writesBefore = persisted.writes.length;
    persisted.failNext(mode);
    assert.throws(() => store.deleteStoredWorkshopPiece(first.id, persisted), /storage-write-failed|save-verification-failed/);
    assert.deepStrictEqual(persisted.snapshot(), before, mode);
    assert.strictEqual(store.readWorkshopLibrary(persisted).pieces.length, 2);
    assert(persisted.writes.slice(writesBefore).every(write => write.key === model.WORKSHOP_STORAGE_KEY));
  }
});

test("deleting a local piece is preserved when an unrelated app backup is restored", () => {
  const { persisted, first, second } = fixture();
  const result = store.deleteStoredWorkshopPiece(first.id, persisted);
  const exported = backup.createSaveDataBackup(persisted);
  assert(backup.validateSaveDataBackup(exported).valid);
  assert.strictEqual(exported.data.workshopLibrary, undefined);
  assert.deepStrictEqual(store.readWorkshopLibrary(persisted),result.library);
  const restored = storage();
  restored.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY));
  restored.setItem("unrelated", "keep");
  imports.importSaveData(restored, exported, "replace");
  assert.deepStrictEqual(store.readWorkshopLibrary(restored).pieces, [second]);
  assert.strictEqual(restored.getItem("unrelated"), "keep");
  assert.strictEqual(persisted.getItem("learning-progress"), "unchanged progress");
});

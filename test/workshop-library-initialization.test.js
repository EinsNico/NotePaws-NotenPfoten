const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, file) => {
  if (!file.startsWith(sourceRoot)) return original(mod, file);
  mod._compile(babel.transform(fs.readFileSync(file, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, file);
};
const model = require("../src/model/Workshop"), store = require("../src/model/WorkshopStorage"), demos = require("../src/model/WorkshopDemoPieces");
const backup = require("../src/model/SaveDataBackup"), imports = require("../src/model/SaveDataImport");
Module._extensions[".js"] = original;
const packaged = demos.WORKSHOP_DEMO_PIECES[0];
function storage() {
  const data = new Map(), writes = [];
  let failure = null;
  return {
    get length() { return data.size; }, key(index) { return Array.from(data.keys())[index] || null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      writes.push(key); const mode = failure; failure = null;
      if (mode === "throw-before") throw new Error("quota-exceeded");
      if (mode === "ignore") return;
      data.set(key, mode === "corrupt" ? "incorrect write" : String(value));
      if (mode === "throw-after") throw new Error("quota-exceeded");
    },
    removeItem(key) { writes.push(key); data.delete(key); },
    failNext(mode) { failure = mode; }, writes,
    snapshot() { return Array.from(data.entries()); }
  };
}
async function test(name, run) { await run(); process.stdout.write("✓ Workshop library initialization: " + name + "\n"); }
(async () => {
  await test("installs one ordinary saved piece, keeping rights and unrelated storage", async () => {
    const persisted = storage(); persisted.setItem("unrelated", "unchanged");
    const result = await store.initializeWorkshopLibrary(persisted);
    assert.strictEqual(result.warning, undefined); assert(model.isValidWorkshopLibrary(result.library));
    assert.strictEqual(result.library.version, 1); assert.deepStrictEqual(result.library.installedPieceIds, [packaged.id]);
    assert.strictEqual(result.library.pieces.length, 1);
    const piece = result.library.pieces[0], opened = model.openWorkshopPiece(piece);
    assert.strictEqual(opened.pieceId, piece.id); assert.strictEqual(piece.title, packaged.title);
    assert.strictEqual(opened.score.metadata.composer, packaged.composer);
    assert.strictEqual(opened.score.metadata.license, "Public Domain (gemeinfrei laut Mutopia Project)");
    assert.strictEqual(opened.score.metadata.sources.length, 3);
    assert.deepStrictEqual(store.readWorkshopLibrary(persisted), result.library);
    assert.strictEqual(persisted.getItem("unrelated"), "unchanged");
    assert(persisted.writes.slice(1).every(key => key === model.WORKSHOP_STORAGE_KEY));
    const before = persisted.snapshot(), writes = persisted.writes.length;
    assert.deepStrictEqual((await store.initializeWorkshopLibrary(persisted)).library, result.library);
    assert.deepStrictEqual(persisted.snapshot(), before); assert.strictEqual(persisted.writes.length, writes);
  });
  await test("normal rename, note edits, deletion and reopening never restore the packaged piece", async () => {
    const persisted = storage(), installed = await store.initializeWorkshopLibrary(persisted);
    const draft = model.openWorkshopPiece(installed.library.pieces[0]);
    draft.title = "Meine Fassung"; draft.score.metadata.title = draft.title; draft.score.bpm = 112;
    const changed = store.storeWorkshopDraft(draft, persisted);
    assert.deepStrictEqual(changed.library.installedPieceIds, [packaged.id]);
    const again = await store.initializeWorkshopLibrary(persisted);
    assert.deepStrictEqual(again.library, changed.library); assert.strictEqual(again.library.pieces[0].title, "Meine Fassung");
    const deleted = store.deleteStoredWorkshopPiece(changed.piece.id, persisted);
    assert.strictEqual(deleted.library.pieces.length, 0); assert.deepStrictEqual(deleted.library.installedPieceIds, [packaged.id]);
    const before = persisted.snapshot();
    assert.deepStrictEqual((await store.initializeWorkshopLibrary(persisted)).library, deleted.library);
    assert.deepStrictEqual(persisted.snapshot(), before);
    const ordinary = store.storeWorkshopDraft(model.createWorkshopDraft("Neues Stück"), persisted);
    assert.deepStrictEqual(ordinary.library.installedPieceIds, [packaged.id]);
  });
  await test("same-title user piece remains byte-for-byte intact", async () => {
    const persisted = storage(), existing = store.storeWorkshopDraft(model.createWorkshopDraft(packaged.title), persisted).piece;
    const result = await store.initializeWorkshopLibrary(persisted);
    assert.strictEqual(result.library.pieces.length, 2);
    assert.deepStrictEqual(result.library.pieces.find(piece => piece.id === existing.id), existing);
    assert.notStrictEqual(result.library.pieces[1].id, existing.id);
  });
  await test("recognizes an earlier edited packaged copy by source without replacing user metadata or score", async () => {
    const persisted = storage(), draft = await demos.createWorkshopDemoDraft(packaged.id);
    draft.title = "Schon vorhanden"; draft.score.metadata.title = draft.title;
    draft.score.metadata.license = "Mein Hinweis"; draft.score.metadata.sources = [];
    const old = store.storeWorkshopDraft(draft, persisted).piece;
    const edited = model.openWorkshopPiece(old); edited.score.bpm = 99;
    const current = store.storeWorkshopDraft(edited, persisted).piece;
    const result = await store.initializeWorkshopLibrary(persisted);
    assert.strictEqual(result.library.pieces.length, 1); assert.deepStrictEqual(result.library.pieces[0], current);
    assert.deepStrictEqual(result.library.installedPieceIds, [packaged.id]);
  });
  await test("parallel installers and a save while importing retain every new user piece", async () => {
    const persisted = storage();
    const first = store.initializeWorkshopLibrary(persisted), second = store.initializeWorkshopLibrary(persisted);
    const userPiece = store.storeWorkshopDraft(model.createWorkshopDraft("Während des Ladens"), persisted).piece;
    await Promise.all([first, second]);
    const result = store.readWorkshopLibrary(persisted);
    assert.strictEqual(result.pieces.length, 2); assert.deepStrictEqual(result.installedPieceIds, [packaged.id]);
    assert.deepStrictEqual(result.pieces.find(piece => piece.id === userPiece.id), userPiece);
    assert.strictEqual(result.pieces.filter(piece => demos.isWorkshopDemoPiece(piece, packaged.id)).length, 1);
  });
  await test("corrupt or incompatible data is never overwritten", async () => {
    for (const raw of ["not-json", "{}", '{"data":{"version":1,"pieces":[null]}}', '{"data":{"version":1,"pieces":[],"installedPieceIds":"bad"}}']) {
      const persisted = storage(); persisted.setItem(model.WORKSHOP_STORAGE_KEY, raw);
      const before = persisted.snapshot(), writes = persisted.writes.length;
      await assert.rejects(store.initializeWorkshopLibrary(persisted));
      assert.deepStrictEqual(persisted.snapshot(), before); assert.strictEqual(persisted.writes.length, writes);
    }
  });
  await test("full libraries remain accessible unchanged and can install after room is freed", async () => {
    const persisted = storage();
    for (let index = 0; index < 40; index++) store.storeWorkshopDraft(model.createWorkshopDraft("User " + index), persisted);
    const before = persisted.snapshot(), writes = persisted.writes.length;
    const result = await store.initializeWorkshopLibrary(persisted);
    assert.strictEqual(result.warning, "library-full"); assert.strictEqual(result.library.pieces.length, 40);
    assert.deepStrictEqual(persisted.snapshot(), before); assert.strictEqual(persisted.writes.length, writes);
    store.deleteStoredWorkshopPiece(result.library.pieces[0].id, persisted);
    const retried = await store.initializeWorkshopLibrary(persisted);
    assert.strictEqual(retried.warning, undefined); assert.strictEqual(retried.library.pieces.length, 40);
    assert.deepStrictEqual(retried.library.installedPieceIds, [packaged.id]);
  });
  await test("failed or unverifiable installation writes roll back without touching other data", async () => {
    for (const mode of ["throw-before", "throw-after", "ignore", "corrupt"]) {
      const persisted = storage(); persisted.setItem("unrelated", "unchanged");
      store.storeWorkshopDraft(model.createWorkshopDraft("Existing"), persisted);
      const before = persisted.snapshot(); persisted.failNext(mode);
      const result = await store.initializeWorkshopLibrary(persisted);
      assert.strictEqual(result.warning, "demo-install-failed", mode); assert.strictEqual(result.library.pieces.length, 1);
      assert.deepStrictEqual(persisted.snapshot(), before, mode);
    }
  });
  await test("ledger is backward compatible, bounded and strictly validated", async () => {
    assert(model.isValidWorkshopLibrary({ version: 1, pieces: [] }));
    assert(model.isValidWorkshopLibrary({ version: 1, pieces: [], installedPieceIds: [] }));
    assert(model.isValidWorkshopLibrary({ version: 1, pieces: [], installedPieceIds: [packaged.id] }));
    for (const invalid of [null, "bad", {}, [packaged.id, packaged.id], [""], ["bad/id"], [3], Array.from({ length: 65 }, (_, index) => "id-" + index)]) {
      assert(!model.isValidWorkshopLibrary({ version: 1, pieces: [], installedPieceIds: invalid }), JSON.stringify(invalid));
    }
    assert(!model.isValidWorkshopLibrary({ version: 1, pieces: [], unexpected: true }));
  });
  await test("general backups do not transfer installation ledgers and imports preserve local demo deletions", async () => {
    const persisted=storage(),installed=await store.initializeWorkshopLibrary(persisted);
    store.deleteStoredWorkshopPiece(installed.library.pieces[0].id,persisted);
    const exported=backup.createSaveDataBackup(persisted);assert(backup.validateSaveDataBackup(exported).valid);
    assert(!Object.prototype.hasOwnProperty.call(exported.data,'workshopLibrary'));
    const before=persisted.getItem(model.WORKSHOP_STORAGE_KEY);
    for(const mode of ['replace','merge']) {
      imports.importSaveData(persisted,exported,mode);assert.strictEqual(persisted.getItem(model.WORKSHOP_STORAGE_KEY),before);
      assert.strictEqual((await store.initializeWorkshopLibrary(persisted)).library.pieces.length,0);
    }
    // A different device installs its bundled piece independently of app backups.
    const newDevice=storage();imports.importSaveData(newDevice,exported,'replace');
    assert.strictEqual((await store.initializeWorkshopLibrary(newDevice)).library.pieces.length,1);
    const other={version:1,pieces:[],installedPieceIds:['future-piece']};
    assert.deepStrictEqual(model.mergeWorkshopLibraries(store.readWorkshopLibrary(persisted),other).installedPieceIds,[packaged.id,'future-piece']);
  });
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });

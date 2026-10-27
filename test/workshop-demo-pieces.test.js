const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core"), crypto = require("crypto");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const demo = require("../src/model/WorkshopDemoPieces"), model = require("../src/model/Workshop"), io = require("../src/model/WorkshopMusicXml");
const store = require("../src/model/WorkshopStorage"), backup = require("../src/model/SaveDataBackup"), imports = require("../src/model/SaveDataImport");
Module._extensions[".js"] = originalLoader;
const source = require("../src/resources/demo-pieces/la-candeur.musicxml.json");
const descriptor = demo.WORKSHOP_DEMO_PIECES[0];
const expectedMetadata = {
  title: "La Candeur (Tenderness), Op. 100 Nr. 1",
  composer: "Friedrich Burgmüller (1806–1874)",
  copyright: "Das Stück bzw. die zugrunde liegende Mutopia-Vorlage ist im Mutopia Project als „Public Domain“ gekennzeichnet. Die MusicXML-Datei wird von Pianodemy als aus der Mutopia-MIDI-Datei erstellt beschrieben. Dieser Hinweis bezieht sich auf das Stück und die genannte Vorlage, nicht auf die App oder deren Programmcode.",
  license: "Public Domain (gemeinfrei laut Mutopia Project)",
  sources: [
    { label: "Mutopia Project – La Candeur, Mutopia-ID 202", url: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=202" },
    { label: "Pianodemy – Stück- und Dateiquelle", url: "https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/" },
    { label: "MusicXML-Datei", url: "https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/burgmuller-tenderness-op-100-no-1.musicxml" }
  ]
};
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; }, setItem(key, value) { entries.set(key, String(value)); }, removeItem(key) { entries.delete(key); } };
}
function notes(score) { return score.parts.flatMap(part => part.measures.flatMap(bar => bar.events)); }
function eventRows(score) {
  return score.parts.flatMap((part, staff) => part.measures.flatMap((bar, measure) => bar.events.map(event => {
    const row = model.cloneWorkshop(event);
    delete row.id; delete row.beamGroupId; delete row.tupletGroupId;
    return JSON.stringify({ staff, measure, event: row });
  }))).sort();
}
async function test(name, run) { await run(); process.stdout.write("✓ workshop demo: " + name + "\n"); }
(async () => {
  await test("packages the exact reference offline and opens a complete ordinary editable score", async () => {
    assert.strictEqual(Buffer.byteLength(source), 75003);
    assert.strictEqual(crypto.createHash("sha256").update(source).digest("hex"), "6974276ac336fb8ded68d52406a99bcd6694037b302697c706ad693f39946cc6");
    const draft = await demo.createWorkshopDemoDraft(descriptor.id);
    assert.strictEqual(draft.pieceId, null); assert.strictEqual(draft.title, expectedMetadata.title);
    assert(model.isValidWorkshopScore(draft.score)); assert.strictEqual(draft.score.musicXml.sourceXml, source);
    assert.strictEqual(draft.score.parts.length, 2); assert.strictEqual(draft.score.parts[0].measures.length, 23);
    assert.strictEqual(notes(draft.score).filter(event => event.kind === "note").length, 245);
    assert.strictEqual(notes(draft.score).filter(event => event.kind === "rest").length, 11);
    assert.deepStrictEqual(eventRows(draft.score), eventRows((await io.importWorkshopMusicXml(source)).score));
    assert.deepStrictEqual(draft.score.metadata, expectedMetadata);
    const timeline = model.workshopTimeline(draft.score); assert(timeline.events.length > 0); assert(timeline.durationMs > 0);
    assert(!JSON.stringify(draft.score.metadata).includes("CC0")); assert(!JSON.stringify(draft.score.metadata).includes("AGPL"));
    await assert.rejects(demo.createWorkshopDemoDraft("missing"), /unknown-workshop-demo/);
  });
  await test("never writes on opening, preserves same-title user data and creates independent copies only on save", async () => {
    const persisted = storage(); global.localStorage = persisted;
    const existing = store.storeWorkshopDraft(model.createWorkshopDraft(descriptor.title), persisted);
    const originalStorage = persisted.getItem(model.WORKSHOP_STORAGE_KEY), originalPiece = JSON.stringify(existing.piece);
    const draft = await demo.createWorkshopDemoDraft(descriptor.id);
    assert.strictEqual(persisted.getItem(model.WORKSHOP_STORAGE_KEY), originalStorage);
    const saved = store.storeWorkshopDraft(draft, persisted);
    assert.strictEqual(saved.library.pieces.length, 2); assert.notStrictEqual(saved.piece.id, existing.piece.id);
    assert.strictEqual(JSON.stringify(saved.library.pieces[0]), originalPiece);
    draft.score.metadata.sources[0].label = "Edited source"; draft.score.parts[0].measures[0].events[0].pitch.step = "D";
    const fresh = await demo.createWorkshopDemoDraft(descriptor.id);
    assert.deepStrictEqual(fresh.score.metadata, expectedMetadata);
    assert.notStrictEqual(fresh.score.parts[0].measures[0].events[0].id, draft.score.parts[0].measures[0].events[0].id);
    assert.strictEqual(fresh.score.parts[0].measures[0].events[0].pitch.step, model.openWorkshopPiece(saved.piece).score.parts[0].measures[0].events[0].pitch.step);
    assert.deepStrictEqual(demo.WORKSHOP_DEMO_PIECES[0], descriptor);
  });
  await test("retains title, composer, separate rights/license and all source links after save, reopen and rename", async () => {
    const persisted = storage(), draft = await demo.createWorkshopDemoDraft(descriptor.id);
    const saved = store.storeWorkshopDraft(draft, persisted), reopened = model.openWorkshopPiece(store.readWorkshopLibrary(persisted).pieces[0]);
    assert.deepStrictEqual(reopened.score.metadata, expectedMetadata);
    reopened.title = "Meine La Candeur"; reopened.score.metadata.title = reopened.title;
    reopened.score.metadata.composer = "Friedrich Burgmüller – eigene Fassung";
    reopened.score.metadata.copyright += "\nPersönliche Notiz";
    reopened.score.metadata.license = "Eigener Lizenzvermerk"; reopened.score.metadata.sources[0].label = "Mutopia-Referenz";
    const renamed = store.storeWorkshopDraft(reopened, persisted), again = model.openWorkshopPiece(store.readWorkshopLibrary(persisted).pieces[0]);
    assert.strictEqual(renamed.piece.id, saved.piece.id); assert.strictEqual(again.title, "Meine La Candeur");
    assert.deepStrictEqual(again.score.metadata, reopened.score.metadata);
    assert.deepStrictEqual((await demo.createWorkshopDemoDraft(descriptor.id)).score.metadata, expectedMetadata);
  });
  await test("round trips demo metadata and notes through XML/MXL while app backups leave local demos intact", async () => {
    const draft = await demo.createWorkshopDemoDraft(descriptor.id);
    for (const compressed of [false, true]) {
      const exported = await io.exportWorkshopMusicXml(draft.score, { title: draft.title, compressed });
      const imported = await io.importWorkshopMusicXml(exported.data, { filename: compressed ? "demo.mxl" : "demo.musicxml" });
      assert.strictEqual(imported.title, draft.title); assert.deepStrictEqual(imported.score.metadata, expectedMetadata);
      assert.deepStrictEqual(eventRows(imported.score), eventRows(draft.score)); assert.strictEqual(imported.score.musicXml.sourceXml, source);
    }
    const persisted = storage(), saved = store.storeWorkshopDraft(draft, persisted), exported = backup.createSaveDataBackup(persisted);
    assert(backup.validateSaveDataBackup(exported).valid);
    assert.strictEqual(exported.data.workshopLibrary, undefined);
    const restored = storage(); restored.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(restored, imports.prepareSaveDataImport(restored, exported, "replace"));
    const reopened = model.openWorkshopPiece(store.readWorkshopLibrary(restored).pieces[0]);
    assert.deepStrictEqual(reopened.score.metadata, expectedMetadata); assert.strictEqual(reopened.title, draft.title);
    assert.deepStrictEqual(reopened.score, model.openWorkshopPiece(saved.piece).score);
  });
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });

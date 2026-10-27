const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const io = require("../src/model/WorkshopMusicXml"), model = require("../src/model/Workshop"), fingering = require("../src/model/WorkshopFingerings"),
  parser = require("../src/model/WorkshopMusicXmlParser"), editor = require("../src/model/WorkshopScoreEditor");
Module._extensions[".js"] = originalLoader;
function test(name, operation) { operation(); process.stdout.write("✓ workshop fingerings: " + name + "\n"); }
function xml(markup) {
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">'
    + '<attributes><divisions>1</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
    + '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>' + markup + '</note></measure></part></score-partwise>';
}
function technical(markup) { return '<notations><technical>' + markup + '</technical></notations>'; }
function first(score) { return score.parts[0].measures[0].events.find(event => event.kind === "note"); }
function stripNative(value) {
  const document = parser.parseWorkshopMusicXmlDocument(value), misc = parser.musicXmlChild(parser.musicXmlChild(document, "identification"), "miscellaneous"),
    field = parser.musicXmlChildren(misc, "miscellaneous-field").find(item => item.attrs.name === "notenpfoten-editor-score-v1");
  return field ? value.slice(0, field.start) + value.slice(field.end) : value;
}
function timing(score) {
  return model.workshopTimeline(score).events.map(event => [event.barIndex, event.startMs, event.durationMs, event.value, event.partIndex || 0, event.voice || 1]);
}
const rich = [
  { value: "1", placement: "above" },
  { value: "2", substitution: true, placement: "above" },
  { value: "3", alternate: true, placement: "below" },
  { value: "1–4", substitution: false, alternate: false }
];

test("legacy numeric fingers remain valid and both reading formats return independent copies", () => {
  const score = model.createWorkshopDraft("Legacy").score;
  score.parts[0].measures[0].events = [{ id: "n", kind: "note", noteValue: "quarter", startSlot: 0, pitch: { step: "C", alter: 0, octave: 4 }, fingering: 4 }];
  assert(model.isValidWorkshopScore(score)); assert.deepStrictEqual(fingering.workshopFingerings(first(score)), [{ value: "4" }]);
  delete first(score).fingering; first(score).fingerings = model.cloneWorkshop(rich);
  assert(model.isValidWorkshopScore(score));
  const read = fingering.workshopFingerings(first(score)); read[0].value = "5";
  assert.strictEqual(first(score).fingerings[0].value, "1");
  assert.deepStrictEqual(fingering.workshopFingerings(null), []);
  assert.deepStrictEqual(fingering.workshopFingerings({ fingering: 6 }), []);
});

test("bounded annotation validation rejects empty, ambiguous, sparse and malformed data", () => {
  assert(fingering.isValidWorkshopFingerings(rich));
  assert(fingering.isValidWorkshopFingerings(Array.from({ length: 16 }, () => ({ value: "1" }))));
  assert(fingering.isValidWorkshopFingerings([{ value: "x".repeat(32) }]));
  const invalid = [null, {}, [], new Array(1), [{ value: "" }], [{ value: " 1" }], [{ value: "1 " }], [{ value: 1 }], [{ value: "1\u0000" }],
    [{ value: "x".repeat(33) }], [{ value: "1", alternate: "yes" }], [{ value: "1", substitution: 1 }],
    [{ value: "1", placement: "left" }], [{ value: "1", placement: undefined }], [{ value: "1", style: "bold" }],
    Array.from({ length: 17 }, () => ({ value: "1" }))];
  invalid.forEach(value => assert(!fingering.isValidWorkshopFingerings(value), JSON.stringify(value)));
  const score = io.importWorkshopMusicXmlText(xml(technical('<fingering>1</fingering>'))).score;
  first(score).fingerings = [{ value: "2" }]; assert(!model.isValidWorkshopScore(score), "legacy and rich fields cannot conflict");
  const event = first(score); delete event.fingering; event.kind = "rest"; event.pitch = null;
  assert(!model.isValidWorkshopScore(score), "fingering is a note annotation");
});

test("all standard fingerings and semantic attributes import in document order", () => {
  const source = xml(technical('<fingering placement="above"> 1 </fingering><fingering substitution="yes" placement="above">2</fingering>')
    + technical('<fingering alternate="yes" placement="below">3</fingering><fingering substitution="no" alternate="no">1–4</fingering>'));
  const imported = io.importWorkshopMusicXmlText(source);
  assert.deepStrictEqual(first(imported.score).fingerings, rich);
  assert.strictEqual(first(imported.score).fingering, undefined);
  assert(!imported.warnings.includes("unsupported-notation")); assert(model.isValidWorkshopScore(imported.score));
});

test("a simple single finger preserves the legacy representation; text and flags use rich entries", () => {
  const simple = io.importWorkshopMusicXmlText(xml(technical('<fingering>3</fingering>'))).score;
  assert.strictEqual(first(simple).fingering, 3); assert.strictEqual(first(simple).fingerings, undefined);
  for (const mark of ['<fingering alternate="yes">3</fingering>', '<fingering>1–2</fingering>', '<fingering>03</fingering>']) {
    const event = first(io.importWorkshopMusicXmlText(xml(technical(mark))).score);
    assert(event.fingerings); assert.strictEqual(event.fingering, undefined);
  }
});

test("ordinary MusicXML roundtrip carries every entry after edits without private editor metadata", () => {
  const source = xml(technical('<fingering>1</fingering><fingering substitution="yes">2</fingering>'));
  const imported = io.importWorkshopMusicXmlText(source);
  assert.strictEqual(io.exportWorkshopMusicXmlText(imported.score, { title: imported.title }).data, source, "an unchanged import keeps its original source");
  first(imported.score).fingerings = model.cloneWorkshop(rich); first(imported.score).pitch.step = "D";
  const output = io.exportWorkshopMusicXmlText(imported.score, { title: imported.title });
  assert(output.warnings.includes("edited-source-preserved"));
  const plain = stripNative(output.data), restored = io.importWorkshopMusicXmlText(plain);
  assert.deepStrictEqual(first(restored.score).fingerings, rich);
  assert.deepStrictEqual(first(restored.score).pitch, first(imported.score).pitch);
  assert(!restored.warnings.includes("unsupported-notation")); assert.deepStrictEqual(timing(restored.score), timing(imported.score));
});

test("finger text is escaped in generated standard XML and restored verbatim", () => {
  const score = io.importWorkshopMusicXmlText(xml(technical('<fingering>1</fingering>'))).score;
  delete score.musicXml; delete first(score).fingering; first(score).fingerings = [{ value: '1 & 2 <3> "4"' }];
  const exported = stripNative(io.exportWorkshopMusicXmlText(score).data);
  assert(exported.includes('<fingering>1 &amp; 2 &lt;3&gt; &quot;4&quot;</fingering>'));
  assert.deepStrictEqual(first(io.importWorkshopMusicXmlText(exported).score).fingerings, first(score).fingerings);
});

test("native MusicXML snapshots retain rich fingerings and support later ordinary XML edits", () => {
  const score = io.importWorkshopMusicXmlText(xml(technical('<fingering>1</fingering>'))).score;
  delete first(score).fingering; first(score).fingerings = model.cloneWorkshop(rich);
  const exported = io.exportWorkshopMusicXmlText(score, { title: "Fingersatz" }).data;
  const native = io.importWorkshopMusicXmlText(exported);
  assert.deepStrictEqual(first(native.score).fingerings, rich); assert(model.isValidWorkshopScore(native.score));
  const editedElsewhere = exported.replace('<fingering placement="above">1</fingering>', '<fingering placement="above">5</fingering>');
  assert.strictEqual(first(io.importWorkshopMusicXmlText(editedElsewhere).score).fingerings[0].value, "5", "standard notation edits supersede stale native metadata");
});

test("ignored fingering styling, invalid flags and exceeded bounds report import limitations", () => {
  for (const mark of ['<fingering default-x="10">1</fingering>', '<fingering font-weight="bold">1</fingering>',
    '<fingering alternate="maybe">1</fingering>', '<fingering placement="side">1</fingering>', '<fingering/>',
    '<fingering>' + "x".repeat(33) + '</fingering>', Array.from({ length: 17 }, () => '<fingering>1</fingering>').join("")]) {
    const imported = io.importWorkshopMusicXmlText(xml(technical(mark)));
    assert(imported.warnings.includes("unsupported-notation"), mark); assert(model.isValidWorkshopScore(imported.score));
  }
  const limited = first(io.importWorkshopMusicXmlText(xml(technical(Array.from({ length: 17 }, () => '<fingering>1</fingering>').join("")))).score);
  assert.strictEqual(limited.fingerings.length, 16);
});

test("cloning, note moves, measure edits and saved revisions retain independent fingerings", () => {
  const score = io.importWorkshopMusicXmlText(xml(technical('<fingering>1</fingering><fingering substitution="yes">2</fingering>'))).score;
  const original = model.cloneWorkshop(score), note = first(score), moved = editor.moveWorkshopNote(score.parts[0].measures[0], note.id, 2, note.pitch);
  assert(moved); assert.deepStrictEqual(moved.find(event => event.kind === "note").fingerings, note.fingerings);
  moved.find(event => event.kind === "note").fingerings[0].value = "4"; assert.strictEqual(note.fingerings[0].value, "1");
  const withBar = model.insertWorkshopMeasures(score, 0), trimmed = model.removeWorkshopMeasure(withBar, 1);
  assert.deepStrictEqual(first(trimmed).fingerings, note.fingerings);
  const draft = { pieceId: null, title: "Fingersatz", score }, saved = model.saveWorkshopDraft({ version: 1, pieces: [] }, draft, "2026-10-06T12:00:00.000Z");
  draft.pieceId = saved.piece.id; first(draft.score).fingerings[0].value = "5";
  const second = model.saveWorkshopDraft(saved.library, draft, "2026-10-06T12:01:00.000Z"), piece = JSON.parse(JSON.stringify(second.library)).pieces[0];
  assert(model.isValidWorkshopLibrary(second.library)); assert.strictEqual(piece.revisions.length, 2);
  assert.strictEqual(first(model.openWorkshopPiece(piece, piece.revisions[0].id).score).fingerings[0].value, "1");
  const reopened = model.openWorkshopPiece(piece); assert.strictEqual(first(reopened.score).fingerings[0].value, "5");
  first(reopened.score).fingerings[0].value = "3"; assert.strictEqual(first(piece.revisions[1].score).fingerings[0].value, "5");
  assert.strictEqual(first(original).fingerings[0].value, "1");
});

test("fingering annotations never add required notes or alter pitch, start or duration", () => {
  const score = io.importWorkshopMusicXmlText(xml("")).score, before = timing(score);
  first(score).fingerings = model.cloneWorkshop(rich);
  assert.deepStrictEqual(timing(score), before);
  const scheduled = model.workshopTimeline(score).events.find(event => event.value !== null);
  assert.deepStrictEqual(scheduled.fingerings, rich); scheduled.fingerings[0].value = "5";
  assert.strictEqual(first(score).fingerings[0].value, "1");
});

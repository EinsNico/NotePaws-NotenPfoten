const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const xml = require("../src/model/WorkshopMusicXml");
const model = require("../src/model/Workshop");
const archive = require("../src/model/WorkshopMusicXmlArchive");
Module._extensions[".js"] = originalLoader;

function document(notes, attributes = "", extraParts = "") {
  return '<score-partwise version="4.0"><work><work-title>Note counts</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
    '<part id="P1"><measure number="1"><attributes><divisions>8</divisions>' +
    '<time><beats>4</beats><beat-type>4</beat-type></time>' + attributes +
    '</attributes>' + notes + '</measure></part>' + extraParts + '</score-partwise>';
}
function pitch(step = "C", octave = 4) {
  return '<pitch><step>' + step + '</step><octave>' + octave + '</octave></pitch>';
}
function note(content = pitch(), extra = "") {
  return '<note>' + content + '<duration>8</duration><type>quarter</type>' + extra + '</note>';
}
function counts(result, source, imported) {
  assert.deepStrictEqual(result.noteCounts, { source, imported, skipped: source - imported });
  assert(model.isValidWorkshopScore(result.score));
  return result;
}
function allEvents(score) {
  return score.parts.reduce((events, part) => events.concat(...part.measures.map(bar => bar.events)), []);
}
function standard(text) {
  return text.replace(/<miscellaneous-field name="notenpfoten-editor-score-v1">[\s\S]*?<\/miscellaneous-field>/, "");
}
async function test(name, callback) {
  await callback();
  process.stdout.write("✓ MusicXML note counts: " + name + "\n");
}

(async () => {
  await test("a missing step or octave reports zero of one source note and a later valid import recovers", () => {
    const valid = document(note());
    for (const tag of ["<step>C</step>", "<octave>4</octave>"]) {
      const broken = valid.replace(tag, "");
      const result = counts(xml.importWorkshopMusicXmlText(broken), 1, 0);
      assert(result.warnings.includes("unsupported-notation"));
      assert.strictEqual(allEvents(result.score).filter(event => event.kind === "note").length, 0);
      assert.strictEqual(result.score.musicXml.sourceXml, broken);
      counts(xml.importWorkshopMusicXmlText(valid), 1, 1);
    }
  });

  await test("mixed readable, missing and unsupported pitches report exactly the lost notes", () => {
    const result = counts(xml.importWorkshopMusicXmlText(document(
      note(pitch("D")) + note("<pitch><octave>4</octave></pitch>") +
      note(pitch("C", 10)) + note('<unpitched><display-step>C</display-step><display-octave>4</display-octave></unpitched>')
    )), 4, 1);
    assert.deepStrictEqual(allEvents(result.score).filter(event => event.kind === "note").map(event => event.pitch.step), ["D"]);
    assert(result.warnings.includes("unsupported-notation"));
  });

  await test("intentionally empty measures and subdivided rests remain valid zero-note imports", () => {
    const empty = counts(xml.importWorkshopMusicXmlText(document("")), 0, 0);
    assert(!empty.warnings.includes("unsupported-notation"));
    const rest = counts(xml.importWorkshopMusicXmlText(document(
      '<note><rest/><duration>17</duration></note>'
    )), 0, 0);
    assert(allEvents(rest.score).length > 1, "this rest requires multiple duration fragments");
    assert(allEvents(rest.score).every(event => event.kind === "rest"));
    assert(rest.warnings.includes("unsupported-rhythm"));
  });

  await test("each chord tone and grace note counts once, independent of duration or playback onsets", () => {
    const result = counts(xml.importWorkshopMusicXmlText(document(
      note(pitch()) + note('<chord/>' + pitch("E")) +
      '<note><grace slash="yes"/>' + pitch("D") + '<type>eighth</type></note>' +
      note(pitch("F"))
    )), 4, 4);
    assert.strictEqual(allEvents(result.score).filter(event => event.grace).length, 1);
    assert.strictEqual(new Set(allEvents(result.score).map(event => event.startSlot)).size, 2);
    assert.strictEqual(xml.importWorkshopMusicXmlText(xml.exportWorkshopMusicXmlText(result.score, {
      title: result.title, preserveOriginal: false
    }).data).noteCounts.imported, 4);
  });

  await test("excluded staves and whole parts are counted as source-note losses", () => {
    const staves = counts(xml.importWorkshopMusicXmlText(document(
      note(pitch(), "<staff>1</staff><voice>1</voice>") +
      '<backup><duration>8</duration></backup>' + note(pitch("E"), "<staff>2</staff><voice>2</voice>") +
      '<backup><duration>8</duration></backup>' + note(pitch("G"), "<staff>3</staff><voice>3</voice>"),
      "<staves>3</staves>"
    )), 3, 2);
    assert(staves.warnings.includes("extra-parts"));
    const part = id => '<part id="' + id + '"><measure number="1"><attributes><divisions>8</divisions></attributes>' + note() + '</measure></part>';
    const parts = counts(xml.importWorkshopMusicXmlText(document(note(), "", part("P2") + part("P3"))), 3, 2);
    assert(parts.warnings.includes("extra-parts"));
  });

  await test("timewise MusicXML uses the same source-note definition", () => {
    const source = '<score-timewise version="4.0"><part-list><score-part id="P1">' +
      '<part-name>Piano</part-name></score-part></part-list><measure number="1"><part id="P1">' +
      '<attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' +
      note() + note("<pitch><step>D</step></pitch>") + '</part></measure></score-timewise>';
    counts(xml.importWorkshopMusicXmlText(source), 2, 1);
  });

  await test("verified editor envelopes count restored hidden parts rather than only printed notes", () => {
    const score = model.createWorkshopDraft("Hidden hand", 1).score;
    score.parts[0].measures[0].events = [{ id: "right-note", kind: "note", noteValue: "quarter", startSlot: 0,
      pitch: { step: "C", alter: 0, octave: 4 } }];
    score.parts.push({ id: "left", clef: "bass", enabled: false, measures: [{ id: "left-bar", events: [
      { id: "left-note", kind: "note", noteValue: "quarter", startSlot: 0, pitch: { step: "C", alter: 0, octave: 3 } }
    ] }] });
    const before = JSON.stringify(score);
    const exported = xml.exportWorkshopMusicXmlText(score).data;
    const restored = counts(xml.importWorkshopMusicXmlText(exported), 2, 2);
    assert.strictEqual(restored.score.parts[1].enabled, false);
    counts(xml.importWorkshopMusicXmlText(exported, { standardOnly: true }), 1, 1);
    counts(xml.importWorkshopMusicXmlText(standard(exported)), 1, 1);
    assert.strictEqual(JSON.stringify(score), before, "neither export nor counting may mutate the source score");
  });

  await test("preserved originals are not counted again and an invalid envelope falls back to printed XML", () => {
    const original = document(note().replace("<step>C</step>", ""));
    const imported = xml.importWorkshopMusicXmlText(original);
    imported.score.bpm = 80;
    const exported = xml.exportWorkshopMusicXmlText(imported.score, { title: imported.title }).data;
    assert(exported.includes("notenpfoten-preserved-musicxml"));
    counts(xml.importWorkshopMusicXmlText(exported), 0, 0);
    const valid = model.createWorkshopDraft("Envelope fallback", 1).score;
    valid.parts[0].measures[0].events = [{ id: "note", kind: "note", noteValue: "quarter", startSlot: 0,
      pitch: { step: "C", alter: 0, octave: 4 } }];
    const exportedValid = xml.exportWorkshopMusicXmlText(valid, { title: "Envelope fallback" }).data;
    const brokenEnvelope = exportedValid.replace("Envelope fallback", "Changed title");
    assert.notStrictEqual(brokenEnvelope, exportedValid);
    const fallback = counts(xml.importWorkshopMusicXmlText(brokenEnvelope), 1, 1);
    assert(fallback.warnings.includes("unsupported-notation"));
  });

  await test("text, byte and MXL entry points preserve the same note-loss summary", async () => {
    const source = document(note() + note("<pitch><step>D</step></pitch>"));
    counts(await xml.importWorkshopMusicXml(source), 2, 1);
    counts(await xml.importWorkshopMusicXml(new TextEncoder().encode(source)), 2, 1);
    const compressed = archive.writeMusicXmlArchive(source);
    counts(await xml.importWorkshopMusicXml(compressed), 2, 1);
    counts(await xml.importWorkshopMusicXml({ async arrayBuffer() {
      return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
    } }), 2, 1);
  });
})().catch(error => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});

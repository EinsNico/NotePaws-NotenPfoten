const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const io = require("../src/model/WorkshopMusicXml"), model = require("../src/model/Workshop"), parser = require("../src/model/WorkshopMusicXmlParser");
Module._extensions[".js"] = originalLoader;
function test(name, operation) { operation(); process.stdout.write("✓ editable MusicXML notation: " + name + "\n"); }
function xml(body) { return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' + body + '</part></score-partwise>'; }
const initial = '<attributes><divisions>12</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function note(step, alter = 0, extra = "", duration = 12, type = "quarter", voice = 1, staff = 1) {
  return '<note><pitch><step>' + step + '</step><alter>' + alter + '</alter><octave>4</octave></pitch><duration>' + duration + '</duration><voice>' + voice + '</voice><type>' + type + '</type>' + extra + '<staff>' + staff + '</staff></note>';
}
function strippedNative(value) {
  const root = parser.parseWorkshopMusicXmlDocument(value), miscellaneous = parser.musicXmlChild(parser.musicXmlChild(root, "identification"), "miscellaneous");
  const field = parser.musicXmlChildren(miscellaneous, "miscellaneous-field").find(item => item.attrs.name === "notenpfoten-editor-score-v1");
  return field ? value.slice(0, field.start) + value.slice(field.end) : value;
}
function timing(score) { return model.workshopTimeline(score).events.filter(event => event.value !== null).map(event => [event.barIndex, event.startMs, event.durationMs, event.value, event.partIndex || 0]); }
function changes(bar) { return (bar.contextChanges || []).map(change => { const value = Object.assign({}, change); delete value.id; return value; }); }
function plainRoundtrip(score) { return io.importWorkshopMusicXmlText(strippedNative(io.exportWorkshopMusicXmlText(score).data)); }

test("staccatissimo is imported and survives edited standard MusicXML without private metadata", () => {
  const source=xml('<measure number="1">'+initial+note('D',0,'<notations><articulations><staccatissimo/><accent/></articulations></notations>')+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source),event=imported.score.parts[0].measures[0].events[0];
  assert(!imported.warnings.includes('unsupported-notation'));
  assert.deepStrictEqual(event.articulations,['staccatissimo','accent']);
  assert(model.isValidWorkshopScore(imported.score));
  event.pitch.step='E'; imported.score.bpm=72;
  const exported=io.exportWorkshopMusicXmlText(imported.score).data;
  assert(exported.includes('<staccatissimo/>'));
  const restored=io.importWorkshopMusicXmlText(strippedNative(exported)).score;
  assert.deepStrictEqual(restored.parts[0].measures[0].events[0].articulations,event.articulations);
  assert.deepStrictEqual(timing(restored),timing(imported.score));
});

test("all supported quarter-tone signs and courtesy flags survive edited plain MusicXML export", () => {
  const names = ["flat-flat", "three-quarters-flat", "flat", "quarter-flat", "natural", "quarter-sharp", "sharp", "three-quarters-sharp", "double-sharp"];
  const source = xml(model.WORKSHOP_PITCH_ALTERS.map((alter, index) => '<measure number="' + (index + 1) + '">' + (index === 0 ? initial : "")
    + note("F", alter, '<accidental parentheses="yes" cautionary="yes" editorial="yes">' + names[index] + '</accidental>') + '</measure>').join(""));
  const imported = io.importWorkshopMusicXmlText(source);
  assert(!imported.warnings.includes("unsupported-notation"));
  const events = imported.score.parts[0].measures.map(bar => bar.events[0]);
  assert.deepStrictEqual(events.map(event => event.pitch.alter), model.WORKSHOP_PITCH_ALTERS);
  events.forEach(event => assert.deepStrictEqual(event.accidentalDisplay, { force: true, enclosure: "parentheses", cautionary: true, editorial: true }));
  imported.score.bpm = 72;
  const exported = io.exportWorkshopMusicXmlText(imported.score, { title: imported.title });
  assert(exported.warnings.includes("edited-source-preserved"));
  names.forEach(name => assert(exported.data.includes('cautionary="yes" editorial="yes">' + name + '</accidental>')));
  const result = io.importWorkshopMusicXmlText(strippedNative(exported.data));
  assert.deepStrictEqual(result.score.parts[0].measures.map(bar => bar.events[0].pitch), events.map(event => event.pitch));
  assert.deepStrictEqual(result.score.parts[0].measures.map(bar => bar.events[0].accidentalDisplay), events.map(event => event.accidentalDisplay));
  assert.deepStrictEqual(timing(result.score), timing(imported.score));
});

test("a forced natural or bracketed reminder is independent of sounding pitch and remains editable", () => {
  const source = xml('<measure number="1">' + initial + note("F", 0, '<accidental bracket="yes" editorial="yes">natural</accidental>')
    + note("F", 0) + note("F", 1, '<accidental>sharp</accidental>') + note("F", 0, '<accidental>natural</accidental>') + '</measure>');
  const imported = io.importWorkshopMusicXmlText(source), events = imported.score.parts[0].measures[0].events;
  assert.deepStrictEqual(events[0].accidentalDisplay, { force: true, enclosure: "bracket", editorial: true });
  assert.strictEqual(events[1].accidentalDisplay, undefined);
  assert.strictEqual(events[3].accidentalDisplay, undefined, "a required cancellation remains automatic");
  events[0].accidentalDisplay = { force: true, enclosure: "parentheses", cautionary: true };
  const restored = plainRoundtrip(imported.score).score.parts[0].measures[0].events;
  assert.deepStrictEqual(restored[0].accidentalDisplay, events[0].accidentalDisplay);
  assert.strictEqual(restored[0].pitch.alter, 0);
  assert.strictEqual(restored[1].accidentalDisplay, undefined);
});

test("mid-bar key and clef changes apply in score order across voices without shifting note timing", () => {
  const source = xml('<measure number="1">' + initial + note("C")
    + '<attributes><key><fifths>1</fifths><mode>major</mode></key><clef><sign>F</sign><line>4</line></clef></attributes>'
    + note("F", 1) + '<backup><duration>24</duration></backup>' + note("G", 0, "", 48, "whole", 2) + '</measure>'
    + '<measure number="2">' + note("A") + '</measure>');
  const imported = io.importWorkshopMusicXmlText(source), score = imported.score;
  assert(!imported.warnings.includes("unsupported-notation"));
  assert.strictEqual(score.keyId, "C-major"); assert.strictEqual(score.parts[0].clef, "treble");
  assert.deepStrictEqual(changes(score.parts[0].measures[0]), [{ startSlot: 2, keyId: "G-major", clef: "bass" }]);
  assert.strictEqual(model.workshopMeasureContextAtSlot(score, 0, 1).clef, "treble");
  assert.strictEqual(model.workshopMeasureContextAtSlot(score, 0, 2).clef, "bass");
  assert.strictEqual(model.workshopMeasureContext(score, 1).keyId, "G-major");
  assert.strictEqual(model.workshopMeasureContext(score, 1).clef, "bass");
  score.bpm = 70;
  const restored = plainRoundtrip(score).score;
  assert.deepStrictEqual(changes(restored.parts[0].measures[0]), changes(score.parts[0].measures[0]));
  assert.deepStrictEqual(timing(restored), timing(score));
  assert.strictEqual(model.workshopMeasureContext(restored, 1).clef, "bass");
});

test("shared piano key changes merge with independent clefs and survive a plain XML roundtrip", () => {
  const pianoInitial = initial.replace('<clef>', '<staves>2</staves><clef number="1">').replace('</attributes>', '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>');
  const source = xml('<measure number="1">' + pianoInitial + note("C")
    + '<attributes><key><fifths>-1</fifths><mode>major</mode></key><clef number="1"><sign>F</sign><line>4</line></clef><clef number="2"><sign>G</sign><line>2</line></clef></attributes>'
    + note("B", -1, '<dot/>', 36, "half") + '<backup><duration>48</duration></backup>' + note("C", 0, "", 48, "whole", 5, 2) + '</measure>'
    + '<measure number="2">' + note("A") + '</measure>');
  const score = io.importWorkshopMusicXmlText(source).score;
  assert.strictEqual(score.parts.length, 2);
  assert.deepStrictEqual(changes(score.parts[0].measures[0]), [{ startSlot: 2, keyId: "F-major", clef: "bass" }]);
  assert.deepStrictEqual(changes(score.parts[1].measures[0]), [{ startSlot: 2, keyId: "F-major", clef: "treble" }]);
  score.bpm = 71;
  const exported = strippedNative(io.exportWorkshopMusicXmlText(score).data), restored = io.importWorkshopMusicXmlText(exported).score;
  assert.deepStrictEqual(timing(restored), timing(score));
  score.parts.forEach((part, index) => assert.deepStrictEqual(changes(restored.parts[index].measures[0]), changes(part.measures[0])));
  assert.strictEqual(model.workshopMeasureContext(restored, 1, 1).clef, "treble");
  const document = parser.parseWorkshopMusicXmlDocument(exported), bars = parser.musicXmlChildren(parser.musicXmlChild(document, "part"), "measure");
  assert.strictEqual(parser.musicXmlChildren(bars[1], "attributes").length, 0, "inherited end-of-bar context must not be reset by the next header");
});

test("context changes exactly at a barline become next-bar headers", () => {
  const source = xml('<measure number="1">' + initial + note("C", 0, "", 48, "whole")
    + '<attributes><key><fifths>2</fifths><mode>major</mode></key><clef><sign>F</sign><line>4</line></clef></attributes></measure><measure number="2">' + note("D") + '</measure>');
  const score = io.importWorkshopMusicXmlText(source).score;
  assert.strictEqual(score.parts[0].measures[0].contextChanges, undefined);
  assert.strictEqual(score.parts[0].measures[1].keyId, "D-major"); assert.strictEqual(score.parts[0].measures[1].clef, "bass");
});

test("numbered signatures are imported while mismatched written signs are reported without replacing pitch values", () => {
  const source = xml('<measure number="1">' + initial + '<attributes><key number="1"><fifths>2</fifths></key></attributes>'
    + note("F", 0.5, '<accidental>sharp</accidental>') + '</measure>');
  const imported = io.importWorkshopMusicXmlText(source);
  assert(imported.warnings.includes("unsupported-notation")); assert.strictEqual(imported.score.keyId, "D-major");
  assert.strictEqual(imported.score.parts[0].measures[0].events[0].pitch.alter, 0.5);
  assert.strictEqual(imported.score.parts[0].measures[0].events[0].accidentalDisplay, undefined);
  assert.strictEqual(io.exportWorkshopMusicXmlText(imported.score, { title: imported.title }).data, source);
});
function writtenSigns(xml) {
  const root=parser.parseWorkshopMusicXmlDocument(xml),part=parser.musicXmlChild(root,"part");
  return parser.musicXmlChildren(part,"measure").reduce((all,bar)=>all.concat(parser.musicXmlChildren(bar,"note").map(event=>{
    const accidental=parser.musicXmlChild(event,"accidental");return accidental ? {value:accidental.text,attrs:accidental.attrs}:null;
  })),[]);
}
test("ordinary required sharps and naturals stay automatic, repeated and key-signature pitches get no extra signs", () => {
  const score=model.createWorkshopDraft("Automatic",2).score;
  score.parts[0].measures[0].events=[1,1,0,0].map((alter,index)=>({id:"note-"+index,kind:"note",noteValue:"quarter",startSlot:index*2,pitch:{step:"F",alter,octave:4}}));
  score.parts[0].measures[1].keyId="G-major";
  score.parts[0].measures[1].events=[{id:"key-fis",kind:"note",noteValue:"whole",startSlot:0,pitch:{step:"F",alter:1,octave:4}}];
  const exported=strippedNative(io.exportWorkshopMusicXmlText(score).data);
  assert.deepStrictEqual(writtenSigns(exported).map(sign=>sign&&sign.value),["sharp",null,"natural",null,null]);
  writtenSigns(exported).filter(Boolean).forEach(sign=>assert.strictEqual(sign.attrs.cautionary,undefined));
  const imported=io.importWorkshopMusicXmlText(exported).score;
  assert(imported.parts[0].measures.every(bar=>bar.events.every(event=>!event.accidentalDisplay)));
  assert.deepStrictEqual(timing(imported),timing(score));
});
test("redundant reminders and explicitly forced required signs retain their intent through plain XML", () => {
  const source=xml('<measure number="1">'+initial+note("F",1,'<accidental>sharp</accidental>')+note("F",1,'<accidental>sharp</accidental>')+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source).score,events=imported.parts[0].measures[0].events;
  assert.strictEqual(events[0].accidentalDisplay,undefined);
  assert.deepStrictEqual(events[1].accidentalDisplay,{force:true});
  events[0].accidentalDisplay={force:true};
  const exported=strippedNative(io.exportWorkshopMusicXmlText(imported).data);
  writtenSigns(exported).filter(Boolean).forEach(sign=>assert.strictEqual(sign.attrs.cautionary,"yes"));
  const restored=io.importWorkshopMusicXmlText(exported).score;
  restored.parts[0].measures[0].events.forEach(event=>assert.deepStrictEqual(event.accidentalDisplay,{force:true,cautionary:true}));
});
test("automatic export respects an in-bar key change and shares memory across displayed cross-staff notes", () => {
  const score=model.createWorkshopDraft("Context signs",1).score,bar=score.parts[0].measures[0];
  bar.contextChanges=[{id:"key-change",startSlot:4,keyId:"G-major"}];
  bar.events=[1,1,1,0].map((alter,index)=>({id:"note-"+index,kind:"note",noteValue:"quarter",startSlot:index*2,pitch:{step:"F",alter,octave:4}}));
  const exported=strippedNative(io.exportWorkshopMusicXmlText(score).data);
  assert.deepStrictEqual(writtenSigns(exported).map(sign=>sign&&sign.value),["sharp",null,null,"natural"]);
  assert(io.importWorkshopMusicXmlText(exported).score.parts[0].measures[0].events.every(event=>!event.accidentalDisplay));
  const piano=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Cross staff",1).score,true);
  piano.parts[0].measures[0].events=[{id:"own",kind:"note",noteValue:"quarter",startSlot:0,pitch:{step:"C",alter:0,octave:4}},
    {id:"cross",kind:"note",noteValue:"quarter",startSlot:2,displayStaff:1,pitch:{step:"F",alter:1,octave:4}}];
  piano.parts[1].measures[0].events=[{id:"lower",kind:"note",noteValue:"quarter",startSlot:4,pitch:{step:"F",alter:1,octave:4}}];
  const crossExport=strippedNative(io.exportWorkshopMusicXmlText(piano).data);
  assert.deepStrictEqual(writtenSigns(crossExport).map(sign=>sign&&sign.value),[null,"sharp",null]);
  assert(io.importWorkshopMusicXmlText(crossExport).score.parts.every(part=>part.measures[0].events.every(event=>!event.accidentalDisplay)));
});
process.stdout.write("Editable MusicXML notation tests passed.\n");

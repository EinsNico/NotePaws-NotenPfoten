import { isValidWorkshopKeyId, workshopKeyAlter } from "./WorkshopTonality";
import { WORKSHOP_NOTE_UNITS, WORKSHOP_TICKS_PER_UNIT, workshopEventUnits, workshopRequestedUnits,
  workshopTimeTicks, workshopTimeOnGrid, workshopEventVoice, workshopRestDurationValues, isValidWorkshopTuplet, workshopTupletRatio } from "./WorkshopRhythm";
import { isValidWorkshopTies, repairWorkshopTies } from "./WorkshopTies";
import { isValidWorkshopSlurs, repairWorkshopSlurs, isValidWorkshopGlissandos, repairWorkshopGlissandos,
  isValidWorkshopTremolos, repairWorkshopTremolos } from "./WorkshopExpression";
import { indexWorkshopExpressionNotes } from './WorkshopExpression';
import { isValidWorkshopContextChanges, workshopContextAtSlot, workshopOrderedContextChanges } from "./WorkshopContextChanges";
import { isValidWorkshopFingerings } from "./WorkshopFingerings";
import { isValidWorkshopTupletDisplay } from "./WorkshopTupletDisplay";
import { isValidWorkshopPedal, workshopPedal, workshopPedalValue, workshopPedalTimelineEvents } from "./WorkshopPedal";
import { isValidWorkshopPitchContext, isValidWorkshopTranspose, workshopPitchContextOffset } from './WorkshopPitchContext';
import { isValidWorkshopNavigation, createWorkshopNavigationOrder } from './WorkshopNavigation';
import { WORKSHOP_EXPRESSION_ORNAMENTS, isValidWorkshopOrnamentAccidentals, isValidWorkshopOrnamentWavy, isValidWorkshopGraceTiming, isValidWorkshopSwing } from "./WorkshopPerformanceDetails";
import { WORKSHOP_MUSICXML_MAX_SOURCE_BYTES, WORKSHOP_MUSICXML_MAX_BYTES, musicXmlUtf8Encode } from "./WorkshopMusicXmlArchive";
export { WORKSHOP_NOTE_UNITS, WORKSHOP_SLOT_STEP, WORKSHOP_FINE_SLOT_STEP, WORKSHOP_TICKS_PER_UNIT, WORKSHOP_TRIPLET_SLOT_STEP,
  workshopEventUnits, workshopRequestedDots, workshopRequestedUnits, workshopMeasureGridStep,
  workshopTimeTicks, workshopTimeOnGrid, workshopEventVoice } from "./WorkshopRhythm";

export const WORKSHOP_STORAGE_KEY = "workshopLibrary";
export const WORKSHOP_VERSION = 1;
export const WORKSHOP_MAX_LIBRARY_CHARS = 128 * 1024 * 1024;
export const WORKSHOP_MAX_MEASURE_EVENTS = 64;
export const WORKSHOP_MAX_SCORE_MEASURES = 1000;
export const WORKSHOP_MAX_PIECE_REVISIONS = 64;
export const WORKSHOP_MAX_ARCHIVE_ASSET_BYTES = 2 * 1024 * 1024;
export const WORKSHOP_METERS = Object.freeze(["2/4", "3/4", "4/4", "5/4", "6/4", "3/8", "5/8", "6/8", "7/8", "9/8", "12/8", "2/2", "3/2"]);
export const WORKSHOP_CLEFS = Object.freeze(["treble", "bass", "alto", "tenor"]);
export const WORKSHOP_MIN_PITCH = 9;
export const WORKSHOP_MAX_PITCH = 96;
export const WORKSHOP_PITCH_ALTERS = Object.freeze([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);
export const WORKSHOP_DYNAMICS = Object.freeze(["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "sf", "sfz", "fp"]);
export const WORKSHOP_ARTICULATIONS = Object.freeze(["staccato", "staccatissimo", "accent", "tenuto", "strong-accent", "breath-mark", "caesura", "detached-legato"]);
export const WORKSHOP_MAX_PLAYBACK_BARS = 8000;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
let nextId = 0;

export function workshopId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `${prefix}-${Array.from(bytes).map(value => value.toString(16)).join("-")}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${(++nextId).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Clone JSON data without serializing large immutable source-XML/base64 strings
// again for every editor snapshot. Arrays/objects remain fully independent.
export function cloneWorkshop(value) {
  const ancestors=new Set();
  function copy(input,key,arrayEntry=false) {
    if (input && typeof input.toJSON==="function") input=input.toJSON(key);
    if (input instanceof Number || input instanceof String || input instanceof Boolean) input=input.valueOf();
    if (input===null || typeof input==="string" || typeof input==="boolean") return input;
    if (typeof input==="number") return Number.isFinite(input) ? (Object.is(input,-0) ? 0:input) : null;
    if (typeof input==="bigint" || Object.prototype.toString.call(input)==="[object BigInt]") throw new TypeError("Workshop JSON cannot contain BigInt values.");
    if (typeof input!=="object") return arrayEntry ? null : undefined;
    if (ancestors.has(input)) throw new TypeError("Workshop JSON cannot contain circular references.");
    ancestors.add(input);
    let output;
    if (Array.isArray(input)) output=Array.from({length:input.length},(_,index)=>copy(input[index],String(index),true));
    else {
      output={};
      Object.keys(input).forEach(name=>{
        const result=copy(input[name],name);
        if (result===undefined) return;
        if (name==="__proto__") Object.defineProperty(output,name,{value:result,enumerable:true,configurable:true,writable:true});
        else output[name]=result;
      });
    }
    ancestors.delete(input);return output;
  }
  const result=copy(value,"");
  if (result===undefined) throw new SyntaxError("Workshop JSON needs a serializable root value.");
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonical(value[key]); return result;
  }, {});
  return value;
}
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value, allowed) { return plain(value) && Object.keys(value).every(key => allowed.includes(key)); }
function id(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function date(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function unique(values) { return new Set(values).size === values.length; }

export const WORKSHOP_ORNAMENTS = WORKSHOP_EXPRESSION_ORNAMENTS;
export const WORKSHOP_NAVIGATION = Object.freeze(["segno","coda","fine","dc","ds","toCoda"]);
export const WORKSHOP_DIRECTION_TYPES = Object.freeze(["tempo","tempoRamp","dynamic","wedge","octaveShift","pedal","text","swing"]);
function boundedString(value,max=1024) { return typeof value === "string" && value.length <= max; }
export function isValidWorkshopSourceUrl(value) {
  if (!boundedString(value,2048) || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url=new URL(value);
    return ["http:","https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch (caught) { return false; }
}
export function isValidWorkshopSources(value) {
  return Array.isArray(value) && value.length<=16 && value.every(source=>keys(source,["label","url"])
    && boundedString(source.label,256) && isValidWorkshopSourceUrl(source.url));
}
export function isValidWorkshopAccidentalDisplay(value) {
  return keys(value,["force","enclosure","cautionary","editorial"]) && typeof value.force === "boolean"
    && (!Object.prototype.hasOwnProperty.call(value,"enclosure") || ["parentheses","bracket"].includes(value.enclosure))
    && ["cautionary","editorial"].every(key => !Object.prototype.hasOwnProperty.call(value,key) || typeof value[key] === "boolean");
}
function validEventAnnotations(event) {
  return (!Object.prototype.hasOwnProperty.call(event,"fermata") || Number.isFinite(event.fermata) && event.fermata >= 1.25 && event.fermata <= 4)
    && (!Object.prototype.hasOwnProperty.call(event,"fermataShape") || event.fermata && ["normal","angled","square"].includes(event.fermataShape))
    && (!Object.prototype.hasOwnProperty.call(event,"grace") || event.kind === "note" && event.grace === true)
    && (!Object.prototype.hasOwnProperty.call(event,"graceSlash") || event.grace===true && typeof event.graceSlash==="boolean")
    && (!Object.prototype.hasOwnProperty.call(event,"graceTiming") || event.grace===true && isValidWorkshopGraceTiming(event.graceTiming))
    && (!Object.prototype.hasOwnProperty.call(event,"ornament") || event.kind === "note" && WORKSHOP_ORNAMENTS.includes(event.ornament))
    && (!Object.prototype.hasOwnProperty.call(event,"ornamentLong") || ["mordent","inverted-mordent"].includes(event.ornament) && typeof event.ornamentLong==="boolean")
    && (!Object.prototype.hasOwnProperty.call(event,"ornamentPlacement") || event.kind==="note" && (event.ornament || event.ornamentWavy) && ["above","below"].includes(event.ornamentPlacement))
    && (!Object.prototype.hasOwnProperty.call(event,"ornamentWavy") || event.kind === "note" && isValidWorkshopOrnamentWavy(event.ornamentWavy))
    && (!Object.prototype.hasOwnProperty.call(event,"ornamentAccidentals") || event.kind === "note" && (event.ornament && event.ornament!=="tremolo" || event.ornamentWavy) && isValidWorkshopOrnamentAccidentals(event.ornamentAccidentals))
    && (!Object.prototype.hasOwnProperty.call(event,"tremoloMarks") || event.ornament==="tremolo" && Number.isInteger(event.tremoloMarks) && event.tremoloMarks>=1 && event.tremoloMarks<=4)
    && (!Object.prototype.hasOwnProperty.call(event,"twoNoteTremolo") || event.kind==="note" && event.twoNoteTremolo===true)
    && (!Object.prototype.hasOwnProperty.call(event,"arpeggio") || event.kind === "note" && ["up","down"].includes(event.arpeggio))
    && (!Object.prototype.hasOwnProperty.call(event,"lyric") || event.kind === "note" && boundedString(event.lyric))
    && (!Object.prototype.hasOwnProperty.call(event,"lyrics") || event.kind==="note" && Array.isArray(event.lyrics) && event.lyrics.length>0 && event.lyrics.length<=8
      && unique(event.lyrics.map(verse=>verse && verse.number)) && event.lyrics.every(verse=>keys(verse,["number","text","syllabic","extend"])
        && boundedString(verse.number,32) && verse.number.length>0 && boundedString(verse.text,1024)
        && (verse.syllabic===undefined || ["single","begin","middle","end"].includes(verse.syllabic))
        && (verse.extend===undefined || ["start","continue","stop"].includes(verse.extend))))
    && (!Object.prototype.hasOwnProperty.call(event,"displayStaff") || ["note","rest"].includes(event.kind) && [0,1].includes(event.displayStaff))
    && (!Object.prototype.hasOwnProperty.call(event,"accidentalDisplay") || event.kind === "note" && isValidWorkshopAccidentalDisplay(event.accidentalDisplay))
    && (!Object.prototype.hasOwnProperty.call(event,"stem") || event.kind === "note" && ["up","down"].includes(event.stem));
}
export function isValidWorkshopDirection(direction,limit=Infinity) {
  if (!keys(direction,["id","startSlot","type","value","endSlot","endBarId","pedal"]) || !id(direction.id)
    || !workshopTimeOnGrid(direction.startSlot) || direction.startSlot > limit || !WORKSHOP_DIRECTION_TYPES.includes(direction.type)) return false;
  const span=["tempoRamp","wedge","octaveShift"].includes(direction.type);
  if (span && (!workshopTimeOnGrid(direction.endSlot) || !direction.endBarId && (direction.endSlot <= direction.startSlot || direction.endSlot > limit))) return false;
  if (!span && (Object.prototype.hasOwnProperty.call(direction,"endSlot") || Object.prototype.hasOwnProperty.call(direction,"endBarId"))) return false;
  if (direction.endBarId !== undefined && !id(direction.endBarId)) return false;
  if (Object.prototype.hasOwnProperty.call(direction,"pedal") && direction.type !== "pedal") return false;
  if (["tempo","tempoRamp"].includes(direction.type)) return Number.isInteger(direction.value) && direction.value >= 25 && direction.value <= 240;
  if (direction.type === "dynamic") return WORKSHOP_DYNAMICS.includes(direction.value);
  if (direction.type === "wedge") return ["crescendo","diminuendo"].includes(direction.value);
  if (direction.type === "octaveShift") return [-2,-1,1,2].includes(direction.value);
  if (direction.type === "swing") return isValidWorkshopSwing(direction.value);
  if (direction.type === "pedal") return ["down","up","half"].includes(direction.value)
    && (!Object.prototype.hasOwnProperty.call(direction,"pedal") || isValidWorkshopPedal(direction.pedal) && direction.value === workshopPedalValue(workshopPedal(direction)));
  return boundedString(direction.value,2048);
}
function validMeasureAnnotations(measure,limit) {
  return (!Object.prototype.hasOwnProperty.call(measure,"directions") || Array.isArray(measure.directions) && measure.directions.length <= 128
    && measure.directions.every(direction => isValidWorkshopDirection(direction,limit)))
    && (!Object.prototype.hasOwnProperty.call(measure,"ending") || Array.isArray(measure.ending) && measure.ending.length > 0
      && unique(measure.ending) && measure.ending.every(value => Number.isInteger(value) && value >= 1 && value <= 8))
    && (!Object.prototype.hasOwnProperty.call(measure,"navigation") || isValidWorkshopNavigation(measure.navigation));
}
function validArchivePath(value) {
  return boundedString(value,240) && value.length>0 && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every(segment=>segment && segment!=="." && segment!=="..");
}
function validArchiveAssets(assets) {
  if (!Array.isArray(assets) || assets.length>125 || !unique(assets.map(asset=>asset && asset.path))) return false;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bytes=0;
  return Array.from(assets).every(asset=>{
    if (!keys(asset,['path','data']) || !validArchivePath(asset.path) || typeof asset.data!=='string') return false;
    const data=asset.data;
    if (data.length>4*Math.ceil(WORKSHOP_MAX_ARCHIVE_ASSET_BYTES/3) || data.length%4!==0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return false;
    const padding=data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    // Padding bits must be zero as in a canonical encoding. Count decoded
    // bytes per attachment; each attachment has its own Base64 padding.
    if (padding && alphabet.indexOf(data[data.length-padding-1]) % (padding===2 ? 16 : 4)!==0) return false;
    bytes+=data.length/4*3-padding;
    return bytes<=WORKSHOP_MAX_ARCHIVE_ASSET_BYTES;
  });
}

function validMusicXmlSource(source) {
  if (!boundedString(source,WORKSHOP_MUSICXML_MAX_BYTES)) return false;
  const bytes=musicXmlUtf8Encode(source).length;
  return bytes<=WORKSHOP_MUSICXML_MAX_BYTES && (bytes<=WORKSHOP_MUSICXML_MAX_SOURCE_BYTES
    || /<miscellaneous-field\b[^>]*\bname\s*=\s*["']notenpfoten-(?:preserved-musicxml|editor-score-v1)["']/.test(source));
}

function validScoreAnnotations(score) {
  const metadata=score.metadata,layout=score.layout,xml=score.musicXml;
  return (!Object.prototype.hasOwnProperty.call(score,"metadata") || keys(metadata,["title","composer","arranger","lyricist","copyright","subtitle","license","sources"])
      && Object.keys(metadata).every(key => key==="sources" ? isValidWorkshopSources(metadata[key]) : boundedString(metadata[key],2048)))
    && (!Object.prototype.hasOwnProperty.call(score,"layout") || keys(layout,["pageWidth","pageHeight","marginLeft","marginRight","marginTop","marginBottom","staffDistance","systemDistance","fontFamily","fontSize","barsPerSystem","systemBreaks","pageBreaks"])
      && Object.keys(layout).every(key => key === "fontFamily" ? boundedString(layout[key],200)
        : ["systemBreaks","pageBreaks"].includes(key) ? Array.isArray(layout[key]) && layout[key].length <= 1000 && unique(layout[key]) && layout[key].every(id)
          : key === "barsPerSystem" ? Number.isInteger(layout[key]) && layout[key] >= 1 && layout[key] <= 8
            : Number.isFinite(layout[key]) && layout[key] >= 0 && layout[key] <= 10000))
    && (!Object.prototype.hasOwnProperty.call(score,"musicXml") || keys(xml,["sourceXml","fingerprint","warnings","rootPath","archiveAssets"])
      // Editor exports also contain Base64 source and the editable score.
      // Ordinary documents keep the separate 30 MiB original-file budget.
      && validMusicXmlSource(xml.sourceXml)
      && boundedString(xml.fingerprint,200)
      && Array.isArray(xml.warnings) && xml.warnings.length <= 500 && xml.warnings.every(value => boundedString(value,4096))
      && (xml.rootPath===undefined || validArchivePath(xml.rootPath))
      && (xml.archiveAssets===undefined || validArchiveAssets(xml.archiveAssets)));
}

export function workshopPitchValue(pitch) {
  return pitch.octave * 12 + SEMITONES[STEPS.indexOf(pitch.step)] + pitch.alter;
}

export function workshopPitchFromValue(value) {
  if (!Number.isFinite(value) || !Number.isInteger(value * 2)) return null;
  const index = ((value % 12) + 12) % 12;
  // Preserve quarter tones when a selection is transposed. The nearest lower
  // natural keeps the existing sharp spelling for integer semitones as well.
  const stepIndex = SEMITONES.reduce((found, semitone, position) => semitone <= index ? position : found, 0);
  return { step: STEPS[stepIndex], alter: index - SEMITONES[stepIndex], octave: Math.floor(value / 12) };
}

function validPitch(pitch) {
  return keys(pitch, ["step", "alter", "octave"]) && STEPS.includes(pitch.step)
    && WORKSHOP_PITCH_ALTERS.includes(pitch.alter) && Number.isInteger(pitch.octave) && pitch.octave >= 0 && pitch.octave <= 8
    && workshopPitchValue(pitch) >= WORKSHOP_MIN_PITCH && workshopPitchValue(pitch) <= WORKSHOP_MAX_PITCH;
}

export function isValidWorkshopMeter(meter) {
  if (typeof meter !== "string" || !/^\d{1,2}(?:\+\d{1,2}){0,7}\/\d{1,2}$/.test(meter)) return false;
  const [beats,denominator]=meter.split("/");
  const numbers=beats.split("+").map(Number);
  return numbers.every(value => value >= 1 && value <= 32) && numbers.reduce((a,b)=>a+b,0) <= 64
    && [1,2,4,8,16,32,64].includes(Number(denominator));
}
export function workshopMeterUnits(meter) {
  if (!isValidWorkshopMeter(meter)) return null;
  const [beats,denominator] = meter.split("/");
  return beats.split("+").reduce((sum,value)=>sum+Number(value),0)*8/Number(denominator);
}

export function workshopMeasureUnitsLimit(measure, meter = "4/4") {
  const limit = workshopMeterUnits(plain(measure) && Object.prototype.hasOwnProperty.call(measure, "meter") ? measure.meter : meter);
  if (!plain(measure) || !Object.prototype.hasOwnProperty.call(measure, "pickupUnits")) return limit;
  return workshopTimeOnGrid(measure.pickupUnits) && workshopTimeTicks(measure.pickupUnits) > 0 && measure.pickupUnits < limit ? measure.pickupUnits : null;
}

// Each field inherits independently until the next explicit change.
export function workshopMeasureContext(score, index, partIndex = 0) {
  const part = plain(score) && Array.isArray(score.parts) && Number.isInteger(partIndex) && partIndex >= 0 && score.parts[partIndex];
  if (!plain(part) || !isValidWorkshopMeter(score.meter) || !WORKSHOP_CLEFS.includes(part.clef)
    || !Array.isArray(part.measures) || !Number.isInteger(index) || index < 0 || index >= part.measures.length) return null;
  let meter = score.meter;
  let clef = part.clef;
  let keyId = part.keyId || score.keyId;
  let dynamic = "mf";
  let pitchContext=['clefOctave','transpose'].reduce((result,key)=>{if(Object.prototype.hasOwnProperty.call(part,key))result[key]=part[key];return result;},{});
  for (let cursor = 0; cursor <= index; cursor++) {
    const measure = part.measures[cursor];
    if (!plain(measure)) return null;
    if (Object.prototype.hasOwnProperty.call(measure, "meter")) meter = measure.meter;
    if (Object.prototype.hasOwnProperty.call(measure, "clef")) clef = measure.clef;
    if (Object.prototype.hasOwnProperty.call(measure, "keyId")) keyId = measure.keyId;
    if (Object.prototype.hasOwnProperty.call(measure, "dynamic")) dynamic = measure.dynamic;
    ['clefOctave','transpose'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(measure,key))pitchContext[key]=measure[key];});
    if (!isValidWorkshopMeter(meter) || !WORKSHOP_CLEFS.includes(clef) || !isValidWorkshopPitchContext(pitchContext)
      || !isValidWorkshopKeyId(keyId) || !WORKSHOP_DYNAMICS.includes(dynamic)) return null;
    if (cursor < index) {
      const final = workshopContextAtSlot(measure, Infinity, Object.assign({ clef, keyId },pitchContext));
      clef = final.clef; keyId = final.keyId;
      pitchContext=['clefOctave','transpose'].reduce((result,key)=>{if(Object.prototype.hasOwnProperty.call(final,key))result[key]=final[key];return result;},{});
    }
  }
  return Object.assign({ meter, clef, keyId, dynamic, units: index === 0 && score.pickupUnits !== undefined ? score.pickupUnits : workshopMeterUnits(meter) },pitchContext);
}

export function workshopMeasureContextAtSlot(score, index, slot, partIndex = 0) {
  const context = workshopMeasureContext(score, index, partIndex);
  return context ? workshopContextAtSlot(score.parts[partIndex].measures[index], slot, context) : null;
}

export function resolveWorkshopMeasure(score, index, partIndex = 0) {
  const context = workshopMeasureContext(score, index, partIndex);
  if (!context) return null;
  const measure = Object.assign(cloneWorkshop(score.parts[partIndex].measures[index]), {
    meter: context.meter, clef: context.clef, keyId: context.keyId, dynamic: context.dynamic
  });
  ['clefOctave','transpose'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(context,key))measure[key]=cloneWorkshop(context[key]);});
  if (index === 0 && score.pickupUnits !== undefined) measure.pickupUnits = score.pickupUnits;
  return measure;
}

// Legacy scores store events in sequence. Explicit positions let several notes
// share time while keeping saved legacy revisions byte-for-byte unchanged.
export function workshopMeasureEvents(measure) {
  const cursors = new Map();
  return measure.events.map(event => {
    const voice = workshopEventVoice(event);
    const startSlot = Object.prototype.hasOwnProperty.call(event, "startSlot") ? event.startSlot : (cursors.get(voice) || 0);
    cursors.set(voice, (workshopTimeTicks(startSlot) + (event.grace ? 0 : workshopTimeTicks(workshopEventUnits(event)))) / WORKSHOP_TICKS_PER_UNIT);
    return Object.assign({}, event, { startSlot });
  });
}

export function workshopMeasureUnits(measure) {
  return workshopMeasureEvents(measure).reduce((end, event) =>
    Math.max(end,event.startSlot+(event.grace ? 0 : workshopEventUnits(event))),0);
}

export function workshopOccupiedSlots(measure) {
  const intervals=workshopMeasureEvents(measure).filter(event => event.kind === "note" && !event.grace)
    .map(event => [workshopTimeTicks(event.startSlot),workshopTimeTicks(event.startSlot+workshopEventUnits(event))]).sort((a,b)=>a[0]-b[0]);
  let total=0,start=null,end=null;
  intervals.forEach(interval => {
    if (start === null) { start=interval[0]; end=interval[1]; }
    else if (interval[0] <= end) end=Math.max(end,interval[1]);
    else { total+=end-start; start=interval[0]; end=interval[1]; }
  });
  return (total+(start===null ? 0 : end-start))/WORKSHOP_TICKS_PER_UNIT;
}

// A beam joins a close run of complete note onsets within one measure.
// Every note at a chosen onset belongs to the group, including chord tones.
export function isValidWorkshopBeamGroup(events, groupId) {
  if (!Array.isArray(events) || !id(groupId) || events.some(event => !plain(event))) return false;
  const members = events.filter(event => event.beamGroupId === groupId);
  if (members.length < 2 || members.some(event => event.kind !== "note"
    || !["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth", "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"].includes(event.noteValue)
    || !Number.isFinite(event.startSlot))) return false;
  const voice = workshopEventVoice(members[0]);
  if (members.some(event => workshopEventVoice(event) !== voice)) return false;
  const starts = Array.from(new Set(members.map(event => workshopTimeTicks(event.startSlot)))).sort((a, b) => a - b);
  if (starts.length < 2) return false;
  const memberIds = new Set(members.map(event => event.id));
  if (events.some(event => event.kind === "note" && workshopEventVoice(event) === voice && workshopTimeTicks(event.startSlot) >= starts[0]
    && workshopTimeTicks(event.startSlot) <= starts[starts.length - 1] && !memberIds.has(event.id))) return false;
  if (starts.slice(0, -1).some((start, index) => {
    const duration = Math.max(...members.filter(event => workshopTimeTicks(event.startSlot) === start)
      .map(event => workshopTimeTicks(workshopEventUnits(event))));
    const gap = starts[index + 1] - start - duration;
    return gap < 0 || gap > WORKSHOP_TICKS_PER_UNIT;
  })) return false;
  return !events.some(event => event.kind === "rest" && workshopEventVoice(event) === voice && members.some(note =>
    workshopTimeTicks(event.startSlot) < workshopTimeTicks(note.startSlot) + workshopTimeTicks(workshopEventUnits(note))
      && workshopTimeTicks(event.startSlot) + workshopTimeTicks(workshopEventUnits(event)) > workshopTimeTicks(note.startSlot)));
}

export function isValidWorkshopTripletGroup(events, groupId) {
  if (!Array.isArray(events) || !id(groupId) || events.some(event => !plain(event))) return false;
  const members = events.filter(event => event.tupletGroupId === groupId);
  if (!members.length) return false;
  const first = members[0];
  const voice = workshopEventVoice(first);
  if (members.some(event => !["note","rest"].includes(event.kind) || !isValidWorkshopTuplet(event.tuplet) || !same(event.tuplet, first.tuplet) || event.noteValue !== first.noteValue
    || (event.dots || 0) !== (first.dots || 0) || workshopEventVoice(event) !== voice || !workshopTimeOnGrid(event.startSlot))) return false;
  const starts = Array.from(new Set(members.map(event => workshopTimeTicks(event.startSlot)))).sort((a,b) => a-b);
  const duration = workshopTimeTicks(workshopEventUnits(first));
  if (starts.length !== workshopTupletRatio(first).actual || starts.slice(1).some((start,index) => start - starts[index] !== duration)) return false;
  const ids = new Set(members.map(event => event.id));
  return !events.some(event => !ids.has(event.id) && workshopEventVoice(event) === voice && (event.kind === "note"
    && workshopTimeTicks(event.startSlot) >= starts[0] && workshopTimeTicks(event.startSlot) <= starts[starts.length - 1] && !ids.has(event.id)
    || event.kind === "rest" && workshopTimeTicks(event.startSlot) < starts[starts.length - 1] + duration
      && workshopTimeTicks(event.startSlot) + workshopTimeTicks(workshopEventUnits(event)) > starts[0]));
}

export function isValidWorkshopMeasure(measure, meter = "4/4") {
  const limit = workshopMeasureUnitsLimit(measure, meter);
  if (!keys(measure, ["id", "events", "meter", "clef", "clefOctave", "transpose", "keyId", "dynamic", "pickupUnits", "repeatStart", "repeatEnd", "directions", "ending", "navigation", "contextChanges"]) || limit === null
    || !isValidWorkshopPitchContext(measure)
    || (Object.prototype.hasOwnProperty.call(measure, "clef") && !WORKSHOP_CLEFS.includes(measure.clef))
    || (Object.prototype.hasOwnProperty.call(measure, "keyId") && !isValidWorkshopKeyId(measure.keyId))
    || (Object.prototype.hasOwnProperty.call(measure, "dynamic") && !WORKSHOP_DYNAMICS.includes(measure.dynamic))
    || (Object.prototype.hasOwnProperty.call(measure, "repeatStart") && measure.repeatStart !== true)
    || (Object.prototype.hasOwnProperty.call(measure, "repeatEnd") && (!Number.isInteger(measure.repeatEnd) || measure.repeatEnd < 2 || measure.repeatEnd > 8))
    || (Object.prototype.hasOwnProperty.call(measure, "id") && !id(measure.id))
    || !Array.isArray(measure.events) || measure.events.length > WORKSHOP_MAX_MEASURE_EVENTS
    || !validMeasureAnnotations(measure,limit)
    || Object.prototype.hasOwnProperty.call(measure, "contextChanges") && !isValidWorkshopContextChanges(measure.contextChanges, limit)) return false;
  let timed = null;
  const valid = Array.from(measure.events).every(event => {
    if (!keys(event, ["id", "kind", "noteValue", "pitch", "startSlot", "dots", "originalNoteValue", "originalDots", "beamGroupId",
      "voice", "tuplet", "tupletGroupId", "tupletDisplay", "articulations", "fingering", "fingerings", "pedal", "fermata", "fermataShape", "grace", "graceSlash", "graceTiming", "ornament", "ornamentLong", "ornamentPlacement", "ornamentAccidentals", "ornamentWavy", "tremoloMarks", "twoNoteTremolo", "arpeggio", "lyric", "lyrics", "displayStaff", "stem", "accidentalDisplay", "autoRest"])) return false;
    const hasTime = Object.prototype.hasOwnProperty.call(event, "startSlot");
    const hasOriginal = Object.prototype.hasOwnProperty.call(event, "originalNoteValue");
    const hasDots = Object.prototype.hasOwnProperty.call(event, "dots");
    const hasOriginalDots = Object.prototype.hasOwnProperty.call(event, "originalDots");
    const hasBeam = Object.prototype.hasOwnProperty.call(event, "beamGroupId");
    if (timed === null) timed = hasTime;
    if (timed !== hasTime) return false;
    return id(event.id)
      && Object.prototype.hasOwnProperty.call(WORKSHOP_NOTE_UNITS, event.noteValue)
      && (!Object.prototype.hasOwnProperty.call(event, "voice") || Number.isInteger(event.voice) && event.voice >= 1 && event.voice <= 4)
      && (!Object.prototype.hasOwnProperty.call(event, "tuplet") || isValidWorkshopTuplet(event.tuplet))
      && (!Object.prototype.hasOwnProperty.call(event, "tupletDisplay") || ["note","rest"].includes(event.kind) && isValidWorkshopTuplet(event.tuplet) && isValidWorkshopTupletDisplay(event.tupletDisplay))
      && (!Object.prototype.hasOwnProperty.call(event, "tupletGroupId") || hasTime && ["note","rest"].includes(event.kind) && isValidWorkshopTuplet(event.tuplet) && id(event.tupletGroupId))
      && (!Object.prototype.hasOwnProperty.call(event, "articulations") || event.kind === "note" && Array.isArray(event.articulations)
        && event.articulations.length > 0 && unique(event.articulations) && Array.from(event.articulations).every(value => WORKSHOP_ARTICULATIONS.includes(value)))
      && (!Object.prototype.hasOwnProperty.call(event, "fingering") || event.kind === "note" && Number.isInteger(event.fingering) && event.fingering >= 1 && event.fingering <= 5)
      && (!Object.prototype.hasOwnProperty.call(event, "fingerings") || event.kind === "note" && isValidWorkshopFingerings(event.fingerings)
        && !Object.prototype.hasOwnProperty.call(event, "fingering"))
      && (!Object.prototype.hasOwnProperty.call(event, "pedal") || ["down", "up"].includes(event.pedal))
      && (!Object.prototype.hasOwnProperty.call(event, "autoRest") || event.kind === "rest" && typeof event.autoRest === "boolean")
      && (!hasDots || Number.isInteger(event.dots) && event.dots >= 0 && event.dots <= 3)
      && (!hasOriginalDots || hasOriginal && Number.isInteger(event.originalDots) && event.originalDots >= 0 && event.originalDots <= 3)
      && validEventAnnotations(event)
      && (!hasOriginal || hasTime && event.kind === "note"
        && Object.prototype.hasOwnProperty.call(WORKSHOP_NOTE_UNITS, event.originalNoteValue)
        && workshopTimeTicks(workshopRequestedUnits(event)) >= workshopTimeTicks(workshopEventUnits(event)))
      && (!hasBeam || hasTime && event.kind === "note" && id(event.beamGroupId))
      && workshopTimeOnGrid(workshopEventUnits(event))
      && (!hasTime || workshopTimeOnGrid(event.startSlot)
        && workshopTimeTicks(event.startSlot)+(event.grace ? 0:workshopTimeTicks(workshopEventUnits(event))) <= workshopTimeTicks(limit))
      && (event.kind === "rest" ? event.pitch === null : event.kind === "note" && validPitch(event.pitch));
  });
  if (!valid || !unique(measure.events.map(event => event.id)) || workshopTimeTicks(workshopMeasureUnits(measure)) > workshopTimeTicks(limit)) return false;
  const events = workshopMeasureEvents(measure);
  const beamGroups = Array.from(new Set(events.filter(event => event.beamGroupId).map(event => event.beamGroupId)));
  const tuplets = Array.from(new Set(events.filter(event => event.tupletGroupId).map(event => event.tupletGroupId)));
  return beamGroups.every(groupId => isValidWorkshopBeamGroup(events, groupId)) && tuplets.every(groupId => isValidWorkshopTripletGroup(events, groupId));
}

export function isValidWorkshopScore(score) {
  if (!keys(score, ["version", "bpm", "meter", "keyId", "parts", "ties", "slurs", "glissandos", "tremolos", "pickupUnits", "metadata", "layout", "musicXml"])
    || score.version !== WORKSHOP_VERSION || !isValidWorkshopMeter(score.meter) || !isValidWorkshopKeyId(score.keyId)
    || !Number.isInteger(score.bpm) || score.bpm < 25 || score.bpm > 240
    || (Object.prototype.hasOwnProperty.call(score, "pickupUnits") && (!workshopTimeOnGrid(score.pickupUnits) || workshopTimeTicks(score.pickupUnits) <= 0))
    || !Array.isArray(score.parts) || score.parts.length < 1 || score.parts.length > 2
    || !validScoreAnnotations(score)) return false;
  const events = [];
  const bars = [];
  const meters = [];
  const keyIds = [], keyProfiles = [], contextChanges = [];
  const repeats = [];
  const directions = [], directionLocations = new Map(), barContexts = new Map();
  let barCount = null;
  const valid = Array.from(score.parts).every((part, partIndex) => {
    if (!keys(part, partIndex === 0 ? ["id", "clef", "clefOctave", "transpose", "keyId", "measures"] : ["id", "clef", "clefOctave", "transpose", "keyId", "measures", "enabled"])
      || !isValidWorkshopPitchContext(part)
      || part.id !== (partIndex === 0 ? "right" : "left") || !WORKSHOP_CLEFS.includes(part.clef)
      || part.keyId!==undefined && !isValidWorkshopKeyId(part.keyId)
      || (Object.prototype.hasOwnProperty.call(part, "enabled") && typeof part.enabled !== "boolean")
      || !Array.isArray(part.measures) || part.measures.length < 1
      || part.measures.length > WORKSHOP_MAX_SCORE_MEASURES) return false;
    if (barCount === null) barCount = part.measures.length;
    if (part.measures.length !== barCount) return false;
    let meter = score.meter;
    let keyId = part.keyId || score.keyId;
    return Array.from(part.measures).every((measure, index) => {
      if (plain(measure) && Object.prototype.hasOwnProperty.call(measure, "meter")) meter = measure.meter;
      if (plain(measure) && Object.prototype.hasOwnProperty.call(measure, "keyId")) keyId = measure.keyId;
      // pickupUnits belongs to the score's first position, never a stored bar.
      if (!plain(measure) || Object.prototype.hasOwnProperty.call(measure, "pickupUnits")) return false;
      const contextual = index === 0 && score.pickupUnits !== undefined ? Object.assign({}, measure, { pickupUnits:score.pickupUnits }) : measure;
      if (!isValidWorkshopMeasure(contextual, meter) || !id(measure.id)) return false;
      if (partIndex === 0) {
        meters[index] = meter; keyIds[index] = keyId;
        keyProfiles[index] = workshopOrderedContextChanges(measure).filter(change => change.keyId);
        repeats[index] = [measure.repeatStart || false, measure.repeatEnd || null];
      } else if (meters[index] !== meter
        || repeats[index][0] !== (measure.repeatStart || false) || repeats[index][1] !== (measure.repeatEnd || null)) return false;
      (measure.contextChanges || []).forEach(change => contextChanges.push(change.id));
      keyId = workshopContextAtSlot(measure, Infinity, {keyId}).keyId;
      bars.push(measure.id);
      barContexts.set(measure.id,{partIndex,index,units:workshopMeasureUnitsLimit(contextual,meter)});
      (measure.directions || []).forEach(direction => {directions.push(direction);directionLocations.set(direction.id,{partIndex,index,barId:measure.id});});
      measure.events.forEach(event => events.push(event.id));
      return true;
    });
  });
  return valid && unique(bars) && unique(events) && unique(contextChanges) && unique(directions.map(direction => direction.id))
    && directions.every(direction => {
      if (!direction.endBarId) return true;
      const target=barContexts.get(direction.endBarId),source=directionLocations.get(direction.id);
      return target && target.partIndex===source.partIndex && target.index>=source.index && direction.endSlot<=target.units
        && (target.index>source.index || direction.endSlot>direction.startSlot);
    })
    && ["systemBreaks","pageBreaks"].every(field => !(score.layout && score.layout[field]) || score.layout[field].every(barId => bars.includes(barId)))
    && playbackBarOrder(score) !== null
    && (!score.parts.some(part=>part.clefOctave!==undefined || part.transpose!==undefined || part.measures.some(bar=>bar.clefOctave!==undefined || bar.transpose!==undefined || (bar.contextChanges || []).some(change=>change.clefOctave!==undefined || change.transpose!==undefined)))
      || Array.from(indexWorkshopExpressionNotes(score).values()).every(note=>{const value=workshopPitchValue(note.soundingPitch);return value>=WORKSHOP_MIN_PITCH && value<=WORKSHOP_MAX_PITCH;}))
    && isValidWorkshopTies(score) && isValidWorkshopSlurs(score) && isValidWorkshopGlissandos(score) && isValidWorkshopTremolos(score);
}

function repairWorkshopGraphs(score) {
  const next=repairWorkshopGlissandos(repairWorkshopTremolos(repairWorkshopSlurs(repairWorkshopTies(score))));
  const barIds=new Set(next.parts.reduce((all,part)=>all.concat(part.measures.map(bar=>bar.id)),[]));
  next.parts.forEach(part=>{
    let meter=next.meter;
    part.measures.forEach((bar,index)=>{
      if (Object.prototype.hasOwnProperty.call(bar,'meter')) meter=bar.meter;
      const contextual=index===0 && next.pickupUnits!==undefined ? Object.assign({},bar,{pickupUnits:next.pickupUnits}) : bar;
      const units=workshopMeasureUnitsLimit(contextual,meter);
      if (bar.directions) bar.directions=bar.directions.map(direction=>{
        if (!direction.endBarId || barIds.has(direction.endBarId)) return direction;
        const shortened=Object.assign({},direction,{endSlot:units});
        delete shortened.endBarId; return shortened;
      }).filter(direction=>!direction.endSlot || direction.endBarId || direction.endSlot>direction.startSlot);
    });
  });
  if (next.layout) ["systemBreaks","pageBreaks"].forEach(field=>{
    if (next.layout[field]) next.layout[field]=next.layout[field].filter(barId=>barIds.has(barId));
  });
  return next;
}

// A deliberate shorter meter or pickup may remove silent tails, but never a
// sounding note. Legacy sequential events stay sequential when a rest splits.
function trimWorkshopSilentOverflow(score) {
  const plans = [];
  for (const part of score.parts) {
    let meter = score.meter;
    for (let index = 0; index < part.measures.length; index++) {
      const measure = part.measures[index];
      if (Object.prototype.hasOwnProperty.call(measure, "meter")) meter = measure.meter;
      const contextual = { meter };
      if (index === 0 && score.pickupUnits !== undefined) contextual.pickupUnits = score.pickupUnits;
      const limit = workshopMeasureUnitsLimit(contextual);
      if (limit === null) return null;
      const limitTicks = workshopTimeTicks(limit), events = workshopMeasureEvents(measure);
      if (events.some(event => event.kind === "note"
        && workshopTimeTicks(event.startSlot) + workshopTimeTicks(workshopEventUnits(event)) > limitTicks)) return null;
      plans.push({ measure, events, limitTicks });
    }
  }
  plans.forEach(({ measure, events, limitTicks }) => {
    const extraIds = new Set();
    const trimmed = [];
    measure.events.forEach((original, index) => {
      const event = events[index];
      const start = workshopTimeTicks(event.startSlot), end = start + workshopTimeTicks(workshopEventUnits(event));
      if (event.kind !== "rest" || end <= limitTicks) { trimmed.push(original); return; }
      if (start >= limitTicks) return;
      let cursor = start;
      workshopRestDurationValues((limitTicks - start) / WORKSHOP_TICKS_PER_UNIT).forEach((value, fragmentIndex) => {
        const fragment = cloneWorkshop(original);
        delete fragment.dots; delete fragment.tuplet; delete fragment.tupletDisplay;
        Object.assign(fragment, value);
        if (Object.prototype.hasOwnProperty.call(original, "startSlot")) fragment.startSlot = cursor / WORKSHOP_TICKS_PER_UNIT;
        if (fragmentIndex > 0) {
          fragment.id = workshopId("rest"); extraIds.add(fragment.id); delete fragment.pedal;
        }
        trimmed.push(fragment); cursor += workshopTimeTicks(workshopEventUnits(fragment));
      });
    });
    // At the event limit the omitted tail remains exact implicit silence; no
    // original sounding note or retained first rest fragment is discarded.
    measure.events = trimmed.length > WORKSHOP_MAX_MEASURE_EVENTS ? trimmed.filter(event => !extraIds.has(event.id)) : trimmed;
  });
  return score;
}

// Repeat frames track each pass, including skipped first/second endings. All
// written navigation jumps execute once, so malformed imported paths terminate.
function playbackBarOrder(score) {
  return createWorkshopNavigationOrder(score,WORKSHOP_MAX_PLAYBACK_BARS);
}

export function workshopPlaybackBarOrder(score) { return isValidWorkshopScore(score) ? playbackBarOrder(score) : null; }

function isInitialWorkshopDynamic(direction) {
  return direction.type === "dynamic" && workshopTimeTicks(direction.startSlot) === 0;
}
export function setWorkshopMeasureDirections(score,index,directions,partIndex=0) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || !score.parts[partIndex] || !score.parts[partIndex].measures[index] || !Array.isArray(directions)) return null;
  const next=cloneWorkshop(score),previous=score.parts[partIndex].measures[index],bar=next.parts[partIndex].measures[index];
  if (directions.length) bar.directions=cloneWorkshop(directions);
  else delete bar.directions;
  if (!isValidWorkshopScore(next)) return null;
  // The initial direction is editable; its context copy only supplies inheritance.
  // Moving/removing it must not leave the old imported dynamic at the bar start.
  const initial=(bar.directions || []).filter(isInitialWorkshopDynamic);
  if (initial.length) bar.dynamic=initial[initial.length-1].value;
  else if ((previous.directions || []).some(direction => isInitialWorkshopDynamic(direction) && direction.value === previous.dynamic)) delete bar.dynamic;
  return next;
}
export function setWorkshopMeasureNavigation(score,index,changes,options={}) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || !score.parts[0].measures[index] || !keys(changes,["ending","navigation"])) return null;
  const next=cloneWorkshop(score);
  next.parts.forEach(part=>Object.keys(changes).forEach(field=>{
    if (changes[field] === null || Array.isArray(changes[field]) && !changes[field].length) delete part.measures[index][field];
    else part.measures[index][field]=cloneWorkshop(changes[field]);
  }));
  if(options.rename) {
    const {kind,from,to}=options.rename;
    if(!['segno','coda'].includes(kind) || typeof from!=='string' || typeof to!=='string')return null;
    const jumpKind=kind==='segno'?'ds':'toCoda';
    next.parts.forEach(part=>part.measures.forEach(bar=>(bar.navigation || []).forEach(entry=>{if(entry && typeof entry==='object' && entry.kind===jumpKind && entry.target===from){if(to)entry.target=to;else delete entry.target;}})));
  }
  return isValidWorkshopScore(next) ? next : null;
}
export function setWorkshopMetadata(score,metadata) {
  if (!isValidWorkshopScore(score)) return null;
  const next=cloneWorkshop(score);
  if (metadata===null) delete next.metadata; else next.metadata=cloneWorkshop(metadata);
  return isValidWorkshopScore(next) ? next : null;
}
export function setWorkshopLayout(score,layout) {
  if (!isValidWorkshopScore(score)) return null;
  const next=cloneWorkshop(score);
  if (layout===null) delete next.layout; else next.layout=cloneWorkshop(layout);
  return isValidWorkshopScore(next) ? next : null;
}

export function setWorkshopPickup(score, units) {
  if (!isValidWorkshopScore(score) || units !== null && (!workshopTimeOnGrid(units) || workshopTimeTicks(units) <= 0)) return null;
  const next = cloneWorkshop(score);
  if (units === null) delete next.pickupUnits;
  else next.pickupUnits = units;
  const trimmed = trimWorkshopSilentOverflow(next);
  if (!trimmed) return null;
  const repaired = repairWorkshopGraphs(trimmed);
  return isValidWorkshopScore(repaired) ? repaired : null;
}

export function setWorkshopMeasureRepeat(score, index, start, end) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || index < 0 || index >= score.parts[0].measures.length
    || ![true, false, null].includes(start) || end !== null && end !== 0 && (!Number.isInteger(end) || end < 2 || end > 8)) return null;
  const next = cloneWorkshop(score);
  next.parts.forEach(part => {
    const measure = part.measures[index];
    if (start === true) measure.repeatStart = true; else delete measure.repeatStart;
    if (end === null || end === 0) delete measure.repeatEnd; else measure.repeatEnd = end;
  });
  return isValidWorkshopScore(next) ? next : null;
}

export function workshopActiveParts(score) {
  return plain(score) && Array.isArray(score.parts)
    ? score.parts.filter((part, index) => plain(part) && (index === 0 || part.enabled !== false)) : [];
}

// Stored pitches are absolute: changing the signature must not transpose notes.
export function setWorkshopKey(score, keyId) {
  if (!isValidWorkshopScore(score) || !isValidWorkshopKeyId(keyId)) return null;
  const next = cloneWorkshop(score);
  next.keyId = keyId;
  next.parts.forEach(part=>{delete part.keyId;});
  if (keyId !== score.keyId && next.parts.length === 2) {
    // A redundant imported boundary may be stored on only one staff. Preserve
    // every explicit boundary and keep its shared meaning after the base changes.
    let shared = keyId;
    const inherited = next.parts.map(() => keyId);
    next.parts[0].measures.forEach((measure, index) => {
      const boundary = score.parts.map(part => part.measures[index])
        .find(bar => Object.prototype.hasOwnProperty.call(bar, "keyId"));
      if (boundary) shared = boundary.keyId;
      next.parts.forEach((part, partIndex) => {
        const bar = part.measures[index];
        if (Object.prototype.hasOwnProperty.call(bar, "keyId")) inherited[partIndex] = bar.keyId;
        if (inherited[partIndex] !== shared) { bar.keyId = shared; inherited[partIndex] = shared; }
        inherited[partIndex] = workshopContextAtSlot(bar,Infinity,{keyId:inherited[partIndex]}).keyId;
      });
      shared = workshopContextAtSlot(measure,Infinity,{keyId:shared}).keyId;
    });
  }
  alignWorkshopSharedKeyContexts(next);
  return isValidWorkshopScore(next) ? next : null;
}

export function setWorkshopPartKey(score,keyId,partIndex=0) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(partIndex) || !score.parts[partIndex]
    || keyId!==null && !isValidWorkshopKeyId(keyId)) return null;
  const next=cloneWorkshop(score);
  if (keyId===null) delete next.parts[partIndex].keyId;else next.parts[partIndex].keyId=keyId;
  return isValidWorkshopScore(next) ? next:null;
}

export function setWorkshopSecondStaffEnabled(score, enabled) {
  if (!isValidWorkshopScore(score) || typeof enabled !== "boolean") return null;
  const next = cloneWorkshop(score);
  if (next.parts.length === 1) {
    if (!enabled) return next;
    next.parts.push({ id: "left", clef: "bass", enabled: true,
      measures: next.parts[0].measures.map(measure => {
        const created = createEmptyWorkshopMeasure();
        ["meter", "keyId", "repeatStart", "repeatEnd", "ending", "navigation"].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(measure, key)) created[key] = measure[key];
        });
        const changes = (measure.contextChanges || []).filter(change => change.keyId).map(change => ({id:workshopId("context"),startSlot:change.startSlot,keyId:change.keyId}));
        if (changes.length) created.contextChanges = changes;
        return created;
      }) });
    if (next.parts[0].keyId) next.parts[1].keyId=next.parts[0].keyId;
  } else if (next.parts[1].enabled === false || !enabled) next.parts[1].enabled = enabled;
  return isValidWorkshopScore(next) ? next : null;
}

function updateContextBoundary(measure, startSlot, fields, boundaryId) {
  if (!measure.contextChanges) measure.contextChanges = [];
  let change = measure.contextChanges.find(entry => workshopTimeTicks(entry.startSlot) === workshopTimeTicks(startSlot));
  if (!change) {
    change = {id:boundaryId || workshopId("context"),startSlot};
    measure.contextChanges.push(change);
  }
  Object.keys(fields).forEach(key => {
    if (fields[key] === undefined || fields[key] === null) delete change[key];
    else change[key] = fields[key];
  });
  measure.contextChanges = measure.contextChanges.filter(entry => ['clef','keyId','clefOctave','transpose'].some(key=>Object.prototype.hasOwnProperty.call(entry,key)))
    .sort((left,right) => left.startSlot-right.startSlot);
  if (!measure.contextChanges.length) delete measure.contextChanges;
}

// Set a complete in-bar boundary. Shared signatures affect both piano staves;
// clefs belong to the selected staff. Updating one boundary keeps its ID.
export function setWorkshopContextChange(score, index, partIndex, change, options={}) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || index < 0
    || !Number.isInteger(partIndex) || partIndex < 0 || !score.parts[partIndex]
    || !score.parts[partIndex].measures[index] || !keys(change,["id","startSlot","clef","keyId","clefOctave","transpose"])) return null;
  const measure = score.parts[partIndex].measures[index];
  const original = change.id ? (measure.contextChanges || []).find(entry => entry.id === change.id) : null;
  if (change.id && !original) return null;
  const replacement = Object.assign({},change,{id:original ? original.id : workshopId("context")});
  if (!isValidWorkshopContextChanges([replacement],workshopMeasureContext(score,index,partIndex).units)) return null;
  const occupied = (measure.contextChanges || []).find(entry => workshopTimeTicks(entry.startSlot) === workshopTimeTicks(change.startSlot) && (!original || entry.id !== original.id));
  if (original && occupied) return null;
  const next = cloneWorkshop(score), own = next.parts[partIndex].measures[index];
  if (original) {
    own.contextChanges = own.contextChanges.filter(entry => entry.id !== original.id);
    if (original.keyId && !options.partOnly) next.parts.forEach((part,otherIndex) => {
      if (otherIndex !== partIndex) updateContextBoundary(part.measures[index],original.startSlot,{keyId:null});
    });
  }
  const fields = original ? {clef:replacement.clef,keyId:replacement.keyId,clefOctave:replacement.clefOctave,transpose:replacement.transpose} :
    Object.keys(replacement).filter(key => ["clef","keyId","clefOctave","transpose"].includes(key)).reduce((all,key) => {all[key]=replacement[key];return all;},{});
  updateContextBoundary(own,replacement.startSlot,fields,replacement.id);
  if (replacement.keyId && !options.partOnly) next.parts.forEach((part,otherIndex) => {
    if (otherIndex !== partIndex) updateContextBoundary(part.measures[index],replacement.startSlot,{keyId:replacement.keyId});
  });
  if (!options.partOnly && (replacement.keyId || original && original.keyId)) alignWorkshopSharedKeyContexts(next);
  return isValidWorkshopScore(next) ? next : null;
}

export function removeWorkshopContextChange(score, index, partIndex, changeId, options={}) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || index < 0 || !Number.isInteger(partIndex)
    || partIndex < 0 || !score.parts[partIndex] || !score.parts[partIndex].measures[index]) return null;
  const measure = score.parts[partIndex].measures[index];
  const change = (measure.contextChanges || []).find(entry => entry.id === changeId);
  if (!change) return null;
  const next = cloneWorkshop(score), own = next.parts[partIndex].measures[index];
  own.contextChanges = own.contextChanges.filter(entry => entry.id !== changeId);
  if (!own.contextChanges.length) delete own.contextChanges;
  if (change.keyId && !options.partOnly) next.parts.forEach((part,otherIndex) => {
    if (otherIndex !== partIndex) updateContextBoundary(part.measures[index],change.startSlot,{keyId:null});
  });
  if (change.keyId && !options.partOnly) alignWorkshopSharedKeyContexts(next);
  return isValidWorkshopScore(next) ? next : null;
}

function alignWorkshopSharedKeyContexts(score) {
  if (score.parts.length !== 2) return;
  let first = score.parts[0].keyId || score.keyId, second = score.parts[1].keyId || score.keyId;
  score.parts[0].measures.forEach((bar,index) => {
    const other = score.parts[1].measures[index];
    if (bar.keyId) first = bar.keyId;
    if (other.keyId) second = other.keyId;
    if (first !== second) {other.keyId = first;second = first;}
    const positions = Array.from(new Set((bar.contextChanges || []).concat(other.contextChanges || [])
      .filter(entry => entry.keyId).map(entry => entry.startSlot))).sort((a,b) => a-b);
    positions.forEach(slot => {
      const boundary = (bar.contextChanges || []).find(entry => entry.startSlot === slot && entry.keyId)
        || (other.contextChanges || []).find(entry => entry.startSlot === slot && entry.keyId);
      const desired = boundary.keyId;
      if (workshopContextAtSlot(bar,slot,{keyId:first}).keyId !== desired) updateContextBoundary(bar,slot,{keyId:desired});
      if (workshopContextAtSlot(other,slot,{keyId:second}).keyId !== desired) updateContextBoundary(other,slot,{keyId:desired});
    });
    first = workshopContextAtSlot(bar,Infinity,{keyId:first}).keyId;
    second = workshopContextAtSlot(other,Infinity,{keyId:second}).keyId;
  });
}

export function setWorkshopMeasureContext(score, index, changes, partIndex = 0, options={}) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || index < 0
    || index >= score.parts[0].measures.length || !Number.isInteger(partIndex)
    || partIndex < 0 || !score.parts[partIndex] || !keys(changes, ["meter", "clef", "clefOctave", "transpose", "keyId", "dynamic"])) return null;
  if (Object.keys(changes).some(key => changes[key] !== null
    && !(key === "keyId" ? isValidWorkshopKeyId(changes[key])
      : key === "meter" ? isValidWorkshopMeter(changes[key]) : key === 'transpose' ? isValidWorkshopTranspose(changes[key]) : key === 'clefOctave' ? Number.isInteger(changes[key]) && Math.abs(changes[key])<=2 : (key === "clef" ? WORKSHOP_CLEFS : WORKSHOP_DYNAMICS).includes(changes[key])))) return null;
  const next = cloneWorkshop(score);
  Object.keys(changes).forEach(key => {
    const parts = key==="meter" || key==="keyId" && !options.partOnly ? next.parts : [next.parts[partIndex]];
    parts.forEach(part => {
      const measure=part.measures[index];
      if (changes[key] === null) delete measure[key];
      else measure[key] = cloneWorkshop(changes[key]);
      if (key === "dynamic" && measure.directions) {
        // Keep the general loudness control and imported start direction in sync.
        if (changes[key] === null) {
          measure.directions=measure.directions.filter(direction => !isInitialWorkshopDynamic(direction));
          if (!measure.directions.length) delete measure.directions;
        } else measure.directions.forEach(direction => { if (isInitialWorkshopDynamic(direction)) direction.value=changes[key]; });
      }
    });
  });
  // Imported scores may express the same shared meter with different redundant
  // overrides. Keep both staves aligned with the first staff's changed profile.
  ["meter", "keyId"].filter(key => Object.prototype.hasOwnProperty.call(changes, key) && next.parts.length === 2 && (key!=="keyId" || !options.partOnly)).forEach(key => {
    let shared = key==="keyId" ? next.parts[0].keyId || next.keyId : next[key];
    let second = key==="keyId" ? next.parts[1].keyId || next.keyId : next[key];
    next.parts[0].measures.forEach((measure, cursor) => {
      if (Object.prototype.hasOwnProperty.call(measure, key)) shared = measure[key];
      const other = next.parts[1].measures[cursor];
      if (Object.prototype.hasOwnProperty.call(other, key)) second = other[key];
      if (second !== shared) { other[key] = shared; second = shared; }
      if (key === "keyId") {
        shared = workshopContextAtSlot(measure,Infinity,{keyId:shared}).keyId;
        second = workshopContextAtSlot(other,Infinity,{keyId:second}).keyId;
      }
    });
  });
  if (Object.prototype.hasOwnProperty.call(changes, "keyId") && !options.partOnly) alignWorkshopSharedKeyContexts(next);
  const trimmed = Object.prototype.hasOwnProperty.call(changes, "meter") ? trimWorkshopSilentOverflow(next) : next;
  if (!trimmed) return null;
  const repaired = repairWorkshopGraphs(trimmed);
  return isValidWorkshopScore(repaired) ? repaired : null;
}

function createEmptyWorkshopMeasure() {
  return { id: workshopId("bar"), events: [] };
}

export function createWorkshopDraft(title = "", barCount = 1) {
  if (!Number.isInteger(barCount) || barCount < 1 || barCount > WORKSHOP_MAX_SCORE_MEASURES) {
    throw new RangeError(`A workshop piece needs 1–${WORKSHOP_MAX_SCORE_MEASURES} measures.`);
  }
  return { pieceId: null, title, score: {
    version: WORKSHOP_VERSION, bpm: 60, meter: "4/4", keyId: "C-major",
    parts: [{ id: "right", clef: "treble", measures: Array.from({ length: barCount }, createEmptyWorkshopMeasure) }]
  } };
}

// Add or remove bars without rewriting existing notes, bar IDs or revisions.
export function insertWorkshopMeasures(score, afterIndex, count = 1) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(afterIndex)
    || afterIndex < -1 || afterIndex >= score.parts[0].measures.length
    || !Number.isInteger(count) || count < 1
    || score.parts[0].measures.length + count > WORKSHOP_MAX_SCORE_MEASURES) return null;
  const next = cloneWorkshop(score);
  next.parts.forEach(part => part.measures.splice(afterIndex + 1, 0, ...Array.from({ length: count }, createEmptyWorkshopMeasure)));
  const repaired = repairWorkshopGraphs(next);
  return isValidWorkshopScore(repaired) ? repaired : null;
}

export function removeWorkshopMeasure(score, index) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(index) || index < 0
    || index >= score.parts[0].measures.length || score.parts[0].measures.length === 1) return null;
  const next = cloneWorkshop(score);
  next.parts.forEach((part, partIndex) => {
    const successorContext = index + 1 < score.parts[partIndex].measures.length ? workshopMeasureContext(score, index + 1, partIndex) : null;
    part.measures.splice(index, 1);
    if (!successorContext) return;
    const inherited = index > 0 ? workshopMeasureContextAtSlot(next, index - 1, Infinity, partIndex) : Object.assign({ meter: next.meter, clef: part.clef, keyId:part.keyId || next.keyId, dynamic:"mf" },part.clefOctave!==undefined?{clefOctave:part.clefOctave}:{},part.transpose?{transpose:part.transpose}:{});
    const successor = part.measures[index];
    ["meter", "clef", "keyId", "dynamic"].forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(successor, key) && successorContext[key] !== inherited[key]) successor[key] = successorContext[key];
    });
    ['clefOctave','transpose'].forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(successor,key) && JSON.stringify(successorContext[key])!==JSON.stringify(inherited[key]))successor[key]=cloneWorkshop(successorContext[key]===undefined?(key==='clefOctave'?0:{chromatic:0}):successorContext[key]);
    });
  });
  const repaired = repairWorkshopGraphs(next);
  return isValidWorkshopScore(repaired) ? repaired : null;
}

export function moveWorkshopMeasure(score, from, to) {
  if (!isValidWorkshopScore(score) || !Number.isInteger(from) || !Number.isInteger(to)
    || from < 0 || to < 0 || from >= score.parts[0].measures.length
    || to >= score.parts[0].measures.length || from === to) return null;
  const next = cloneWorkshop(score);
  next.parts.forEach((part, partIndex) => {
    const contexts = new Map();
    let meter = score.meter;
    let clef = score.parts[partIndex].clef;
    let keyId = part.keyId || score.keyId;
    let dynamic = "mf";
    let pitchContext={};['clefOctave','transpose'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(part,key))pitchContext[key]=part[key];});
    score.parts[partIndex].measures.forEach(measure => {
      if (Object.prototype.hasOwnProperty.call(measure, "meter")) meter = measure.meter;
      if (Object.prototype.hasOwnProperty.call(measure, "clef")) clef = measure.clef;
      if (Object.prototype.hasOwnProperty.call(measure, "keyId")) keyId = measure.keyId;
      if (Object.prototype.hasOwnProperty.call(measure, "dynamic")) dynamic = measure.dynamic;
      pitchContext=workshopContextAtSlot(measure,0,pitchContext);
      contexts.set(measure.id, Object.assign({ meter, clef, keyId, dynamic },pitchContext));
      const final = workshopContextAtSlot(measure, Infinity, Object.assign({clef,keyId},pitchContext));
      clef = final.clef; keyId = final.keyId;
      pitchContext=['clefOctave','transpose'].reduce((result,key)=>{if(Object.prototype.hasOwnProperty.call(final,key))result[key]=final[key];return result;},{});
    });
    const measures = part.measures;
    measures.splice(to, 0, measures.splice(from, 1)[0]);
    let inherited = Object.assign({ meter: next.meter, clef: part.clef, keyId:part.keyId || next.keyId, dynamic:"mf" },part.clefOctave!==undefined?{clefOctave:part.clefOctave}:{},part.transpose?{transpose:part.transpose}:{});
    measures.forEach(measure => {
      const desired = contexts.get(measure.id);
      ["meter", "clef", "keyId", "dynamic"].forEach(key => {
        // Keep explicit boundaries for subsequent edits, even if redundant now.
        if (desired[key] !== inherited[key]) measure[key] = desired[key];
      });
      ['clefOctave','transpose'].forEach(key=>{if(JSON.stringify(desired[key])!==JSON.stringify(inherited[key]))measure[key]=cloneWorkshop(desired[key]===undefined?(key==='clefOctave'?0:{chromatic:0}):desired[key]);});
      inherited = workshopContextAtSlot(measure, Infinity, desired);
    });
  });
  const repaired = repairWorkshopGraphs(next);
  return isValidWorkshopScore(repaired) ? repaired : null;
}

export function isValidWorkshopLibrary(library) {
  if (library === null) return true;
  if (!keys(library, ["version", "pieces", "installedPieceIds"]) || library.version !== WORKSHOP_VERSION
    || !Array.isArray(library.pieces) || library.pieces.length > 40
    || !unique(library.pieces.map(piece => piece && piece.id))
    || (Object.prototype.hasOwnProperty.call(library, "installedPieceIds")
      && (!Array.isArray(library.installedPieceIds) || library.installedPieceIds.length > 64
        || !library.installedPieceIds.every(id) || !unique(library.installedPieceIds)))) return false;
  const valid = library.pieces.every(piece => {
    if (!keys(piece, ["id", "title", "createdAt", "updatedAt", "currentRevisionId", "revisions"])
      || !id(piece.id) || typeof piece.title !== "string" || !piece.title.trim() || piece.title.length > 80
      || !date(piece.createdAt) || !date(piece.updatedAt) || !id(piece.currentRevisionId)
      || !Array.isArray(piece.revisions) || !piece.revisions.length || piece.revisions.length > WORKSHOP_MAX_PIECE_REVISIONS
      || !unique(piece.revisions.map(revision => revision && revision.id))) return false;
    return piece.revisions.every(revision => keys(revision, ["id", "createdAt", "score"])
        && id(revision.id) && date(revision.createdAt) && isValidWorkshopScore(revision.score))
      && piece.revisions.some(revision => revision.id === piece.currentRevisionId);
  });
  return valid && JSON.stringify(library).length <= WORKSHOP_MAX_LIBRARY_CHARS;
}

function checkedLibrary(library) {
  if (!isValidWorkshopLibrary(library)) throw new Error("invalid-library");
  return library ? cloneWorkshop(library) : { version: WORKSHOP_VERSION, pieces: [] };
}

export function saveWorkshopDraft(library, draft, now = new Date().toISOString()) {
  const next = checkedLibrary(library);
  if (!draft || typeof draft.title !== "string" || !draft.title.trim() || draft.title.trim().length > 80
    || !isValidWorkshopScore(draft.score) || !date(now)) throw new Error("invalid-piece");
  let piece = next.pieces.find(entry => entry.id === draft.pieceId);
  if (draft.pieceId && !piece) throw new Error("missing-piece");
  if (!piece) {
    piece = { id: workshopId("piece"), title: draft.title.trim(), createdAt: now,
      updatedAt: now, currentRevisionId: null, revisions: [] };
    next.pieces.push(piece);
  }
  const current = piece.revisions.find(revision => revision.id === piece.currentRevisionId);
  if (!current || !same(current.score, draft.score)) {
    if (piece.revisions.length >= WORKSHOP_MAX_PIECE_REVISIONS) throw new Error("revision-limit");
    const revision = { id: workshopId("revision"), createdAt: now, score: cloneWorkshop(draft.score) };
    piece.revisions.push(revision);
    piece.currentRevisionId = revision.id;
  }
  piece.title = draft.title.trim();
  piece.updatedAt = now;
  if (!isValidWorkshopLibrary(next)) throw new Error("library-full");
  return { library: next, piece: cloneWorkshop(piece) };
}

export function openWorkshopPiece(piece, revisionId = piece.currentRevisionId) {
  const revision = piece.revisions.find(entry => entry.id === revisionId);
  if (!revision) throw new Error("missing-revision");
  return { pieceId: piece.id, title: piece.title, score: cloneWorkshop(revision.score) };
}

// A details dialog can outlive edits in another app view. Apply only the
// fields changed in that dialog to the current saved score; never save its
// older notes, context, layout or original-file assets as a new score.
export function saveWorkshopPieceDetails(library, originalDraft, updatedDraft, now = new Date().toISOString()) {
  const next=checkedLibrary(library);
  if (!originalDraft || !updatedDraft || !id(originalDraft.pieceId) || updatedDraft.pieceId !== originalDraft.pieceId)
    throw new Error('invalid-details');
  const piece=next.pieces.find(entry=>entry.id===originalDraft.pieceId);
  if (!piece) throw new Error('missing-piece');
  if (typeof originalDraft.title !== 'string' || typeof updatedDraft.title !== 'string' || !updatedDraft.title.trim()
    || updatedDraft.title.trim().length>80 || !isValidWorkshopScore(originalDraft.score)
    || !isValidWorkshopScore(updatedDraft.score) || !date(now)) throw new Error('invalid-details');
  const originalMusic=cloneWorkshop(originalDraft.score),updatedMusic=cloneWorkshop(updatedDraft.score);
  delete originalMusic.bpm;delete updatedMusic.bpm;delete originalMusic.metadata;delete updatedMusic.metadata;
  if (!same(originalMusic,updatedMusic)) throw new Error('invalid-details');

  const current=openWorkshopPiece(piece),originalMetadata=originalDraft.score.metadata || {},updatedMetadata=updatedDraft.score.metadata || {};
  let changed=false;
  if (updatedDraft.title.trim() !== originalDraft.title.trim()) {current.title=updatedDraft.title.trim();changed=true;}
  if (updatedDraft.score.bpm !== originalDraft.score.bpm) {current.score.bpm=updatedDraft.score.bpm;changed=true;}
  const metadata=cloneWorkshop(current.score.metadata || {});
  const fields=new Set(Object.keys(originalMetadata).concat(Object.keys(updatedMetadata)));
  fields.forEach(field=>{
    if (same(originalMetadata[field],updatedMetadata[field])) return;
    if (Object.prototype.hasOwnProperty.call(updatedMetadata,field)) metadata[field]=cloneWorkshop(updatedMetadata[field]);
    else delete metadata[field];
    changed=true;
  });
  if (fields.size && !same(metadata,current.score.metadata || {})) {
    if (Object.keys(metadata).length) current.score.metadata=metadata;
    else delete current.score.metadata;
  }
  if (!changed) return {library:next,piece:cloneWorkshop(piece),changed:false};
  const result=saveWorkshopDraft(next,current,now);
  return Object.assign(result,{changed:true});
}

// Removing saved versions is an explicit choice, never an automatic side
// effect of saving. The current persisted score and all unselected versions
// remain intact, including their timestamps and library ordering.
export function deleteWorkshopRevisions(library, pieceId, revisionIds) {
  if (!Array.isArray(revisionIds) || !revisionIds.length || revisionIds.length > WORKSHOP_MAX_PIECE_REVISIONS
    || !revisionIds.every(id) || !unique(revisionIds)) throw new Error("invalid-revisions");
  const next=checkedLibrary(library);
  const piece=next.pieces.find(entry=>entry.id===pieceId);
  if (!piece) throw new Error("missing-piece");
  const selected=new Set(revisionIds);
  if (selected.has(piece.currentRevisionId)) throw new Error("current-revision-protected");
  if (revisionIds.some(revisionId=>!piece.revisions.some(revision=>revision.id===revisionId))) throw new Error("missing-revision");
  const removedRevisionIds=piece.revisions.filter(revision=>selected.has(revision.id)).map(revision=>revision.id);
  piece.revisions=piece.revisions.filter(revision=>!selected.has(revision.id));
  return {library:next,piece:cloneWorkshop(piece),removedRevisionIds};
}

export function mergeWorkshopLibraries(current, imported) {
  if (!current && !imported) return null;
  const next = checkedLibrary(current);
  const incomingLibrary = checkedLibrary(imported);
  if (next.installedPieceIds || incomingLibrary.installedPieceIds) {
    next.installedPieceIds = Array.from(new Set([].concat(next.installedPieceIds || [], incomingLibrary.installedPieceIds || [])));
  }
  incomingLibrary.pieces.forEach(incoming => {
    const existing = next.pieces.find(piece => piece.id === incoming.id);
    if (!existing) { next.pieces.push(cloneWorkshop(incoming)); return; }
    if (existing.createdAt !== incoming.createdAt) throw new Error("Conflicting workshop piece identity.");
    incoming.revisions.forEach(revision => {
      const known = existing.revisions.find(entry => entry.id === revision.id);
      if (!known) existing.revisions.push(cloneWorkshop(revision));
      else if (!same(known, revision)) {
        throw new Error("Conflicting workshop revision. No pieces were overwritten.");
      }
    });
  });
  if (!isValidWorkshopLibrary(next)) throw new Error("Merged workshop library exceeds its safe limit.");
  return next;
}

export function workshopTimeline(score, options = {}) {
  if (!isValidWorkshopScore(score)) throw new Error("invalid-piece");
  const events=[],positions=[],contexts=[];let cursor=0;
  const hasBarKeys=score.parts[0].measures.some(bar=>Object.prototype.hasOwnProperty.call(bar,"keyId") || (bar.contextChanges||[]).some(change=>change.keyId));
  let meter=score.meter,clef=score.parts[0].clef,keyId=score.parts[0].keyId || score.keyId;
  score.parts[0].measures.forEach((bar,index)=>{
    if (bar.meter) meter=bar.meter;if (bar.clef) clef=bar.clef;if (bar.keyId) keyId=bar.keyId;
    const units=index===0 && score.pickupUnits!==undefined ? score.pickupUnits : workshopMeterUnits(meter);
    positions.push(cursor);contexts.push({index,id:bar.id,meter,clef,keyId,units});cursor+=units;
    const final = workshopContextAtSlot(bar, Infinity, {clef,keyId});clef=final.clef;keyId=final.keyId;
  });
  const totalUnits=cursor,barIds=new Map();
  score.parts.forEach(part=>part.measures.forEach((bar,index)=>barIds.set(bar.id,index)));
  const directions=[];
  workshopActiveParts(score).forEach(part=>part.measures.forEach((bar,index)=>(bar.directions||[]).forEach(direction=>{
    const start=positions[index]+direction.startSlot;
    const end=direction.endSlot===undefined ? start : positions[direction.endBarId ? barIds.get(direction.endBarId) : index]+direction.endSlot;
    directions.push(Object.assign({},direction,{start,end,partIndex:score.parts.indexOf(part),barIndex:index}));
  })));
  directions.sort((a,b)=>a.start-b.start);
  const tempo=[];
  function bpmAt(at) {
    const current=tempo.slice().reverse().find(profile=>profile.start<=at+1e-10);
    if (!current) return score.bpm;
    if (current.end<=current.start || at>=current.end) return current.value;
    return current.startBpm+(current.value-current.startBpm)*(at-current.start)/(current.end-current.start);
  }
  directions.filter(direction=>["tempo","tempoRamp"].includes(direction.type)).forEach(direction=>{
    if (tempo.some(profile=>profile.start===direction.start && profile.end===direction.end && profile.value===direction.value)) return;
    tempo.push(Object.assign({},direction,{startBpm:bpmAt(direction.start)}));
  });
  const points=Array.from(new Set([0,totalUnits].concat(tempo.reduce((all,profile)=>all.concat([profile.start,profile.end]),[]))))
    .filter(point=>point>=0 && point<=totalUnits).sort((a,b)=>a-b);
  const segments=[];let elapsed=0;
  function integrate(a,b,first,last) {
    if (b<=a) return 0;
    return Math.abs(last-first)<1e-9 ? (b-a)*30000/first : (b-a)*30000*Math.log(last/first)/(last-first);
  }
  points.slice(0,-1).forEach((start,index)=>{
    const end=points[index+1],first=bpmAt(start),last=bpmAt(Math.max(start,end-1e-9));
    segments.push({start,end,first,last,startMs:elapsed});elapsed+=integrate(start,end,first,last);
  });
  function metricMs(at) {
    if (at>=totalUnits) return elapsed;
    const segment=segments.find(entry=>at>=entry.start && at<entry.end);
    if (!segment) return 0;
    const last=segment.first+(segment.last-segment.first)*(at-segment.start)/(segment.end-segment.start);
    return segment.startMs+integrate(segment.start,at,segment.first,last);
  }
  const holds=new Map();
  workshopActiveParts(score).forEach(part=>part.measures.forEach((bar,index)=>workshopMeasureEvents(bar).forEach(event=>{
    if (!event.fermata || event.grace) return;
    const start=positions[index]+event.startSlot,end=start+workshopEventUnits(event);
    holds.set(end,Math.max(holds.get(end)||0,(metricMs(end)-metricMs(start))*(event.fermata-1)));
  })));
  const graceHolds=new Map(),graceMakeGroups=new Map();
  workshopActiveParts(score).forEach(part=>part.measures.forEach((bar,index)=>workshopMeasureEvents(bar).forEach(event=>{
    if (!event.grace || !event.graceTiming || !event.graceTiming.makeTime) return;
    const start=positions[index]+event.startSlot,key=start+':'+score.parts.indexOf(part)+':'+workshopEventVoice(event);
    const group=graceMakeGroups.get(key) || {start,duration:0};group.duration+=event.graceTiming.makeTime*30000/bpmAt(start);graceMakeGroups.set(key,group);
  })));
  graceMakeGroups.forEach(group=>graceHolds.set(group.start,Math.max(graceHolds.get(group.start)||0,group.duration)));
  function timeAt(at,beforeGrace=false) {
    let ms=metricMs(at);holds.forEach((duration,position)=>{if (position<=at+1e-9) ms+=duration;});
    graceHolds.forEach((duration,position)=>{if (position<at-1e-9 || !beforeGrace && position<=at+1e-9) ms+=duration;});return ms;
  }
  const measures=contexts.map(context=>{
    const result={index:context.index,id:context.id,startMs:timeAt(positions[context.index],true),endMs:timeAt(positions[context.index]+context.units,true),meter:context.meter,clef:context.clef,units:context.units};
    if (hasBarKeys) result.keyId=context.keyId;return result;
  });
  const tieFrom=new Map((score.ties||[]).map(edge=>[edge.toId,edge.fromId])),tieTo=new Map((score.ties||[]).map(edge=>[edge.fromId,edge.toId]));
  const gapTieSources=new Set((score.ties||[]).filter(edge=>edge.sustainAcrossGap).map(edge=>edge.fromId));
  const levels={ppp:0.12,pp:0.2,p:0.35,mp:0.55,mf:0.7,f:0.85,ff:1,fff:1,sf:1,sfz:1,fp:0.35};
  const dynamicAccent=value=>value==="sf" || value==="sfz";
  workshopActiveParts(score).forEach(part=>{
    const partIndex=score.parts.indexOf(part),staff=score.parts.length===1 ? {} : {partIndex};let dynamic=null;
    const own=directions.filter(direction=>direction.partIndex===partIndex);
    part.measures.forEach((bar,index)=>{if (bar.dynamic) own.push({type:"dynamic",value:bar.dynamic,start:positions[index],end:positions[index],context:true});});
    own.sort((a,b)=>a.start-b.start || (a.context ? -1:a.type==="wedge" ? 1:0)-(b.context ? -1:b.type==="wedge" ? 1:0));
    const loudProfiles=[];
    function loudnessAt(at) {
      const profile=loudProfiles.slice().reverse().find(entry=>entry.start<=at+1e-9);
      if (!profile) return levels.mf;
      if (profile.end<=profile.start || at>=profile.end) return profile.value;
      return profile.first+(profile.value-profile.first)*(at-profile.start)/(profile.end-profile.start);
    }
    own.filter(direction=>direction.type==="wedge" || direction.type==="dynamic" && !dynamicAccent(direction.value)).forEach(direction=>{
      if (direction.type==="dynamic") loudProfiles.push({start:direction.start,end:direction.start,value:levels[direction.value]});
      else {
        const first=loudnessAt(direction.start),final=own.find(candidate=>candidate.type==="dynamic" && !dynamicAccent(candidate.value) && Math.abs(candidate.start-direction.end)<1e-9);
        const last=final ? levels[final.value] : Math.max(0.12,Math.min(1,first+(direction.value==="crescendo"?0.3:-0.3)));
        loudProfiles.push({start:direction.start,end:direction.end,first,value:last});
      }
    });
    function currentDynamic(at,fallback) {
      const changed=own.filter(direction=>direction.type==="dynamic" && direction.start<=at+1e-9
        && (!dynamicAccent(direction.value) || Math.abs(direction.start-at)<1e-9)).slice(-1)[0];
      return changed ? changed.value : fallback;
    }
    part.measures.forEach((bar,barIndex)=>{
      if (bar.dynamic && !dynamicAccent(bar.dynamic)) dynamic=bar.dynamic;
      const context=contexts[barIndex],ownContext=workshopMeasureContext(score,barIndex,partIndex),covered=[];
      workshopMeasureEvents(bar).forEach(event=>{
        const start=positions[barIndex]+event.startSlot,end=start+(event.grace ? 0 : workshopEventUnits(event));
        const scheduled=Object.assign({id:event.id,barIndex,startMs:timeAt(start),durationMs:Math.max(0,timeAt(end,true)-timeAt(start)),value:event.kind==="note" ? workshopPitchValue(event.pitch):null},staff);
        ["voice","fingering","fingerings","pedal","grace","graceSlash","graceTiming","ornament","ornamentLong","ornamentPlacement","ornamentAccidentals","ornamentWavy","tremoloMarks","twoNoteTremolo","arpeggio","lyric","lyrics"].forEach(field=>{if (Object.prototype.hasOwnProperty.call(event,field)) scheduled[field]=cloneWorkshop(event[field]);});
        const swing=directions.filter(direction=>direction.type==="swing" && direction.start<=start+1e-9).slice(-1)[0];
        if (swing && swing.value!=="straight" && !event.grace && !event.dots && !event.tuplet && event.noteValue===swing.value.unit) {
          const unit=WORKSHOP_NOTE_UNITS[swing.value.unit],pair=unit*2,base=Math.floor((event.startSlot+1e-9)/pair)*pair,phase=(event.startSlot-base)/unit;
          if (Math.abs(workshopEventUnits(event)-unit)<1e-9 && (Math.abs(phase)<1e-9 || Math.abs(phase-1)<1e-9)) {
            const split=positions[barIndex]+base+pair*swing.value.first/(swing.value.first+swing.value.second);
            const swungStart=phase<.5?start:split,swungEnd=phase<.5?split:positions[barIndex]+base+pair;
            scheduled.startMs=timeAt(swungStart);scheduled.durationMs=Math.max(0,timeAt(swungEnd,true)-scheduled.startMs);
          }
        }
        if (event.articulations) scheduled.articulations=event.articulations.slice();
        const named=currentDynamic(start,dynamic);
        if (named) scheduled.dynamic=named;
        if (own.some(direction=>direction.type==="wedge" && direction.start<=start)) scheduled.dynamicLevel=loudnessAt(start);
        if (dynamicAccent(named)) scheduled.dynamicLevel=levels[named];
        const displayIndex=event.displayStaff===undefined || !score.parts[event.displayStaff]?partIndex:event.displayStaff;
        const shift=directions.filter(direction=>direction.type==="octaveShift" && direction.partIndex===displayIndex && direction.start<=start && direction.end>start).slice(-1)[0];
        if (shift && scheduled.value!==null) scheduled.value+=12*shift.value;
        if (tieFrom.has(event.id)) scheduled.tieFromId=tieFrom.get(event.id);
        if (tieTo.has(event.id)) scheduled.tieToId=tieTo.get(event.id);
        if (scheduled.tieToId && (gapTieSources.has(event.id) || event.grace)) scheduled.tieSustainAcrossGap=true;
        const displayBar=score.parts[displayIndex].measures[barIndex],displayContext=displayIndex===partIndex?ownContext:workshopMeasureContext(score,barIndex,displayIndex);
        if(scheduled.value!==null)scheduled.value+=workshopPitchContextOffset(workshopContextAtSlot(displayBar,event.startSlot,displayContext));
        scheduled._pitch=event.pitch;scheduled._keyId=workshopContextAtSlot(displayBar,event.startSlot,displayContext).keyId;scheduled._start=start;scheduled._end=end;
        events.push(scheduled);
        if (!event.grace) covered.push([event.startSlot,event.startSlot+workshopEventUnits(event)]);
      });
      covered.sort((a,b)=>a[0]-b[0]);let gap=0;
      function silence(first,last) {
        if (last<=first+1e-9) return;
        const start=positions[barIndex]+first,end=positions[barIndex]+last;
        events.push(Object.assign({id:null,barIndex,startMs:timeAt(start),durationMs:timeAt(end)-timeAt(start),value:null},staff));
      }
      covered.forEach(interval=>{silence(gap,interval[0]);gap=Math.max(gap,interval[1]);});silence(gap,context.units);
      own.filter(direction=>direction.barIndex===barIndex && direction.type==="pedal").forEach(direction=>{
        workshopPedalTimelineEvents(direction).forEach((data,index)=>events.push(Object.assign({id:direction.id+(index?"-change":""),barIndex,startMs:timeAt(direction.start),durationMs:0,value:null},data,staff)));
      });
    });
  });
  const noteGroups=new Map();
  events.filter(event=>event.value!==null).forEach(event=>{
    const key=(event.partIndex||0)+":"+workshopEventVoice(event)+":"+event._start;
    if (!noteGroups.has(key)) noteGroups.set(key,[]);noteGroups.get(key).push(event);
  });
  noteGroups.forEach(group=>{
    const grace=group.filter(event=>event.grace),normal=group.filter(event=>!event.grace);
    if (grace.length) {
      const available=normal.length ? Math.min(...normal.map(event=>event.durationMs)) : 30000/score.bpm;
      if (!grace.some(event=>event.graceTiming)) {
        const step=Math.max(10,Math.min(60,available*0.35/grace.length)),offset=step*grace.length;
        grace.forEach((event,index)=>{event.startMs+=index*step;event.durationMs=step;});
        normal.forEach(event=>{event.startMs+=offset;event.durationMs=Math.max(1,event.durationMs-offset);});
      } else {
        const anchor=grace[0],candidates=events.filter(event=>event.value!==null && !event.grace && (event.partIndex||0)===(anchor.partIndex||0)
          && workshopEventVoice(event)===workshopEventVoice(anchor) && event._start<anchor._start && event._end<=anchor._start+1e-9);
        const previousStart=Math.max(-Infinity,...candidates.map(event=>event._start)),previous=candidates.filter(event=>event._start===previousStart);
        const previousAvailable=previous.length?Math.min(...previous.map(event=>event.durationMs)):0;
        const previousRequested=grace.reduce((sum,event)=>sum+(event.graceTiming && event.graceTiming.stealPrevious || 0)*previousAvailable/100,0);
        const followingRequested=grace.reduce((sum,event)=>sum+(event.graceTiming ? event.graceTiming.stealFollowing || 0 : Math.min(60,available*.35/grace.length)*100/available)*available/100,0);
        const stolenPrevious=Math.min(Math.max(0,previousAvailable-1),previousRequested),stolenFollowing=Math.min(Math.max(0,available-1),followingRequested);
        const insert=graceHolds.get(anchor._start)||0;
        let graceCursor=Math.max(0,anchor.startMs-insert-stolenPrevious);
        grace.forEach(event=>{
          const timing=event.graceTiming || {},before=(timing.stealPrevious||0)*previousAvailable/100,after=event.graceTiming?(timing.stealFollowing||0)*available/100:Math.min(60,available*.35/grace.length);
          const duration=(previousRequested?before*stolenPrevious/previousRequested:0)+(followingRequested?after*stolenFollowing/followingRequested:0)+(timing.makeTime||0)*30000/bpmAt(event._start);
          event.startMs=graceCursor;event.durationMs=duration;graceCursor+=duration;
        });
        previous.forEach(event=>{event.durationMs=Math.max(1,event.durationMs-stolenPrevious);});
        normal.forEach(event=>{event.startMs+=stolenFollowing;event.durationMs=Math.max(1,event.durationMs-stolenFollowing);});
      }
    }
    const rolled=normal.filter(event=>event.arpeggio);
    if (options.expandExpressions!==false && rolled.length>1) {
      const reverse=rolled[0].arpeggio==="down";
      rolled.sort((a,b)=>reverse ? b.value-a.value:a.value-b.value);
      const step=Math.min(40,Math.min(...rolled.map(event=>event.durationMs))*0.35/(rolled.length-1));
      rolled.forEach((event,index)=>{event.startMs+=index*step;event.durationMs=Math.max(1,event.durationMs-index*step);});
    }
  });
  const expanded=[],pairedIds=new Set(),scheduledNotes=new Map(events.filter(event=>event.value!==null).map(event=>[event.id,event]));
  (options.expandExpressions===false ? [] : score.tremolos||[]).forEach(edge=>{
    const from=scheduledNotes.get(edge.fromId),to=scheduledNotes.get(edge.toId);
    if (!from || !to) return;
    const duration=to.startMs+to.durationMs-from.startMs,quarter=30000/bpmAt(from._start)*2;
    const count=Math.max(2,Math.min(256,Math.round(duration/(quarter/Math.pow(2,edge.marks))))),slice=duration/count;
    pairedIds.add(from.id);pairedIds.add(to.id);
    for (let index=0;index<count;index++) {
      const source=index%2===0?from:to;
      expanded.push(Object.assign({},source,{startMs:from.startMs+index*slice,durationMs:slice}));
    }
  });
  const glissandos=new Map((score.glissandos||[]).map(edge=>[edge.fromId,edge]));
  events.forEach(event=>{
    if (pairedIds.has(event.id)) return;
    const glissando=glissandos.get(event.id),target=glissando && scheduledNotes.get(glissando.toId);
    if (options.expandExpressions!==false && target && event.value!==null && !event.grace && !event.tieFromId && !event.tieToId && target.value!==event.value) {
      // A sampled piano performs both slide and glissando as discrete chromatic
      // steps. Keep the written endpoint and intervening silence unchanged.
      const duration=Math.min(event.durationMs,target.startMs-event.startMs),distance=target.value-event.value;
      const count=Math.max(1,Math.min(48,Math.ceil(Math.abs(distance))));
      for (let index=0;index<count;index++) expanded.push(Object.assign({},event,{value:event.value+Math.sign(distance)*Math.floor(Math.abs(distance)*index/count),
        startMs:event.startMs+duration*index/count,durationMs:duration/count}));
      return;
    }
    const ornament=event.ornament || (event.ornamentWavy && event.ornamentWavy.type!=="stop" ? "trill" : null);
    if (options.expandExpressions===false || !ornament || event.grace || event.tieFromId || event.tieToId || event.durationMs<20) {expanded.push(event);return;}
    const stepIndex=STEPS.indexOf(event._pitch.step),absolute=event._pitch.octave*7+stepIndex;
    function neighbor(delta) {
      const written=absolute+delta,step=STEPS[((written%7)+7)%7],side=delta>0?"upper":"lower",accidental=event.ornamentAccidentals && event.ornamentAccidentals[side];
      const pitch={step,octave:Math.floor(written/7),alter:accidental===undefined?workshopKeyAlter(event._keyId,step):accidental};
      return workshopPitchValue(pitch)+(event.value-workshopPitchValue(event._pitch));
    }
    let pitches;
    if (ornament==="trill" || ornament==="tremolo") {
      const count=ornament==="tremolo" && event.tremoloMarks
        ? Math.max(2,Math.min(256,Math.round(event.durationMs/(60000/bpmAt(event._start)/Math.pow(2,event.tremoloMarks)))))
        : Math.max(2,Math.min(64,Math.floor(event.durationMs/100)));
      pitches=Array.from({length:count},(_,index)=>ornament==="tremolo" || index%2===0 ? event.value:neighbor(1));
    } else if (["mordent","inverted-mordent"].includes(ornament)) {
      const auxiliary=neighbor(ornament==="mordent"?-1:1);pitches=event.ornamentLong?[event.value,auxiliary,event.value,auxiliary,event.value]:[event.value,auxiliary,event.value];
    }
    else if (["turn","delayed-turn","vertical-turn"].includes(ornament)) pitches=[neighbor(1),event.value,neighbor(-1),event.value];
    else pitches=[neighbor(-1),event.value,neighbor(1),event.value];
    const delay=ornament.startsWith("delayed-") ? event.durationMs*.5 : 0,slice=(event.durationMs-delay)/pitches.length;
    if (delay) expanded.push(Object.assign({},event,{durationMs:delay}));
    pitches.forEach((value,index)=>expanded.push(Object.assign({},event,{value,startMs:event.startMs+delay+slice*index,durationMs:slice})));
  });
  expanded.forEach(event=>{delete event._pitch;delete event._keyId;delete event._start;delete event._end;});
  expanded.sort((a,b)=>a.startMs-b.startMs);
  const timeline={events:expanded,measures,durationMs:measures[measures.length-1].endMs};
  if (options.includeBeats === true) {
    // Metronome pulses use the same metric-to-time map as notes, including
    // tempo ramps and fermatas. Compound meters use dotted pulses; explicitly
    // additive meters retain their written grouping. A pickup occupies the
    // end of its full meter, so its first pulse is not a false downbeat.
    const beats=[];
    contexts.forEach(context=>{
      const [numerator,denominator]=context.meter.split('/'),groups=numerator.split('+').map(Number);
      const unit=8/Number(denominator),total=groups.reduce((sum,value)=>sum+value,0);
      const lengths=groups.length>1 ? groups.map(value=>value*unit)
        : Number(denominator)>=8 && total>=6 && total%3===0 ? Array(total/3).fill(3*unit) : Array(total).fill(unit);
      const fullUnits=total*unit,offset=Math.max(0,fullUnits-context.units);
      let slot=0;
      lengths.forEach((length,beatIndex)=>{
        const startSlot=slot-offset;slot+=length;
        if (startSlot < -1e-9 || startSlot >= context.units-1e-9) return;
        const start=positions[context.index]+Math.max(0,startSlot),end=positions[context.index]+Math.min(context.units,slot-offset);
        beats.push({barIndex:context.index,startSlot:Math.max(0,startSlot),beatIndex,accent:beatIndex===0,meter:context.meter,
          startMs:timeAt(start),durationMs:timeAt(end)-timeAt(start)});
      });
    });
    timeline.beats=beats;
  }
  return timeline;
}

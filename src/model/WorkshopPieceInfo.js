import { createWorkshopPlayback } from "./WorkshopPlayback";
import { workshopActiveParts, workshopPitchValue, isValidWorkshopSourceUrl } from "./Workshop";
import { WORKSHOP_NOTE_UNITS, workshopTupletRatio } from "./WorkshopRhythm";
import { workshopOrderedContextChanges } from "./WorkshopContextChanges";
import { normalizeNoteNaming } from "./NoteNaming";
import { parseWorkshopMusicXmlDocument, musicXmlChild, musicXmlChildren } from "./WorkshopMusicXmlParser";

const CREDIT_FIELDS = [
  ["subtitle", "WORKSHOP_META_SUBTITLE"],
  ["composer", "WORKSHOP_META_COMPOSER"],
  ["arranger", "WORKSHOP_META_ARRANGER"],
  ["lyricist", "WORKSHOP_META_LYRICIST"],
  ["performer", "WORKSHOP_INFO_PERFORMER"],
  ["origin", "WORKSHOP_INFO_ORIGIN"]
];
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const GERMAN_FLATS = { C:"Ces", D:"Des", E:"Es", F:"Fes", G:"Ges", A:"As", B:"B" };
const GERMAN_SHARPS = { C:"Cis", D:"Dis", E:"Eis", F:"Fis", G:"Gis", A:"Ais", B:"His" };
const text = value => typeof value === "string" && value.trim() ? value : "";

// These two credits are retained in the original XML even though the current
// editable metadata schema has no fields for them. Read only explicit values.
function sourceCredits(score) {
  const result = {};
  const source = score.musicXml && score.musicXml.sourceXml;
  if (!source) return result;
  try {
    const identification = musicXmlChild(parseWorkshopMusicXmlDocument(source), "identification");
    const performers = musicXmlChildren(identification, "creator")
      .filter(node => ["performer", "interpreter"].includes(node.attrs.type))
      .map(node => text(node.text)).filter(Boolean);
    const origins = musicXmlChildren(identification, "source")
      .map(node => node.text.split(/\r?\n/).filter(line => text(line) && !isValidWorkshopSourceUrl(line.trim())).join("\n"))
      .filter(Boolean);
    if (performers.length) result.performer = Array.from(new Set(performers)).join(" · ");
    if (origins.length) result.origin = Array.from(new Set(origins)).join("\n");
  } catch (error) {
    // Old or unsupported source XML must not prevent viewing the stored score.
  }
  return result;
}

function addUnique(list, value) {
  if (value !== undefined && value !== null && !list.includes(value)) list.push(value);
}

function staffContexts(score, parts) {
  return parts.map((part, index) => {
    const result = { number:index + 1, keys:[], meters:[], clefs:[] };
    let meter = score.meter, clef = part.clef, keyId = part.keyId || score.keyId;
    (part.measures || []).forEach(bar => {
      meter = bar.meter || meter; clef = bar.clef || clef; keyId = bar.keyId || keyId;
      addUnique(result.meters, meter); addUnique(result.clefs, clef); addUnique(result.keys, keyId);
      workshopOrderedContextChanges(bar).forEach(change => {
        clef = change.clef || clef; keyId = change.keyId || keyId;
        addUnique(result.clefs, clef); addUnique(result.keys, keyId);
      });
    });
    return result;
  });
}

/** A detached, read-only summary; written chord tones each count as one note. */
export function createWorkshopPieceInfo(score, options = {}) {
  score = score || {};
  const metadata = score.metadata || {}, preserved = sourceCredits(score);
  const credits = CREDIT_FIELDS.reduce((rows, field) => {
    const value = text(metadata[field[0]]) || text(preserved[field[0]]);
    if (value) rows.push({ key:field[0], label:field[1], value });
    return rows;
  }, []);
  if (options.showLicense === true) {
    [["license", "WORKSHOP_META_LICENSE"], ["copyright", "WORKSHOP_META_COPYRIGHT"]].forEach(field => {
      const value = text(metadata[field[0]]);
      if (value) credits.push({ key:field[0], label:field[1], value });
    });
  }
  const parts = workshopActiveParts(score), pitches = new Map(), values = new Map();
  let noteCount = 0;
  parts.forEach(part => (part.measures || []).forEach(bar => (bar.events || []).forEach(event => {
    if (event.kind !== "note" || !event.pitch) return;
    noteCount++;
    const pitch = event.pitch, value = workshopPitchValue(pitch);
    if (Number.isFinite(value)) pitches.set([pitch.step, pitch.alter, pitch.octave].join(":"), {
      step:pitch.step, alter:pitch.alter, octave:pitch.octave, value
    });
    if (Object.prototype.hasOwnProperty.call(WORKSHOP_NOTE_UNITS, event.noteValue)) {
      const ratio = workshopTupletRatio(event), dots = event.dots || 0;
      const key = [event.noteValue, dots, ratio && ratio.actual, ratio && ratio.normal].join(":");
      values.set(key, { key, noteValue:event.noteValue, dots,
        tuplet:ratio ? { actual:ratio.actual, normal:ratio.normal } : null });
    }
  })));
  const containedPitches = Array.from(pitches.values()).sort((a,b) => a.value - b.value
    || a.octave - b.octave || STEPS.indexOf(a.step) - STEPS.indexOf(b.step) || a.alter - b.alter);
  const noteValues = Array.from(values.values()).sort((a,b) => WORKSHOP_NOTE_UNITS[b.noteValue] - WORKSHOP_NOTE_UNITS[a.noteValue]
    || a.dots - b.dots || (a.tuplet && a.tuplet.actual || 0) - (b.tuplet && b.tuplet.actual || 0)
    || (a.tuplet && a.tuplet.normal || 0) - (b.tuplet && b.tuplet.normal || 0));
  let timeline = options.timeline;
  if (!timeline || !Number.isFinite(timeline.durationMs) || timeline.durationMs < 0) {
    try {
      // Constructing playback derives the same performed repeat/navigation order
      // as audition. No start(), timers, audio or stored-score edits are involved.
      timeline = createWorkshopPlayback(score, {}).getTimeline();
    } catch (error) { timeline = null; }
  }
  const sources = (Array.isArray(metadata.sources) ? metadata.sources : [])
    .filter(source => source && isValidWorkshopSourceUrl(source.url))
    .map(source => ({ label:text(source.label) || source.url, url:source.url }));
  return {
    title:text(options.title) || text(metadata.title), credits, sources, noteCount,
    barCount:parts[0] && Array.isArray(parts[0].measures) ? parts[0].measures.length : 0,
    staffCount:parts.length, staves:staffContexts(score, parts), pitches:containedPitches,
    range:containedPitches.length ? { lowest:Object.assign({}, containedPitches[0]),
      highest:Object.assign({}, containedPitches[containedPitches.length - 1]) } : null,
    noteValues, durationMs:timeline ? timeline.durationMs : null,
    hasImportWarnings:!!(score.musicXml && Array.isArray(score.musicXml.warnings) && score.musicXml.warnings.length)
  };
}

export function formatWorkshopInfoPitch(pitch, noteNaming) {
  if (!pitch || !STEPS.includes(pitch.step) || !Number.isFinite(pitch.alter) || !Number.isInteger(pitch.octave)) return "";
  const german = normalizeNoteNaming(noteNaming) === "german";
  const natural = german && pitch.step === "B" ? "H" : pitch.step;
  let name = natural;
  if (!Number.isInteger(pitch.alter)) {
    name += (pitch.alter < 0 ? "−" : "+") + (Math.abs(pitch.alter) === .5 ? "¼" : "¾");
  } else if (german) {
    if (pitch.alter === -2) name = pitch.step === "B" ? "Heses" : GERMAN_FLATS[pitch.step] + "es";
    else if (pitch.alter === 2) name = GERMAN_SHARPS[pitch.step] + "is";
    else if (pitch.alter < 0) name = GERMAN_FLATS[pitch.step];
    else if (pitch.alter > 0) name = GERMAN_SHARPS[pitch.step];
  } else {
    name += pitch.alter === -2 ? "𝄫" : pitch.alter === 2 ? "𝄪" : pitch.alter < 0 ? "♭" : pitch.alter > 0 ? "♯" : "";
  }
  return name + pitch.octave;
}

export function formatWorkshopInfoDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  const seconds = Math.round(durationMs / 1000), minutes = Math.floor(seconds / 60);
  return minutes + ":" + String(seconds % 60).padStart(2, "0");
}

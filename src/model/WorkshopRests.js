import { WORKSHOP_NOTE_UNITS, workshopEventVoice, workshopTimeOnGrid } from "./WorkshopRhythm";

const PLAIN_REST_FIELDS = ["id", "kind", "pitch", "noteValue", "startSlot", "voice", "tuplet", "dots", "autoRest"];
const GENERATED_CRYPTO_ID = /^rest-(?:[a-f0-9]{1,8}-){3}[a-f0-9]{1,8}$/;
const GENERATED_FALLBACK_ID = /^rest-[a-z0-9]{8,12}-[a-z0-9]{1,8}-[a-z0-9]{6,20}$/;

// Importers historically used the same rest-* IDs as the editor. Legacy
// inference is therefore opt-in and only safe for a known local editor score.
// An explicit false preserves an edited/imported rest even with an old ID.
export function isWorkshopGeneratedRest(event, { legacy = false } = {}) {
  if (!event || event.kind !== "rest" || event.pitch !== null || event.autoRest === false
    || Object.keys(event).some(key => !PLAIN_REST_FIELDS.includes(key))) return false;
  if (event.autoRest === true) return true;
  return legacy && (GENERATED_CRYPTO_ID.test(event.id) || GENERATED_FALLBACK_ID.test(event.id))
    && Object.prototype.hasOwnProperty.call(WORKSHOP_NOTE_UNITS, event.noteValue)
    && workshopTimeOnGrid(event.startSlot)
    && (event.voice === undefined || Number.isInteger(event.voice) && event.voice >= 1 && event.voice <= 4)
    && (event.dots === undefined || event.dots === 0)
    && (event.tuplet === undefined || event.tuplet === 3);
}

export function withWorkshopRestProvenance(measure, options = {}) {
  return Object.assign({}, measure, { events: measure.events.map(event => isWorkshopGeneratedRest(event, options)
    ? Object.assign({}, event, { autoRest: true }) : Object.assign({}, event)) });
}

// A note, a deliberate rest or any expressive/rest annotation keeps its voice
// alive. Pure gap-fillers alone must not recreate an abandoned voice forever.
export function pruneWorkshopGeneratedRestVoices(events, options = {}) {
  const active = new Set(events.filter(event => !isWorkshopGeneratedRest(event, options)).map(workshopEventVoice));
  return events.filter(event => active.has(workshopEventVoice(event)) || !isWorkshopGeneratedRest(event, options));
}

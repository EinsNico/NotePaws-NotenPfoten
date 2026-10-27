import { workshopKeyAlter } from "./WorkshopTonality";

const AMBIGUOUS = {};
const GLYPHS = { "-2": "dblflat", "-1.5": "threequarterflat", "-1": "flat", "-0.5": "halfflat",
  "0": "nat", "0.5": "halfsharp", "1": "sharp", "1.5": "threequartersharp", "2": "dblsharp" };

function displayedSlot(event) {
  return Number.isFinite(event.displaySlot) ? event.displaySlot
    : Number.isFinite(event.startSlot) ? event.startSlot : 0;
}

function graceOrder(record) {
  const grace = record.event.grace;
  return grace && Number.isFinite(grace.order) ? grace.order : record.index;
}

function representative(records) {
  // Identical written pitches share one sign. Choose the same representative
  // when events are stored in a different order, including imported voices.
  return records.slice().sort((left, right) => {
    const voice = (left.event.voice || 1) - (right.event.voice || 1);
    const staff = (left.event.sourcePartIndex || 0) - (right.event.sourcePartIndex || 0);
    return voice || staff || String(left.event.id || "").localeCompare(String(right.event.id || ""))
      || left.index - right.index;
  })[0];
}

/**
 * Derive the signs for one displayed staff in one measure, before head layout.
 * The returned shallow copies retain input order, pitches and all score data.
 * Display positions determine accidental memory during a drag. Voices share
 * memory, but octaves do not; a fresh invocation starts at the key signature.
 */
export function layoutWorkshopAccidentals(events, keyId, contextChanges = []) {
  const result = events.map(event => Object.assign({}, event, { accidental: null }));
  const records = result.map((event, index) => ({ event, index, slot: displayedSlot(event) }));
  records.sort((left, right) => left.slot - right.slot
    || Number(!!right.event.grace) - Number(!!left.event.grace)
    || (left.event.grace && right.event.grace ? graceOrder(left) - graceOrder(right) : 0)
    || left.index - right.index);
  const memory = new Map();
  const keyChanges = contextChanges.filter(change => change.keyId).slice()
    .sort((left, right) => displayedSlot(left) - displayedSlot(right));
  let currentKeyId = keyId, changeIndex = 0;

  function advanceKey(slot) {
    while (changeIndex < keyChanges.length && displayedSlot(keyChanges[changeIndex]) <= slot) {
      const nextKeyId = keyChanges[changeIndex++].keyId;
      if (nextKeyId !== currentKeyId) { currentKeyId = nextKeyId; memory.clear(); }
    }
  }

  function apply(onset) {
    const pitches = new Map();
    onset.filter(record => record.event.kind === "note" && record.event.pitch).forEach(record => {
      const pitch = record.event.pitch, key = pitch.step + ":" + pitch.octave;
      if (!pitches.has(key)) pitches.set(key, []);
      pitches.get(key).push(record);
    });
    pitches.forEach((notes, key) => {
      const alterations = new Set(notes.map(record => record.event.pitch.alter));
      if (alterations.size > 1) {
        // F and F-sharp at the same instant must both be explicit. Neither
        // alteration can become the inherited value for the following note.
        notes.forEach(record => { record.event.accidental = GLYPHS[record.event.pitch.alter]; });
        memory.set(key, AMBIGUOUS);
        return;
      }
      const note = representative(notes), pitch = note.event.pitch;
      const previous = memory.has(key) ? memory.get(key) : workshopKeyAlter(currentKeyId, pitch.step);
      const explicit = notes.filter(record => record.event.accidentalDisplay && record.event.accidentalDisplay.force);
      explicit.forEach(record => { record.event.accidental = GLYPHS[record.event.pitch.alter]; });
      if (previous !== pitch.alter && !explicit.length) note.event.accidental = GLYPHS[pitch.alter];
      memory.set(key, pitch.alter);
    });
  }

  let index = 0;
  while (index < records.length) {
    const record = records[index];
    advanceKey(record.slot);
    if (record.event.grace) {
      // Grace notes precede their principal onset and form an ordered phrase.
      apply([record]);
      index++;
    } else {
      const onset = [], slot = record.slot;
      while (index < records.length && records[index].slot === slot && !records[index].event.grace) {
        onset.push(records[index++]);
      }
      apply(onset);
    }
  }
  return result;
}

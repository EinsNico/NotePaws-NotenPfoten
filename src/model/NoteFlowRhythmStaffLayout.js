import {
  createNoteFlowStaffLayout,
  NOTE_FLOW_PLAY_LINE_X,
  NOTE_FLOW_NOTE_LEADING_INSET
} from "./NoteFlowStaffLayout";
import { TICKS_PER_QUARTER } from "./NoteFlowRhythm";

export const RHYTHM_PIXELS_PER_QUARTER = 48;
export const RHYTHM_SIXTEENTH_PIXELS_PER_QUARTER = 72;

function createBeamLayout(events, timeline, staves, height) {
  const beams = [];
  const beamable = event => event.kind === "note"
    && (event.noteValue === "eighth" || event.noteValue === "sixteenth");
  timeline.measures.forEach(measure => {
    ["treble", "bass"].forEach(hand => {
      const voice = events.filter(event => event.hand === hand
        && event.measureIndex === measure.index);
      let group = [];
      const flush = () => {
        if (group.length < 2) { group = []; return; }
        const averageY = group.reduce((sum, event) => sum + event.note.y, 0)
          / group.length;
        const lane = staves.find(staff => staff.clef === hand);
        let up = averageY >= lane.bottomLineY - 20;
        const highestY = Math.min(...group.map(event => event.note.y));
        const lowestY = Math.max(...group.map(event => event.note.y));
        if (up && highestY - 27 < 8) up = false;
        if (!up && lowestY + 27 > height - 8) up = true;
        const beamY = Math.max(8, Math.min(height - 8,
          up ? highestY - 27 : lowestY + 27));
        group.forEach(event => {
          event.beamed = true;
          event.note.stem = {
            x: up ? 6 : -6,
            y1: event.note.y,
            y2: beamY
          };
        });
        const stemX = event => event.x + event.note.stem.x;
        beams.push({
          hand,
          measureIndex: measure.index,
          level: 1,
          x1: stemX(group[0]),
          x2: stemX(group[group.length - 1]),
          y: beamY
        });
        group.forEach((event, index) => {
          if (event.noteValue !== "sixteenth") return;
          const next = group[index + 1];
          if (next && next.noteValue === "sixteenth") {
            beams.push({ hand, measureIndex: measure.index, level: 2,
              x1: stemX(event), x2: stemX(next),
              y: beamY + (up ? 6 : -6) });
          } else if (index === 0 || group[index - 1].noteValue !== "sixteenth") {
            // A lone sixteenth in a mixed group needs a short secondary beam.
            const towardNext = index === 0;
            const x = stemX(event);
            beams.push({ hand, measureIndex: measure.index, level: 2,
              x1: towardNext ? x : x - 9,
              x2: towardNext ? x + 9 : x,
              y: beamY + (up ? 6 : -6) });
          }
        });
        group = [];
      };
      voice.forEach(event => {
        const pulse = Math.floor((event.startTick - measure.startTick)
          / timeline.meter.pulseTicks);
        const previous = group[group.length - 1];
        if (!beamable(event) || (previous && (
          previous.endTick !== event.startTick || previous.pulse !== pulse
        ))) flush();
        if (beamable(event)) {
          event.pulse = pulse;
          group.push(event);
        }
      });
      flush();
    });
  });
  return beams;
}

export function createNoteFlowRhythmStaffLayout(cycle, timeline) {
  if (!cycle || !timeline || !Array.isArray(timeline.events)
    || !Array.isArray(timeline.measures) || !timeline.events.length) {
    throw new TypeError("A generated cycle and rhythmic timeline are required");
  }
  const pitched = timeline.events.filter(event => event.kind === "note");
  if (!pitched.length) throw new RangeError("The score needs a visible note");
  const layoutCycle = Object.assign({}, cycle, {
    timeline: { events: pitched.map((event, index) => ({
      id: `rhythm-${index}`, notes: [event.note],
      tonalityPlan: event.tonalityPlan
    })) }
  });
  const staff = createNoteFlowStaffLayout(layoutCycle, pitched.length);
  const lastSignatureX = Math.max(0, ...staff.staves.reduce((positions, lane) => (
    positions.concat(lane.keySignature.map(signature => signature.x))
  ), []));
  const timeSignatureX = Math.max(72, lastSignatureX + 22);
  const playLineX = Math.max(NOTE_FLOW_PLAY_LINE_X, timeSignatureX + 48);
  const firstNoteX = playLineX + 40;
  const allowedValues = timeline.allowedValues;
  const hasSixteenths = allowedValues
    ? Object.keys(allowedValues).some(hand => (
      allowedValues[hand].some(value => value === "sixteenth")
    ))
    : timeline.events.some(event => event.noteValue === "sixteenth");
  const pixelsPerQuarter = hasSixteenths
    ? RHYTHM_SIXTEENTH_PIXELS_PER_QUARTER : RHYTHM_PIXELS_PER_QUARTER;
  let noteIndex = 0;
  const events = timeline.events.map((event, index) => {
    const rendered = event.kind === "note" ? staff.events[noteIndex++].notes[0] : null;
    const lane = staff.staves.find(item => item.clef === event.hand);
    if (!lane) throw new RangeError(`No staff exists for ${event.hand}`);
    return {
      id: `rhythm-event-${index}`,
      kind: event.kind,
      hand: event.hand,
      noteValue: event.noteValue,
      dots: event.dots,
      measureIndex: event.measureIndex,
      startTick: event.startTick,
      endTick: event.endTick,
      durationTicks: event.durationTicks,
      x: firstNoteX + event.startTick / TICKS_PER_QUARTER
        * pixelsPerQuarter,
      note: rendered,
      restY: lane.bottomLineY - 20
    };
  });
  const beams = createBeamLayout(events, timeline, staff.staves, staff.height);
  return {
    width: staff.width,
    height: staff.height,
    playLineX,
    noteClipX: playLineX - NOTE_FLOW_NOTE_LEADING_INSET,
    firstNoteX,
    timeSignatureX,
    timeSignature: {
      numerator: timeline.meter.numerator,
      denominator: timeline.meter.denominator
    },
    pixelsPerQuarter,
    staves: staff.staves,
    events,
    beams,
    barlines: timeline.measures.map(measure => ({
      index: measure.index,
      x: firstNoteX + measure.endTick / TICKS_PER_QUARTER
        * pixelsPerQuarter
    }))
  };
}

export function getNoteFlowRhythmVisualFrame(layout, timeline, elapsedMs) {
  if (!layout || !timeline || !Number.isFinite(elapsedMs)) {
    throw new TypeError("Layout, timeline and elapsed time are required");
  }
  const atMs = Math.min(timeline.durationMs, Math.max(0, elapsedMs));
  const currentTick = atMs * timeline.bpm * timeline.meter.pulseTicks / 60000;
  return {
    atMs,
    currentTick,
    offsetX: layout.playLineX - layout.firstNoteX
      - currentTick / TICKS_PER_QUARTER * layout.pixelsPerQuarter
  };
}

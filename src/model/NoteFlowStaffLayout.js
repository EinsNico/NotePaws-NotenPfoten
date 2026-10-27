import {
  describeNoteFlowPitch,
  getNoteFlowRenderedClefs,
  NOTE_FLOW_PREVIEW_EVENT_COUNT
} from "./NoteFlowNotation";
import { getNoteRange } from "./NoteRanges";

export const NOTE_FLOW_STAFF_WIDTH = 320;
export const NOTE_FLOW_EVENT_SPACING = 64;
export const NOTE_FLOW_PLAY_LINE_X = 96;
export const NOTE_FLOW_NOTE_LEADING_INSET = 30;

const STAFF_STEP_HEIGHT = 5;
const STAFF_LINE_GAP = STAFF_STEP_HEIGHT * 2;
const STAFF_GAP = 34;
const STAFF_SIDE_PADDING = 12;
const STAFF_VERTICAL_PADDING = 18;
const STAFF_BOTTOM_STEPS = {
  treble: 4 * 7 + 2, // E4
  bass: 2 * 7 + 4 // G2
};
// Include both possible one-accidental spellings at the edges of a range.
const LOWEST_WRITTEN_STEP = [-1, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6];
const HIGHEST_WRITTEN_STEP = [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 7];
const KEY_SIGNATURE_STEPS = {
  treble: {
    sharp: [8, 5, 9, 6, 3, 7, 4],
    flat: [4, 7, 3, 6, 2, 5, 1]
  },
  bass: {
    sharp: [6, 3, 7, 4, 1, 5, 2],
    flat: [2, 5, 1, 4, 0, 3, -1]
  }
};

function clampEventCount(cycle, eventCount) {
  return Math.max(1, Math.min(
    cycle.timeline.events.length,
    Math.round(Number(eventCount) || NOTE_FLOW_PREVIEW_EVENT_COUNT)
  ));
}

function cycleForEvent(cycle, event) {
  return event && event.tonalityPlan
    ? Object.assign({}, cycle, { tonalityPlan: event.tonalityPlan })
    : cycle;
}

function getNoteOffsets(cycle, events, clef) {
  return events.reduce((offsets, event) => {
    const eventCycle = cycleForEvent(cycle, event);
    event.notes.forEach(note => {
      if (note.clef === clef) {
        const pitch = describeNoteFlowPitch(note, eventCycle);
        offsets.push(pitch.writtenStep - STAFF_BOTTOM_STEPS[clef]);
      }
    });
    return offsets;
  }, []);
}

function getConfiguredOffsets(cycle, clef) {
  const config = cycle.config;
  const configured = config && config.ranges && config.ranges[clef];
  if (!configured) {
    return null;
  }
  const range = getNoteRange(clef, config.difficulty, configured.min, configured.max);
  const low = Math.floor(range.min / 12) * 7
    + LOWEST_WRITTEN_STEP[range.min % 12];
  const high = Math.floor(range.max / 12) * 7
    + HIGHEST_WRITTEN_STEP[range.max % 12];
  return [low - STAFF_BOTTOM_STEPS[clef], high - STAFF_BOTTOM_STEPS[clef]];
}

function createStaffMetrics(cycle, events, clef) {
  const offsets = getConfiguredOffsets(cycle, clef)
    || getNoteOffsets(cycle, events, clef);
  const highestOffset = Math.max(8, ...offsets);
  const lowestOffset = Math.min(0, ...offsets);
  return {
    clef,
    above: Math.max(40, highestOffset * STAFF_STEP_HEIGHT),
    below: Math.max(0, -lowestOffset * STAFF_STEP_HEIGHT)
  };
}

function createKeySignature(cycle, clef, bottomLineY) {
  if (!cycle.tonalityPlan.displayKeySignature) {
    return [];
  }
  const signature = cycle.tonalityPlan.key.signature;
  if (!signature || signature.type === "none") {
    return [];
  }
  const positions = KEY_SIGNATURE_STEPS[clef][signature.type] || [];
  return signature.alteredNotes.map((entry, index) => ({
    id: `${clef}-signature-${index}`,
    glyph: entry.accidental,
    x: 52 + index * 6,
    y: bottomLineY - positions[index] * STAFF_STEP_HEIGHT
  }));
}

function createStaff(cycle, metric, bottomLineY) {
  return {
    clef: metric.clef,
    bottomLineY,
    lineYs: Array.from(
      { length: 5 },
      (_, index) => bottomLineY - (4 - index) * STAFF_LINE_GAP
    ),
    clefGlyph: metric.clef === "bass" ? "clefs.F" : "clefs.G",
    clefX: metric.clef === "bass" ? 19 : 17,
    clefY: metric.clef === "bass"
      ? bottomLineY - 3 * STAFF_LINE_GAP // F3: second line from the top
      : bottomLineY - STAFF_LINE_GAP, // G4: second line from the bottom
    clefScale: metric.clef === "bass" ? 1.15 : 1.05,
    keySignature: createKeySignature(cycle, metric.clef, bottomLineY)
  };
}

function createLedgerLines(offset, bottomLineY) {
  const lines = [];
  for (let step = -2; step >= offset; step -= 2) {
    lines.push(bottomLineY - step * STAFF_STEP_HEIGHT);
  }
  for (let step = 10; step <= offset; step += 2) {
    lines.push(bottomLineY - step * STAFF_STEP_HEIGHT);
  }
  return lines;
}

function createNoteLayout(note, cycle, staff) {
  const pitch = describeNoteFlowPitch(note, cycle);
  const offset = pitch.writtenStep - STAFF_BOTTOM_STEPS[staff.clef];
  const y = staff.bottomLineY - offset * STAFF_STEP_HEIGHT;
  const stemDown = offset >= 4;
  return {
    clef: staff.clef,
    value: note.value,
    y,
    ledgerLineYs: createLedgerLines(offset, staff.bottomLineY),
    stem: stemDown
      ? { x: -6, y1: y, y2: y + 27 }
      : { x: 6, y1: y, y2: y - 27 },
    accidental: cycle.tonalityPlan.displayAccidentalsOnNotes
      ? pitch.accidental
      : null,
    accidentalX: -18,
    accidentalY: y
  };
}

function createEventLayouts(cycle, events, staves) {
  return events.map((event, index) => {
    const eventCycle = cycleForEvent(cycle, event);
    const notes = event.notes.map(note => {
      const staff = staves.find(candidate => candidate.clef === note.clef)
        || staves[0];
      return createNoteLayout(note, eventCycle, staff);
    });
    const rests = [];
    if (
      cycle.config.handMode === "two"
      && !event.notes.some(note => note.clef === "bass")
    ) {
      const bassStaff = staves.find(staff => staff.clef === "bass");
      if (bassStaff) {
        rests.push({
          clef: "bass",
          y: bassStaff.bottomLineY - 4 * STAFF_STEP_HEIGHT
        });
      }
    }
    return {
      id: event.id,
      inputResult: event.inputResult || "none",
      x: index * NOTE_FLOW_EVENT_SPACING,
      notes,
      rests
    };
  });
}

export function createNoteFlowStaffLayout(
  cycle,
  eventCount = NOTE_FLOW_PREVIEW_EVENT_COUNT,
  options = {}
) {
  if (!cycle || !cycle.timeline || !Array.isArray(cycle.timeline.events)) {
    throw new Error("A generated Note Flow cycle is required for staff layout.");
  }
  const count = clampEventCount(cycle, eventCount);
  const events = cycle.timeline.events.slice(0, count);
  const metricEvents = Array.isArray(options.metricEvents)
    && options.metricEvents.length > 0
    ? options.metricEvents
    : events;
  const clefs = getNoteFlowRenderedClefs(cycle);
  const metrics = clefs.map(clef => createStaffMetrics(
    cycle,
    metricEvents,
    clef
  ));
  const contentHeight = metrics.reduce(
    (sum, metric) => sum + metric.above + metric.below,
    STAFF_GAP * Math.max(0, metrics.length - 1)
  );
  const minimumHeight = metrics.length > 1 ? 225 : 145;
  const height = Math.max(
    minimumHeight,
    contentHeight + STAFF_VERTICAL_PADDING * 2
  );
  let cursorY = (height - contentHeight) / 2;
  const staves = metrics.map(metric => {
    const bottomLineY = cursorY + metric.above;
    const staff = createStaff(cycle, metric, bottomLineY);
    cursorY = bottomLineY + metric.below + STAFF_GAP;
    return staff;
  });
  const lastSignatureX = Math.max(0, ...staves.reduce((positions, staff) => (
    positions.concat(staff.keySignature.map(signature => signature.x))
  ), []));
  const playLineX = Math.max(NOTE_FLOW_PLAY_LINE_X,
    lastSignatureX + NOTE_FLOW_NOTE_LEADING_INSET + 14);

  return {
    width: NOTE_FLOW_STAFF_WIDTH,
    height,
    staffStartX: STAFF_SIDE_PADDING,
    staffEndX: NOTE_FLOW_STAFF_WIDTH - 4,
    playLineX,
    noteClipX: playLineX - NOTE_FLOW_NOTE_LEADING_INSET,
    trackStartX: playLineX + NOTE_FLOW_EVENT_SPACING,
    trackEndX: playLineX
      - (count - 1) * NOTE_FLOW_EVENT_SPACING,
    eventCount: count,
    staves,
    events: createEventLayouts(cycle, events, staves)
  };
}

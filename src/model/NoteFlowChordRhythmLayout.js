import { createNoteFlowChordNotation } from "./NoteFlowChordNotation";
import { TICKS_PER_QUARTER } from "./NoteFlowRhythm";
import Glyphs from "abcjs/src/write/creation/glyphs";

const PIXELS_PER_QUARTER = 58;
const SIXTEENTH_PIXELS_PER_QUARTER = 76;
const streamSpacing = new WeakMap();

function retainStreamSpacing(score, options, required) {
  const scope = score.spacingScope || score;
  let variants = streamSpacing.get(scope);
  if (!variants) {
    variants = new Map();
    streamSpacing.set(scope, variants);
  }
  // A preview with a different key/spelling must not set the density of the
  // live notation. The requested window length deliberately shares it.
  const key = JSON.stringify([options.tonality || null, !!options.displayKeySignature,
    options.preferSharp !== false, options.staves || null]);
  const spacing = Math.max(required, variants.get(key) || 0);
  variants.set(key, spacing);
  return spacing;
}

function placeHeads(notes) {
  const ordered = notes.slice().sort((left, right) => left.writtenStep - right.writtenStep);
  return ordered.map((note, index) => Object.assign({}, note, {
    offsetX: index > 0 && note.writtenStep - ordered[index - 1].writtenStep === 1
      ? (index % 2 ? -8 : 8) : 0
  }));
}

function createPart(notes, staff, noteValue) {
  if (!notes.length) return { clef: staff.clef, restY: staff.lineYs[2] };
  const heads = placeHeads(notes);
  const highest = Math.min(...heads.map(note => note.y));
  const lowest = Math.max(...heads.map(note => note.y));
  let up = (highest + lowest) / 2 >= staff.lineYs[2];
  if (up && highest - 28 < 10) up = false;
  if (!up && lowest + 28 > staff.lineYs[4] + 26) up = true;
  return {
    clef: staff.clef,
    heads,
    restY: staff.lineYs[2],
    stem: noteValue === "whole" ? null : {
      x: up ? Math.max(...heads.map(note => note.offsetX)) + 6 :
        Math.min(...heads.map(note => note.offsetX)) - 6,
      y1: up ? lowest : highest,
      y2: up ? highest - 28 : lowest + 28,
      up
    },
    beamed: false
  };
}

function addBeams(events, meter, staves) {
  const beams = [];
  staves.forEach(staff => {
    let group = [];
    const flush = () => {
      if (group.length < 2) { group = []; return; }
      const firstPart = group[0].parts.find(part => part.clef === staff.clef);
      const up = firstPart.stem.up;
      const extremes = group.map(event => {
        const part = event.parts.find(item => item.clef === staff.clef);
        return up ? Math.min(...part.heads.map(head => head.y))
          : Math.max(...part.heads.map(head => head.y));
      });
      const beamY = up ? Math.min(...extremes) - 28 : Math.max(...extremes) + 28;
      group.forEach(event => {
        const part = event.parts.find(item => item.clef === staff.clef);
        part.stem.y2 = beamY;
        part.beamed = true;
      });
      const stemX = event => event.x
        + event.parts.find(part => part.clef === staff.clef).stem.x;
      beams.push({ clef: staff.clef, level: 1,
        x1: stemX(group[0]), x2: stemX(group[group.length - 1]), y: beamY });
      group.forEach((event, index) => {
        if (event.noteValue !== "sixteenth") return;
        const next = group[index + 1];
        const previous = group[index - 1];
        const delta = up ? 6 : -6;
        if (next && next.noteValue === "sixteenth") {
          beams.push({ clef: staff.clef, level: 2,
            x1: stemX(event), x2: stemX(next), y: beamY + delta });
        } else if (!previous || previous.noteValue !== "sixteenth") {
          const x = stemX(event);
          beams.push({ clef: staff.clef, level: 2,
            x1: next ? x : x - 9, x2: next ? x + 9 : x,
            y: beamY + delta });
        }
      });
      group = [];
    };
    events.forEach(event => {
      const pulse = Math.floor(event.startTick / meter.pulseTicks);
      const previous = group[group.length - 1];
      const part = event.parts.find(item => item.clef === staff.clef);
      const beamable = event.kind === "note" && !!part && !!part.stem
        && (event.noteValue === "eighth" || event.noteValue === "sixteenth");
      if (!beamable || (previous && (previous.measureIndex !== event.measureIndex
        || previous.endTick !== event.startTick || previous.pulse !== pulse))) flush();
      if (beamable) { event.pulse = pulse; group.push(event); }
    });
    flush();
  });
  return beams;
}

function eventHorizontalBounds(event) {
  if (event.kind === "rest") {
    const restName = event.noteValue === "eighth" ? "8th"
      : event.noteValue === "sixteenth" ? "16th" : event.noteValue;
    return { left: -8, right: Math.max(12, Glyphs.getSymbolWidth(`rests.${restName}`) + 1) };
  }
  let left = -9, right = 9;
  event.parts.forEach(part => {
    (part.heads || []).forEach((head, index) => {
      const halfWidth = head.ledgerLineYs.length ? 12 : 9;
      left = Math.min(left, head.offsetX - halfWidth);
      right = Math.max(right, head.offsetX + halfWidth, event.dots ? head.offsetX + 15 : 0);
      if (head.accidental) {
        const accidentalX = -19 - index * 9;
        // ABC glyph origins are left-aligned; leave an additional three pixels
        // around their outlines rather than treating the accidental as text.
        left = Math.min(left, accidentalX - 3);
        right = Math.max(right, accidentalX + Glyphs.getSymbolWidth(`accidentals.${head.accidental}`) * .8 + 3);
      }
    });
    if (part.stem) {
      // Reserve the flag even for a beamed onset. The same spacing then remains
      // safe at pulse boundaries and when a following event becomes a rest.
      const flag = event.noteValue === "eighth" || event.noteValue === "sixteenth" ? 12 : 1;
      left = Math.min(left, part.stem.x - (part.stem.up ? 1 : flag));
      right = Math.max(right, part.stem.x + (part.stem.up ? flag : 1));
    }
  });
  return { left, right };
}

// Defaults to two preview bars; the training view can request its bounded stream.
export function createNoteFlowChordRhythmLayout(score, options = {}) {
  if (!score || !Array.isArray(score.measures) || !score.measures.length
    || !Array.isArray(score.targets) || !score.targets.length) {
    throw new TypeError("A non-empty chord rhythm score is required");
  }
  const measureCount = Math.min(options.measureCount || 2, score.measures.length);
  const firstChord = score.targets[0].chord;
  const firstNotation = createNoteFlowChordNotation(firstChord, options);
  const staves = firstNotation.staves;
  const lastSignatureX = Math.max(0, ...staves.reduce((all, staff) =>
    all.concat(staff.keySignature.map(entry => entry.x)), []));
  const timeSignatureX = Math.max(78, lastSignatureX + 16);
  const sourceEvents = score.measures.slice(0, measureCount)
    .reduce((all, measure) => all.concat(measure.events), []);
  const hasSixteenths = Array.isArray(score.allowedValues)
    ? score.allowedValues.indexOf("sixteenth") !== -1
    : sourceEvents.some(event => event.noteValue === "sixteenth");
  const events = sourceEvents.map((event, index) => {
    const notation = event.chord ? createNoteFlowChordNotation(event.chord, Object.assign({}, options, { staves })) : null;
    return {
      id: `chord-rhythm-${index}`,
      kind: event.kind,
      measureIndex: event.measureIndex,
      startTick: event.startTick,
      globalStartTick: event.globalStartTick,
      endTick: event.endTick,
      noteValue: event.noteValue,
      dots: event.dots,
      parts: staves.map(staff => notation
        ? createPart(notation.notes.filter(note => note.clef === staff.clef), staff, event.noteValue)
        : { clef: staff.clef, restY: staff.lineYs[2] })
    };
  });
  const bounds = events.map(eventHorizontalBounds);
  let pixelsPerQuarter = hasSixteenths ? SIXTEENTH_PIXELS_PER_QUARTER : PIXELS_PER_QUARTER;
  events.forEach((event, index) => {
    if (!index) return;
    const deltaTicks = event.globalStartTick - events[index - 1].globalStartTick;
    if (deltaTicks <= 0) return;
    const requiredGap = bounds[index - 1].right - bounds[index].left + 8;
    pixelsPerQuarter = Math.max(pixelsPerQuarter, Math.ceil(requiredGap * TICKS_PER_QUARTER / deltaTicks));
  });
  // Once a round needs wider glyph spacing, dropping those older measures
  // must not rescale every remaining note or change its scrolling speed.
  pixelsPerQuarter = retainStreamSpacing(score, options, pixelsPerQuarter);
  // Preserve one linear tick-to-x mapping for staff scrolling and the playline.
  // Short notes with wide accidental columns determine the necessary zoom.
  const firstNoteX = Math.max(timeSignatureX + 42, timeSignatureX + 18 - bounds[0].left);
  const position = tick => firstNoteX + tick / TICKS_PER_QUARTER * pixelsPerQuarter;
  events.forEach(event => { event.x = position(event.globalStartTick); });
  const beams = addBeams(events, score.meter, staves);
  return {
    width: position(measureCount * score.meter.durationTicks) + 18,
    height: firstNotation.height,
    firstNoteX,
    pixelsPerQuarter,
    staves,
    timeSignatureX,
    timeSignature: {
      numerator: score.meter.numerator,
      denominator: score.meter.denominator
    },
    events,
    beams,
    barlines: Array.from({ length: measureCount }, (_, index) => {
      const tick = (index + 1) * score.meter.durationTicks;
      const nextIndex = events.findIndex(event => event.globalStartTick === tick);
      const inset = nextIndex < 0 ? 15 : Math.max(15, -bounds[nextIndex].left + 8);
      return { index, x: position(tick) - inset };
    })
  };
}

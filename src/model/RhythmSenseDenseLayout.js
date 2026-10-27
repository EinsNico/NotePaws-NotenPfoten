// Dense one-line percussion notation. Beats use quarter-note units throughout.
export const RHYTHM_DENSE_MIN_SPACING = 32;
const EPSILON = 0.000001;
const VALUE_SHAPES = Object.freeze({
  whole: { duration: 4, beams: 0, label: "1", hollow: true },
  half: { duration: 2, beams: 0, label: "1/2", hollow: true },
  dottedQuarter: { duration: 1.5, beams: 0, label: "3/8", dotted: true },
  quarter: { duration: 1, beams: 0, label: "1/4" },
  dottedEighth: { duration: 0.75, beams: 1, label: "3/16", dotted: true },
  eighth: { duration: 0.5, beams: 1, label: "1/8" },
  sixteenth: { duration: 0.25, beams: 2, label: "1/16" },
  thirtySecond: { duration: 0.125, beams: 3, label: "1/32" },
  sixtyFourth: { duration: 0.0625, beams: 4, label: "1/64" }
});

function meterShape(meter) {
  const parts = String(meter || "4/4").split("/").map(Number);
  const compound = parts[1] === 8 && (parts[0] === 6 || parts[0] === 9);
  const units = parts[0] > 0 && parts[1] > 0 ? parts[0] * 4 / parts[1] : 4;
  return { units, pulse: compound ? 1.5 : 1, numerator: parts[0] || 4, denominator: parts[1] || 4 };
}

export function shouldUseRhythmDenseScore(events = [], meter = "4/4") {
  // The legacy mobile 4/4 view folds at beat two. An unsplit whole/half
  // spanning that fold needs one continuous staff to show its full duration.
  if (meter === "4/4" && events.some(event => event.beat < 2
    && event.beat + (event.duration || (VALUE_SHAPES[event.value] || VALUE_SHAPES.quarter).duration) > 2 + EPSILON)) return true;
  if (events.length > 8 || events.some(event => event.value === "thirtySecond" || event.value === "sixtyFourth")) return true;
  // Keep legacy examples unless their nearest heads would be less than one
  // readable note slot apart on the smallest legacy row.
  const unitWidth = meter === "9/8" ? 60 : meter === "6/8" ? 90 : meter === "3/4" ? 88 : 132;
  return events.some((event, index) => index > 0
    && !(meter === "4/4" && events[index - 1].beat < 2 && event.beat >= 2)
    && (event.beat - events[index - 1].beat) * unitWidth < RHYTHM_DENSE_MIN_SPACING);
}

export function createRhythmSenseDenseLayout(events = [], meter = "4/4") {
  const shape = meterShape(meter);
  const headY = 80, stemTop = 25, stemOffset = 7, beamGap = 7;
  const left = 104, right = 30;
  let cursor = left;
  const notes = events.map((event, index) => {
    const value = VALUE_SHAPES[event.value] || VALUE_SHAPES.quarter;
    const duration = Number.isFinite(event.duration) && event.duration > 0 ? event.duration : value.duration;
    const slotWidth = Math.max(RHYTHM_DENSE_MIN_SPACING, duration * 72);
    const note = {
      id: event.id, index, value: event.value, beat: event.beat, duration,
      x: cursor, slotWidth, beamCount: value.beams, beamed: false,
      hollow: !!value.hollow, dotted: !!value.dotted, label: value.label,
      stem: event.value !== "whole"
    };
    cursor += slotWidth;
    return note;
  });
  const width = Math.max(320, cursor + right);
  const groups = [];
  let group = [];
  const finishGroup = () => { if (group.length > 1) groups.push(group); group = []; };
  notes.forEach(note => {
    if (!note.beamCount) { finishGroup(); return; }
    const previous = group[group.length - 1];
    if (previous && (Math.floor((previous.beat + EPSILON) / shape.pulse) !== Math.floor((note.beat + EPSILON) / shape.pulse)
      || Math.abs(previous.beat + previous.duration - note.beat) > EPSILON)) finishGroup();
    group.push(note);
  });
  finishGroup();
  const beams = [];
  groups.forEach((members, groupIndex) => {
    members.forEach(note => { note.beamed = true; });
    for (let level = 1; level <= 4; level++) {
      let run = [];
      const finishRun = () => {
        if (!run.length) return;
        const first = run[0], last = run[run.length - 1];
        let x1 = first.x + stemOffset, x2 = last.x + stemOffset;
        if (run.length === 1) {
          const position = members.indexOf(first);
          const subdivision = 0.5 / Math.pow(2, level - 2);
          const aligned = Math.abs(first.beat / subdivision - Math.round(first.beat / subdivision)) < EPSILON;
          const forward = position === 0 || position < members.length - 1 && aligned;
          const neighbor = members[position + (forward ? 1 : -1)];
          const length = Math.min(12, Math.abs(neighbor.x - first.x) * 0.38);
          if (forward) x2 += length;
          else x1 -= length;
        }
        beams.push({ id: `${groupIndex}-${level}-${first.index}`, group: groupIndex, level,
          startIndex: first.index, endIndex: last.index, partial: run.length === 1,
          x1, x2, y: stemTop + (level - 1) * beamGap });
        run = [];
      };
      members.forEach(note => { if (note.beamCount >= level) run.push(note); else finishRun(); });
      finishRun();
    }
  });
  const flags = [];
  notes.filter(note => note.beamCount && !note.beamed).forEach(note => {
    for (let level = 1; level <= note.beamCount; level++) {
      const x = note.x + stemOffset, y = stemTop + (level - 1) * beamGap;
      flags.push({ id: `${note.index}-${level}`, index: note.index, level,
        path: `M ${x} ${y} C ${x + 17} ${y + 2} ${x + 19} ${y + 14} ${x + 8} ${y + 20}` });
    }
  });
  return { width, height: 151, left, right, headY, stemTop, stemOffset, beamGap,
    units: shape.units, pulse: shape.pulse, numerator: shape.numerator, denominator: shape.denominator,
    notes, beams, flags };
}

export function rhythmDenseXAtBeat(layout, beat) {
  if (!layout.notes.length || !Number.isFinite(beat)) return layout.left;
  const target = layout.notes.find(note => beat < note.beat + note.duration) || layout.notes[layout.notes.length - 1];
  const x = target.x + (beat - target.beat) * target.slotWidth / target.duration;
  return Math.max(layout.left, Math.min(layout.width - layout.right, x));
}

export function rhythmDenseTapMarkerX(layout, marker, bpm = 80) {
  const target = layout.notes[marker.targetIndex];
  if (!target || !Number.isFinite(marker.offsetMs)) return null;
  // In compound meters BPM counts dotted-quarter pulses (1.5 units).
  const unitMs = 60000 / Math.max(1, bpm) / layout.pulse;
  const x = target.x + marker.offsetMs / unitMs * target.slotWidth / target.duration;
  return Math.max(12, Math.min(layout.width - 12, x));
}

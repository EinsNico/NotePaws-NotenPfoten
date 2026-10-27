// One-bar rhythm exercises. Beats are quarter-note units.
export const RHYTHM_SENSE_BPM = 80;
export const RHYTHM_SENSE_TEMPOS = Object.freeze([60, 80, 100, 120]);
export const RHYTHM_SENSE_METERS = Object.freeze(['4/4', '3/4', '2/4', '6/8', '9/8']);
export const RHYTHM_SENSE_ROUND_LENGTHS = Object.freeze([3, 10, 20, 0]);
export const RHYTHM_SENSE_NOTE_VALUES = Object.freeze([
  'whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond', 'sixtyFourth'
]);
export const RHYTHM_SENSE_DEFAULT_NOTE_VALUES = Object.freeze(['whole', 'half', 'quarter']);

export function normalizeRhythmSenseNoteValues(raw) {
  const selected = Array.isArray(raw)
    ? RHYTHM_SENSE_NOTE_VALUES.filter(value => raw.includes(value)) : [];
  return selected.length ? selected : RHYTHM_SENSE_DEFAULT_NOTE_VALUES.slice();
}

const METER_SHAPES = Object.freeze({
  '4/4': { units: 4, pulses: 4 },
  '3/4': { units: 3, pulses: 3 },
  '2/4': { units: 2, pulses: 2 },
  '6/8': { units: 3, pulses: 2 },
  '9/8': { units: 4.5, pulses: 3 }
});

function meterShape(meter) {
  const shape = METER_SHAPES[meter];
  if(!shape) throw new RangeError('Unsupported rhythm meter');
  return shape;
}

export function rhythmSenseBeatsPerBar(meter = '4/4') {
  return meterShape(meter).pulses;
}

export function rhythmSenseBarUnits(meter = '4/4') {
  return meterShape(meter).units;
}

export function rhythmSenseBeatMs(bpm = RHYTHM_SENSE_BPM) {
  if (!RHYTHM_SENSE_TEMPOS.includes(bpm)) throw new RangeError("Unsupported rhythm tempo");
  return 60000 / bpm;
}

export function rhythmSenseBarDurationMs(bpm = RHYTHM_SENSE_BPM, meter = '4/4') {
  return rhythmSenseBeatsPerBar(meter) * rhythmSenseBeatMs(bpm);
}

export function rhythmSenseUnitMs(bpm = RHYTHM_SENSE_BPM, meter = '4/4') {
  const shape = meterShape(meter);
  return rhythmSenseBeatMs(bpm) * shape.pulses / shape.units;
}

export function rhythmSenseOnsetMs(event, bpm = RHYTHM_SENSE_BPM, meter = '4/4') {
  if (!event || !Number.isFinite(event.beat)) throw new RangeError("Invalid rhythm event");
  return event.beat * rhythmSenseUnitMs(bpm, meter);
}

const VALUES = Object.freeze({ whole: 4, half: 2, dottedQuarter: 1.5, quarter: 1,
  dottedEighth: 0.75, eighth: 0.5, sixteenth: 0.25, thirtySecond: 0.125, sixtyFourth: 0.0625 });

function selectionPlan(raw, meter) {
  const totalTicks = rhythmSenseBarUnits(meter) * 16;
  const values = normalizeRhythmSenseNoteValues(raw);
  const shortestTicks = VALUES[values[values.length - 1]] * 16;
  // Selectable lengths are powers of two in sixty-fourth-note units. Repeating
  // the shortest selected value fills exactly every reachable remainder.
  const fits = totalTicks % shortestTicks === 0;
  return { totalTicks, shortestTicks, fits,
    values: values.filter(value => VALUES[value] * 16 <= totalTicks) };
}

export function rhythmSenseSelectionFitsMeter(values, meter = '4/4') {
  return selectionPlan(values, meter).fits;
}

function selectedPattern(index, meter, raw) {
  const plan = selectionPlan(raw, meter);
  if(!plan.fits) throw new RangeError('Selected note values cannot fill this meter');
  // Rotate a guaranteed member across deterministic seeds so a short selected
  // length cannot be crowded out by otherwise valid longer notes.
  const first = plan.values[index % plan.values.length];
  const values = [first];
  let remaining = plan.totalTicks - VALUES[first] * 16;
  let seed = (Math.imul(index + 1, 2654435761) + 1) >>> 0;
  while(remaining > 0) {
    const choices = plan.values.filter(value => {
      const ticks = VALUES[value] * 16;
      return ticks <= remaining && (remaining - ticks) % plan.shortestTicks === 0;
    });
    seed = nextSeed(seed);
    const value = choices[seed % choices.length];
    values.push(value);
    remaining -= VALUES[value] * 16;
  }
  return values;
}
const PATTERNS = Object.freeze([
  ["quarter", "eighth", "eighth", "quarter", "quarter"],
  ["half", "quarter", "quarter"],
  ["quarter", "eighth", "eighth", "sixteenth", "sixteenth", "sixteenth", "sixteenth", "quarter"],
  ["whole"],
  ["quarter", "dottedEighth", "sixteenth", "quarter", "quarter"]
]);
const THREE_FOUR_PATTERNS = Object.freeze([
  ['quarter', 'eighth', 'eighth', 'quarter'],
  ['half', 'quarter'],
  ['quarter', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'quarter'],
  ['quarter', 'quarter', 'quarter'],
  ['quarter', 'dottedEighth', 'sixteenth', 'quarter']
]);
const TWO_FOUR_PATTERNS = Object.freeze([
  ['quarter', 'quarter'],
  ['eighth', 'eighth', 'quarter'],
  ['quarter', 'eighth', 'eighth'],
  ['half'],
  ['quarter', 'dottedEighth', 'sixteenth']
]);
const SIX_EIGHT_PATTERNS = Object.freeze([
  ['eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth'],
  ['dottedQuarter', 'dottedQuarter'],
  ['quarter', 'eighth', 'quarter', 'eighth'],
  ['eighth', 'quarter', 'eighth', 'quarter'],
  ['eighth', 'sixteenth', 'sixteenth', 'eighth', 'quarter', 'eighth'],
  ['dottedEighth', 'sixteenth', 'eighth', 'dottedQuarter']
]);
const NINE_EIGHT_PATTERNS = Object.freeze([
  Array(9).fill('eighth'),
  ['dottedQuarter', 'dottedQuarter', 'dottedQuarter'],
  ['quarter', 'eighth', 'quarter', 'eighth', 'quarter', 'eighth'],
  ['eighth', 'quarter', 'eighth', 'quarter', 'eighth', 'quarter'],
  ['eighth', 'sixteenth', 'sixteenth', 'eighth', 'quarter', 'eighth', 'dottedQuarter'],
  ['dottedEighth', 'sixteenth', 'eighth', 'dottedQuarter', 'dottedQuarter']
]);
const COMPOUND_CELLS = Object.freeze([
  ['eighth', 'eighth', 'eighth'],
  ['quarter', 'eighth'],
  ['eighth', 'quarter'],
  ['dottedQuarter']
]);
const COMPOUND_SIXTEENTH_CELL = Object.freeze(['eighth', 'sixteenth', 'sixteenth', 'eighth']);
const COMPOUND_DOTTED_EIGHTH_CELL = Object.freeze(['dottedEighth', 'sixteenth', 'eighth']);

// Keep the first four examples predictable; subsequent bars combine one-beat
// rhythmic cells. A seed derived from the bar number makes them reproducible
// for tests while giving "another rhythm" more than four choices.
const BEAT_CELLS = Object.freeze([
  ["quarter"], ["quarter"], ["quarter"],
  ["eighth", "eighth"], ["eighth", "eighth"],
  ["eighth", "sixteenth", "sixteenth"],
  ["sixteenth", "sixteenth", "eighth"],
  ["sixteenth", "sixteenth", "sixteenth", "sixteenth"],
  ["dottedEighth", "sixteenth"]
]);

function nextSeed(seed) {
  let value = seed;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function generatedPattern(index, beatsPerBar = 4, offset = 0) {
  let seed = (Math.imul(index + 1, 2654435761) + offset + 1) >>> 0;
  const values = [];
  let beat = 0;
  let busyBeatUsed = false;
  while(beat < beatsPerBar) {
    seed = nextSeed(seed);
    const remaining = beatsPerBar - beat;
    if(beatsPerBar === 4 && beat === 0 && seed % 37 === 0) {
      values.push("whole");
      beat = 4;
    } else if(remaining >= 2 && seed % 9 === 0) {
      values.push("half");
      beat += 2;
    } else {
      let cell = BEAT_CELLS[seed % BEAT_CELLS.length];
      if(cell.includes("sixteenth")) {
        if(busyBeatUsed) cell = BEAT_CELLS[3];
        else busyBeatUsed = true;
      }
      values.push(...cell);
      beat += 1;
    }
  }
  return values;
}

function generatedCompoundPattern(index, groups, offset = 0, allowDottedEighth = false) {
  let seed = (Math.imul(index + 1, 2654435761) + offset + 19) >>> 0;
  const values = [];
  let denseGroupUsed = false;
  for(let group = 0; group < groups; group++) {
    seed = nextSeed(seed);
    if(!denseGroupUsed && allowDottedEighth && seed % 7 === 0) {
      values.push(...COMPOUND_DOTTED_EIGHTH_CELL);
      denseGroupUsed = true;
    } else if(!denseGroupUsed && seed % 5 === 0) {
      values.push(...COMPOUND_SIXTEENTH_CELL);
      denseGroupUsed = true;
    } else {
      values.push(...COMPOUND_CELLS[seed % COMPOUND_CELLS.length]);
    }
  }
  return values;
}

function patternValues(index, meter, beatsPerBar) {
  if(meter === '6/8' || meter === '9/8') {
    const starters = meter === '6/8' ? SIX_EIGHT_PATTERNS : NINE_EIGHT_PATTERNS;
    const groups = meter === '6/8' ? 2 : 3;
    if(index < starters.length) return starters[index];
    const allowDottedEighth = true;
    const previous = index === starters.length
      ? starters[starters.length - 1] : generatedCompoundPattern(index - 1, groups, 0, allowDottedEighth);
    let values = generatedCompoundPattern(index, groups, 0, allowDottedEighth);
    if(values.join(',') === previous.join(',')) values = generatedCompoundPattern(index, groups, 1, allowDottedEighth);
    return values;
  }
  const starters = meter === '2/4' ? TWO_FOUR_PATTERNS
    : beatsPerBar === 3 ? THREE_FOUR_PATTERNS : PATTERNS;
  if(index < starters.length) return starters[index];
  const previous = index === starters.length
    ? starters[starters.length - 1] : generatedPattern(index - 1, beatsPerBar);
  let values = generatedPattern(index, beatsPerBar);
  if(values.join(",") === previous.join(",")) {
    values = generatedPattern(index, beatsPerBar, 1);
  }
  return values;
}

export function createRhythmSenseBar(patternIndex = 0, meter = '4/4', selectedValues) {
  if(!Number.isSafeInteger(patternIndex) || patternIndex < 0) {
    throw new RangeError("Invalid rhythm pattern index");
  }
  const beatsPerBar = rhythmSenseBarUnits(meter);
  const values = selectedValues === undefined ? patternValues(patternIndex, meter, beatsPerBar)
    : selectedPattern(patternIndex, meter, selectedValues);
  let beat = 0;
  const events = values.map((value, index) => {
    const event = { id: index, value, beat, duration: VALUES[value] };
    beat += event.duration;
    return event;
  });
  if (beat !== beatsPerBar) throw new RangeError('A rhythm exercise must fill one bar');
  return events;
}

// A session samples each difficulty band before repeating it. The catalog
// contains unique bars only, so changing the index cannot silently repeat a
// rhythm with identical note values.
export function createRhythmSensePatternPicker(meter = '4/4', initialIndex = null, random = Math.random, selectedValues) {
  meterShape(meter);
  const tierFor = events => events.some(event => event.duration <= 0.25 || event.value === 'dottedEighth')
    ? 'dense' : events.length <= rhythmSenseBeatsPerBar(meter) ? 'simple' : 'varied';
  const catalog = { simple: [], varied: [], dense: [] };
  const signatures = new Map();
  for(let index = 0; index < 160; index++) {
    const events = createRhythmSenseBar(index, meter, selectedValues);
    const signature = events.map(event => event.value).join(',');
    if(signatures.has(signature)) continue;
    signatures.set(signature, index);
    catalog[tierFor(events)].push({ index, signature });
  }
  const shuffle = values => {
    const copy = values.slice();
    for(let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };
  const bags = { simple: [], varied: [], dense: [] };
  const availableTiers = ['simple', 'varied', 'dense'].filter(tier => catalog[tier].length);
  let tiers = [];
  let lastTier = initialIndex === null ? null : tierFor(createRhythmSenseBar(initialIndex, meter, selectedValues));
  const recent = initialIndex === null ? []
    : [createRhythmSenseBar(initialIndex, meter, selectedValues).map(event => event.value).join(',')];
  return () => {
    if(!tiers.length) tiers = shuffle(availableTiers);
    let tier = tiers.pop();
    if(tier === lastTier && tiers.length) {
      const alternative = tiers.pop();
      tiers.push(tier);
      tier = alternative;
    }
    if(!bags[tier].length) bags[tier] = shuffle(catalog[tier]);
    let position = bags[tier].findIndex(entry => !recent.includes(entry.signature));
    if(position < 0) position = bags[tier].findIndex(entry => entry.signature !== recent[recent.length - 1]);
    if(position < 0) position = 0;
    const [selected] = bags[tier].splice(position, 1);
    recent.push(selected.signature);
    if(recent.length > 3) recent.shift();
    lastTier = tier;
    return selected.index;
  };
}

export function rhythmSenseWindows(events, index, bpm = RHYTHM_SENSE_BPM, meter = '4/4') {
  const current = events[index];
  if (!current) throw new RangeError("Invalid rhythm timing");
  const previousGap = index ? current.beat - events[index - 1].beat : Infinity;
  const nextGap = index < events.length - 1 ? events[index + 1].beat - current.beat : Infinity;
  const beatGap = Math.min(previousGap, nextGap, 1);
  const gapMs = beatGap * rhythmSenseUnitMs(bpm, meter);
  return { preciseMs: Math.min(100, gapMs * 0.3), outerMs: Math.min(180, gapMs * 0.48) };
}

export function rhythmSenseTap(events, results, elapsedMs, bpm = RHYTHM_SENSE_BPM, meter = '4/4') {
  rhythmSenseUnitMs(bpm, meter);
  const nextIndex = results.findIndex(result => !result);
  if (nextIndex < 0) return { result: "extra", index: -1 };
  const targetMs = rhythmSenseOnsetMs(events[nextIndex], bpm, meter);
  const windows = rhythmSenseWindows(events, nextIndex, bpm, meter);
  const differenceMs = elapsedMs - targetMs;
  if (differenceMs < -windows.outerMs) return { result: "too-early", index: -1 };
  if (differenceMs > windows.outerMs) return { result: "too-late", index: -1 };
  return {
    result: Math.abs(differenceMs) <= windows.preciseMs ? "correct" : differenceMs < 0 ? "early" : "late",
    index: nextIndex,
    differenceMs
  };
}

export function summarizeRhythmSenseResults(events, results) {
  const summary = { total: events.length, correct: 0, early: 0, late: 0, missed: 0 };
  events.forEach((_, index) => {
    const result = results[index] || 'missed';
    if(Object.prototype.hasOwnProperty.call(summary, result) && result !== 'total') {
      summary[result] += 1;
    }
  });
  return summary;
}

export function evaluateRhythmSenseRound(events, results) {
  const summary = summarizeRhythmSenseResults(events, results);
  const hitCount = summary.correct + summary.early + summary.late;
  const byValue = [];
  const rows = Object.create(null);
  events.forEach((event, index) => {
    if (!event || !Object.prototype.hasOwnProperty.call(VALUES, event.value)) return;
    let row = rows[event.value];
    if (!row) {
      row = { value: event.value, total: 0, correct: 0, early: 0, late: 0, missed: 0 };
      rows[event.value] = row;
      byValue.push(row);
    }
    row.total += 1;
    const result = results[index] || 'missed';
    if (Object.prototype.hasOwnProperty.call(row, result) && result !== 'total') {
      row[result] += 1;
    }
  });
  return Object.assign({}, summary, {
    hitCount,
    precisionPercent: summary.total ? Math.round(summary.correct / summary.total * 100) : 0,
    hitPercent: summary.total ? Math.round(hitCount / summary.total * 100) : 0,
    byValue
  });
}

export function createRhythmSenseBarRecord(options) {
  const { sessionId, barNumber, meter, bpm, roundLength, events, results, tapMarkers, acceptedOffsets, noteValues } = options || {};
  if (typeof sessionId !== 'string' || !sessionId || !Number.isInteger(barNumber) || barNumber < 1
    || !Array.isArray(events) || !Array.isArray(results) || events.length !== results.length) {
    throw new TypeError('A complete rhythm bar is required');
  }
  rhythmSenseUnitMs(bpm, meter);
  const evaluation = evaluateRhythmSenseRound(events, results);
  const taps = (Array.isArray(tapMarkers) ? tapMarkers : []).map(marker => ({
    targetIndex: marker.targetIndex,
    offsetMs: Math.round(marker.offsetMs),
    result: marker.result
  }));
  const notes = events.map((event, index) => {
    const result = results[index] || 'missed';
    const tap = taps.find(marker => marker.targetIndex === index && marker.result === result);
    const savedOffset = Array.isArray(acceptedOffsets) && Number.isFinite(acceptedOffsets[index])
      ? acceptedOffsets[index] : tap ? tap.offsetMs : null;
    return {
      beat: event.beat,
      value: event.value,
      result,
      offsetMs: savedOffset === null ? null : Math.round(savedOffset)
    };
  });
  const timedOffsets = notes.filter(note => note.offsetMs !== null);
  const totalAbsoluteOffsetMs = timedOffsets.reduce((sum, note) => sum + Math.abs(note.offsetMs), 0);
  const completedAt = options.completedAt || new Date().toISOString();
  const settings = { meter, bpm, roundLength, rhythm: { meter } };
  if(noteValues !== undefined) settings.noteValues = normalizeRhythmSenseNoteValues(noteValues);
  return {
    id: `${sessionId}:bar:${barNumber}`,
    resultVersion: 1,
    exerciseType: 'rhythm',
    mode: 'normal',
    sessionId,
    barNumber,
    startedAt: new Date(Date.parse(completedAt) - rhythmSenseBarDurationMs(bpm, meter)).toISOString(),
    completedAt,
    durationMs: rhythmSenseBarDurationMs(bpm, meter),
    settings,
    score: {
      evaluatedInputs: evaluation.total,
      correct: evaluation.correct,
      wrong: evaluation.early + evaluation.late,
      missed: evaluation.missed,
      accuracy: evaluation.precisionPercent
    },
    timing: {
      evaluatedInputs: timedOffsets.length,
      precise: evaluation.correct,
      early: evaluation.early,
      late: evaluation.late,
      totalAbsoluteOffsetMs,
      averageAbsoluteOffsetMs: timedOffsets.length
        ? Math.round(totalAbsoluteOffsetMs / timedOffsets.length) : null
    },
    notes,
    taps
  };
}

export function mergeRhythmSenseEvaluations(previous, current) {
  const counts = ['total', 'correct', 'early', 'late', 'missed'];
  const merged = {};
  counts.forEach(key => { merged[key] = (previous ? previous[key] : 0) + current[key]; });
  const rows = Object.create(null);
  const byValue = [];
  [previous, current].forEach(evaluation => {
    if (!evaluation) return;
    evaluation.byValue.forEach(source => {
      let row = rows[source.value];
      if (!row) {
        row = { value: source.value, total: 0, correct: 0, early: 0, late: 0, missed: 0 };
        rows[source.value] = row;
        byValue.push(row);
      }
      counts.forEach(key => { row[key] += source[key]; });
    });
  });
  const hitCount = merged.correct + merged.early + merged.late;
  return Object.assign(merged, {
    hitCount,
    precisionPercent: merged.total ? Math.round(merged.correct / merged.total * 100) : 0,
    hitPercent: merged.total ? Math.round(hitCount / merged.total * 100) : 0,
    byValue
  });
}

import { createWorkshopDraft, isValidWorkshopScore, workshopId, workshopMeterUnits, workshopMeasureContext,
  WORKSHOP_MAX_MEASURE_EVENTS, WORKSHOP_MAX_SCORE_MEASURES, WORKSHOP_MIN_PITCH, WORKSHOP_MAX_PITCH } from "./Workshop";
import { WORKSHOP_NOTE_UNITS, WORKSHOP_TICKS_PER_UNIT, workshopEventUnits, workshopTimeTicks, workshopEventVoice } from "./WorkshopRhythm";
import { NOTE_FLOW_TONALITIES } from "./NoteFlowTonality";
import { workshopKeyAlter } from "./WorkshopTonality";

// MIDI contains performance events, not engraved notation. Import into a new,
// ordinary editor score; never rewrite an existing library or a source file.
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_EVENTS = 200000;
const MAX_NOTES = 64000;
const MAX_TRACKS = 256;
// A common straight/triplet lattice (512th straight / 1024th triplet). This
// avoids an unrepresentable one-tick tail between the smallest written values.
const GRID_TICKS = WORKSHOP_TICKS_PER_UNIT / 192;
const KEY_IDS = new Map(NOTE_FLOW_TONALITIES.map(key => [key.fifths + ":" + (key.mode === "minor" ? 1 : 0), key.id]));
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function warn(list, code) { if (!list.includes(code)) list.push(code); }
function bytesFor(data) {
  let bytes;
  if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else fail("invalid-midi");
  if (bytes.byteLength > MAX_BYTES) fail("midi-too-large");
  return bytes;
}
function textFor(bytes) {
  let value;
  if (typeof TextDecoder !== "undefined") value = new TextDecoder("utf-8").decode(bytes);
  else value = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 2048);
}
function parseMidi(data, warnings) {
  const bytes = bytesFor(data);
  let position = 0, eventCount = 0;
  function require(count, end = bytes.length) { if (!Number.isSafeInteger(count) || count < 0 || position + count > end) fail("invalid-midi"); }
  function byte(end) { require(1, end); return bytes[position++]; }
  function word() { return byte() * 256 + byte(); }
  function long() { return byte() * 16777216 + byte() * 65536 + byte() * 256 + byte(); }
  function tag() { require(4); const result = String.fromCharCode(...bytes.subarray(position, position + 4)); position += 4; return result; }
  function variable(end) {
    let value = 0;
    for (let count = 0; count < 4; count++) {
      const next = byte(end); value = value * 128 + (next & 127);
      if (!(next & 128)) return value;
    }
    fail("invalid-midi");
  }
  if (tag() !== "MThd") fail("invalid-midi");
  const headerLength = long(); require(headerLength);
  if (headerLength < 6) fail("invalid-midi");
  const format = word(), trackCount = word(), division = word(); position += headerLength - 6;
  if (format > 1) fail("unsupported-midi-format");
  if (!trackCount || format === 0 && trackCount !== 1 || trackCount > MAX_TRACKS) fail("unsupported-midi-score");
  if (division & 32768) fail("unsupported-midi-timing");
  if (!division) fail("invalid-midi");
  const notes = [], tempos = [], meters = [], keys = [], pedals = [], names = [], rights = [], velocities = new Set(), noteChannels = new Set();
  let duration = 0, tracksRead = 0;
  while (position < bytes.length) {
    const chunkTag = tag(), chunkLength = long(); require(chunkLength);
    const end = position + chunkLength;
    if (chunkTag !== "MTrk") { position = end; continue; }
    if (tracksRead >= trackCount) fail("invalid-midi");
    const track = tracksRead++, active = new Map(); let ticks = 0, running = 0, ended = false;
    function finish(channel, pitch) {
      const queue = active.get(channel + ":" + pitch);
      if (!queue || !queue.length) { warn(warnings, "incomplete-notes"); return; }
      const note = queue.shift(); note.end = ticks; notes.push(note);
      if (notes.length > MAX_NOTES) fail("unsupported-midi-score");
      if (!queue.length) active.delete(channel + ":" + pitch);
    }
    while (position < end) {
      if (++eventCount > MAX_EVENTS) fail("unsupported-midi-score");
      ticks += variable(end);
      if (!Number.isSafeInteger(ticks)) fail("invalid-midi");
      let status = byte(end), first = null;
      if (status < 128) {
        if (!running) fail("invalid-midi"); first = status; status = running;
      }
      if (status === 255) {
        running = 0;
        const type = byte(end), length = variable(end); require(length, end);
        const value = bytes.subarray(position, position + length); position += length;
        if (type === 47) {
          if (length || position !== end) fail("invalid-midi"); ended = true; break;
        }
        if (type === 81) {
          if (length !== 3) fail("invalid-midi");
          const micros = value[0] * 65536 + value[1] * 256 + value[2];
          if (!micros) fail("invalid-midi");
          const exact = 60000000 / micros, bpm = Math.round(exact);
          if (exact < 25 || exact > 240) fail("unsupported-midi-score");
          if (Math.abs(exact - bpm) > 0.0001) warn(warnings, "quantized-timing");
          tempos.push({ tick:ticks, value:bpm });
        } else if (type === 88) {
          if (length !== 4) fail("invalid-midi");
          const meter = value[0] + "/" + Math.pow(2, value[1]);
          if (workshopMeterUnits(meter) === null) fail("unsupported-midi-score");
          meters.push({ tick:ticks, value:meter });
        } else if (type === 89) {
          if (length !== 2) fail("invalid-midi");
          const fifths = value[0] > 127 ? value[0] - 256 : value[0], keyId = KEY_IDS.get(fifths + ":" + value[1]);
          if (!keyId) fail("unsupported-midi-score"); keys.push({ tick:ticks, value:keyId });
        } else if (type === 3) names.push({ track, value:textFor(value) });
        else if (type === 2) rights.push(textFor(value));
        else if ([5, 6, 7].includes(type)) warn(warnings, "performance-controls-ignored");
        continue;
      }
      if (status === 240 || status === 247) {
        running = 0; const length = variable(end); require(length, end); position += length;
        warn(warnings, "performance-controls-ignored"); continue;
      }
      if (status < 128 || status >= 240) fail("invalid-midi");
      running = status;
      const kind = status & 240, channel = status & 15;
      const one = first === null ? byte(end) : first, two = [192, 208].includes(kind) ? null : byte(end);
      if (one >= 128 || two !== null && two >= 128) fail("invalid-midi");
      if (kind === 144 && two > 0) {
        if (channel === 9) { warn(warnings, "percussion-ignored"); continue; }
        const value = one - 12;
        if (value < WORKSHOP_MIN_PITCH || value > WORKSHOP_MAX_PITCH) fail("unsupported-midi-score");
        velocities.add(two); noteChannels.add(channel);
        const key = channel + ":" + one;
        if (!active.has(key)) active.set(key, []);
        active.get(key).push({ start:ticks, pitch:one, track, channel });
        if (active.size > MAX_NOTES) fail("unsupported-midi-score");
      } else if (kind === 128 || kind === 144) {
        if (channel !== 9) finish(channel, one);
      } else if (kind === 176 && one === 64 && channel !== 9) pedals.push({ tick:ticks, channel, value:two >= 64 ? "down" : "up" });
      else if (kind === 176 && [120, 123].includes(one)) {
        Array.from(active.keys()).filter(key => key.startsWith(channel + ":")).forEach(key => {
          const queue = active.get(key); queue.forEach(note => { note.end = ticks; notes.push(note); }); active.delete(key);
        });
        if (one === 120) pedals.push({tick:ticks, channel, value:"up"});
      } else if (kind === 192) { if (one !== 0 && channel !== 9) warn(warnings, "instruments-ignored"); }
      else if (kind === 176 && [0, 32].includes(one)) { if (two !== 0 && channel !== 9) warn(warnings, "instruments-ignored"); }
      else warn(warnings, "performance-controls-ignored");
    }
    if (!ended) fail("invalid-midi");
    if (active.size) {
      warn(warnings, "incomplete-notes");
      active.forEach(queue => queue.forEach(note => { note.end = Math.max(ticks, note.start + division / 4); notes.push(note); }));
    }
    if (notes.length > MAX_NOTES) fail("unsupported-midi-score");
    duration = Math.max(duration, ticks);
  }
  if (tracksRead !== trackCount) fail("invalid-midi");
  if (!notes.length) fail("empty-midi");
  // Per-key velocity and separate channel sustain are not editable properties
  // of a workshop piano score; disclose their normalization explicitly.
  if (velocities.size > 1 || pedals.length && noteChannels.size > 1) warn(warnings, "performance-controls-ignored");
  return { division, notes, tempos, meters, keys, pedals, names, rights, duration };
}

function pointMap(points, convert) {
  const values = new Map();
  points.forEach(point => {
    const tick = convert(point.tick);
    if (values.has(tick) && values.get(tick) !== point.value) fail("unsupported-midi-score");
    values.set(tick, point.value);
  });
  return Array.from(values, ([tick, value]) => ({ tick, value })).sort((a, b) => a.tick - b.tick);
}
function atPoint(points, tick, fallback) {
  let low = 0, high = points.length;
  while (low < high) { const middle = (low + high) >>> 1; if (points[middle].tick <= tick) low = middle + 1; else high = middle; }
  return low ? points[low - 1].value : fallback;
}
const DURATIONS = Object.keys(WORKSHOP_NOTE_UNITS).reduce((all, noteValue) => {
  for (let dots = 0; dots <= 3; dots++) {
    const value = Object.assign({noteValue}, dots ? {dots} : {});
    all.push({value, ticks:workshopTimeTicks(workshopEventUnits(value))});
    const triplet = Object.assign({}, value, {tuplet:3});
    all.push({value:triplet, ticks:workshopTimeTicks(workshopEventUnits(triplet))});
  }
  return all;
}, []).filter(value => value.ticks % GRID_TICKS === 0)
  .sort((a, b) => b.ticks - a.ticks || Number(!!a.value.tuplet) - Number(!!b.value.tuplet) || (a.value.dots || 0) - (b.value.dots || 0));
function durationFragments(ticks) {
  const result = [];
  // The binary/triplet grid can always be represented; reject pathological
  // fragment counts rather than importing a partial or silently clipped note.
  while (ticks > 0) {
    const choice = DURATIONS.find(value => value.ticks <= ticks);
    if (!choice || result.length >= 64) fail("unsupported-midi-score");
    result.push(choice); ticks -= choice.ticks;
  }
  return result;
}
function spelledPitch(midi, keyId) {
  const value = midi - 12, octave = Math.floor(value / 12), fifths = NOTE_FLOW_TONALITIES.find(key => key.id === keyId).fifths;
  const candidates = [];
  for (let oct = octave - 1; oct <= octave + 1; oct++) STEPS.forEach((step, index) => {
    const alter = value - oct * 12 - SEMITONES[index];
    if (oct < 0 || oct > 8 || Math.abs(alter) > 2) return;
    const signature = workshopKeyAlter(keyId, step);
    const cost = alter === signature ? 0 : 4 + Math.abs(alter) + (fifths < 0 ? Math.max(0, alter) : Math.max(0, -alter));
    candidates.push({ pitch:{step, alter, octave:oct}, cost });
  });
  candidates.sort((a, b) => a.cost - b.cost); return candidates[0].pitch;
}
function makeBars(duration, meters) {
  const bars = []; let start = 0, meter = atPoint(meters, 0, "4/4"), cursor = 0;
  while (start < duration || !bars.length) {
    while (cursor < meters.length && meters[cursor].tick === start) { meter = meters[cursor++].value; }
    const length = workshopTimeTicks(workshopMeterUnits(meter)), end = start + length;
    if (cursor < meters.length && meters[cursor].tick < end) fail("unsupported-midi-score");
    bars.push({ start, end, meter }); start = end;
    if (bars.length > WORKSHOP_MAX_SCORE_MEASURES) fail("unsupported-midi-score");
  }
  return bars;
}
function locateBar(bars, tick) {
  let low = 0, high = bars.length;
  while (low < high) { const middle = (low + high) >>> 1; if (bars[middle].end <= tick) low = middle + 1; else high = middle; }
  return Math.min(low, bars.length - 1);
}

export function importWorkshopMidi(data, options = {}) {
  const warnings = ["notation-inferred"], parsed = parseMidi(data, warnings);
  function quantize(value) {
    const exact = value * 2 * WORKSHOP_TICKS_PER_UNIT / parsed.division, rounded = Math.round(exact / GRID_TICKS) * GRID_TICKS;
    if (Math.abs(exact - rounded) > 0.001) warn(warnings, "quantized-timing");
    return rounded;
  }
  const notes = parsed.notes.map(note => {
    const start = quantize(note.start), requested = (note.end - note.start) * 2 * WORKSHOP_TICKS_PER_UNIT / parsed.division;
    let end = quantize(note.end);
    // Released MIDI keys commonly leave a small articulation gap. Infer one
    // conventional note value within 15%, instead of turning every gated note
    // into a pile of tiny tied fragments. Positions remain independently timed.
    const exact = DURATIONS.find(candidate => Math.abs(candidate.ticks - requested) < 0.001);
    const candidates = DURATIONS.filter(candidate => (candidate.value.dots || 0) <= 1 && Math.abs(candidate.ticks - requested) <= candidate.ticks * 0.15)
      .sort((a, b) => (Number(!!a.value.tuplet) * 2 + (a.value.dots || 0)) - (Number(!!b.value.tuplet) * 2 + (b.value.dots || 0))
        || Math.abs(a.ticks - requested) / a.ticks - Math.abs(b.ticks - requested) / b.ticks);
    const nearest = exact || candidates[0];
    if (requested > 0 && nearest) {
      end = start + nearest.ticks;
      if (Math.abs(requested - nearest.ticks) > 0.001) warn(warnings, "quantized-timing");
    }
    if (end <= start) { end = start + GRID_TICKS; warn(warnings, "quantized-timing"); }
    return Object.assign({}, note, {start, end});
  }).sort((a, b) => a.start - b.start || a.pitch - b.pitch || a.end - b.end);
  const tempos = pointMap(parsed.tempos, quantize), meters = pointMap(parsed.meters, quantize), keys = pointMap(parsed.keys, quantize);
  const duration = notes.reduce((maximum, note) => Math.max(maximum, note.end), quantize(parsed.duration));
  const bars = makeBars(duration, meters);
  const fileTitle = typeof options.filename === "string" ? options.filename.replace(/\.(?:mid|midi)$/i, "").trim() : "";
  const declaredTitle = parsed.names.find(name => name.track === 0 && name.value);
  const title = (declaredTitle ? declaredTitle.value : fileTitle || "MIDI").slice(0, 80);
  const score = createWorkshopDraft(title, bars.length).score;
  score.bpm = atPoint(tempos, 0, 120); score.meter = bars[0].meter; score.keyId = atPoint(keys, 0, "C-major");
  score.metadata = {title};
  const copyright = Array.from(new Set(parsed.rights.filter(Boolean))).join("\n").slice(0, 2048);
  if (copyright) score.metadata.copyright = copyright;
  const low = notes.some(note => note.pitch < 60), high = notes.some(note => note.pitch >= 60);
  if (low && high) score.parts.push({id:"left", clef:"bass", enabled:true, measures:bars.map(() => ({id:workshopId("bar"), events:[]}))});
  else if (low) score.parts[0].clef = "bass";
  score.parts.forEach(part => bars.forEach((bar, index) => {
    if (index && bar.meter !== bars[index - 1].meter) part.measures[index].meter = bar.meter;
  }));
  const ties = [], laneEnds = score.parts.map(() => [0, 0, 0, 0]);
  let group = [], groupStart = null;
  function writeGroup() {
    score.parts.forEach((part, partIndex) => {
      const own = group.filter(note => score.parts.length === 1 || (note.pitch < 60 ? 1 : 0) === partIndex);
      if (!own.length) return;
      const ends = laneEnds[partIndex]; let voice = ends.findIndex(end => end <= groupStart);
      if (voice < 0) { voice = ends.indexOf(Math.min(...ends)); warn(warnings, "voices-merged"); }
      ends[voice] = Math.max(ends[voice], ...own.map(note => note.end));
      own.forEach(note => {
        let position = note.start, previous = null;
        const pitch = spelledPitch(note.pitch, atPoint(keys, note.start, "C-major"));
        while (position < note.end) {
          const index = locateBar(bars, position), bar = bars[index], measure = part.measures[index];
          const length = Math.min(note.end, bar.end) - position;
          durationFragments(length).forEach(fragment => {
            const event = Object.assign({id:workshopId("note"), kind:"note", pitch:Object.assign({}, pitch), startSlot:(position - bar.start) / WORKSHOP_TICKS_PER_UNIT}, fragment.value);
            if (voice) event.voice = voice + 1;
            measure.events.push(event);
            if (measure.events.length > WORKSHOP_MAX_MEASURE_EVENTS) fail("unsupported-midi-score");
            if (previous) ties.push({fromId:previous.id, toId:event.id});
            previous = event; position += fragment.ticks;
          });
        }
      });
    });
  }
  notes.forEach(note => {
    if (groupStart !== note.start) { if (group.length) writeGroup(); group = []; groupStart = note.start; }
    group.push(note);
  });
  if (group.length) writeGroup();
  if (ties.length) score.ties = ties;
  function direction(point, type) {
    const index = locateBar(bars, point.tick), measure = score.parts[0].measures[index];
    if (!measure.directions) measure.directions = [];
    measure.directions.push({id:workshopId("direction"), startSlot:(point.tick - bars[index].start) / WORKSHOP_TICKS_PER_UNIT, type, value:point.value});
    if (measure.directions.length > 128) fail("unsupported-midi-score");
  }
  tempos.filter(point => point.tick > 0).forEach(point => direction(point, "tempo"));
  keys.filter(point => point.tick > 0).forEach(point => {
    const index = locateBar(bars, point.tick), startSlot = (point.tick - bars[index].start) / WORKSHOP_TICKS_PER_UNIT;
    // A context at the exact final endpoint affects no note and is omitted.
    if (point.tick >= duration) return;
    score.parts.forEach(part => {
      const measure = part.measures[index];
      if (startSlot === 0) measure.keyId = point.value;
      else {
        if (!measure.contextChanges) measure.contextChanges = [];
        measure.contextChanges.push({id:workshopId("context"), startSlot, keyId:point.value});
      }
    });
  });
  // The workshop piano has one sustain pedal. Combine MIDI channel pedal
  // states with OR semantics, so one channel cannot release another's sustain.
  const channelPedals = new Map(); let pedalDown = false;
  parsed.pedals.sort((a, b) => a.tick - b.tick).forEach(point => {
    channelPedals.set(point.channel, point.value === "down");
    const next = Array.from(channelPedals.values()).some(Boolean);
    if (next !== pedalDown) { direction({tick:quantize(point.tick), value:next ? "down" : "up"}, "pedal"); pedalDown = next; }
  });
  score.parts.forEach(part => part.measures.forEach(measure => measure.events.sort((a, b) => a.startSlot - b.startSlot || (a.voice || 1) - (b.voice || 1))));
  if (!isValidWorkshopScore(score)) fail("unsupported-midi-score");
  return { score, title, warnings };
}

// Optional notation cleanup. The exact import remains available; only the
// explicitly chosen copy gains conventional durations for small release gaps.
// Onsets, pitches, expression, IDs and tied fragments remain unchanged.
export function quantizeWorkshopMidiScore(score) {
  if(!isValidWorkshopScore(score))return null;
  const next=JSON.parse(JSON.stringify(score));
  const tied=new Set((next.ties||[]).reduce((all,edge)=>all.concat([edge.fromId,edge.toId]),[]));
  const simple=DURATIONS.filter(choice=>(choice.value.dots||0)<=1 && !choice.value.tuplet);
  next.parts.forEach((part,partIndex)=>part.measures.forEach((bar,barIndex)=>{
    const units=barIndex===0 && next.pickupUnits!==undefined?next.pickupUnits:workshopMeterUnits(workshopMeasureContext(next,barIndex,partIndex).meter);
    bar.events.forEach(event=>{
      // Preserve intentional dotted values and grouped notation. Changing one
      // member of a beam/tuplet could invalidate the whole score. The MIDI gate
      // case targeted here is an ungrouped, triple-dotted approximation.
      if(event.kind!=="note" || event.grace || tied.has(event.id) || (event.dots||0)<3
        || event.tuplet || event.tupletGroupId || event.beamGroupId)return;
      const duration=workshopTimeTicks(workshopEventUnits(event)),voice=workshopEventVoice(event);
      const following=bar.events.filter(other=>other!==event && workshopEventVoice(other)===voice && !other.grace && other.startSlot>event.startSlot)
        .reduce((limit,other)=>Math.min(limit,other.startSlot),units);
      const limit=workshopTimeTicks(following-event.startSlot);
      const candidates=simple.filter(choice=>choice.ticks<=limit && Math.abs(choice.ticks-duration)<=choice.ticks*0.15)
        .sort((a,b)=>Math.abs(a.ticks-duration)/a.ticks-Math.abs(b.ticks-duration)/b.ticks
          || Number(!!a.value.tuplet)-Number(!!b.value.tuplet) || (a.value.dots||0)-(b.value.dots||0));
      if(!candidates.length)return;
      delete event.dots;delete event.tuplet;
      Object.assign(event,candidates[0].value);
    });
  }));
  return isValidWorkshopScore(next)?next:null;
}

import { workshopTimeline, workshopPlaybackBarOrder, workshopMeasureEvents } from "./Workshop";
import { workshopEventVoice, WORKSHOP_TICKS_PER_UNIT } from "./WorkshopRhythm";
import { workshopExpressionVolume } from "./WorkshopExpression";
import { appVolumeToAudioLevel } from "./AppVolume";

function performedTimeline(complete, order) {
  if (!order) order = complete.measures.map(measure => measure.index);
  const sourceEvents = new Map();
  complete.events.forEach(event => {
    if (!sourceEvents.has(event.barIndex)) sourceEvents.set(event.barIndex, []);
    sourceEvents.get(event.barIndex).push(event);
  });
  const sourceBeats = new Map();
  if (complete.beats) complete.beats.forEach(beat => {
    if (!sourceBeats.has(beat.barIndex)) sourceBeats.set(beat.barIndex, []);
    sourceBeats.get(beat.barIndex).push(beat);
  });
  let cursor = 0;
  const events = [], measures = [], beats = [];
  const sourceMeasures = new Map(complete.measures.map(measure => [measure.index, measure]));
  order.forEach((index, measureIndex) => {
    const source = sourceMeasures.get(index),local=sourceEvents.get(index) || [];
    // A grace that borrows from the preceding written bar still needs room
    // when that bar is omitted or a navigation jump arrives here.
    const leading=measureIndex === 0 || order[measureIndex-1] !== index-1
      ? Math.max(0,...local.filter(event=>event.grace).map(event=>source.startMs-event.startMs)) : 0;
    const duration = source.endMs - source.startMs+leading;
    measures.push(Object.assign({}, source, { measureIndex, startMs:cursor, endMs:cursor + duration }));
    local.forEach(event => events.push(Object.assign({}, event,
      { measureIndex, startMs:cursor + leading + event.startMs - source.startMs })));
    (sourceBeats.get(index) || []).forEach(beat => beats.push(Object.assign({}, beat,
      { measureIndex, startMs:cursor + leading + beat.startMs - source.startMs })));
    cursor += duration;
  });
  events.sort((left,right)=>left.startMs-right.startMs);
  const timeline = { events, measures, durationMs:cursor };
  if (complete.beats) timeline.beats = beats;
  return timeline;
}

export function createWorkshopPlayback(score, player, options = {}) {
  const completeTimeline = workshopTimeline(score, { includeBeats:options.includeBeats === true,expandExpressions:options.expandExpressions !== false });
  const slots = new Map();
  score.parts.forEach(part => part.measures.forEach(bar => {
    workshopMeasureEvents(bar).forEach(event => slots.set(event.id, event.startSlot));
    (bar.directions || []).forEach(direction => slots.set(direction.id, direction.startSlot));
  }));
  completeTimeline.events.forEach(event => { if (slots.has(event.id)) event.startSlot = slots.get(event.id); });
  const selectedBar = options.barIndex !== undefined;
  const chosen = selectedBar && Number.isInteger(options.barIndex)
    ? completeTimeline.measures.find(measure => measure.index === options.barIndex) : null;
  const order = selectedBar ? null : workshopPlaybackBarOrder(score);
  const validSelection = selectedBar ? !!chosen : Array.isArray(order) && order.length > 0;
  let initialPedalDown = false, initialPedalHalf = false;
  if (chosen) completeTimeline.events.filter(event => event.startMs < chosen.startMs).forEach(event => {
    if (event.pedal === "down" || event.pedal === "half") { initialPedalDown = true; initialPedalHalf = event.pedal === "half"; }
    if (event.pedal === "up") initialPedalDown = false;
  });
  const timeline = performedTimeline(completeTimeline, chosen ? [chosen.index] : order);
  const expressive = score.parts.some(part => part.enabled !== false && part.measures.some(bar =>
    Object.prototype.hasOwnProperty.call(bar,"dynamic") || (bar.directions || []).some(direction=>["dynamic","wedge"].includes(direction.type)) || bar.events.some(event=>(event.articulations || []).some(mark=>["accent","strong-accent"].includes(mark)))));
  const delayMs = Math.max(0, Math.min(1000, Number(options.delayMs) || 0));
  const schedule = options.setTimeoutFn || setTimeout;
  const cancel = options.clearTimeoutFn || clearTimeout;
  const now = options.nowFn || (() => typeof performance !== "undefined" && performance.now
    ? performance.now() : Date.now());
  // Quarter ticks accommodate both detached articulations without rounding tuplets.
  const playbackTickMs = 30000 / score.bpm / WORKSHOP_TICKS_PER_UNIT / 4;
  const tickAt = time => Math.round(time / playbackTickMs);
  const endTick = tickAt(timeline.durationMs);
  let nextTimer = null, active = false, paused = false, generation = 0;
  let position = 0, originPosition = 0, startedAt = 0;
  let audioScheduling = false, audioStartedAt = 0, audioIndex = 0;
  const lookAheadMs = 300, refillMs = 50;
  const timers = new Set(), viewTimers = new Set();
  let currentBar = chosen ? chosen.index : 0, pedalDown = false, pedalHalf = false;
  const notes = new Map(), sustained = new Set(), boundaries = new Map();
  const eventKeys = new Map(), bySourceId = new Map(), continuations = new Map(), ends = new Map();
  timeline.events.forEach((event, key) => {
    eventKeys.set(event, key);
    if (event.value === null) return;
    if (!bySourceId.has(event.id)) bySourceId.set(event.id, new Map());
    bySourceId.get(event.id).set(tickAt(event.startMs), event);
  });
  timeline.events.forEach(event => {
    const sourceEnd = tickAt(event.startMs + event.durationMs);
    const candidates = bySourceId.get(event.tieToId);
    let target = candidates && candidates.get(sourceEnd);
    if (candidates && event.tieSustainAcrossGap) {
      target = Array.from(candidates.values()).find(candidate => tickAt(candidate.startMs) >= sourceEnd
        && candidate.measureIndex - event.measureIndex === candidate.barIndex - event.barIndex);
    }
    if (target && target.tieFromId === event.id && target.value === event.value && target.partIndex === event.partIndex
      && workshopEventVoice(target) === workshopEventVoice(event) && tickAt(target.startMs) > tickAt(event.startMs)) {
      continuations.set(eventKeys.get(event), target);
    }
  });
  function boundary(tick) {
    if (!boundaries.has(tick)) boundaries.set(tick, { starts: [], ends: [] });
    return boundaries.get(tick);
  }
  timeline.events.forEach(event => {
    boundary(tickAt(event.startMs)).starts.push(event);
    if (event.value === null) return;
    const target = continuations.get(eventKeys.get(event));
    const articulations = event.articulations || [];
    // Audition convention: staccatissimo sounds shorter than staccato; written timing stays intact.
    const gate = event.tieFromId || event.tieToId ? 1
      : articulations.includes("staccatissimo") ? 0.25 : articulations.includes("staccato") ? 0.5 : articulations.includes("detached-legato") ? 0.75 : 1;
    const finish = target ? target.startMs : event.startMs + event.durationMs * gate;
    ends.set(eventKeys.get(event), tickAt(finish) * playbackTickMs);
    boundary(tickAt(finish)).ends.push(event);
  });
  const measureStarts = timeline.measures.map(measure => tickAt(measure.startMs));
  measureStarts.forEach(tick => boundary(tick));
  const ticks = Array.from(boundaries.keys()).filter(tick => tick < endTick).sort((left, right) => left - right);
  // Resolve ties and pedal lifetimes before playing. Both attack and release can
  // then run on the audio clock while the main thread draws the score.
  const audioPlan = [], plannedNotes = new Map(), plannedSustain = new Set();
  let plannedPedal = initialPedalDown, plannedHalf = initialPedalHalf;
  function endPlanned(note, time) { note.endMs = Math.min(time, timeline.durationMs); plannedSustain.delete(note); }
  ticks.concat(endTick).forEach(tick => {
    const atMs = tick * playbackTickMs, group = boundaries.get(tick) || { starts:[], ends:[] };
    plannedSustain.forEach(note => { if (note.untilMs !== undefined && note.untilMs <= atMs) endPlanned(note, note.untilMs); });
    group.starts.forEach(event => {
      if (event.pedal === "down" || event.pedal === "half") { plannedPedal = true; plannedHalf = event.pedal === "half"; }
      if (event.pedal === "up") { plannedPedal = false; plannedSustain.forEach(note => endPlanned(note, atMs)); }
    });
    const continuing = new Map();
    group.ends.forEach(event => {
      const key = eventKeys.get(event), note = plannedNotes.get(key), target = continuations.get(key);
      if (note && target) continuing.set(eventKeys.get(target), note);
      else if (note && plannedPedal) {
        plannedSustain.add(note);
        if (plannedHalf) note.untilMs = atMs + 300;
      } else if (note) endPlanned(note, atMs);
      plannedNotes.delete(key);
    });
    group.starts.forEach(event => {
      if (event.value === null) return;
      const key = eventKeys.get(event), previous = continuing.get(key);
      const note = previous || { event, startMs:atMs, endMs:timeline.durationMs, segments:[] };
      note.segments.push({ event, startMs:atMs });
      if (!previous) audioPlan.push(note);
      plannedNotes.set(key, note);
    });
  });
  plannedSustain.forEach(note => endPlanned(note, note.untilMs === undefined ? timeline.durationMs : note.untilMs));
  function measureAt(positionMs) {
    if (!timeline.measures.length) return null;
    const tick = positionMs / playbackTickMs;
    let first = 0, last = timeline.measures.length - 1;
    while (first < last) {
      const middle = Math.ceil((first + last) / 2);
      if (measureStarts[middle] <= tick) first = middle;
      else last = middle - 1;
    }
    return first;
  }
  function barAt(tick) { return timeline.measures[measureAt(tick * playbackTickMs)].index; }
  function elapsedTime() {
    const clock = audioScheduling && player.getAudioTime();
    return Number.isFinite(clock) ? clock - audioStartedAt : now() - startedAt;
  }
  function getPosition() {
    return active ? Math.max(0, Math.min(timeline.durationMs, originPosition + Math.max(0, elapsedTime() - delayMs))) : position;
  }
  function getPositionState() {
    const positionMs = getPosition(), measureIndex = measureAt(positionMs);
    const measure = timeline.measures[measureIndex];
    return { positionMs, durationMs:timeline.durationMs, measureIndex, barIndex:measure ? measure.index : null, playing:active, paused };
  }
  function reportPosition() {
    if (options.onPosition) { const state = getPositionState(); options.onPosition(state.positionMs, state.barIndex, state); }
  }
  function stopSample(sample) {
    if (!sample) return;
    if (typeof player.stop === "function") { player.stop(sample); return; }
    if (typeof sample.pause === "function") sample.pause();
    try { sample.currentTime = 0; } catch (error) {
      // A sample may not expose a writable position before it has loaded.
    }
  }
  function releasePedal() { sustained.forEach(note => stopSample(note.sample)); sustained.clear(); }
  function activeNoteIds() {
    return Array.from(new Set(Array.from(notes.values()).map(note => note.event.id)));
  }
  function reportNotes(ids = activeNoteIds(), barIndex = currentBar) {
    if (options.onActiveNotes) options.onActiveNotes(ids, barIndex);
  }
  function stopSources() {
    notes.forEach(note => stopSample(note.sample)); notes.clear();
    releasePedal(); pedalDown = false; pedalHalf = false;
    player.stopAll();
  }
  function trackedTimer(callback, delay, collection = timers) {
    const id = schedule(() => { collection.delete(id); callback(); }, Math.max(0, delay));
    collection.add(id); return id;
  }
  function clearPlayback() {
    active = false; generation++;
    timers.forEach(cancel); timers.clear(); viewTimers.forEach(cancel); viewTimers.clear();
    if (nextTimer !== null) cancel(nextTimer);
    nextTimer = null; stopSources();
  }
  function afterDelay(callback, run) {
    if (!active || generation !== run) return;
    if (delayMs === 0) { callback(); return; }
    trackedTimer(() => {
      if (active && generation === run) callback();
    }, delayMs, viewTimers);
  }
  function finish(run) {
    stopSources();
    // End the UI after the last release has crossed the output buffer.
    afterDelay(() => stop(true), run);
  }
  function stop(finished = false) {
    const hadPlayback = active || paused;
    position = finished ? timeline.durationMs : getPosition();
    clearPlayback(); paused = false;
    const measure = timeline.measures[measureAt(position)]; currentBar = measure ? measure.index : null;
    reportNotes([], currentBar); reportPosition();
    if (hadPlayback && options.onStop) options.onStop();
  }
  function at(time, callback, run) {
    if (!active || generation !== run) return;
    if (time === 0) callback();
    else trackedTimer(() => { if (active && generation === run) callback(); }, time);
  }
  function noteVolume(event) {
    return expressive ? workshopExpressionVolume(options.appVolume, event.dynamicLevel === undefined ? event.dynamic : event.dynamicLevel, event.articulations || []) : options.appVolume;
  }
  function playNote(note, positionMs) {
    const elapsed = Math.max(0, positionMs - note.startedMs) / 1000;
    const fraction = note.event.value - Math.floor(note.event.value);
    const rate = typeof player.getPlaybackRate === "function" ? player.getPlaybackRate(note.event.value) : Math.pow(2, fraction / 12);
    note.sample = player.play(note.event.value, noteVolume(note.event), { offsetSeconds:elapsed * rate });
  }
  function audioTimeAt(positionMs) { return (audioStartedAt + positionMs - originPosition) / 1000; }
  function queueAudio(run) {
    if (!active || generation !== run) return;
    const current = originPosition + Math.max(0, elapsedTime()), horizon = current + lookAheadMs;
    while (audioIndex < audioPlan.length && audioPlan[audioIndex].startMs <= horizon) {
      const note = audioPlan[audioIndex++];
      // A long device stall must not replay expired attacks in a burst.
      if (note.endMs <= current) continue;
      const onset = Math.max(current, note.startMs), rate = player.getPlaybackRate ? player.getPlaybackRate(note.event.value) : 1;
      let event = note.event;
      note.segments.forEach(segment => { if (segment.startMs <= onset) event = segment.event; });
      const sample = player.play(note.event.value, noteVolume(event), {
        offsetSeconds:Math.max(0, onset - note.startMs) / 1000 * rate, whenSeconds:audioTimeAt(onset)
      });
      if (!sample) continue;
      player.stop(sample, { whenSeconds:audioTimeAt(note.endMs) });
      if (expressive && typeof player.setVolume === "function") note.segments.forEach(segment => {
        if (segment.startMs > onset) player.setVolume(sample, noteVolume(segment.event), { whenSeconds:audioTimeAt(segment.startMs) });
      });
    }
    if (current < timeline.durationMs && audioIndex < audioPlan.length) trackedTimer(() => queueAudio(run), refillMs);
  }
  function queueHalfRelease(note, delay, run) {
    trackedTimer(() => {
      if (active && generation === run && sustained.has(note)) { sustained.delete(note); stopSample(note.sample); }
    }, delay);
  }
  function stepAt(tick, run, simulate = false) {
    const group = boundaries.get(tick); currentBar = barAt(tick);
    const atMs = tick * playbackTickMs;
    if (simulate || audioScheduling) sustained.forEach(note => { if (note.untilMs !== undefined && note.untilMs <= atMs) sustained.delete(note); });
    // The piano has one pedal, even when its notes are displayed on two staves.
    group.starts.forEach(event => {
      if (event.pedal === "down" || event.pedal === "half") {pedalDown=true;pedalHalf=event.pedal==="half";}
      if (event.pedal === "up") { pedalDown = false; releasePedal(); }
    });
    const continuingNotes = new Map();
    group.ends.forEach(event => {
      const key = eventKeys.get(event), sounding = notes.get(key), target = continuations.get(key);
      if (target && sounding) continuingNotes.set(eventKeys.get(target), sounding);
      else if (sounding && pedalDown && (simulate || audioScheduling || sounding.sample)) {
        sustained.add(sounding);
        if (pedalHalf) {
          sounding.untilMs = atMs + 300;
          if (!simulate && !audioScheduling) queueHalfRelease(sounding, 300, run);
        }
      }
      else if (sounding) stopSample(sounding.sample);
      notes.delete(key);
    });
    group.starts.forEach(event => {
      if (event.value === null) return;
      const key = eventKeys.get(event), previous = continuingNotes.get(key);
      const sounding = previous || { startedMs:atMs, sample:null };
      sounding.event = event;
      if (!simulate && !audioScheduling && !previous) playNote(sounding, atMs);
      if (!simulate && sounding.sample && previous && expressive) {
        try { sounding.sample.volume = appVolumeToAudioLevel(noteVolume(event)); } catch (error) {
          // A custom player may expose a read-only sample volume.
        }
      }
      notes.set(key, sounding);
    });
    if (simulate) return;
    const ids = activeNoteIds(), barIndex = currentBar;
    afterDelay(() => {
      group.starts.forEach(event => { if (active && generation === run && options.onStep) options.onStep(event); });
      if (active && generation === run) { reportNotes(ids, barIndex); reportPosition(); }
    }, run);
  }
  function queueLongTimeline(index, run) {
    if (!active || generation !== run) return;
    const time = (index < ticks.length ? ticks[index] : endTick) * playbackTickMs;
    nextTimer = schedule(() => {
      if (!active || generation !== run) return;
      nextTimer = null;
      if (index === ticks.length) { finish(run); return; }
      stepAt(ticks[index], run); queueLongTimeline(index + 1, run);
    }, Math.max(0, time - originPosition - elapsedTime()));
  }
  function activeAt(positionMs) {
    return Array.from(new Set(timeline.events.filter(event => event.value !== null && event.startMs <= positionMs
      && ends.get(eventKeys.get(event)) > positionMs).map(event => event.id)));
  }
  function reportHeldPosition() {
    currentBar = timeline.measures[measureAt(position)].index;
    reportNotes(activeAt(position), currentBar); reportPosition();
  }
  function restoreAt(positionMs, run) {
    let index = 0;
    pedalDown = initialPedalDown; pedalHalf = initialPedalHalf;
    while (index < ticks.length && ticks[index] * playbackTickMs <= positionMs + 1e-7) {
      stepAt(ticks[index++], run, true);
    }
    if (!audioScheduling) sustained.forEach(note => {
      if (note.untilMs !== undefined && note.untilMs <= positionMs) sustained.delete(note);
      else {
        playNote(note, positionMs);
        if (note.untilMs !== undefined) queueHalfRelease(note, note.untilMs - positionMs, run);
      }
    });
    if (!audioScheduling) notes.forEach(note => playNote(note, positionMs));
    const ids = activeNoteIds(), barIndex = timeline.measures[measureAt(positionMs)].index;
    afterDelay(() => { reportNotes(ids, barIndex); reportPosition(); }, run);
    return index;
  }
  function begin(positionMs, restore) {
    if (!validSelection) return false;
    clearPlayback(); active = true; paused = false;
    position = originPosition = positionMs; startedAt = now();
    const audioTime = typeof player.getAudioTime === "function" ? player.getAudioTime() : null;
    audioScheduling = Number.isFinite(audioTime); audioStartedAt = audioScheduling ? audioTime : 0;
    currentBar = timeline.measures[measureAt(positionMs)].index;
    pedalDown = initialPedalDown; pedalHalf = initialPedalHalf;
    const run = generation;
    if (audioScheduling) { audioIndex = 0; queueAudio(run); }
    let index = restore ? restoreAt(positionMs, run) : 0;
    if (!restore && ticks[0] === 0) { stepAt(0, run); index = 1; }
    if (audioScheduling || ticks.length > 128) queueLongTimeline(index, run);
    else {
      ticks.slice(index).forEach(tick => at(tick * playbackTickMs - positionMs, () => stepAt(tick, run), run));
      at(endTick * playbackTickMs - positionMs, () => finish(run), run);
    }
    return true;
  }
  function pause() {
    if (!active) return false;
    position = getPosition(); clearPlayback(); paused = true; reportHeldPosition();
    if (options.onPause) options.onPause(position);
    return true;
  }
  function seek(positionMs) {
    if (!validSelection || !Number.isFinite(positionMs)) return false;
    const wasPlaying = active;
    positionMs = Math.max(0, Math.min(timeline.durationMs, positionMs));
    clearPlayback(); position = positionMs; paused = true; reportHeldPosition();
    if (wasPlaying && position < timeline.durationMs) return begin(position, true);
    if (wasPlaying && position === timeline.durationMs) { paused = false; if (options.onStop) options.onStop(); }
    return true;
  }
  return {
    start() { return begin(0, false); },
    stop, pause, seek,
    resume() { return paused ? begin(position >= timeline.durationMs ? 0 : position, position > 0 && position < timeline.durationMs) : false; },
    getPosition, getPositionState,
    getDuration() { return timeline.durationMs; },
    getTimeline() { return timeline; },
    isPlaying() { return active; },
    isPaused() { return paused; }
  };
}

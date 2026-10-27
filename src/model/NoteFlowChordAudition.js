export const NOTE_FLOW_CHORD_AUDITION_STEP_MS = 900;

function rhythmEvents(score) {
  if (!score || !Array.isArray(score.measures)) return [];
  const events = score.measures.reduce((all, measure) => all.concat(measure.events || []), []);
  if (!events.length || events.some((event, index) => !event
    || !["note", "rest"].includes(event.kind)
    || !Number.isFinite(event.startMs) || !Number.isFinite(event.endMs)
    || event.startMs < 0 || event.endMs <= event.startMs
    || index > 0 && event.startMs < events[index - 1].endMs
    || event.kind === "note" && (!event.chord || !Array.isArray(event.chord.values)
      || !event.chord.values.length))) return [];
  return events;
}

export function createNoteFlowChordAudition(plan, options = {}) {
  const timed = options.rhythmScore !== undefined;
  const events = timed ? rhythmEvents(options.rhythmScore) : plan && Array.isArray(plan.blocks)
    ? plan.blocks.reduce((all, block) => all.concat(block.chords || []), [])
    : [];
  const total = timed ? events.filter(event => event.kind === "note").length : events.length;
  const player = options.player;
  const delayMs = Math.max(0, Math.min(1000, Number(options.delayMs) || 0));
  const schedule = options.setTimeoutFn || setTimeout;
  const cancel = options.clearTimeoutFn || clearTimeout;
  const now = options.nowFn || (() => typeof performance !== "undefined" && performance.now
    ? performance.now() : Date.now());
  const stepMs = Number.isFinite(options.stepMs) && options.stepMs > 0
    ? options.stepMs
    : NOTE_FLOW_CHORD_AUDITION_STEP_MS;
  let timer = null;
  const viewTimers = new Set();
  let active = false;
  let nextIndex = 0;
  let chordIndex = 0;
  let startedAt = 0;
  let runId = 0;

  function stop() {
    if (timer !== null) cancel(timer);
    timer = null;
    viewTimers.forEach(cancel);
    viewTimers.clear();
    active = false;
    nextIndex = 0;
    chordIndex = 0;
    runId += 1;
    if (player) player.stopAll();
    if (typeof options.onStop === "function") options.onStop();
  }

  function report(callback) {
    if (delayMs === 0) { callback(); return; }
    const expectedRun = runId;
    const id = schedule(() => {
      viewTimers.delete(id);
      if (active && expectedRun === runId) callback();
    }, delayMs);
    viewTimers.add(id);
  }

  function scheduleNext(delay) {
    const expectedRun = runId;
    timer = schedule(() => {
      if (expectedRun !== runId) return;
      timer = null;
      playNext();
    }, delay);
  }

  function playNext() {
    if (!active) return;
    const expectedRun = runId;
    const elapsed = timed ? now() - startedAt : 0;
    // A suspended tab can resume after several note ends. Do not replay those
    // expired attacks; continue at the current absolute position in the score.
    while (timed && nextIndex < events.length && events[nextIndex].endMs <= elapsed) {
      if (events[nextIndex].kind === "note") chordIndex += 1;
      nextIndex += 1;
    }
    if (nextIndex >= events.length) {
      if (delayMs > 0 && player) player.stopAll();
      report(stop);
      return;
    }
    if (player) player.stopAll();
    const event = events[nextIndex];
    if (timed && event.startMs > elapsed) {
      if (typeof options.onRest === "function") report(options.onRest);
      if (active && expectedRun === runId) scheduleNext(Math.max(0, event.startMs - (now() - startedAt)));
      return;
    }
    const chord = timed ? event.chord : event;
    if (!timed || event.kind === "note") {
      const values = Array.from(new Set(
        Array.isArray(chord.bassValues) && Array.isArray(chord.trebleValues)
          ? chord.values
          : chord.bassValue == null ? chord.values : [chord.bassValue].concat(chord.values)
      ));
      values.forEach(value => player.play(value, options.appVolume));
      chordIndex += 1;
      const displayedIndex = chordIndex;
      if (typeof options.onStep === "function") report(() => options.onStep(chord, displayedIndex, total));
    } else if (typeof options.onRest === "function") {
      report(options.onRest);
    }
    if (!active || expectedRun !== runId) return;
    nextIndex += 1;
    scheduleNext(timed ? Math.max(0, event.endMs - (now() - startedAt)) : stepMs);
  }

  return {
    start() {
      if (!player || events.length === 0 || total === 0) return false;
      stop();
      active = true;
      startedAt = timed ? now() : 0;
      playNext();
      return true;
    },
    stop,
    isPlaying() { return active; }
  };
}

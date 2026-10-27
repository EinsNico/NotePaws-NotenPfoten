// Listen to a generated melody without creating a practice session or saved round.
export function createNoteFlowPreviewAudition(timeline, options = {}) {
  const player = options.player;
  const schedule = options.setTimeoutFn || setTimeout;
  const cancel = options.clearTimeoutFn || clearTimeout;
  const delayMs = Math.max(0, Math.min(1000, Number(options.delayMs) || 0));
  const events = timeline.events.filter(event => event.kind === "note");
  let timers = [];
  let active = false;
  let generation = 0;
  const samples = new Map();
  function stopSample(sample) {
    if (!sample) return;
    if (typeof player.stop === "function") { player.stop(sample); return; }
    if (typeof sample.pause === "function") sample.pause();
    try { sample.currentTime = 0; } catch (error) { /* A loading sample may be read-only. */ }
  }
  function report(indices = Array.from(samples.keys())) {
    if (options.onActiveNotes) options.onActiveNotes(indices);
  }
  function afterDelay(callback, run) {
    if (delayMs === 0) callback();
    else timers.push(schedule(() => { if (active && generation === run) callback(); }, delayMs));
  }
  function stop() {
    active = false;
    generation += 1;
    timers.forEach(cancel);
    timers = [];
    samples.forEach(stopSample);
    samples.clear();
    if (player) player.stopAll();
    report();
    if (options.onStop) options.onStop();
  }
  return {
    start() {
      stop();
      if (!player || !events.length) return false;
      active = true;
      const run = generation;
      const boundaries = new Map();
      function boundary(time) {
        if (!boundaries.has(time)) boundaries.set(time, { starts: [], ends: [] });
        return boundaries.get(time);
      }
      events.forEach((event, index) => {
        const entry = { event, id: index };
        boundary(event.startMs).starts.push(entry);
        boundary(event.endMs).ends.push(entry);
      });
      Array.from(boundaries.keys()).sort((a, b) => a - b).forEach(time => {
        const callback = () => {
          if (!active || generation !== run) return;
          const group = boundaries.get(time);
          group.ends.forEach(entry => {
            stopSample(samples.get(entry.id));
            samples.delete(entry.id);
          });
          group.starts.forEach(entry => samples.set(entry.id,
            player.play(entry.event.note.value, options.appVolume)));
          const indices = Array.from(samples.keys());
          afterDelay(() => report(indices), run);
        };
        if (time === 0) callback();
        else timers.push(schedule(callback, time));
      });
      timers.push(schedule(() => {
        if (!active || generation !== run) return;
        // Stop the source on score time; keep the view alive until the buffered
        // output reaches the listener, including the last note's release.
        samples.forEach(stopSample);
        samples.clear();
        if (player) player.stopAll();
        afterDelay(stop, run);
      }, timeline.durationMs));
      return true;
    },
    stop,
    isPlaying() { return active; }
  };
}

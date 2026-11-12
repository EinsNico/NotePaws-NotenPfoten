import AudioSync from "./AudioSynchronization";
import Options from "./Options";
import { createWorkshopPracticeMetronome } from "./WorkshopPracticeMetronome";

export function createNoteFlowMetronome(bpm, meter, options) {
  const millisecondsPerTick = 60000 / (bpm * meter.pulseTicks);
  return createWorkshopPracticeMetronome({
    beats: meter.pulseStarts.map(tick => ({
      startMs: tick * millisecondsPerTick,
      accent: tick === 0
    })),
    repeatEveryMs: meter.durationTicks * millisecondsPerTick
  }, options);
}

export function startNoteFlowMetronome({ bpm, meter, positionMs, startedAt, audioReady }) {
  const getContext = () => AudioSync.getContext();
  const metronome = createNoteFlowMetronome(bpm, meter, {
    getContext,
    getVolume: () => Options.metronomeVolume
  });
  const start = () => {
    const context = getContext();
    if (!context || context.state !== "running") return;
    metronome.start(positionMs, {
      audibleAtSeconds: context.currentTime - (performance.now() - startedAt) / 1000,
      delayMs: AudioSync.getDelayMs()
    });
  };
  const context = getContext();
  if (context && context.state === "running") start();
  else if (audioReady) audioReady.then(ready => { if (ready) start(); });
  return metronome;
}

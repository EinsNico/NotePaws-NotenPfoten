import AudioSync from "./AudioSynchronization";

// Meter/estimate notifications do not interrupt a round. Only a new timing or
// output revision needs a fresh playback snapshot.
export function watchAudioTimingChanges(onChange) {
  let revision = AudioSync.getState().revision;
  return AudioSync.subscribe(state => {
    if (state.revision === revision) return;
    revision = state.revision;
    onChange();
  });
}

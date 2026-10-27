import Options from "./Options";

// Every WebAudio envelope feeds a shared final gate. Changing the master switch
// therefore also silences notes/clicks that were already scheduled or are held.
// HTMLAudio fallbacks use muted, so their per-note volume changes cannot reopen it.
export function createAppSoundController(getEnabled) {
  const outputs = new Map();
  const media = new Set();
  const enabled = () => getEnabled() === true;

  function updateOutput(context, output) {
    output.gain.value = enabled() ? 1 : 0;
  }
  function destination(context) {
    if (!context || !context.destination) return null;
    if (typeof context.createGain !== "function") return context.destination;
    let output = outputs.get(context);
    if (!output) {
      output = context.createGain();
      updateOutput(context, output);
      output.connect(context.destination);
      outputs.set(context, output);
    } else updateOutput(context, output);
    return output;
  }
  function trackMedia(element) {
    if (!element) return () => {};
    element.muted = !enabled();
    media.add(element);
    return () => media.delete(element);
  }
  function refresh() {
    outputs.forEach((output, context) => {
      if (context.state === "closed") {
        try { output.disconnect(); } catch (error) { /* Context is already closed. */ }
        outputs.delete(context);
      } else updateOutput(context, output);
    });
    media.forEach(element => { element.muted = !enabled(); });
  }
  return { enabled, destination, trackMedia, refresh };
}

const appSound = createAppSoundController(() => Options.sound);
export const isAppSoundEnabled = appSound.enabled;
export const getAppAudioDestination = appSound.destination;
export const trackAppMediaElement = appSound.trackMedia;
export const refreshAppSound = appSound.refresh;

export default appSound;

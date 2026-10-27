// Short, individually triggered pulses: never queue a bar-long pattern, which
// could keep vibrating after playback stops or its audio route changes.
export function createRhythmSenseHaptics(
  getNavigator = () => typeof navigator === 'undefined' ? null : navigator,
  getEnabled = () => true
) {
  let active = false;
  return {
    available() {
      const device = getNavigator();
      return Boolean(device && typeof device.vibrate === 'function');
    },
    pulse(durationMs = 18) {
      // Read the app-wide switch for every pulse, so saved per-mode choices
      // cannot bypass it while a preview or a round is already running.
      if(!getEnabled()) {
        this.cancel();
        return false;
      }
      const device = getNavigator();
      if(!device || typeof device.vibrate !== 'function') return false;
      try {
        const accepted = device.vibrate(Math.max(2, Math.min(18, Math.floor(durationMs)))) !== false;
        active = active || accepted;
        return accepted;
      } catch(error) { return false; }
    },
    cancel() {
      if(!active) return;
      active = false;
      const device = getNavigator();
      if(device && typeof device.vibrate === 'function') {
        try { device.vibrate(0); } catch(error) { /* Unsupported or inactive device. */ }
      }
    }
  };
}

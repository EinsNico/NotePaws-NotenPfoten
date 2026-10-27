export const DEFAULT_APP_VOLUME = 100;
export const MIN_APP_VOLUME = 0;
export const MAX_APP_VOLUME = 100;

export function normalizeAppVolume(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_APP_VOLUME;
  }
  return Math.min(
    MAX_APP_VOLUME,
    Math.max(MIN_APP_VOLUME, Math.round(numericValue))
  );
}

export function appVolumeToAudioLevel(value) {
  return normalizeAppVolume(value) / MAX_APP_VOLUME;
}

export default {
  normalizeAppVolume,
  appVolumeToAudioLevel
};

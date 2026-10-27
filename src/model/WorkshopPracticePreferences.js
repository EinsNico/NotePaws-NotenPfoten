import * as Lockr from 'lockr';

export const WORKSHOP_WRONG_PITCH_MARKERS_STORAGE_KEY = 'uiWorkshopWrongPitchMarkers';
let fallback = true;
let changedThisSession = false;

export function loadWorkshopWrongPitchMarkers() {
  if (changedThisSession) return fallback;
  try {
    const stored = Lockr.get(WORKSHOP_WRONG_PITCH_MARKERS_STORAGE_KEY);
    if (stored !== undefined && stored !== null) fallback = stored !== false;
  }
  catch (error) { /* Keep the session preference when local storage is unavailable. */ }
  return fallback;
}

export function saveWorkshopWrongPitchMarkers(value) {
  fallback = value !== false;
  // Lockr can silently swallow a write failure. A choice made in this session
  // must therefore take precedence even if storage still has the old value.
  changedThisSession = true;
  try { Lockr.set(WORKSHOP_WRONG_PITCH_MARKERS_STORAGE_KEY, fallback); }
  catch (error) { /* The switch still works for this app session. */ }
  return fallback;
}

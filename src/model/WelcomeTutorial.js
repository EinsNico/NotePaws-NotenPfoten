export const WELCOME_SEEN_KEY = 'uiWelcomeTutorialSeenV1';

// Read before Options.loadOptions can create initial language preferences.
export function shouldShowWelcome(storage, search = '') {
  if (new URLSearchParams(search).get('tutorial') === '1') return true;
  try {
    if (storage.getItem(WELCOME_SEEN_KEY) !== null) return false;
    return ['options', 'adaptiveOptions', 'statistics', 'roundHistory'].every(key => storage.getItem(key) === null);
  } catch (ignored) { return false; }
}

export function rememberWelcome(storage) {
  try { storage.setItem(WELCOME_SEEN_KEY, '1'); return storage.getItem(WELCOME_SEEN_KEY) === '1'; }
  catch (ignored) { return false; }
}

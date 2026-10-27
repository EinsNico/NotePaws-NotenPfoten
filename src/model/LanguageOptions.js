export const DEFAULT_LANGUAGE = "en";
export const ENABLED_LANGUAGES = ["en", "de"];

function getBaseLanguage(language) {
  if (typeof language !== "string") {
    return null;
  }
  const value = language.trim().toLowerCase().split(/[-_]/)[0];
  return value || null;
}

function isEnabled(language) {
  return ENABLED_LANGUAGES.indexOf(language) !== -1;
}

export function normalizeEnabledLanguage(
  selectedLanguage,
  detectedLanguage = null
) {
  const selected = getBaseLanguage(selectedLanguage);
  if (isEnabled(selected)) {
    return selected;
  }
  if (selected !== null) {
    return DEFAULT_LANGUAGE;
  }

  const detected = getBaseLanguage(detectedLanguage);
  return isEnabled(detected) ? detected : DEFAULT_LANGUAGE;
}

export default {
  DEFAULT_LANGUAGE,
  ENABLED_LANGUAGES,
  normalizeEnabledLanguage
};

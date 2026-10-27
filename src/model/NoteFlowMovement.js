export const NOTE_FLOW_MOVEMENTS = Object.freeze(["calm", "mixed", "leaping", "custom"]);

const ALGORITHM_DEFAULTS = {
  melody: { jumpFrequency: 35, jumpSize: 7, repetition: 35, noteDensity: 65 },
  chord: { jumpFrequency: 30, jumpSize: 8, bassJumpFrequency: 25 }
};

const RHYTHM_DENSITIES = { calm: 35, mixed: 65, leaping: 78 };

export function normalizeNoteFlowAlgorithmSettings(value = {}, kind = "melody") {
  const defaults = ALGORITHM_DEFAULTS[kind === "chord" ? "chord" : "melody"];
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.keys(defaults).reduce((settings, key) => {
    const requested = source[key];
    const numeric = typeof requested === "number"
      || (typeof requested === "string" && requested.trim() !== "")
      ? Number(requested) : NaN;
    settings[key] = Number.isFinite(numeric)
      ? Math.max(key === "jumpSize" ? 2 : 0, Math.min(key === "jumpSize" ? 12 : 100, Math.round(numeric)))
      : defaults[key];
    return settings;
  }, {});
}

export function isValidNoteFlowAlgorithmSettings(value, kind = "melody") {
  const normalized = normalizeNoteFlowAlgorithmSettings(value, kind);
  // Earlier melody backups did not have the density slider yet.
  const expectedKeys = Object.keys(normalized).filter(key => (
    key !== "noteDensity" || (value && Object.prototype.hasOwnProperty.call(value, key))
  ));
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expectedKeys.length
    && expectedKeys.every(key => (
      Object.prototype.hasOwnProperty.call(value, key)
      && typeof value[key] === "number" && value[key] === normalized[key]
    )));
}

export function normalizeNoteFlowMovement(value) {
  return NOTE_FLOW_MOVEMENTS.indexOf(value) !== -1 ? value : "mixed";
}

export function getNoteFlowRhythmDensity(movement, algorithmSettings) {
  const resolved = normalizeNoteFlowMovement(movement);
  return resolved === "custom"
    ? normalizeNoteFlowAlgorithmSettings(algorithmSettings).noteDensity
    : RHYTHM_DENSITIES[resolved];
}

export function getNoteFlowMovementLabelKey(value) {
  return "FLOW_MOVEMENT_" + normalizeNoteFlowMovement(value).toUpperCase();
}

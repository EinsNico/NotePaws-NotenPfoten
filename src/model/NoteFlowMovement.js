export const NOTE_FLOW_MOVEMENT_PRESETS = Object.freeze(["calm", "mixed", "leaping"]);
export const NOTE_FLOW_MOVEMENTS = Object.freeze([...NOTE_FLOW_MOVEMENT_PRESETS, "custom"]);

const ALGORITHM_DEFAULTS = {
  melody: { jumpFrequency: 35, jumpSize: 7, repetition: 35, noteDensity: 65 },
  chord: { jumpFrequency: 30, jumpSize: 8, bassJumpFrequency: 25 }
};

const MELODY_MOVEMENT_PRESETS = {
  calm: { jumpFrequency: 10, jumpSize: 3, repetition: 10, noteDensity: 35 },
  mixed: { jumpFrequency: 45, jumpSize: 7, repetition: 8, noteDensity: 65 },
  leaping: { jumpFrequency: 85, jumpSize: 10, repetition: 2, noteDensity: 78 }
};

const CHORD_MOVEMENT_PRESETS = {
  calm: { jumpFrequency: 0, jumpSize: 2, bassJumpFrequency: 0 },
  mixed: { jumpFrequency: 40, jumpSize: 7, bassJumpFrequency: 40 },
  leaping: { jumpFrequency: 100, jumpSize: 10, bassJumpFrequency: 100 }
};

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

export function resolveNoteFlowMelodyAlgorithmSettings(movement, settings) {
  return normalizeNoteFlowAlgorithmSettings(
    MELODY_MOVEMENT_PRESETS[normalizeNoteFlowMovement(movement)] || settings
  );
}

export function findNoteFlowMelodyMovement(settings, { pitchOnly = false } = {}) {
  return NOTE_FLOW_MOVEMENT_PRESETS.find(movement => {
    const preset = MELODY_MOVEMENT_PRESETS[movement];
    return Object.keys(preset).every(key => (
      (pitchOnly && key === "noteDensity") || settings[key] === preset[key]
    ));
  }) || "custom";
}

export function resolveNoteFlowChordAlgorithmSettings(movement, settings) {
  return normalizeNoteFlowAlgorithmSettings(
    CHORD_MOVEMENT_PRESETS[normalizeNoteFlowMovement(movement)] || settings, "chord"
  );
}

export function findNoteFlowChordMovement(settings) {
  return NOTE_FLOW_MOVEMENT_PRESETS.find(movement => {
    const preset = CHORD_MOVEMENT_PRESETS[movement];
    return Object.keys(preset).every(key => settings[key] === preset[key]);
  }) || "custom";
}

export function getNoteFlowRhythmDensity(movement, algorithmSettings) {
  return resolveNoteFlowMelodyAlgorithmSettings(movement, algorithmSettings).noteDensity;
}

export function getNoteFlowMovementLabelKey(value) {
  return "FLOW_MOVEMENT_" + normalizeNoteFlowMovement(value).toUpperCase();
}

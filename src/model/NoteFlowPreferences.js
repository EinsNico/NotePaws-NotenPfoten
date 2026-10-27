import { applyNoteFlowMenuDependencies } from "./NoteFlowMenuConfig";
import { normalizeNoteFlowChordOptions } from "./NoteFlowChordConfig";
import { normalizeNoteFlowBpm, NOTE_FLOW_SPEED_DURATIONS_MS } from "./NoteFlowPlayback";
import { getCustomRangeLimits } from "./NoteRanges";
import { normalizeNoteFlowAlgorithmSettings, isValidNoteFlowAlgorithmSettings } from "./NoteFlowMovement";

export function normalizeNoteFlowMelodyPreferences(preferences = {}, defaults = {}) {
  const source = Object.assign({}, defaults, preferences.menuOptions || {});
  const resolved = applyNoteFlowMenuDependencies(source);
  const range = getCustomRangeLimits(source.customMinValue, source.customMaxValue,
    source.customTrebleMinValue, source.customBassMaxValue);
  const singleClef = applyNoteFlowMenuDependencies({
    handMode: "single",
    clef: preferences.lastSingleHandClef || (resolved.handMode === "single" ? resolved.clef : ["treble"])
  }).clef;
  return {
    trainingMode: "normal",
    lastSingleHandClef: singleClef.slice(),
    menuOptions: {
      gameLength: [0, 20, 60, 300].includes(Number(source.gameLength)) ? Number(source.gameLength) : 60,
      speed: Object.prototype.hasOwnProperty.call(NOTE_FLOW_SPEED_DURATIONS_MS, source.speed) ? source.speed : "normal",
      bpm: normalizeNoteFlowBpm(source.bpm) || 50,
      behavior: source.behavior === "continuous" ? "continuous" : "wait",
      rhythmMeter: resolved.rhythmMeter,
      rhythmValues: resolved.rhythmValues,
      handMode: resolved.handMode,
      secondaryNotesPerBlock: resolved.secondaryNotesPerBlock,
      tonalityMode: resolved.tonalityMode,
      selectedKey: resolved.selectedKey,
      difficulty: ["easy", "normal", "hard", "custom"].includes(source.difficulty) ? source.difficulty : "easy",
      clef: resolved.clef.slice(),
      movement: resolved.movement,
      algorithmSettings: resolved.algorithmSettings,
      customMinValue: range.min,
      customMaxValue: range.max,
      customTrebleMinValue: range.trebleMin,
      customBassMaxValue: range.bassMax,
      accidentals: resolved.accidentals,
      inputMode: ["button", "keyboard", "midi"].includes(source.inputMode) ? source.inputMode : "midi",
      sound: source.sound === true,
      vibration: typeof source.vibration === "boolean" ? source.vibration : true,
      displayNote: typeof source.displayNote === "boolean" ? source.displayNote : true
    }
  };
}

export function normalizeNoteFlowChordPreferences(preferences = {}) {
  return normalizeNoteFlowChordOptions(preferences);
}

// Reject malformed backup settings instead of silently changing them during import.
function matchesNormalized(value, normalized) {
  if (Array.isArray(normalized)) {
    return Array.isArray(value) && value.length === normalized.length
      && normalized.every((entry, index) => matchesNormalized(value[index], entry));
  }
  if (normalized && typeof normalized === "object") {
    return Boolean(value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === Object.keys(normalized).length
      && Object.keys(normalized).every(key => Object.prototype.hasOwnProperty.call(value, key)
        && matchesNormalized(value[key], normalized[key])));
  }
  return value === normalized;
}

export function isValidNoteFlowMelodyPreferences(value) {
  // Keep older backups with a selected Learning Mode importable.
  let compatible = value && value.trainingMode === "learning"
    ? Object.assign({}, value, { trainingMode: "normal" }) : value;
  if (compatible && compatible.menuOptions
    && compatible.menuOptions.movement !== "custom"
    && !Object.prototype.hasOwnProperty.call(compatible.menuOptions, "algorithmSettings")) {
    compatible = Object.assign({}, compatible, {
      menuOptions: Object.assign({}, compatible.menuOptions, {
        algorithmSettings: normalizeNoteFlowAlgorithmSettings()
      })
    });
  }
  const algorithmSettings = compatible && compatible.menuOptions && compatible.menuOptions.algorithmSettings;
  if (algorithmSettings && !Object.prototype.hasOwnProperty.call(algorithmSettings, "noteDensity")
    && isValidNoteFlowAlgorithmSettings(algorithmSettings)) {
    compatible = Object.assign({}, compatible, {
      menuOptions: Object.assign({}, compatible.menuOptions, {
        algorithmSettings: normalizeNoteFlowAlgorithmSettings(algorithmSettings)
      })
    });
  }
  return value === null || Boolean(value && typeof value === "object"
    && matchesNormalized(compatible, normalizeNoteFlowMelodyPreferences(value)));
}

export function isValidNoteFlowChordPreferences(value) {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let compatible = value.movement !== "custom"
    && !Object.prototype.hasOwnProperty.call(value, "algorithmSettings")
    ? Object.assign({}, value, { algorithmSettings: normalizeNoteFlowAlgorithmSettings({}, "chord") })
    : value;
  // Backups predating played-pitch markers omitted this flag. Only absence
  // receives the legacy default; present malformed values must fail validation.
  if (!Object.prototype.hasOwnProperty.call(value, "displayNote")) {
    compatible = Object.assign({}, compatible, { displayNote: true });
  }
  const normalized = normalizeNoteFlowChordPreferences(value);
  const handFields = ["handMode", "singleHand", "bassNotesPerChord", "trebleNotesPerChord", "ranges",
    "customMinValue", "customBassMaxValue", "customTrebleMinValue", "customMaxValue"];
  if (handFields.every(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    // Validate the entire older schema before migrating its additional bass root
    // into the new total count. Do not accept malformed or partially new settings.
    const legacyNormalized = Object.assign({}, normalized, {
      chordSize: normalized.chordSize - (value.bassNote === true ? 1 : 0)
    });
    handFields.forEach(key => { delete legacyNormalized[key]; });
    if (![3, 4].includes(value.chordSize) || !matchesNormalized(compatible, legacyNormalized)) return false;
    compatible = Object.assign({}, compatible, { chordSize: normalized.chordSize });
    handFields.forEach(key => { compatible[key] = normalized[key]; });
  }
  return matchesNormalized(compatible, normalized);
}

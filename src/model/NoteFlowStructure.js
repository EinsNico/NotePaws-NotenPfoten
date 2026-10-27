import {
  DEFAULT_CUSTOM_MIN_VALUE,
  DEFAULT_CUSTOM_MAX_VALUE,
  DEFAULT_CUSTOM_TREBLE_MIN_VALUE,
  DEFAULT_CUSTOM_BASS_MAX_VALUE,
  clampCustomValue
} from "./NoteRanges";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings } from "./NoteFlowMovement";

export const NOTE_FLOW_STRUCTURE_VERSION = 1;
export const DEFAULT_POSITIONS_PER_BLOCK = 16;
export const DEFAULT_BLOCKS_PER_CYCLE = 2;
export const MAX_POSITIONS_PER_BLOCK = 64;
export const MAX_BLOCKS_PER_CYCLE = 8;

const DEFAULT_SEED = 0x4e6f7465;
const VALID_HAND_MODES = ["single", "two"];
const VALID_DIFFICULTIES = ["easy", "normal", "hard", "custom"];
const VALID_CLEFS = ["bass", "treble"];
const VALID_TONALITY_MODES = ["circle", "random"];
const VALID_ACCIDENTALS = ["no", "onlySharp", "onlyFlat", "sharpAndFlat"];
const PHASES = ["statement", "restatement", "departure", "conclusion"];

function clampInteger(value, fallback, minimum, maximum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
}

function normalizeEnum(value, allowedValues, fallback) {
  return allowedValues.indexOf(value) !== -1 ? value : fallback;
}

function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeNoteFlowSeed(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value) >>> 0;
  }
  if (typeof value === "string" && value.length > 0) {
    return hashSeed(value);
  }
  return DEFAULT_SEED;
}

function normalizeClefs(requestedClefs, handMode) {
  if (handMode === "two") {
    return ["bass", "treble"];
  }
  const source = Array.isArray(requestedClefs) ? requestedClefs : [];
  const clefs = VALID_CLEFS.filter(clef => source.indexOf(clef) !== -1);
  return clefs.length > 0 ? clefs : ["treble"];
}

function normalizeRange(range, defaultMin, defaultMax) {
  const requested = range && typeof range === "object" ? range : {};
  const first = clampCustomValue(requested.min, defaultMin);
  const second = clampCustomValue(requested.max, defaultMax);
  return {
    min: Math.min(first, second),
    max: Math.max(first, second)
  };
}

function normalizeRanges(ranges) {
  const requested = ranges && typeof ranges === "object" ? ranges : {};
  return {
    bass: normalizeRange(
      requested.bass,
      DEFAULT_CUSTOM_MIN_VALUE,
      DEFAULT_CUSTOM_BASS_MAX_VALUE
    ),
    treble: normalizeRange(
      requested.treble,
      DEFAULT_CUSTOM_TREBLE_MIN_VALUE,
      DEFAULT_CUSTOM_MAX_VALUE
    )
  };
}

export function normalizeNoteFlowConfig(input = {}) {
  const requested = input && typeof input === "object" ? input : {};
  const positionsPerBlock = clampInteger(
    requested.positionsPerBlock,
    DEFAULT_POSITIONS_PER_BLOCK,
    1,
    MAX_POSITIONS_PER_BLOCK
  );
  const blocksPerCycle = clampInteger(
    requested.blocksPerCycle,
    DEFAULT_BLOCKS_PER_CYCLE,
    1,
    MAX_BLOCKS_PER_CYCLE
  );
  const handMode = normalizeEnum(requested.handMode, VALID_HAND_MODES, "single");
  const secondaryNotesPerBlock = handMode === "two"
    ? clampInteger(requested.secondaryNotesPerBlock, 4, 1, positionsPerBlock)
    : 0;

  return {
    positionsPerBlock,
    blocksPerCycle,
    handMode,
    secondaryNotesPerBlock,
    movement: normalizeNoteFlowMovement(requested.movement),
    algorithmSettings: normalizeNoteFlowAlgorithmSettings(requested.algorithmSettings),
    difficulty: normalizeEnum(
      requested.difficulty,
      VALID_DIFFICULTIES,
      "easy"
    ),
    clefs: normalizeClefs(requested.clefs, handMode),
    ranges: normalizeRanges(requested.ranges),
    tonalityMode: normalizeEnum(
      requested.tonalityMode,
      VALID_TONALITY_MODES,
      "random"
    ),
    selectedKey: typeof requested.selectedKey === "string"
      && requested.selectedKey.length > 0
      ? requested.selectedKey
      : "C-major",
    accidentals: normalizeEnum(
      requested.accidentals,
      VALID_ACCIDENTALS,
      "no"
    ),
    seed: normalizeNoteFlowSeed(requested.seed)
  };
}

export function createSeededNoteFlowRandom(seed) {
  let state = normalizeNoteFlowSeed(seed);
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveNoteFlowCycleSeed(seed, cycleIndex) {
  const baseSeed = normalizeNoteFlowSeed(seed);
  const normalizedIndex = clampInteger(
    cycleIndex,
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );
  return (baseSeed ^ Math.imul(normalizedIndex + 1, 0x9e3779b1)) >>> 0;
}

function getBlockRole(blockIndex, blockCount) {
  if (blockCount === 1) {
    return "complete";
  }
  if (blockIndex === 0) {
    return "question";
  }
  if (blockIndex === blockCount - 1) {
    return "answer";
  }
  return "development";
}

function getPhase(positionIndex, positionCount) {
  const phaseIndex = Math.min(
    PHASES.length - 1,
    Math.floor(positionIndex * PHASES.length / positionCount)
  );
  return {
    index: phaseIndex,
    role: PHASES[phaseIndex]
  };
}

function getStructuralRole(positionIndex, positionCount, phaseIndex) {
  if (positionIndex === 0) {
    return "entry";
  }
  if (positionIndex === positionCount - 1) {
    return "cadence";
  }
  const previousPhase = getPhase(positionIndex - 1, positionCount).index;
  return previousPhase !== phaseIndex ? "anchor" : "continuation";
}

function getProgress(index, count) {
  return count <= 1 ? 0 : index / (count - 1);
}

function createBlock(config, cycleId, blockIndex, totalPositionCount) {
  const positions = Array.from(
    { length: config.positionsPerBlock },
    (_, positionIndex) => {
      const globalIndex = blockIndex * config.positionsPerBlock + positionIndex;
      const phase = getPhase(positionIndex, config.positionsPerBlock);
      return {
        id: `${cycleId}:b${blockIndex}:p${positionIndex}`,
        blockIndex,
        positionIndex,
        globalIndex,
        blockProgress: getProgress(positionIndex, config.positionsPerBlock),
        cycleProgress: getProgress(globalIndex, totalPositionCount),
        phaseIndex: phase.index,
        phaseRole: phase.role,
        structuralRole: getStructuralRole(
          positionIndex,
          config.positionsPerBlock,
          phase.index
        ),
        harmonicFunction: null,
        motifId: null,
        primaryNote: null,
        secondaryNote: null
      };
    }
  );

  return {
    id: `${cycleId}:b${blockIndex}`,
    index: blockIndex,
    role: getBlockRole(blockIndex, config.blocksPerCycle),
    positionCount: config.positionsPerBlock,
    secondaryNoteBudget: config.secondaryNotesPerBlock,
    positions
  };
}

export function createNoteFlowCycleSkeleton(input = {}, cycleIndex = 0) {
  const config = normalizeNoteFlowConfig(input);
  const normalizedCycleIndex = clampInteger(
    cycleIndex,
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const cycleSeed = deriveNoteFlowCycleSeed(config.seed, normalizedCycleIndex);
  const cycleId = `note-flow-${cycleSeed}-${normalizedCycleIndex}`;
  const positionCount = config.positionsPerBlock * config.blocksPerCycle;
  const blocks = Array.from(
    { length: config.blocksPerCycle },
    (_, blockIndex) => createBlock(
      config,
      cycleId,
      blockIndex,
      positionCount
    )
  );

  return {
    structureVersion: NOTE_FLOW_STRUCTURE_VERSION,
    id: cycleId,
    index: normalizedCycleIndex,
    seed: cycleSeed,
    positionCount,
    config,
    tonalityPlan: {
      mode: config.tonalityMode,
      requestedKey: config.tonalityMode === "circle" ? config.selectedKey : null,
      resolvedKey: null,
      displayKeySignature: config.tonalityMode === "circle"
    },
    blocks
  };
}

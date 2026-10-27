import {
  createNoteFlowCycleSkeleton,
  createSeededNoteFlowRandom
} from "./NoteFlowStructure";
import { resolveNoteFlowTonality } from "./NoteFlowTonality";

const CHORD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6]
};

const MAJOR_QUALITIES = [
  "major", "minor", "minor", "major", "major", "minor", "diminished"
];
const MINOR_QUALITIES = [
  "minor", "diminished", "major", "minor", "minor", "major", "major"
];
const MAJOR_ROMAN_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_ROMAN_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

const HARMONIC_TEMPLATES = {
  question: [
    { id: "question-basic", degrees: [1, 1, 4, 5] },
    { id: "question-submediant", degrees: [1, 6, 2, 5] },
    { id: "question-expanded", degrees: [1, 3, 4, 2, 5] }
  ],
  development: [
    { id: "development-predominant", degrees: [1, 6, 4, 2, 5] },
    { id: "development-circle", degrees: [1, 3, 6, 2, 5] },
    { id: "development-direct", degrees: [1, 4, 2, 5] }
  ],
  answer: [
    { id: "answer-basic", degrees: [1, 4, 2, 5, 1] },
    { id: "answer-submediant", degrees: [1, 6, 4, 5, 1] },
    { id: "answer-expanded", degrees: [1, 3, 6, 2, 5, 1] }
  ],
  complete: [
    { id: "complete-basic", degrees: [1, 4, 2, 5, 1] },
    { id: "complete-submediant", degrees: [1, 6, 2, 5, 1] }
  ]
};

function getHarmonicFunction(scaleDegree) {
  if (scaleDegree === 1) {
    return "tonic";
  }
  if (scaleDegree === 3 || scaleDegree === 6) {
    return "tonic-prolongation";
  }
  if (scaleDegree === 2 || scaleDegree === 4) {
    return "predominant";
  }
  return "dominant";
}

function getTension(harmonicFunction) {
  const tensions = {
    tonic: 0.08,
    "tonic-prolongation": 0.28,
    predominant: 0.56,
    dominant: 0.88
  };
  return tensions[harmonicFunction];
}

function getSupportPriority(harmonicFunction) {
  const priorities = {
    tonic: 0.24,
    "tonic-prolongation": 0.36,
    predominant: 0.58,
    dominant: 0.82
  };
  return priorities[harmonicFunction];
}

function getCadenceType(blockRole) {
  return blockRole === "answer" || blockRole === "complete"
    ? "closed"
    : "open";
}

function getTemplate(blockRole, random) {
  const candidates = HARMONIC_TEMPLATES[blockRole]
    || HARMONIC_TEMPLATES.development;
  return candidates[Math.floor(random() * candidates.length)];
}

function selectStepsForPositionCount(degrees, positionCount, cadenceType) {
  if (positionCount >= degrees.length) {
    return degrees.slice();
  }
  if (positionCount === 1) {
    return [degrees[degrees.length - 1]];
  }
  if (cadenceType === "closed") {
    return degrees.slice(degrees.length - positionCount);
  }
  return [degrees[0]].concat(
    degrees.slice(degrees.length - (positionCount - 1))
  );
}

function expandStepsToPositions(degrees, positionCount) {
  return Array.from({ length: positionCount }, (_, positionIndex) => {
    const stepIndex = Math.min(
      degrees.length - 1,
      Math.floor(positionIndex * degrees.length / positionCount)
    );
    return {
      degree: degrees[stepIndex],
      stepIndex,
      startsStep: positionIndex === 0
        || Math.floor((positionIndex - 1) * degrees.length / positionCount)
          !== stepIndex
    };
  });
}

function createChord(tonality, scaleDegree) {
  const qualities = tonality.mode === "minor"
    ? MINOR_QUALITIES
    : MAJOR_QUALITIES;
  const romanNumerals = tonality.mode === "minor"
    ? MINOR_ROMAN_NUMERALS
    : MAJOR_ROMAN_NUMERALS;
  const quality = qualities[scaleDegree - 1];
  const rootPitchClass = tonality.scalePitchClasses[scaleDegree - 1];
  const harmonicFunction = getHarmonicFunction(scaleDegree);
  return {
    scaleDegree,
    romanNumeral: romanNumerals[scaleDegree - 1],
    quality,
    rootPitchClass,
    pitchClasses: CHORD_INTERVALS[quality].map(interval => (
      (rootPitchClass + interval) % 12
    )),
    harmonicFunction,
    tension: getTension(harmonicFunction),
    supportPriority: getSupportPriority(harmonicFunction)
  };
}

function getCadenceRole(block, positionIndex, harmonyEntries) {
  const isFinalPosition = positionIndex === block.positions.length - 1;
  if (!isFinalPosition) {
    const current = harmonyEntries[positionIndex];
    const next = harmonyEntries[positionIndex + 1];
    if (
      block.cadenceType === "closed"
      && current.degree === 5
      && next.degree === 1
    ) {
      return "cadential-dominant";
    }
    return null;
  }
  return block.cadenceType === "closed"
    ? "tonic-resolution"
    : "open-dominant";
}

function enrichBlock(block, tonality, random) {
  const cadenceType = getCadenceType(block.role);
  const template = getTemplate(block.role, random);
  const selectedDegrees = selectStepsForPositionCount(
    template.degrees,
    block.positions.length,
    cadenceType
  );
  const harmonyEntries = expandStepsToPositions(
    selectedDegrees,
    block.positions.length
  );

  block.harmonicTemplateId = template.id;
  block.cadenceType = cadenceType;
  block.harmonicDegrees = selectedDegrees;
  block.positions.forEach((position, positionIndex) => {
    const harmonyEntry = harmonyEntries[positionIndex];
    const chord = createChord(tonality, harmonyEntry.degree);
    const cadenceRole = getCadenceRole(block, positionIndex, harmonyEntries);
    position.harmonicFunction = chord.harmonicFunction;
    position.harmony = Object.assign({}, chord, {
      stepIndex: harmonyEntry.stepIndex,
      startsStep: harmonyEntry.startsStep,
      cadenceRole,
      tension: cadenceRole === "tonic-resolution" ? 0 : chord.tension,
      supportPriority: cadenceRole
        ? Math.max(chord.supportPriority, cadenceRole === "tonic-resolution" ? 1 : 0.95)
        : chord.supportPriority
    });
  });
  return block;
}

export function createNoteFlowHarmonicPlan(
  input = {},
  cycleIndex = 0,
  previousKeyId = null
) {
  const cycle = createNoteFlowCycleSkeleton(input, cycleIndex);
  const tonalityPlan = resolveNoteFlowTonality(
    cycle.config,
    cycle.index,
    previousKeyId
  );
  const random = createSeededNoteFlowRandom(tonalityPlan.cycleSeed ^ 0x4861726d);
  cycle.tonalityPlan = tonalityPlan;
  cycle.blocks.forEach(block => enrichBlock(block, tonalityPlan.key, random));
  return cycle;
}


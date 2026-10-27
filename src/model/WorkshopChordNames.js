import { workshopPitchValue } from "./Workshop";

const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const patterns = new Map();
const pitchClass = value => ((value % 12) + 12) % 12;
const sorted = values => Array.from(new Set(values)).sort((a, b) => a - b);

function register(suffix, intervals, rank = 0) {
  const key = sorted(intervals).join(",");
  const existing = patterns.get(key);
  // Different spellings of the same symbol are not separate interpretations.
  if (!existing || rank < existing.rank) patterns.set(key, { suffix, rank });
}

function symbol(prefix, number, modifiers) {
  return `${prefix}${number}${modifiers.length ? `(${modifiers.join(",")})` : ""}`;
}

// Closed pitch-class sets, not subset matches: no absent root, third or fifth
// is inferred. Octave doubling and inversion do not change a chord's quality.
register("", [0, 4, 7]);
register("m", [0, 3, 7]);
register("dim", [0, 3, 6]);
register("aug", [0, 4, 8]);
register("5", [0, 7]);
register("6", [0, 4, 7, 9]);
register("m6", [0, 3, 7, 9]);
register("6/9", [0, 2, 4, 7, 9], 10);
register("m6/9", [0, 2, 3, 7, 9], 10);
register("dim7", [0, 3, 6, 9]);
register("m7(b5)", [0, 3, 6, 10]);

[{ prefix: "", third: 4 }, { prefix: "m", third: 3 }].forEach(quality => {
  register(`${quality.prefix}add9`, [0, quality.third, 7, 2], 10);
  register(`${quality.prefix}add11`, [0, quality.third, 7, 5], 10);
  register(`${quality.prefix}(add9,add11)`, [0, quality.third, 7, 2, 5], 15);
  register(`${quality.prefix}6(add11)`, [0, quality.third, 7, 9, 5], 15);
  register(`${quality.prefix}6/9(add11)`, [0, quality.third, 7, 9, 2, 5], 15);
});

function extensionSymbol(prefix, ninth, eleventh, thirteenth, alterations) {
  const hasNinth = ninth.length > 0;
  const number = hasNinth && eleventh !== null && thirteenth !== null ? 13
    : hasNinth && eleventh === 5 ? 11 : ninth.includes(2) ? 9 : 7;
  const additions = [];
  if (eleventh === 5 && number < 11) additions.push("add11");
  if (thirteenth === 9 && number < 13) additions.push("add13");
  return symbol(prefix, number, alterations.concat(additions));
}

// A seventh is required for extensions. Where a lower extension is absent,
// add11/add13 describes the actual set instead of silently filling it in.
[
  { prefix: "", third: 4, seventh: 10 },
  { prefix: "maj", third: 4, seventh: 11 },
  { prefix: "m", third: 3, seventh: 10 },
  { prefix: "mMaj", third: 3, seventh: 11 }
].forEach(quality => {
  [7, 6, 8].forEach(fifth => {
    const fifthAlteration = fifth === 6 ? "b5" : fifth === 8 ? "#5" : null;
    const ninths = quality.prefix === "" ? [[], [2], [1], [3], [1, 3]] : [[], [2], [1]];
    ninths.forEach(ninth => {
      [null, 5, 6].forEach(eleventh => {
        [null, 9, 8].forEach(thirteenth => {
          // A retained perfect fifth distinguishes #11/b13 from altered fifths.
          if (eleventh === 6 && fifth !== 7 || thirteenth === 8 && fifth !== 7) return;
          const alterations = [];
          if (fifthAlteration) alterations.push(fifthAlteration);
          if (ninth.includes(1)) alterations.push("b9");
          if (ninth.includes(3)) alterations.push("#9");
          if (eleventh === 6) alterations.push("#11");
          if (thirteenth === 8) alterations.push("b13");
          // Avoid turning arbitrary dense clusters into elaborate chord names.
          if (alterations.length > 2) return;
          const intervals = [0, quality.third, fifth, quality.seventh].concat(ninth,
            eleventh === null ? [] : [eleventh], thirteenth === null ? [] : [thirteenth]);
          if (sorted(intervals).length > 7) return;
          const suffix = extensionSymbol(quality.prefix, ninth, eleventh, thirteenth, alterations);
          const additions = (suffix.match(/add/g) || []).length;
          const qualityRank = quality.prefix === "mMaj" && intervals.length > 4 ? 12 : 0;
          const rank = alterations.length ? 20 + alterations.length * 2 + additions * 3 + qualityRank
            : intervals.length === 4 ? 0 : 10 + additions * 3 + qualityRank;
          register(suffix, intervals, rank);
        });
      });
    });
  });
});

// Common half-diminished extensions keep their explicitly lowered fifth.
register("m9(b5)", [0, 2, 3, 6, 10], 15);
register("m11(b5)", [0, 2, 3, 5, 6, 10], 15);
register("m13(b5)", [0, 2, 3, 5, 6, 9, 10], 15);

register("sus4", [0, 5, 7]);
register("sus2", [0, 2, 7]);
register("sus4(add9)", [0, 2, 5, 7], 10);
register("6sus4", [0, 5, 7, 9], 10);
register("6sus2", [0, 2, 7, 9], 10);
register("6/9sus4", [0, 2, 5, 7, 9], 10);
[10, 11].forEach(seventh => {
  const prefix = seventh === 10 ? "" : "maj";
  const suspendedRank = seventh === 10 ? 0 : 15;
  register(`${prefix}7sus4`, [0, 5, 7, seventh], suspendedRank);
  register(`${prefix}7sus2`, [0, 2, 7, seventh], Math.max(10, suspendedRank));
  register(`${prefix}9sus4`, [0, 2, 5, 7, seventh], Math.max(10, suspendedRank));
  register(`${prefix}13sus4`, [0, 2, 5, 7, 9, seventh], Math.max(10, suspendedRank));
  register(`${prefix}7sus4(add13)`, [0, 5, 7, 9, seventh], Math.max(11, suspendedRank));
  register(`${prefix}7sus2(add13)`, [0, 2, 7, 9, seventh], Math.max(11, suspendedRank));
});
register("7sus4(b9)", [0, 1, 5, 7, 10], 22);
register("7sus4(b13)", [0, 5, 7, 8, 10], 22);
register("9sus4(b13)", [0, 2, 5, 7, 8, 10], 22);
register("13sus4(b9)", [0, 1, 5, 7, 9, 10], 22);

function noteValue(event) {
  const pitch = event.pitch;
  // This catalogue names twelve-tone chords only. Never round microtonal
  // pitches into a familiar but incorrect chord name.
  if (!pitch || !STEPS.includes(pitch.step) || ![-2, -1, 0, 1, 2].includes(pitch.alter)
    || !Number.isInteger(pitch.octave)) return null;
  return workshopPitchValue(pitch);
}

export function recognizeWorkshopChord(events) {
  if (!Array.isArray(events)) return null;
  const values = [];
  for (const event of events) {
    if (!event || event.kind !== "note") continue;
    const value = noteValue(event);
    if (value === null) return null;
    values.push(value);
  }
  const pitchClasses = sorted(values.map(pitchClass));
  if (pitchClasses.length < 2) return null;
  const bass = pitchClass(Math.min(...values));
  const candidates = [];
  pitchClasses.forEach(root => {
    const intervals = sorted(pitchClasses.map(value => pitchClass(value - root)));
    const pattern = patterns.get(intervals.join(","));
    if (pattern) candidates.push({ root, suffix: pattern.suffix, bass, intervals, rank: pattern.rank });
  });
  // Common exact interpretations take precedence over exotic alternatives;
  // root position tips similarly plausible readings toward the bass note.
  // Bass alone cannot establish harmonic function.
  candidates.sort((left, right) => (left.rank - (left.root === bass ? 10 : 0))
    - (right.rank - (right.root === bass ? 10 : 0)) || left.rank - right.rank || left.root - right.root);
  const primary = candidates[0];
  return {
    root: primary ? primary.root : bass,
    suffix: primary ? primary.suffix : "",
    bass,
    alternatives: candidates.slice(1).map(candidate => ({ root: candidate.root, suffix: candidate.suffix, bass })),
    intervals: primary ? primary.intervals : sorted(pitchClasses.map(value => pitchClass(value - bass))),
    pitchClasses,
    recognized: !!primary
  };
}

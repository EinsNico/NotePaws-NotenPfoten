export const NOTE_FLOW_METERS = Object.freeze(["3/4", "4/4", "6/8"]);

export function createEmptyNoteFlowMeterStatistics() {
  return NOTE_FLOW_METERS.reduce((summary, meter) => {
    summary[meter] = { roundCount: 0, evaluatedNoteCount: 0, correctCount: 0 };
    return summary;
  }, {});
}

export function addNoteFlowRoundToMeterStatistics(summary, result) {
  const meter = result && (result.exerciseType === "chord"
    ? result.chord && result.chord.rhythmMeter
    : result.settings && result.settings.rhythm && result.settings.rhythm.meter);
  if (result && NOTE_FLOW_METERS.includes(meter)) {
    const score = result.score || {};
    const evaluated = Number(score.evaluatedInputs)
      || Number(score.correct || 0) + Number(score.wrong || 0)
        + Number(score.missed || 0);
    summary[meter].roundCount += 1;
    summary[meter].evaluatedNoteCount += Math.max(0, evaluated);
    summary[meter].correctCount += Math.max(0, Number(score.correct) || 0);
  }
  return summary;
}

export function hasNoteFlowMeterStatistics(statistics) {
  return Boolean(statistics && statistics.rhythmByMeter
    && (statistics.scope !== "midi:note-flow-chords"
      || statistics.chordMeterVersion === 1)
    && NOTE_FLOW_METERS.every(meter => statistics.rhythmByMeter[meter]));
}

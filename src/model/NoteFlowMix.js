export const DEFAULT_NOTE_FLOW_CHORD_PERCENT = 25;

export function normalizeNoteFlowChordPercent(value) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : DEFAULT_NOTE_FLOW_CHORD_PERCENT;
}

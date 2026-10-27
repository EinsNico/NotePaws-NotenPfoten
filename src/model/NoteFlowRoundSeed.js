let roundSequence = 0;

// Keep the generators reproducible within a round, while every newly started
// round gets its own sequence even when two starts occur in the same millisecond.
export function createNoteFlowRoundSeed() {
  roundSequence += 1;
  return `round:${Date.now()}:${Math.random()}:${roundSequence}`;
}

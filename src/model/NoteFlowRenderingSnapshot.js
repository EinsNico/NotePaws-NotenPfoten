// Scores and notation are immutable between buffer changes. Keeping snapshots
// outside Vue's deep observation avoids forwarding thousands of dependencies
// through the frame/visibility computed properties on every animation frame.
const snapshots = new WeakSet();

export function createNoteFlowRenderingSnapshot(value, copies = new Map()) {
  if (!value || typeof value !== "object" || snapshots.has(value)) return value;
  if (copies.has(value)) return copies.get(value);
  const copy = Array.isArray(value) ? [] : {};
  copies.set(value, copy);
  Object.keys(value).forEach(key => {
    copy[key] = createNoteFlowRenderingSnapshot(value[key], copies);
  });
  snapshots.add(copy);
  return Object.freeze(copy);
}

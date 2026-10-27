import { resolveWorkshopMeasure, workshopMeasureUnitsLimit } from "./Workshop";
import { workshopTimeTicks } from "./WorkshopRhythm";

// Derived engraving metadata only. The source directions and their playback
// timing remain untouched, including pickup bars and inherited meter changes.
export function workshopDirectionSpans(score, partIndex, measureUnits) {
  const part = score.parts[partIndex];
  if (!part) return [];
  const limits = measureUnits || part.measures.map((bar, index) =>
    workshopMeasureUnitsLimit(resolveWorkshopMeasure(score, index, partIndex)));
  const starts = [0], indexes = new Map(part.measures.map((bar, index) => [bar.id, index]));
  limits.forEach(units => starts.push(starts[starts.length - 1] + workshopTimeTicks(units)));
  const result = part.measures.map(() => []);
  part.measures.forEach((bar, first) => (bar.directions || []).forEach(direction => {
    const last = direction.endBarId ? indexes.get(direction.endBarId) : first;
    if (!Number.isInteger(last) || last < first) return;
    const start = starts[first] + workshopTimeTicks(direction.startSlot || 0);
    const end = starts[last] + workshopTimeTicks(direction.endSlot === undefined ? limits[last] : direction.endSlot);
    const length = end - start;
    for (let index = first; index <= last; index++) {
      const startSlot = index === first ? direction.startSlot : 0;
      const endSlot = index === last ? direction.endSlot : limits[index];
      const segment = Object.assign({}, direction, { startSlot, endSlot,
        continuation:index !== first, startsHere:index === first, endsHere:index === last });
      if (length > 0 && direction.endSlot !== undefined) {
        segment.spanStartProgress = Math.max(0, Math.min(1, (starts[index] + workshopTimeTicks(startSlot || 0) - start) / length));
        segment.spanEndProgress = Math.max(0, Math.min(1, (starts[index] + workshopTimeTicks(endSlot) - start) / length));
      }
      result[index].push(segment);
    }
  }));
  return result;
}

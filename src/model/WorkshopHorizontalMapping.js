import { workshopEventUnits } from "./WorkshopRhythm";

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }

/** Snapshot the engraved time columns without retaining references to notes. */
export function createWorkshopHorizontalMapping(events, geometry, gridStep, units) {
  const step = Number.isFinite(gridStep) && gridStep > 0 ? gridStep : .5;
  const length = Number.isFinite(units) && units > 0 ? units : 8;
  const left = finite(geometry && geometry.left, 90);
  const unitWidth = geometry && Number.isFinite(geometry.unitWidth) && geometry.unitWidth > 0 ? geometry.unitWidth : 31;
  const maximumSlot = Math.max(0, length - step);
  const columns = new Map();
  (events || []).forEach(event => {
    if (!event || event.grace || !Number.isFinite(event.x) || !["note", "rest"].includes(event.kind)) return;
    // Centered measure-rest ink has no onset. Keep its exact silent segments
    // from bending insertion, context-change or stream time coordinates.
    if (event.measureRestUnits || event.restHidden) return;
    let slot = finite(event.displaySlot, event.startSlot);
    if (event.implicit) slot += workshopEventUnits(event) / 2 - step;
    if (!Number.isFinite(slot) || slot < 0 || slot > maximumSlot) return;
    if (!columns.has(slot)) columns.set(slot, []);
    columns.get(slot).push(event.x);
  });
  const anchors = [{ slot: -step, x: left, minX: left, maxX: left, headXs: [] }];
  Array.from(columns.keys()).sort((a, b) => a - b).forEach(slot => {
    const headXs = columns.get(slot).slice().sort((a, b) => a - b);
    const minX = headXs[0], maxX = headXs[headXs.length - 1];
    // Columns normally arrive monotonic from engraving. Keep the inverse
    // defined even for an overlapping imported chord or a drag preview.
    const x = Math.max(minX, anchors[anchors.length - 1].x + 1e-6);
    anchors.push({ slot, x, minX, maxX, headXs });
  });
  const last = anchors[anchors.length - 1];
  if (last.slot < maximumSlot) {
    const extra = Math.max(0, last.x - (left + (last.slot + step) * unitWidth));
    const right = Math.max(last.x + 1e-6, left + length * unitWidth + extra);
    anchors.push({ slot: maximumSlot, x: right, minX: right, maxX: right, headXs: [] });
  }
  const linear = anchors.every(anchor => Math.abs(anchor.x - (left + (anchor.slot + step) * unitWidth)) < 1e-8);
  anchors.forEach(anchor => { Object.freeze(anchor.headXs); Object.freeze(anchor); });
  return Object.freeze({ anchors: Object.freeze(anchors), left, unitWidth, linear, gridStep: step, units: length, minimumSlot: 0, maximumSlot });
}

function interpolate(anchors, value, from, to) {
  let index = 0;
  while (index < anchors.length - 2 && value > anchors[index + 1][from]) index++;
  const first = anchors[index], last = anchors[index + 1];
  return first[to] + (value - first[from]) / (last[from] - first[from]) * (last[to] - first[to]);
}

/** Grid line n is at the position of note onset n minus one grid step. */
export function workshopXAtMappedSlot(mapping, slot) {
  if (mapping.linear) return mapping.left + (slot + mapping.gridStep) * mapping.unitWidth;
  return interpolate(mapping.anchors, slot, "slot", "x");
}

/** Invert a frozen engraving map; pass snap:false for continuous drag deltas. */
export function workshopSlotAtMappedX(mapping, x, options = {}) {
  let slot = mapping.linear ? (x - mapping.left) / mapping.unitWidth - mapping.gridStep
    : interpolate(mapping.anchors, x, "x", "slot");
  if (options.snap !== false) {
    // Adjacent seconds can put heads on either side of their common stem.
    // Every head in that chord must still target its single musical onset.
    const heads = mapping.anchors.filter(anchor => anchor.headXs.length && x >= anchor.minX && x <= anchor.maxX);
    if (heads.length) {
      heads.sort((a, b) => Math.min(...a.headXs.map(head => Math.abs(head - x))) - Math.min(...b.headXs.map(head => Math.abs(head - x))));
      slot = heads[0].slot;
    } else {
      const step = Number.isFinite(options.gridStep) && options.gridStep > 0 ? options.gridStep : mapping.gridStep;
      slot = Math.round(slot / step) * step;
    }
  }
  return options.clamp === false ? slot : Math.max(mapping.minimumSlot, Math.min(mapping.maximumSlot, slot));
}

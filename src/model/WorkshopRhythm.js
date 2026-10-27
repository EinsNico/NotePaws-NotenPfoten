// Positions remain eighth-note units. The tick grid covers dotted values through
// 1024ths and common 2–9 tuplets without changing legacy saved positions.
export const WORKSHOP_SLOT_STEP = 0.5;
export const WORKSHOP_FINE_SLOT_STEP = 0.25;
export const WORKSHOP_TICKS_PER_UNIT = 2580480;
export const WORKSHOP_TRIPLET_SLOT_STEP = 1 / 12;
export const WORKSHOP_NOTE_UNITS = Object.freeze({
  maxima:64, long:32, breve:16, whole:8, half:4, quarter:2, eighth:1,
  sixteenth:0.5, thirtysecond:0.25, sixtyfourth:0.125, onetwentyeighth:0.0625,
  twofiftysixth:0.03125, fivehundredtwelfth:0.015625, onethousandtwentyfourth:0.0078125
});
export function workshopTupletRatio(event) {
  const value = event && event.tuplet;
  return value === 3 ? { actual:3, normal:2 } : value && typeof value === "object" ? value : null;
}
export function isValidWorkshopTuplet(value) {
  return value === 3 || !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => ["actual","normal"].includes(key))
    && Number.isInteger(value.actual) && value.actual >= 2 && value.actual <= 9
    && Number.isInteger(value.normal) && value.normal >= 2 && value.normal <= 9 && value.actual !== value.normal;
}
export function workshopEventUnits(event) {
  const units = event && WORKSHOP_NOTE_UNITS[event.noteValue];
  const dots = event && Number.isInteger(event.dots) ? event.dots : 0;
  const ratio = workshopTupletRatio(event);
  return units * (2 - Math.pow(0.5, dots)) * (ratio ? ratio.normal / ratio.actual : 1) * (event && event.twoNoteTremolo ? 0.5 : 1);
}
export function workshopTimeTicks(units) { return Number.isFinite(units) ? Math.round(units * WORKSHOP_TICKS_PER_UNIT) : NaN; }
export function workshopTimeOnGrid(units) {
  return Number.isFinite(units) && units >= 0 && Math.abs(units - workshopTimeTicks(units)/WORKSHOP_TICKS_PER_UNIT) < 1e-9;
}
export function workshopEventVoice(event) { return event && event.voice || 1; }
export function workshopRestDurationValues(units) {
  if (!workshopTimeOnGrid(units)) return [];
  const plain = Object.keys(WORKSHOP_NOTE_UNITS).reduce((values,noteValue) => {
    for (let dots=0; dots<=3; dots++) values.push(Object.assign({noteValue},dots ? {dots}:{}));
    return values;
  },[]);
  const all = plain.concat(plain.map(value => Object.assign({},value,{tuplet:3})));
  const ordered = all.map(value => ({value,ticks:workshopTimeTicks(workshopEventUnits(value))}))
    .sort((a,b) => b.ticks-a.ticks || (a.value.tuplet || 0)-(b.value.tuplet || 0));
  let remaining = workshopTimeTicks(units);
  const result=[];
  // At most 64 written fragments. Unrepresentable imported spans stay implicit
  // silence; timing is retained by their explicit positions.
  while (remaining > 0 && result.length < 64) {
    const choice = ordered.find(entry => entry.ticks > 0 && entry.ticks <= remaining);
    if (!choice) break;
    result.push(Object.assign({},choice.value)); remaining -= choice.ticks;
  }
  return result;
}
export function workshopRequestedDots(event) {
  return event && event.originalNoteValue ? (event.originalDots || 0) : (event && event.dots || 0);
}
export function workshopRequestedUnits(event) {
  return workshopEventUnits({noteValue:event && (event.originalNoteValue || event.noteValue),dots:workshopRequestedDots(event),tuplet:event && event.tuplet,twoNoteTremolo:event && event.twoNoteTremolo});
}
function gcd(a,b) { return b ? gcd(b,a % b) : a; }
export function workshopMeasureGridStep(measure,tool={}) {
  const events=(measure && Array.isArray(measure.events) ? measure.events : []).concat([tool]);
  const advanced=events.some(event => event && (workshopTupletRatio(event) && event.tuplet !== 3
    || WORKSHOP_NOTE_UNITS[event.noteValue] < 0.25 || (event.dots || 0) > 1));
  if (advanced) {
    let ticks=workshopTimeTicks(WORKSHOP_SLOT_STEP);
    events.forEach(event => {
      if (!event) return;
      [event.startSlot,workshopEventUnits(event)].forEach(value => {
        if (Number.isFinite(value) && value > 0 && workshopTimeOnGrid(value)) ticks=gcd(ticks,workshopTimeTicks(value));
      });
    });
    return Math.max(1,ticks)/WORKSHOP_TICKS_PER_UNIT;
  }
  if (events.some(event => event && (event.tuplet === 3 || Number.isFinite(event.startSlot) && !Number.isInteger(event.startSlot / WORKSHOP_FINE_SLOT_STEP)))) return WORKSHOP_TRIPLET_SLOT_STEP;
  return events.some(event => event && (event.noteValue === "thirtysecond"
    || Number.isFinite(event.startSlot) && !Number.isInteger(event.startSlot / WORKSHOP_SLOT_STEP)
    || Number.isFinite(workshopEventUnits(event)) && !Number.isInteger(workshopEventUnits(event)/WORKSHOP_SLOT_STEP)
    || Number.isFinite(workshopRequestedUnits(event)) && !Number.isInteger(workshopRequestedUnits(event)/WORKSHOP_SLOT_STEP))) ? WORKSHOP_FINE_SLOT_STEP : WORKSHOP_SLOT_STEP;
}

import { workshopRestBounds } from "./WorkshopRestGlyphs";
import { workshopEventVoice } from "./WorkshopRhythm";
import { workshopAccidentalInk } from "./WorkshopAccidentalGlyphs";

const SHORT_VALUES = ["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth", "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"];
const GAP = 4;

/** Keep augmentation dots clear of the complete rest, including two longas. */
export function workshopRestDotAnchor(event, notationScale = event.notationScale || 1) {
  const scale=Number.isFinite(notationScale) && notationScale > 0 ? notationScale : 1;
  const bounds=workshopRestBounds(event.restDisplayValue || event.noteValue,scale);
  return {x:event.x+Math.max(13*scale,bounds.right+4*scale),y:event.y-10*scale};
}

/** Bounds of the actual rest symbol, its augmentation dots and extra flags. */
export function workshopRestInk(event, notationScale = event.notationScale || 1) {
  const scale = Number.isFinite(notationScale) && notationScale > 0 ? notationScale : 1;
  const glyph = workshopRestBounds(event.restDisplayValue || event.noteValue,scale);
  const box = { left: event.x + glyph.left, right: event.x + glyph.right,
    top: event.y + glyph.top, bottom: event.y + glyph.bottom };
  if (event.dots) {
    const dot=workshopRestDotAnchor(event,scale);
    box.right = Math.max(box.right, dot.x + (2 + (event.dots - 1) * 7) * scale);
    box.top = Math.min(box.top, event.y - 12 * scale);
    box.bottom = Math.max(box.bottom, event.y - 8 * scale);
  }
  return box;
}

function overlap(left, right, scale = 1) {
  return left.left < right.right + GAP * scale && right.left < left.right + GAP * scale
    && left.top < right.bottom + GAP * scale && right.top < left.bottom + GAP * scale;
}

/** Reserve separate rest lanes for real polyphony without changing score data.
 * The input is the fresh derived notation, so only displayed rest y positions
 * are adjusted. Voice 1/2 stay near the staff; voice 3/4 sit farther outside.
 */
export function layoutWorkshopRestLanes(notation) {
  const scale = notation.notationScale || 1;
  const voices = new Set(notation.events.map(workshopEventVoice));
  if (voices.size < 2) return notation;
  const occupied = [];
  notation.events.filter(event => event.kind === "note").forEach(event => {
    occupied.push({ left: event.x - (event.grace ? 5 : 8) * scale, right: event.x + (event.grace ? 5 : 8) * scale, top: event.y - 6 * scale, bottom: event.y + 6 * scale });
    (event.ledgers || []).forEach(y => occupied.push({ left: event.x - 12 * scale, right: event.x + 12 * scale, top: y - scale, bottom: y + scale }));
    if (event.accidental) occupied.push(workshopAccidentalInk(event,event.accidentalX || 0,event.y || 0,.85*scale));
  });
  notation.stems.filter(stem => !["whole", "breve"].includes(stem.noteValue)).forEach(stem => {
    occupied.push({ left: stem.x - scale, right: stem.x + scale, top: Math.min(stem.y1, stem.y2) - scale, bottom: Math.max(stem.y1, stem.y2) + scale });
    const flags = SHORT_VALUES.indexOf(stem.noteValue) + 1;
    if (flags > 0 && !stem.beamed && !stem.beamGroupId) {
      const end = stem.y2 + stem.direction * (20 + (flags - 1) * 8) * scale;
      occupied.push({ left: stem.x + (stem.direction > 0 ? -1 : -9) * scale, right: stem.x + (stem.direction > 0 ? 9 : 1) * scale,
        top: Math.min(stem.y2, end) - scale, bottom: Math.max(stem.y2, end) + scale });
    }
  });
  notation.events.filter(event => event.kind === "rest" && !event.restHidden).sort((left, right) => workshopEventVoice(left) - workshopEventVoice(right)
    || left.x - right.x || String(left.id).localeCompare(String(right.id))).forEach(event => {
    const voice = workshopEventVoice(event), direction = voice % 2 ? -1 : 1;
    event.y = direction < 0 ? 96 - Math.floor((voice - 1) / 2) * 40 : 136 + Math.floor((voice - 1) / 2) * 40;
    let box = workshopRestInk(event), collision = occupied.find(other => overlap(box, other, scale));
    while (collision) {
      const distance = direction < 0 ? box.bottom - collision.top + GAP * scale : collision.bottom - box.top + GAP * scale;
      event.y += direction * Math.max(10, Math.ceil(distance / 10) * 10);
      box = workshopRestInk(event); collision = occupied.find(other => overlap(box, other, scale));
    }
    occupied.push(box);
  });
  return notation;
}

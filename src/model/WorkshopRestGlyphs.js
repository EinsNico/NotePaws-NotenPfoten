import Glyphs from "abcjs/src/write/creation/glyphs";

const SHORT_VALUES = ["eighth", "sixteenth", "thirtysecond", "sixtyfourth", "onetwentyeighth",
  "twofiftysixth", "fivehundredtwelfth", "onethousandtwentyfourth"];
const ORDINARY_GLYPHS = { whole: "rests.whole", half: "rests.half", quarter: "rests.quarter" };
const SHORT_GLYPHS = ["rests.8th", "rests.16th", "rests.32nd", "rests.64th", "rests.128th"];
const LONG_VALUES = ["breve", "long", "maxima"];
const STAFF_SPACE = 20;
const CACHE = new Map();

/** abcjs base identifier; the three long forms use vector primitives instead. */
export function workshopRestGlyph(value) {
  const index = SHORT_VALUES.indexOf(value);
  return Object.prototype.hasOwnProperty.call(ORDINARY_GLYPHS, value) ? ORDINARY_GLYPHS[value]
    : index >= 0 ? SHORT_GLYPHS[Math.min(index, 4)] : null;
}

function rectangle(left, top, width, height) {
  return [["M", left, top], ["l", width, 0], ["l", 0, height], ["l", -width, 0], ["z"]];
}

function extraFlags(value) {
  // Preserve the staff's existing 256th/512th/1024th flag geometry.
  return Array.from({ length: Math.max(0, SHORT_VALUES.indexOf(value) - 4) }, (_, index) => [
    ["M", 3 + index, -27 - index * 7], ["c", -5, -3, -8, 4, -3, 5],
    ["q", 3, 1, 6, -4], ["l", -1, 6], ["l", 1, 0], ["l", 2, -10], ["z"]
  ]).reduce((parts, flag) => parts.concat(flag), []);
}

function partsForValue(value) {
  if (LONG_VALUES.includes(value)) {
    // SMuFL restDoubleWhole occupies one space; restLonga occupies two.
    // Bravura's restMaxima is two restLonga components, 1.024 spaces apart.
    // Its tiny optical overshoot is omitted: staff-space alignment stays exact.
    const height = value === "breve" ? STAFF_SPACE : 2 * STAFF_SPACE;
    const parts = rectangle(-4, -STAFF_SPACE, STAFF_SPACE / 2, height);
    return value === "maxima" ? parts.concat(rectangle(-4 + 1.024 * STAFF_SPACE,
      -STAFF_SPACE, STAFF_SPACE / 2, height)) : parts;
  }
  const glyph = workshopRestGlyph(value);
  return glyph ? Glyphs.getPathForSymbol(-4, 0, glyph, 1.1, 1.1).concat(extraFlags(value)) : null;
}

function cubicAt(start, a, b, end, t) {
  const rest = 1 - t;
  return rest * rest * rest * start + 3 * rest * rest * t * a + 3 * rest * t * t * b + t * t * t * end;
}

function cubicExtrema(start, a, b, end) {
  const qa = -start + 3 * a - 3 * b + end, qb = 2 * (start - 2 * a + b), qc = a - start;
  if (Math.abs(qa) < 1e-12) return Math.abs(qb) < 1e-12 ? [] : [-qc / qb];
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)];
}

function quadraticAt(start, a, end, t) {
  const rest = 1 - t;
  return rest * rest * start + 2 * rest * t * a + t * t * end;
}

function pathBounds(parts) {
  const xs = [], ys = [];
  let x = 0, y = 0, startX = 0, startY = 0;
  parts.forEach(part => {
    const operation = part[0], lower = operation.toLowerCase(), relative = operation === lower;
    if (lower === "z") { x = startX; y = startY; return; }
    const points = part.slice(1).map((value, index) => value + (relative ? index % 2 ? y : x : 0));
    if (lower === "c") {
      cubicExtrema(x, points[0], points[2], points[4]).filter(t => t > 0 && t < 1)
        .forEach(t => xs.push(cubicAt(x, points[0], points[2], points[4], t)));
      cubicExtrema(y, points[1], points[3], points[5]).filter(t => t > 0 && t < 1)
        .forEach(t => ys.push(cubicAt(y, points[1], points[3], points[5], t)));
    } else if (lower === "q") {
      const tx = (x - points[0]) / (x - 2 * points[0] + points[2]);
      const ty = (y - points[1]) / (y - 2 * points[1] + points[3]);
      if (tx > 0 && tx < 1) xs.push(quadraticAt(x, points[0], points[2], tx));
      if (ty > 0 && ty < 1) ys.push(quadraticAt(y, points[1], points[3], ty));
    }
    x = points[points.length - 2]; y = points[points.length - 1];
    if (lower === "m") { startX = x; startY = y; }
    xs.push(x); ys.push(y);
  });
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function geometry(value) {
  if (!CACHE.has(value)) {
    const parts = partsForValue(value);
    if (!parts) return null;
    CACHE.set(value, { parts, bounds: pathBounds(parts) });
  }
  return CACHE.get(value);
}

function usableScale(scale) { return Number.isFinite(scale) && scale > 0; }

function pathAt(parts, x, y, scale) {
  let finite = true;
  const path = parts.map(part => {
    const operation = part[0], absolute = operation === operation.toUpperCase();
    return [operation].concat(part.slice(1).map((value, index) => {
      const coordinate = value * scale + (absolute ? index % 2 ? y : x : 0);
      if (!Number.isFinite(coordinate)) finite = false;
      return coordinate;
    })).join(" ");
  }).join(" ");
  return finite ? path : "";
}

/**
 * Filled, complete rest path. x/y are the staff event's anchor, scale=1 its
 * existing notation size. Extra short flags are already included. Dots and
 * measure-rest placement remain the caller's responsibility.
 */
export function workshopRestPath(value, x, y, scale = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !usableScale(scale)) return "";
  const shape = geometry(value);
  return shape ? pathAt(shape.parts, x, y, scale) : "";
}

/** Extra flags only, for adapters which deliberately retain a separate base. */
export function workshopRestExtraFlags(value, x, y, scale = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !usableScale(scale)) return "";
  return pathAt(extraFlags(value), x, y, scale);
}

/** Exact filled-ink bounds relative to x/y; unsupported values return null. */
export function workshopRestBounds(value, scale = 1) {
  if (!usableScale(scale)) return null;
  const shape = geometry(value);
  if (!shape) return null;
  const bounds = shape.bounds;
  const scaled = { left: bounds.left * scale, right: bounds.right * scale,
    top: bounds.top * scale, bottom: bounds.bottom * scale };
  return Object.values(scaled).every(Number.isFinite) ? scaled : null;
}

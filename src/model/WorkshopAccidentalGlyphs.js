import Glyphs from "abcjs/src/write/creation/glyphs";

const CACHE = new Map();
const NAMES = ["sharp", "flat", "nat", "dblsharp", "dblflat", "halfsharp", "halfflat", "threequartersharp", "threequarterflat"];

function glyphParts(name) {
  if (!NAMES.includes(name)) return [];
  if (name === "threequarterflat") {
    // Stein–Zimmermann: a reversed flat followed by a regular flat.
    return Glyphs.getPathForSymbol(0, 0, "accidentals.halfflat", 1, 1)
      .concat(Glyphs.getPathForSymbol(7, 0, "accidentals.flat", 1, 1));
  }
  if (name === "threequartersharp") {
    // Stein's three-quarter sharp has three uprights and two continuous bars.
    const polygons = [[1, -8, 2.1, -8, 2.1, 12, 1, 12], [4.7, -10, 5.8, -10, 5.8, 10, 4.7, 10],
      [8.4, -12, 9.5, -12, 9.5, 8, 8.4, 8], [-1, -3.5, 11.5, -8, 11.5, -5, -1, -.5], [-1, 4.5, 11.5, 0, 11.5, 3, -1, 7.5]];
    return polygons.reduce((parts, points) => parts.concat([["M", points[0], points[1]], ["L", points[2], points[3]],
      ["L", points[4], points[5]], ["L", points[6], points[7]], ["Z"]]), []);
  }
  return Glyphs.getPathForSymbol(0, 0, "accidentals." + name, 1, 1) || [];
}

function cubicAt(start, a, b, end, t) {
  const remaining = 1 - t;
  return remaining * remaining * remaining * start + 3 * remaining * remaining * t * a
    + 3 * remaining * t * t * b + t * t * t * end;
}
function cubicExtrema(start, a, b, end) {
  const qa = -start + 3 * a - 3 * b + end, qb = 2 * (start - 2 * a + b), qc = a - start;
  if (Math.abs(qa) < 1e-12) return Math.abs(qb) < 1e-12 ? [] : [-qc / qb];
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)];
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
    }
    x = points[points.length - 2]; y = points[points.length - 1];
    if (lower === "m") { startX = x; startY = y; }
    xs.push(x); ys.push(y);
  });
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
function geometry(event) {
  const name = event && event.accidental;
  if (!NAMES.includes(name)) return null;
  if (!CACHE.has(name)) {
    const parts = glyphParts(name);
    CACHE.set(name, { parts, bounds: pathBounds(parts) });
  }
  return CACHE.get(name);
}
function scaleBounds(bounds, x, y, scale) {
  return { left: x + bounds.left * scale, right: x + bounds.right * scale,
    top: y + bounds.top * scale, bottom: y + bounds.bottom * scale };
}
function enclosureGeometry(event, x, y, scale) {
  const shape = geometry(event), enclosure = event && event.accidentalDisplay && event.accidentalDisplay.enclosure;
  if (!shape || !["parentheses", "bracket"].includes(enclosure)) return null;
  const ink = scaleBounds(shape.bounds, x, y, scale);
  return { enclosure, left: ink.left - 4 * scale, right: ink.right + 4 * scale,
    top: Math.min(ink.top, y - 9 * scale) - 2 * scale, bottom: Math.max(ink.bottom, y + 9 * scale) + 2 * scale };
}

/** Filled glyph path. Both the renderer and spacing use the same geometry. */
export function workshopAccidentalPath(event, x = event.accidentalX || 0, y = event.y || 0, scale = .85) {
  const shape = geometry(event);
  if (!shape) return "";
  return shape.parts.map(part => {
    const operation = part[0], absolute = operation === operation.toUpperCase();
    return [operation].concat(part.slice(1).map((value, index) => value * scale + (absolute ? index % 2 ? y : x : 0))).join(" ");
  }).join(" ");
}

/** Draw as fill="none", stroke="currentColor", stroke-width="1". */
export function workshopAccidentalEnclosurePath(event, x = event.accidentalX || 0, y = event.y || 0, scale = .85) {
  const box = enclosureGeometry(event, x, y, scale);
  if (!box) return "";
  const { left, right, top, bottom } = box, inset = 2 * scale, middle = (top + bottom) / 2;
  if (box.enclosure === "bracket") return `M ${left + inset} ${top} L ${left} ${top} L ${left} ${bottom} L ${left + inset} ${bottom} M ${right - inset} ${top} L ${right} ${top} L ${right} ${bottom} L ${right - inset} ${bottom}`;
  return `M ${left + inset} ${top} Q ${left - inset} ${middle} ${left + inset} ${bottom} M ${right - inset} ${top} Q ${right + inset} ${middle} ${right - inset} ${bottom}`;
}

/** Ink bounds in score coordinates, including a 1px enclosure stroke. */
export function workshopAccidentalInk(event, x = event.accidentalX || 0, y = event.y || 0, scale = .85) {
  const shape = geometry(event);
  if (!shape) return null;
  const box = enclosureGeometry(event, x, y, scale);
  const bounds = box ? { left: box.left - .5, right: box.right + .5, top: box.top - .5, bottom: box.bottom + .5 }
    : scaleBounds(shape.bounds, x, y, scale);
  return Object.assign(bounds, { accidental: true });
}

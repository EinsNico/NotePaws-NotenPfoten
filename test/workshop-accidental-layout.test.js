const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core"), Glyphs = require("abcjs/src/write/creation/glyphs");
const root = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(root)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const { layoutWorkshopChords, spaceWorkshopAccidentals, spaceWorkshopAccidentalsTogether } = require("../src/model/WorkshopChordLayout");
const { layoutWorkshopBeams } = require("../src/model/WorkshopBeamLayout");
const tests = [];
function test(name, body) { tests.push([name, body]); }
function note(id, slot, x, y, accidental = null, extra = {}) {
  return Object.assign({ id, kind: "note", startSlot: slot, displaySlot: slot, x, y,
    noteValue: "eighth", dots: 0, ledgers: [], accidental, pitch: { step: "C", alter: 0, octave: 4 } }, extra);
}
function notation(events) {
  const result = layoutWorkshopChords(events);
  result.stems.forEach(stem => {
    const member = result.events.find(event => event.id === stem.eventIds[0]);
    if (member.beamGroupId) stem.beamGroupId = member.beamGroupId;
  });
  return result;
}
function overlaps(left, right) {
  return left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
}
// Measure the real rendered glyph path, independently of the layout's bounds.
function glyphBounds(note, symbol = "accidentals." + note.accidental, scale = .85, x = note.accidentalX) {
  const points = [], commands = Glyphs.getPathForSymbol(x, note.y, symbol, scale, scale);
  let current = [0, 0], start = [0, 0];
  commands.forEach(command => {
    if (command[0] === "M" || command[0] === "m") {
      current = command[0] === "M" ? command.slice(1) : [current[0] + command[1], current[1] + command[2]];
      start = current.slice(); points.push(current.slice());
    } else if (command[0] === "l") {
      current = [current[0] + command[1], current[1] + command[2]]; points.push(current.slice());
    } else if (command[0] === "c") {
      const a = current.slice(), b = [a[0] + command[1], a[1] + command[2]],
        c = [a[0] + command[3], a[1] + command[4]], d = [a[0] + command[5], a[1] + command[6]];
      for (let index = 0; index <= 50; index++) {
        const t = index / 50, u = 1 - t;
        points.push([0, 1].map(axis => u * u * u * a[axis] + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t * t * t * d[axis]));
      }
      current = d;
    } else if (command[0] === "z") current = start.slice();
    else throw new Error("Unexpected accidental glyph command: " + command[0]);
  });
  return { left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])) };
}
function headBounds(note) {
  const halfWidth = note.grace ? 4.5 : 7, halfHeight = note.grace ? 3.6 : 6;
  return { left: note.x - halfWidth, right: note.x + halfWidth, top: note.y - halfHeight, bottom: note.y + halfHeight };
}
function restBounds(event) {
  const value = { eighth: "8th", sixteenth: "16th", thirtysecond: "32nd", sixtyfourth: "64th" }[event.noteValue] || event.noteValue;
  return glyphBounds(event, "rests." + value, 1.1, event.x - 4);
}
function assertClearSigns(result) {
  const signs = result.events.filter(event => event.kind === "note" && event.accidental);
  signs.forEach((sign, index) => {
    const box = glyphBounds(sign);
    result.events.filter(event => event.kind === "note").forEach(head => {
      assert(!overlaps(box, headBounds(head)), sign.id + " overlaps head " + head.id);
      (head.ledgers || []).forEach(y => assert(!overlaps(box,
        { left: head.x - 11, right: head.x + 11, top: y - 1, bottom: y + 1 }), sign.id + " overlaps ledger " + head.id));
    });
    result.stems.filter(stem => !["whole", "breve"].includes(stem.noteValue)).forEach(stem => assert(!overlaps(box,
      { left: stem.x - 1, right: stem.x + 1, top: Math.min(stem.y1, stem.y2) - 1, bottom: Math.max(stem.y1, stem.y2) + 1 }), sign.id + " overlaps stem " + stem.id));
    result.events.filter(event => event.kind === "rest").forEach(rest => {
      assert(!overlaps(box, restBounds(rest)), sign.id + " overlaps rest " + rest.id);
    });
    signs.slice(index + 1).forEach(other => assert(!overlaps(box, glyphBounds(other)), sign.id + " overlaps sign " + other.id));
  });
}
function musicalFields(events) { return events.map(event => [event.id, event.pitch, event.startSlot, event.displaySlot, event.noteValue, event.dots, event.beamGroupId, event.voice, event.grace]); }

test("dense chromatic onsets reserve space for the signs beside preceding heads and stems", () => {
  const events = [note("e", 0, 100, 156, null, { noteValue: "whole" }), note("g", 0, 100, 136, null, { noteValue: "whole" }),
    note("b", 0, 100, 116, null, { noteValue: "whole" }), note("b2", 2, 141, 116),
    note("a#", 3, 162, 126, "sharp"), note("b#", 3.5, 176, 116, "sharp"), note("g#", 4, 183, 136, "sharp"),
    note("last", 10, 300, 116, null, { noteValue: "quarter" })];
  const original = notation(events), before = JSON.stringify(original), spaced = spaceWorkshopAccidentals(original);
  assertClearSigns(spaced);
  assert.strictEqual(JSON.stringify(original), before);
  assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
  assert.strictEqual(spaced.events.find(event => event.id === "last").x, original.events.find(event => event.id === "last").x);
  assert.strictEqual(spaced.width, 360);
  assert.deepStrictEqual(spaceWorkshopAccidentals(spaced), spaced);
});

test("all accidental glyphs keep clear of own chord heads and ledger lines", () => {
  for (const accidental of ["sharp", "flat", "nat", "dblsharp", "dblflat"]) {
    const events = [note("low", 0, 110, 176, accidental, { ledgers: [176] }),
      note("mid", 0, 110, 166, accidental), note("high", 0, 110, 156, accidental)];
    const original = notation(events), spaced = spaceWorkshopAccidentals(original);
    assertClearSigns(spaced);
    assert.strictEqual(new Set(spaced.events.map(event => event.accidentalX)).size, 3);
    assert.strictEqual(new Set(spaced.events.map(event => event.stemX)).size, 1);
    assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
    assert(spaced.events.every(event => glyphBounds(event).left >= 84));
  }
});

test("signs also avoid a neighbouring onset's standalone flag", () => {
  const original = notation([note("flag", 0, 150, 156), note("next", .5, 168, 126, "sharp")]);
  const spaced = spaceWorkshopAccidentals(original), stem = spaced.stems.find(stem => stem.id === "flag");
  assertClearSigns(spaced);
  const flag = { left: stem.x, right: stem.x + 8.55, top: stem.y2, bottom: stem.y2 + 20 };
  assert(!overlaps(glyphBounds(spaced.events.find(event => event.id === "next")), flag));
});

test("adjacent sixteenth rests leave a visible gap before a two-note natural chord", () => {
  const original = notation([
    note("earlier-a", 3, 162.333, 126, "sharp", { beamGroupId: "beam" }),
    note("earlier-g", 4, 183, 136, "sharp", { beamGroupId: "beam" }),
    { id: "rest-one", kind: "rest", noteValue: "sixteenth", startSlot: 6, displaySlot: 6, x: 224.333, y: 116 },
    { id: "rest-two", kind: "rest", noteValue: "sixteenth", startSlot: 6.5, displaySlot: 6.5, x: 234.667, y: 116 },
    note("natural-g", 7, 245, 136, "nat", { noteValue: "quarter" }),
    note("natural-a", 7, 245, 126, "nat", { noteValue: "quarter" })
  ]);
  const before = JSON.stringify(original), spaced = spaceWorkshopAccidentals(original);
  const rests = spaced.events.filter(event => event.kind === "rest").map(restBounds);
  const signs = spaced.events.filter(event => event.accidental === "nat").map(event => glyphBounds(event));
  signs.forEach(sign => rests.forEach(rest => {
    if (sign.top < rest.bottom && rest.top < sign.bottom) {
      assert(sign.left - rest.right >= 7.5, "Natural and rest need a readable gap in the narrow editor");
    }
  }));
  assert(rests[1].left - rests[0].right >= 5.5, "Neighbouring short rests must remain distinct");
  assertClearSigns(spaced);
  assert.strictEqual(JSON.stringify(original), before);
  assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
  assert.deepStrictEqual(spaceWorkshopAccidentals(spaced), spaced);
});

test("short rests remain separate even when the bar contains no accidentals", () => {
  const original = notation([
    note("plain", 0, 100, 156, null, { noteValue: "quarter" }),
    { id: "rest-one", kind: "rest", noteValue: "sixteenth", startSlot: 6, displaySlot: 6, x: 224.333, y: 116 },
    { id: "rest-two", kind: "rest", noteValue: "sixteenth", startSlot: 6.5, displaySlot: 6.5, x: 234.667, y: 116 }
  ]);
  const before = JSON.stringify(original), spaced = spaceWorkshopAccidentals(original);
  const rests = spaced.events.filter(event => event.kind === "rest").map(restBounds);
  assert(rests[1].left - rests[0].right >= 5.5, "Rest-only spacing must not depend on an accidental elsewhere");
  assert.strictEqual(spaced.events[0].x, original.events[0].x);
  assert.strictEqual(JSON.stringify(original), before);
  assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
  assert.deepStrictEqual(spaceWorkshopAccidentals(spaced), spaced);
});

test("explicit and implicit rest glyphs also reserve room beside accidentals", () => {
  const rest = { id: "rest", kind: "rest", noteValue: "quarter", startSlot: 0, displaySlot: 0, x: 150, y: 116 };
  const original = notation([rest, note("following", 2, 164, 116, "sharp")]);
  const spaced = spaceWorkshopAccidentals(original);
  const renderedRest = spaced.events.find(event => event.id === rest.id), sign = spaced.events.find(event => event.id === "following");
  assert(!overlaps(glyphBounds(sign), glyphBounds(renderedRest, "rests.quarter", 1.1, renderedRest.x - 4)));
  assertClearSigns(spaced);
  const implicit = { id: "silence", kind: "rest", noteValue: "whole", startSlot: 0, displaySlot: 0, x: 214, y: 136, implicit: true };
  const withSilence = notation([note("early", 0, 100, 116, "sharp"), implicit, note("late", 4, 229, 136, "flat")]);
  const output = spaceWorkshopAccidentals(withSilence, { gridStep: .5 }), early = output.events.find(event => event.id === "early"),
    late = output.events.find(event => event.id === "late"), silence = output.events.find(event => event.id === "silence");
  assert(early.x < 110, "A rest at the middle of a gap must not push the earlier note past that gap");
  assert(!overlaps(glyphBounds(late), glyphBounds(silence, "rests.whole", 1.1, silence.x - 4)));
  assert.deepStrictEqual(musicalFields(output.events), musicalFields(withSilence.events));
});

test("grace signs are arranged after their final pre-anchor positions", () => {
  const events = [note("grace-a", 2, 126, 126, "sharp", { grace: { slash: true } }),
    note("grace-b", 2, 141, 116, "dblflat", { grace: { slash: true } }), note("anchor", 2, 156, 116, "nat")];
  const original = { events: events.map(event => Object.assign({}, event, { stemX: event.x + 4, accidentalX: event.x - 12 })),
    stems: events.map(event => ({ id: event.id, eventIds: [event.id], noteValue: "eighth", grace: !!event.grace,
      x: event.x + 4, direction: 1, y1: event.y, y2: event.y - (event.grace ? 26 : 38) })) };
  const before = JSON.stringify(original), spaced = spaceWorkshopAccidentals(original);
  assertClearSigns(spaced);
  assert(spaced.events[0].x < spaced.events[1].x && spaced.events[1].x < spaced.events[2].x);
  assert.strictEqual(JSON.stringify(original), before);
  assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
});

test("crowded chromatic bars grow instead of clipping their last signs and notes", () => {
  const events = Array.from({ length: 24 }, (_, index) => note("dense-" + index, index * .25, 97 + index * 7.75, 116,
    index % 2 ? "nat" : "sharp", { noteValue: "thirtysecond" }));
  const original = notation(events), spaced = spaceWorkshopAccidentals(original);
  assertClearSigns(spaced);
  assert(spaced.width > 360);
  assert(spaced.events.every(event => event.x + 7 < spaced.width - 12));
  spaced.stems.slice(1).forEach((stem, index) => assert(stem.x > spaced.stems[index].x));
  assert.deepStrictEqual(musicalFields(spaced.events), musicalFields(original.events));
});

test("beams use the moved stems while grouping and source times stay intact", () => {
  const events = [note("a", 0, 100, 126, "sharp", { beamGroupId: "beam" }),
    note("b", 1, 113, 116, "flat", { beamGroupId: "beam" }), note("c", 2, 126, 136, "nat", { beamGroupId: "beam" })];
  const original = notation(events), before = JSON.stringify(original), spaced = spaceWorkshopAccidentals(original), beamed = layoutWorkshopBeams(spaced);
  assertClearSigns(spaced);
  assert.strictEqual(beamed.beams.length, 1);
  const points = beamed.beams[0].points.split(" ").map(point => point.split(",").map(Number));
  assert.strictEqual(points[0][0], spaced.stems[0].x);
  assert.strictEqual(points[1][0], spaced.stems[2].x);
  assert.deepStrictEqual(musicalFields(beamed.events), musicalFields(original.events));
  assert.strictEqual(JSON.stringify(original), before);
});

test("well-spaced bars without incidental signs retain the former engraving coordinates", () => {
  const original = notation([note("one", 0, 100, 156), note("two", 1, 150, 116)]), before = JSON.stringify(original);
  const spaced = spaceWorkshopAccidentals(original);
  assert.deepStrictEqual(spaced.events, original.events);
  assert.deepStrictEqual(spaced.stems, original.stems);
  assert.strictEqual(spaced.width, 360);
  assert.notStrictEqual(spaced.events[0], original.events[0]);
  assert.notStrictEqual(spaced.stems[0].eventIds, original.stems[0].eventIds);
  assert.strictEqual(JSON.stringify(original), before);
});

function assertSharedColumns(result) {
  result.notations.forEach(notation => notation.columns.forEach((x, slot) => {
    assert(Math.abs(x - result.columns.get(slot)) < 1e-8, "Staff onset " + slot + " is not on the shared column");
  }));
}

test("shared piano columns align dense quarter onsets with a staff without accidentals", () => {
  const upper = notation(Array.from({ length: 12 }, (_, index) => note("upper-" + index, index * 2, 97 + index * 19, 116,
    index % 2 ? "nat" : "dblflat", { noteValue: "quarter" })));
  const lower = notation(Array.from({ length: 12 }, (_, index) => note("lower-" + index, index * 2, 97 + index * 19, 126,
    null, { noteValue: "quarter" })));
  const source = [upper, lower], before = JSON.stringify(source), result = spaceWorkshopAccidentalsTogether(source);
  assertSharedColumns(result);
  result.notations.forEach(assertClearSigns);
  assert(result.width > 360);
  result.notations.forEach((notation, index) => assert.deepStrictEqual(musicalFields(notation.events), musicalFields(source[index].events)));
  assert.strictEqual(JSON.stringify(source), before);
  assert.deepStrictEqual(spaceWorkshopAccidentalsTogether(result.notations), result);
});

test("shared columns preserve whole grace phrases while the other staff pushes the anchor", () => {
  const graces = [note("grace-one", 2, 126, 126, "sharp", { grace: { slash: true } }),
    note("grace-two", 2, 141, 116, "dblflat", { grace: { slash: true } }), note("anchor", 2, 156, 116, "nat")];
  const upper = { events: graces.map(event => Object.assign({}, event, { stemX: event.x + 4, accidentalX: event.x - 12 })),
    stems: graces.map(event => ({ id: event.id, eventIds: [event.id], noteValue: "eighth", grace: !!event.grace,
      x: event.x + 4, direction: 1, y1: event.y, y2: event.y - (event.grace ? 26 : 38) })) };
  const lower = notation([note("before-anchor", 1, 185, 116, "dblflat"), note("lower-anchor", 2, 199, 116, "sharp")]);
  const first = spaceWorkshopAccidentals(upper), before = JSON.stringify([upper, lower]),
    result = spaceWorkshopAccidentalsTogether([upper, lower], [{ gridStep: .5 }, { gridStep: .5 }]);
  assertSharedColumns(result);
  result.notations.forEach(assertClearSigns);
  const moved = result.notations[0].events, anchor = moved.find(event => event.id === "anchor"), oldAnchor = first.events.find(event => event.id === "anchor");
  assert(anchor.x > oldAnchor.x);
  for (const id of ["grace-one", "grace-two"]) {
    const originalGrace = first.events.find(event => event.id === id), grace = moved.find(event => event.id === id);
    assert(Math.abs(anchor.x - grace.x - (oldAnchor.x - originalGrace.x)) < 1e-8);
  }
  assert.strictEqual(JSON.stringify([upper, lower]), before);
  assert.deepStrictEqual(musicalFields(moved), musicalFields(upper.events));
  assert.deepStrictEqual(spaceWorkshopAccidentalsTogether(result.notations), result);
  for (const raw of [upper, lower]) {
    const rendered = spaceWorkshopAccidentals(raw, { columns: result.columns, gridStep: .5 });
    rendered.columns.forEach((x, slot) => assert(Math.abs(x - result.columns.get(slot)) < 1e-8));
    assertClearSigns(rendered);
  }
});

test("shared column displacements propagate through alternating staff obstacles", () => {
  const upper = notation([note("u0", 0, 100, 116, "dblflat"), note("u1", 1, 115, 76),
    note("u2", 2, 130, 116, "sharp"), note("u3", 3, 145, 76)]);
  const lower = notation([note("l0", 0, 100, 76), note("l1", 1, 115, 116, "dblflat"),
    note("l2", 2, 130, 76), note("l3", 3, 145, 116, "sharp")]);
  const result = spaceWorkshopAccidentalsTogether([upper, lower]);
  assertSharedColumns(result);
  result.notations.forEach(assertClearSigns);
  assert.deepStrictEqual(spaceWorkshopAccidentalsTogether(result.notations), result);
  const empty = spaceWorkshopAccidentalsTogether([]);
  assert.strictEqual(empty.width, 360); assert.strictEqual(empty.columns.size, 0);
});

let passed = 0;
tests.forEach(([name, body]) => { body(); passed++; process.stdout.write("PASS " + name + "\n"); });
process.stdout.write("All " + passed + " accidental layout tests passed.\n");

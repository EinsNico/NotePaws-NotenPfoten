const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
let model, parseWorkshopMeterInput;
try {
  Module._extensions[".js"] = (mod, filename) => {
    if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
    mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false, presets: [["env", { modules: "commonjs" }]]
    }).code, filename);
  };
  model = require("../src/model/Workshop");
  ({ parseWorkshopMeterInput } = require("../src/model/WorkshopMeterInput"));
} finally {
  Module._extensions[".js"] = originalLoader;
}

function test(name, operation) {
  operation();
  process.stdout.write("✓ workshop approved meter: " + name + "\n");
}

function note(id, startSlot = 0, noteValue = "quarter", pitch = 48) {
  return { id, kind: "note", noteValue, startSlot, pitch: model.workshopPitchFromValue(pitch) };
}

function rest(id, startSlot, noteValue = "quarter") {
  const event = { id, kind: "rest", noteValue, pitch: null };
  if (startSlot !== undefined) event.startSlot = startSlot;
  return event;
}

function assertRejectedInput(value, reason) {
  assert.deepStrictEqual(parseWorkshopMeterInput(value), { meter: null, reason }, JSON.stringify(value));
  assert.strictEqual(model.isValidWorkshopMeter(value), false, JSON.stringify(value));
  assert.strictEqual(model.setWorkshopMeasureContext(model.createWorkshopDraft().score, 0, { meter: value }), null,
    "the actual empty score must reject " + JSON.stringify(value));
}

test("malformed raw input identifies format errors without normalizing it", () => {
  for (const value of [undefined, 4, {}, [], new String("4/4"), "", "4", "4/", "/4", "4//4", "4/4/4",
    "3++2/8", "+3/4", "3+/4", "3.5/4", "-3/4", " 4/4", "4/4 ", "3 + 2/8", "4/4\n", "４/４",
    "100/4", "4/128", "1+1+1+1+1+1+1+1+1/8"]) {
    assertRejectedInput(value, "format");
  }
});

test("well-formed input identifies invalid values even in an empty score", () => {
  for (const value of ["0/0", "0/4", "00/04", "4/0", "4/00", "33/4", "99/4", "3+0/8", "32+32+1/8",
    "8+8+8+8+8+8+8+9/8", "4/3", "4/6", "4/99"]) {
    assertRejectedInput(value, "value");
  }
});

test("valid additive, boundary and leading-zero input retains its exact spelling", () => {
  const inputs = model.WORKSHOP_METERS.concat([
    "3+2/8", "32+32/1", "1+1+1+1+1+1+1+1/8", "8+8+8+8+8+8+8+8/64", "01/04", "03+02/08",
    "01+01+01+01+01+01+01+01/64",
    "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "32/64"
  ]);
  inputs.forEach(value => {
    const parsed = parseWorkshopMeterInput(value);
    assert.deepStrictEqual(parsed, { meter: value, reason: null });
    const original = model.createWorkshopDraft("Empty meter boundary", 2).score;
    const before = JSON.stringify(original);
    const changed = model.setWorkshopMeasureContext(original, 0, { meter: parsed.meter });
    assert(changed, value);
    assert(model.isValidWorkshopScore(changed), value);
    assert.strictEqual(model.workshopMeasureContext(changed, 1).meter, value);
    assert.strictEqual(JSON.stringify(original), before);
  });
});

test("input acceptance agrees with the real model across numeric and group boundaries", () => {
  const inputs = new Set();
  for (let numerator = 0; numerator <= 34; numerator++) {
    for (let denominator = 0; denominator <= 65; denominator++) inputs.add(numerator + "/" + denominator);
  }
  for (let first = 0; first <= 34; first++) {
    for (let second = 0; second <= 34; second++) inputs.add(first + "+" + second + "/8");
  }
  for (let groups = 1; groups <= 9; groups++) {
    for (const numerator of ["1", "8", "9", "32", "33"]) inputs.add(Array(groups).fill(numerator).join("+") + "/64");
  }
  const emptyScore = model.createWorkshopDraft().score;
  inputs.forEach(value => {
    const parsed = parseWorkshopMeterInput(value);
    assert.strictEqual(parsed.reason === null, model.isValidWorkshopMeter(value), value);
    const changed = model.setWorkshopMeasureContext(emptyScore, 0, { meter: value });
    assert.strictEqual(!!changed, parsed.reason === null, value);
    if (changed) assert(model.isValidWorkshopScore(changed), value);
  });
  process.stdout.write("  " + inputs.size + " raw inputs checked against actual score acceptance\n");
});

test("a valid meter fits populated bars without changing their sounding notes", () => {
  const original = model.createWorkshopDraft("Filled additive meter", 2).score;
  original.parts[0].measures[0].events = [note("first", 0), note("edge", 4.5, "sixteenth")];
  original.parts[0].measures[1].events = [note("following", 1, "eighth")];
  assert(model.isValidWorkshopScore(original));
  const before = JSON.stringify(original);
  const parsed = parseWorkshopMeterInput("3+2/8");
  const changed = model.setWorkshopMeasureContext(original, 0, { meter: parsed.meter });
  assert(changed);
  assert.strictEqual(model.workshopMeasureContext(changed, 0).units, 5);
  original.parts[0].measures.forEach((bar, index) => assert.deepStrictEqual(changed.parts[0].measures[index].events, bar.events));
  assert.strictEqual(JSON.stringify(original), before);
});

test("valid input leaves sounding overflow and inheritance to the score model", () => {
  const original = model.createWorkshopDraft("Following sounding overflow", 3).score;
  original.parts[0].measures[2].events = [note("long-note", 0, "whole")];
  const before = JSON.stringify(original);
  const parsed = parseWorkshopMeterInput("3+2/8");
  assert.strictEqual(parsed.reason, null);
  assert.strictEqual(model.setWorkshopMeasureContext(original, 1, { meter: parsed.meter }), null);
  assert.strictEqual(JSON.stringify(original), before);
  original.parts[0].measures[2].meter = "4/4";
  const explicitBoundary = model.setWorkshopMeasureContext(original, 1, { meter: parsed.meter });
  assert(explicitBoundary, "an explicit later meter ends inheritance");
  assert.strictEqual(model.workshopMeasureContext(explicitBoundary, 2).meter, "4/4");
  assert.deepStrictEqual(explicitBoundary.parts[0].measures[2].events, original.parts[0].measures[2].events);
});

test("shortening keeps existing silent-tail trimming for explicit and sequential rests", () => {
  const original = model.createWorkshopDraft("Silent tail", 2).score;
  original.parts[0].measures[0].events = [note("retained-note"), rest("partial-rest", 4), rest("removed-rest", 6)];
  original.parts[0].measures[1].events = [rest("sequential-rest", undefined, "whole")];
  assert(model.isValidWorkshopScore(original));
  const before = JSON.stringify(original);
  const changed = model.setWorkshopMeasureContext(original, 0, { meter: parseWorkshopMeterInput("3+2/8").meter });
  assert(changed);
  assert(model.isValidWorkshopScore(changed));
  const explicitEvents = model.workshopMeasureEvents(changed.parts[0].measures[0]);
  assert.deepStrictEqual(changed.parts[0].measures[0].events[0], original.parts[0].measures[0].events[0]);
  const partial = explicitEvents.find(event => event.id === "partial-rest");
  assert(partial);
  assert.strictEqual(partial.startSlot + model.workshopEventUnits(partial), 5);
  assert(!explicitEvents.some(event => event.id === "removed-rest"));
  const sequentialEvents = model.workshopMeasureEvents(changed.parts[0].measures[1]);
  assert.strictEqual(sequentialEvents[0].id, "sequential-rest");
  assert(sequentialEvents.every(event => event.kind === "rest"));
  assert.strictEqual(model.workshopMeasureUnits(changed.parts[0].measures[1]), 5);
  assert.strictEqual(JSON.stringify(original), before);
});

test("shared meter still checks both differently cleffed staves including a hidden staff", () => {
  const original = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Both staves", 2).score, true);
  original.parts[0].measures[1].events = [note("right", 0, "quarter", 60)];
  original.parts[1].measures[1].events = [note("left", 0, "quarter", 24)];
  const before = JSON.stringify(original);
  const parsed = parseWorkshopMeterInput("3+2/8");
  const changed = model.setWorkshopMeasureContext(original, 1, { meter: parsed.meter }, 1);
  assert(changed);
  changed.parts.forEach((part, index) => {
    assert.strictEqual(model.workshopMeasureContext(changed, 1, index).meter, "3+2/8");
    assert.strictEqual(part.clef, original.parts[index].clef);
    assert.deepStrictEqual(part.measures[1].events, original.parts[index].measures[1].events);
  });
  assert.strictEqual(JSON.stringify(original), before);
  const hiddenOverflow = model.setWorkshopSecondStaffEnabled(original, false);
  hiddenOverflow.parts[1].measures[1].events = [note("hidden-whole", 0, "whole", 24)];
  assert(model.isValidWorkshopScore(hiddenOverflow));
  const hiddenBefore = JSON.stringify(hiddenOverflow);
  assert.strictEqual(model.setWorkshopMeasureContext(hiddenOverflow, 1, { meter: parsed.meter }, 0), null);
  assert.strictEqual(JSON.stringify(hiddenOverflow), hiddenBefore);
});

test("valid meter input preserves compatible pickups and rejects an incompatible pickup", () => {
  const empty = model.createWorkshopDraft("Pickup", 2).score;
  const parsed = parseWorkshopMeterInput("3+2/8");
  const longPickup = model.setWorkshopPickup(empty, 6);
  assert(longPickup);
  const before = JSON.stringify(longPickup);
  assert.strictEqual(parsed.reason, null);
  assert.strictEqual(model.setWorkshopMeasureContext(longPickup, 0, { meter: parsed.meter }), null);
  assert.strictEqual(JSON.stringify(longPickup), before);
  const shortPickup = model.setWorkshopPickup(empty, 2);
  const changed = model.setWorkshopMeasureContext(shortPickup, 0, { meter: parsed.meter });
  assert(changed);
  assert.strictEqual(changed.pickupUnits, 2);
  assert.strictEqual(model.workshopMeasureContext(changed, 0).units, 2);
  assert.strictEqual(model.workshopMeasureContext(changed, 1).units, 5);
});

test("the existing null inheritance command remains separate from custom string input", () => {
  assert.deepStrictEqual(parseWorkshopMeterInput(null), { meter: null, reason: "format" });
  const changed = model.setWorkshopMeasureContext(model.createWorkshopDraft("Reset meter", 2).score, 1, { meter: "3+2/8" });
  const reset = model.setWorkshopMeasureContext(changed, 1, { meter: null });
  assert(reset);
  assert.strictEqual(model.workshopMeasureContext(reset, 1).meter, "4/4");
});

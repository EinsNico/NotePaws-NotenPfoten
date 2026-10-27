const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('babel-core');
const Glyphs = require('abcjs/src/write/creation/glyphs');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (module, file) => {
  if (!file.startsWith(sourceRoot)) return originalLoader(module, file);
  module._compile(babel.transform(fs.readFileSync(file, 'utf8'), {
    babelrc:false, presets:[['env', { modules:'commonjs' }]]
  }).code, file);
};
const { workshopRestPath, workshopRestBounds, workshopRestGlyph, workshopRestExtraFlags }
  = require('../src/model/WorkshopRestGlyphs');
const { WORKSHOP_NOTE_UNITS } = require('../src/model/WorkshopRhythm');
const values = Object.keys(WORKSHOP_NOTE_UNITS);
const short = ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth', 'onetwentyeighth',
  'twofiftysixth', 'fivehundredtwelfth', 'onethousandtwentyfourth'];
let passed = 0;
function test(name, body) { body(); passed++; process.stdout.write('✓ ' + name + '\n'); }
function close(actual, expected, tolerance = 1e-8) {
  assert(Math.abs(actual - expected) <= tolerance, actual + ' differs from ' + expected);
}

// Independent SVG reader and de Casteljau sampling: it does not use the helper's
// analytic extrema implementation. All commands of each path must be consumed.
function readPath(d) {
  const tokens = d.match(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  const arity = { m:2, l:2, c:6, q:4, z:0 }, commands = [];
  let index = 0;
  while (index < tokens.length) {
    const operation = tokens[index++], count = arity[operation.toLowerCase()];
    assert.notStrictEqual(count, undefined, 'Unexpected path token: ' + operation);
    const coordinates = tokens.slice(index, index + count).map(Number);
    assert.strictEqual(coordinates.length, count);
    assert(coordinates.every(Number.isFinite), 'Non-finite coordinates');
    index += count;
    commands.push([operation].concat(coordinates));
  }
  return commands;
}
function samplePath(d) {
  const points = [];
  let current = [0, 0], start = [0, 0];
  readPath(d).forEach(command => {
    const operation = command[0], lower = operation.toLowerCase();
    if (lower === 'z') { current = start.slice(); points.push(current); return; }
    const coordinates = command.slice(1), controls = [];
    for (let index = 0; index < coordinates.length; index += 2) controls.push([
      coordinates[index] + (operation === lower ? current[0] : 0),
      coordinates[index + 1] + (operation === lower ? current[1] : 0)
    ]);
    if (lower === 'c' || lower === 'q') {
      for (let step = 0; step <= 200; step++) {
        const t = step / 200;
        let layer = [current].concat(controls).map(point => point.slice());
        while (layer.length > 1) layer = layer.slice(1).map((point, index) => [
          layer[index][0] * (1 - t) + point[0] * t,
          layer[index][1] * (1 - t) + point[1] * t
        ]);
        points.push(layer[0]);
      }
    }
    current = controls[controls.length - 1];
    if (lower === 'm') start = current.slice();
    points.push(current);
  });
  return points;
}
function pathString(parts) { return parts.map(part => part.join(' ')).join(' '); }
function oldExtraPath(value, x, y) {
  return Array.from({ length:Math.max(0, short.indexOf(value) - 4) }, (_, index) => {
    const flagY = y - 27 - index * 7, flagX = x + 3 + index;
    return 'M ' + flagX + ' ' + flagY + ' c -5 -3 -8 4 -3 5 q 3 1 6 -4 l -1 6 l 1 0 l 2 -10 z';
  }).join(' ');
}
function equivalentPaths(actual, expected) {
  const a = readPath(actual), b = readPath(expected);
  assert.strictEqual(a.length, b.length);
  a.forEach((command, index) => {
    assert.strictEqual(command[0], b[index][0]);
    command.slice(1).forEach((number, position) => close(number, b[index][position + 1]));
  });
}

test('All 14 score duration values have a finite, closed, unique rest silhouette', () => {
  assert.strictEqual(values.length, 14);
  const paths = values.map(value => {
    const d = workshopRestPath(value, 0, 0);
    assert(d, value);
    assert(!/NaN|Infinity/.test(d), value + ' has non-finite SVG');
    const commands = readPath(d);
    assert.strictEqual(commands[commands.length - 1][0].toLowerCase(), 'z', value);
    const bounds = workshopRestBounds(value);
    assert(bounds && Object.values(bounds).every(Number.isFinite), value);
    assert(bounds.right > bounds.left && bounds.bottom > bounds.top, value);
    return d;
  });
  assert.strictEqual(new Set(paths).size, 14, 'Duration choices must not alias visually');
});

test('Ordinary abcjs paths keep the staff anchor, size and original curves', () => {
  const names = { whole:'whole', half:'half', quarter:'quarter', eighth:'8th', sixteenth:'16th',
    thirtysecond:'32nd', sixtyfourth:'64th', onetwentyeighth:'128th' };
  Object.keys(names).forEach(value => {
    const name = 'rests.' + names[value];
    assert.strictEqual(workshopRestGlyph(value), name);
    equivalentPaths(workshopRestPath(value, 137, 116),
      pathString(Glyphs.getPathForSymbol(133, 116, name, 1.1, 1.1)));
  });
});

test('Breve and longa span one/two staff spaces; maxima is two separated longas', () => {
  assert.deepStrictEqual(workshopRestBounds('breve'), { left:-4, right:6, top:-20, bottom:0 });
  assert.deepStrictEqual(workshopRestBounds('long'), { left:-4, right:6, top:-20, bottom:20 });
  const maxima = readPath(workshopRestPath('maxima', 0, 0));
  assert.strictEqual(maxima.filter(part => part[0] === 'M').length, 2);
  assert.strictEqual(maxima.filter(part => part[0].toLowerCase() === 'z').length, 2);
  equivalentPaths(pathString(maxima.slice(0, 5)), workshopRestPath('long', 0, 0));
  equivalentPaths(pathString(maxima.slice(5)), workshopRestPath('long', 20.48, 0));
  close(workshopRestBounds('maxima').right, 26.48);
  assert(workshopRestBounds('whole').top > -1 && workshopRestBounds('whole').bottom > 0,
    'Whole rests must still hang below their anchor line');
  ['breve', 'long', 'maxima'].forEach(value => assert.strictEqual(workshopRestGlyph(value), null));
});

test('The 6/7/8 short flags preserve existing staff geometry and enter the complete path once', () => {
  ['twofiftysixth', 'fivehundredtwelfth', 'onethousandtwentyfourth'].forEach((value, index) => {
    const extra = workshopRestExtraFlags(value, 137, 116);
    equivalentPaths(extra, oldExtraPath(value, 137, 116));
    assert.strictEqual(readPath(extra).filter(part => part[0] === 'M').length, index + 1);
    const base = pathString(Glyphs.getPathForSymbol(133, 116, 'rests.128th', 1.1, 1.1));
    equivalentPaths(workshopRestPath(value, 137, 116), base + ' ' + extra);
  });
  values.slice().filter(value => !short.slice(5).includes(value))
    .forEach(value => assert.strictEqual(workshopRestExtraFlags(value, 0, 0), ''));
});

test('Shared bounds contain the actual ink tightly at picker and enlarged score scales', () => {
  values.forEach(value => [.25, .5, 1, 1.7, 3].forEach(scale => {
    const x = 43, y = -17, points = samplePath(workshopRestPath(value, x, y, scale));
    const b = workshopRestBounds(value, scale), xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    const sampled = { left:Math.min(...xs), right:Math.max(...xs), top:Math.min(...ys), bottom:Math.max(...ys) };
    points.forEach(point => {
      assert(point[0] >= x + b.left - 1e-8 && point[0] <= x + b.right + 1e-8, value + ' horizontal bounds');
      assert(point[1] >= y + b.top - 1e-8 && point[1] <= y + b.bottom + 1e-8, value + ' vertical bounds');
    });
    close(sampled.left, x + b.left, .002);
    close(sampled.right, x + b.right, .002);
    close(sampled.top, y + b.top, .002);
    close(sampled.bottom, y + b.bottom, .002);
  }));
});

test('Translation and scaling transform every point, including extra flags', () => {
  values.forEach(value => {
    const unit = samplePath(workshopRestPath(value, 0, 0));
    const moved = samplePath(workshopRestPath(value, -39, 71, 1.6));
    assert.strictEqual(unit.length, moved.length);
    unit.forEach((point, index) => {
      close(moved[index][0], -39 + point[0] * 1.6);
      close(moved[index][1], 71 + point[1] * 1.6);
    });
  });
});

test('Bounds are caller-owned and invalid duration/coordinate inputs do not emit broken SVG', () => {
  const original = workshopRestBounds('maxima');
  const changed = workshopRestBounds('maxima');
  changed.left = -900;
  assert.deepStrictEqual(workshopRestBounds('maxima'), original);
  ['unknown', 'toString', 'constructor', null, undefined].forEach(value => {
    assert.strictEqual(workshopRestPath(value, 0, 0), '');
    assert.strictEqual(workshopRestBounds(value), null);
    assert.strictEqual(workshopRestGlyph(value), null);
  });
  [0, -1, NaN, Infinity, Number.MAX_VALUE, '1'].forEach(scale => {
    assert.strictEqual(workshopRestPath('whole', 0, 0, scale), '');
    assert.strictEqual(workshopRestExtraFlags('twofiftysixth', 0, 0, scale), '');
    assert.strictEqual(workshopRestBounds('whole', scale), null);
  });
  [NaN, Infinity, undefined, '0'].forEach(coordinate => {
    assert.strictEqual(workshopRestPath('quarter', coordinate, 0), '');
    assert.strictEqual(workshopRestPath('quarter', 0, coordinate), '');
  });
});

process.stdout.write(passed + ' focused rest-glyph tests passed.\n');

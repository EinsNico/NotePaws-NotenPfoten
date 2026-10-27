const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
global.regeneratorRuntime = require('babel-runtime/regenerator');

const parsed = compiler.parseComponent(fs.readFileSync(path.join(__dirname, '../src/components/RhythmSenseStatistics.vue'), 'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const componentModule = { exports: {} };
new Function('module', 'exports', 'require', babel.transform(parsed.script.content, {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code)(componentModule, componentModule.exports, name => name.endsWith('RhythmSenseStatistics')
  ? { summarizeRhythmSenseStatistics: () => ({ hasResults: false }) } : {});
const definition = componentModule.exports.default;
const vm = new Vue(Object.assign({}, definition, compiler.compileToFunctions(parsed.template.content), {
  mounted: undefined,
  beforeDestroy: undefined,
  methods: Object.assign({}, definition.methods, { $t: key => key })
}));
vm.$i18n = { locale: 'de' };
vm.$el = { querySelector: () => null };
const flatten = node => node ? [node].concat((node.children || []).flatMap(flatten)) : [];
const hasClass = (node, name) => node.data && (node.data.staticClass || '').split(' ').includes(name);

(async () => {
  vm.state = 'ready';
  vm.summary = { hasResults: true, barCount: 50, accuracy: 50, durationMs: 150000, evaluated: 200, averageOffsetMs: 20, missed: 10 };
  vm.rounds = Array.from({ length: 50 }, (_, i) => ({ id: 'round-' + i, accuracy: i % 101, barCount: 1, completedAt: '2026-10-08T12:00:00Z', settings: { meter: '4/4', bpm: 80 } }));
  const tree = flatten(vm._render());
  const axis = tree.find(node => hasClass(node, 'history-axis'));
  const scroll = tree.find(node => hasClass(node, 'history-scroll'));
  assert(axis && scroll);
  assert(!flatten(scroll).includes(axis), 'percentage axis must not move inside the horizontal scroller');
  assert.deepStrictEqual(flatten(axis).filter(node => node.tag === 'text').map(node => (node.children || []).map(child => child.text || '').join('').trim()), ['0 %', '50 %', '100 %']);
  assert.strictEqual(flatten(scroll).filter(node => hasClass(node, 'history-point')).length, 50, 'fixed axis keeps all 50 interactive round points');
  assert.strictEqual(vm.plotWidth, 2030);
  console.log('✓ The percentage scale remains outside the scrollable 50-point history');

  const calls = [];
  const point = { isConnected: true, focus: options => calls.push(['point', options]) };
  const fallback = { focus: options => calls.push(['history', options]) };
  vm.$refs.historyScroll = fallback;
  vm.selectRound(vm.rounds[7], point);
  await Vue.nextTick();
  assert.strictEqual(vm.selectedRound.id, 'round-7');
  vm.closeRoundDetails();
  assert.strictEqual(vm.selectedRound, null);
  assert.deepStrictEqual(calls, [], 'focus returns after the detail DOM has been removed');
  await Vue.nextTick();
  assert.deepStrictEqual(calls, [['point', { preventScroll: true }]]);
  console.log('✓ Closing round details returns keyboard focus to the opening point without scrolling');

  point.isConnected = false;
  vm.selectRound(vm.rounds[8], point);
  await Vue.nextTick();
  vm.closeRoundDetails();
  await Vue.nextTick();
  assert.strictEqual(calls[1][0], 'history');
  vm.$refs.historyScroll = null;
  vm.closeRoundDetails();
  await Vue.nextTick();
  assert.strictEqual(calls.length, 2, 'removed history does not cause a focus exception');
  vm.$refs.historyScroll = fallback;
  vm.closeRoundDetails();
  vm._isDestroyed = true;
  await Vue.nextTick();
  assert.strictEqual(calls.length, 2, 'a destroyed view cannot steal keyboard focus');
  console.log('✓ Removed points, missing history and destroyed views use a safe focus fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });

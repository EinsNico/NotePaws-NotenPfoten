/* Pause focus only: actual melody Vue lifecycle/watchers with RAM-only collaborators. */
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
const root = path.resolve(__dirname, '..'), sourceRoot = process.env.AUDIT_SOURCE_ROOT || root;
const previous = { document: global.document, window: global.window, localStorage: global.localStorage, performance: global.performance, setInterval: global.setInterval, clearInterval: global.clearInterval, requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame, regeneratorRuntime: global.regeneratorRuntime };
global.regeneratorRuntime = require('babel-runtime/regenerator');
let now = 0, timerId = 0; const ticks = new Map(), saves = [], hashes = {};
const frames = new Map(), ram = new Map();
global.localStorage = { getItem: key => ram.has(key) ? ram.get(key) : null, setItem: (key, value) => ram.set(key, String(value)), removeItem: key => ram.delete(key) };
global.window = { addEventListener() {}, removeEventListener() {} };
global.requestAnimationFrame = callback => { const id = ++timerId; frames.set(id, callback); return id; };
global.cancelAnimationFrame = id => frames.delete(id);
global.performance = { now: () => now };
global.setInterval = callback => { const id = ++timerId; ticks.set(id, callback); return id; };
global.clearInterval = id => ticks.delete(id);
function read(relative, from = sourceRoot) {
  const text = fs.readFileSync(path.join(from, relative), 'utf8');
  if(from === sourceRoot) hashes[relative] = crypto.createHash('sha256').update(text).digest('hex');
  return text;
}
function evaluate(text, dependencies = {}) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(text, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code)(module, module.exports, name => dependencies[name] || {});
  return module.exports;
}
function load(from = sourceRoot) {
  const parsed = compiler.parseComponent(read('src/components/NoteFlowGamePreview.vue', from));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const definition = evaluate(parsed.script.content, {
    '../model/NoteFlowRoundTimer': evaluate(read('src/model/NoteFlowRoundTimer.js', from)),
    '../model/NoteFlowDisplayConstraints': evaluate(read('src/model/NoteFlowDisplayConstraints.js', from)),
    '../model/ModalFocus': evaluate(read('src/model/ModalFocus.js', from)),
    '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) },
    '../model/NoteFlowRoundResult': { createNoteFlowRoundResult: input => input },
    '../model/NoteFlowRoundStorage': { saveRound: result => { saves.push(result); return Promise.resolve({ saved: true }); } }
  }).default;
  return { definition, template: parsed.template.content };
}
function fixture() {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
    removeEventListener(type, fn) { if(listeners[type]) listeners[type].delete(fn); },
    count(type) { return (listeners[type] || new Set()).size; },
    fire(type, details) { const event = Object.assign({ preventDefault() {}, stopPropagation() {} }, details); [...(listeners[type] || [])].forEach(fn => fn(event)); }
  };
  class Element {
    constructor(tabIndex = -1) { this.tagName = 'DIV'; this.tabIndex = tabIndex; this.children = []; this.parentElement = null; this.attrs = {}; this.style = {}; this.disabled = false; }
    append(child) { this.children.push(child); child.parentElement = this; return child; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    closest(selector) { for(let e = this; e; e = e.parentElement) if((selector.includes('[inert]') && e.getAttribute('inert') !== null) || (selector.includes('[hidden]') && e.getAttribute('hidden') !== null) || (selector.includes('[aria-hidden="true"]') && e.getAttribute('aria-hidden') === 'true')) return e; return null; }
    getClientRects() { return [{}]; }
    querySelectorAll() { return this.children.flatMap(child => [child.tabIndex >= 0 && !child.disabled ? child : null, ...child.querySelectorAll()]).filter(Boolean); }
    focus() { doc.activeElement = this; doc.fire('focusin', { target: this }); }
  }
  const body = doc.body = new Element(); body.style.overflow = 'hidden';
  const app = body.append(new Element()); const notice = app.append(new Element()); notice.setAttribute('aria-hidden', 'false');
  const page = app.append(new Element()); const controls = page.append(new Element()); const opener = controls.append(new Element(0));
  const stage = page.append(new Element()); const staff = stage.append(new Element()); const dialog = stage.append(new Element()); const resume = dialog.append(new Element(0));
  opener.focus(); return { doc, body, controls, opener, stage, staff, dialog, resume, notice };
}
const { definition, template } = load();
const projectCache = {};
function loadProject(relative) {
  const overrides = {
    'src/model/ScreenAwakeMixin.js': { createScreenAwakeMixin: () => ({}) },
    'src/model/AudioSynchronizationPlayback.js': { watchAudioTimingChanges: () => () => {} },
    'src/model/NoteFlowViewport.js': { lockNoteFlowViewport: () => () => {} },
    'src/model/NoteFlowRoundStorage.js': { saveRound: result => { saves.push(result); return Promise.resolve({ saved: true }); } }
  };
  if(overrides[relative]) return overrides[relative];
  if(projectCache[relative]) return projectCache[relative].exports;
  const text = read(relative), parsed = relative.endsWith('.vue') ? compiler.parseComponent(text) : null;
  if(parsed) assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const module = { exports: {} }; projectCache[relative] = module;
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : text, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code)(module, module.exports, dependency => {
    if(!dependency.startsWith('.')) return require(dependency);
    let target = path.resolve(sourceRoot, path.dirname(relative), dependency);
    if(!fs.existsSync(target)) target += fs.existsSync(target + '.js') ? '.js' : '.vue';
    if(target.endsWith('.vue')) return {};
    if(target.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
    return loadProject(path.relative(sourceRoot, target));
  });
  return module.exports;
}
const chordDefinition = loadProject('src/components/NoteFlowChordTraining.vue').default;
const instances = [];
function instance(f) {
  global.document = f.doc;
  const vm = new Vue(Object.assign({}, definition, compiler.compileToFunctions(template), {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    propsData: { preview: { menuOptions: { gameLength: 20, inputMode: 'button', handMode: 'single', clef: ['treble'] } } },
    methods: Object.assign({}, definition.methods, { $t: key => key })
  }));
  vm.generatedCycle = {};
  vm.$refs.pauseDialog = f.dialog; vm.$refs.pauseButton = f.opener; vm.$refs.flowStage = f.stage;
  vm.$refs.flowStaff = { resumeMotion: () => vm.resumeRound(), toggleMotion: () => vm.startRound(), pauseMotion: () => vm.pauseRound(), finishMotion() {} };
  instances.push(vm); return vm;
}
function chordInstance(f) {
  global.document = f.doc;
  loadProject('src/model/Options.js').default.preparationSeconds = 0;
  const { createNoteFlowChordPlan } = loadProject('src/model/NoteFlowChordPlan.js');
  const chordTemplate = compiler.parseComponent(read('src/components/NoteFlowChordTraining.vue')).template.content;
  const vm = new Vue(Object.assign({}, chordDefinition, compiler.compileToFunctions(chordTemplate), {
    mounted: undefined, beforeDestroy: undefined,
    propsData: { plan: createNoteFlowChordPlan({ tonalityMode: 'circle', selectedKey: 'C-major', chordSize: 3, bassNote: true, behavior: 'wait', bpm: 50, gameLength: 20, rhythmMeter: '4/4', rhythmValues: ['quarter'] }) },
    methods: Object.assign({}, chordDefinition.methods, { $t: key => key })
  }));
  vm.auditDefinition = chordDefinition;
  vm.$refs.pauseDialog = f.dialog; vm.$refs.pauseButton = f.opener; vm.$refs.flowStage = f.stage;
  vm.handleMidiConnection(true); instances.push(vm); return vm;
}
async function flush(vm) { await vm.$nextTick(); await vm.$nextTick(); }
function nodes(node) { return [node, ...(node.children || []).flatMap(nodes)]; }
const evidence = { sourceRoot, tests: [], protections: ['RAM-only collaborators', 'no browser/build/real data'], generatedAt: new Date().toISOString() };
async function test(name, body) {
  now = 0; ticks.clear(); frames.clear(); saves.length = 0;
  try { await body(); evidence.tests.push({ name, passed: true }); }
  catch(error) { evidence.tests.push({ name, passed: false, error: error.stack }); }
  finally { for(const vm of instances.splice(0)) { (vm.auditDefinition || definition).beforeDestroy.call(vm); vm.$destroy(); } }
  process.stdout.write((evidence.tests.at(-1).passed ? 'PASS ' : 'FAIL ') + name + '\n');
}
async function run() {
  await test('U7: actual paused watcher names, focuses and contains the single Resume control', async () => {
    assert(template.includes(':aria-label="$t(\'PAUSED\')"'));
    const f = fixture(), vm = instance(f); vm.startRound(); now = 900; vm.pauseRound(); await flush(vm);
    assert.strictEqual(f.doc.activeElement, f.dialog); assert.strictEqual(f.controls.getAttribute('inert'), ''); assert.strictEqual(f.staff.getAttribute('inert'), '');
    f.doc.fire('keydown', { key: 'Tab', shiftKey: true }); assert.strictEqual(f.doc.activeElement, f.resume);
    f.doc.fire('keydown', { key: 'Tab', shiftKey: false }); assert.strictEqual(f.doc.activeElement, f.resume);
    f.opener.focus(); assert.strictEqual(f.doc.activeElement, f.dialog);
    assert.strictEqual(ticks.size, 0); assert.strictEqual(vm.roundTimer.remainingMs, 19100);
  });
  await test('U7: resume restores focus/background and leaves active timing/save behavior intact', async () => {
    const f = fixture(), vm = instance(f); vm.startRound(); now = 900; vm.pauseRound(); await flush(vm);
    now = 60900; vm.playTraining(); await flush(vm);
    assert.strictEqual(f.doc.activeElement, f.opener); assert.strictEqual(f.controls.getAttribute('inert'), null); assert.strictEqual(f.staff.getAttribute('inert'), null);
    assert.strictEqual(f.notice.getAttribute('aria-hidden'), 'false'); assert.strictEqual(f.body.style.overflow, 'hidden'); assert.strictEqual(f.doc.count('keydown'), 0);
    now = 80000; vm.updateRoundTimer(); await flush(vm);
    assert.strictEqual(vm.roundTimer.status, 'complete'); assert.strictEqual(vm.roundTimer.elapsedMs, 20000); assert.strictEqual(saves.length, 1);
  });
  await test('U7: rapid pause/resume and a result replacing pause cancel pending modal focus', async () => {
    const f = fixture(), vm = instance(f); vm.startRound(); vm.pauseRound(); vm.resumeRound(); await flush(vm);
    assert.strictEqual(f.doc.count('keydown'), 0);
    vm.pauseRound(); vm.finishRound(); await flush(vm);
    assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.controls.getAttribute('inert'), null); assert.strictEqual(saves.length, 1);
    vm.finishRound(); assert.strictEqual(saves.length, 1);
  });
  await test('U7: reset and disposal restore background and reject late nextTick modal work', async () => {
    const f = fixture(), vm = instance(f); vm.startRound(); vm.pauseRound(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 1);
    vm.resetRound(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.staff.getAttribute('inert'), null);
    vm.startRound(); vm.pauseRound(); definition.beforeDestroy.call(vm); vm.$destroy(); await flush(vm);
    assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.staff.getAttribute('inert'), null);
  });
  await test('U7: pause during preparation waits for the visible dialog without changing preparation', async () => {
    const f = fixture(), vm = instance(f); vm.isPreparing = true; vm.pauseRound(); await flush(vm);
    assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(vm.isPreparing, true);
    vm.isPreparing = false; await flush(vm); assert.strictEqual(f.doc.activeElement, f.dialog); assert.strictEqual(f.doc.count('keydown'), 1);
  });
  await test('U7: repeated pause/reset keeps one guard, and completed results save only once', async () => {
    const f = fixture(), vm = instance(f);
    for(let i = 0; i < 30; i++) {
      vm.startRound(); now += 100; vm.pauseRound(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 1);
      vm.resumeRound(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 0);
    }
    assert.strictEqual(vm.roundTimer.elapsedMs, 3000);
    vm.finishRound(); vm.finishRound(); await flush(vm); assert.strictEqual(saves.length, 1); assert.strictEqual(f.doc.count('keydown'), 0);
    vm.resetRound(); await flush(vm); assert.strictEqual(vm.roundTimer.elapsedMs, 0); assert.strictEqual(vm.roundResult, null);
  });
  await test('U7-chords: real connected-MIDI play/pause contains focus, stops timers and rejects note input', async () => {
    const f = fixture(), vm = chordInstance(f); vm.playMotion(); now = 900; vm.pauseMotion(); await flush(vm);
    assert.strictEqual(vm.roundTimer.status, 'paused'); assert.strictEqual(ticks.size, 0); assert.strictEqual(frames.size, 0);
    assert.strictEqual(f.doc.activeElement, f.dialog); assert.strictEqual(f.controls.getAttribute('inert'), ''); assert.strictEqual(f.staff.getAttribute('inert'), '');
    f.doc.fire('keydown', { key: 'Tab', shiftKey: true }); assert.strictEqual(f.doc.activeElement, f.resume);
    f.doc.fire('keydown', { key: 'Tab', shiftKey: false }); assert.strictEqual(f.doc.activeElement, f.resume);
    f.opener.focus(); assert.strictEqual(f.doc.activeElement, f.dialog);
    const practice = vm.practice; vm.pressMidi(48); assert.strictEqual(vm.practice, practice);
    now = 60900; vm.playMotion(); await flush(vm); assert.strictEqual(f.doc.activeElement, f.opener); assert.strictEqual(f.controls.getAttribute('inert'), null);
    assert.strictEqual(vm.roundTimer.remainingMs, 19100); assert.strictEqual(f.doc.count('keydown'), 0);
  });
  await test('U7-chords: repeated real transport, MIDI disconnect, result and restart release one modal guard', async () => {
    const f = fixture(), vm = chordInstance(f);
    for(let i = 0; i < 15; i++) {
      vm.playMotion(); now += 100; vm.pauseMotion(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 1);
      vm.playMotion(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 0);
    }
    vm.handleMidiConnection(false); await flush(vm); assert.strictEqual(vm.roundTimer.status, 'paused'); assert.strictEqual(f.doc.count('keydown'), 1);
    vm.handleMidiConnection(true); vm.playMotion(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 0);
    vm.pauseMotion(); await flush(vm); vm.endRound('manual'); await flush(vm);
    assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.controls.getAttribute('inert'), null); assert.strictEqual(saves.length, 1);
    vm.endRound('manual'); assert.strictEqual(saves.length, 1);
    vm.restartRound(); await flush(vm); assert.strictEqual(f.doc.count('keydown'), 0);
  });
  await test('U7-chords: destruction before or after pause mounting restores background and cancels frames', async () => {
    for(const mounted of [false, true]) {
      const f = fixture(), vm = chordInstance(f); vm.playMotion(); vm.pauseMotion(); if(mounted) await flush(vm);
      chordDefinition.beforeDestroy.call(vm); vm.$destroy(); await flush(vm);
      assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.staff.getAttribute('inert'), null); assert.strictEqual(ticks.size, 0); assert.strictEqual(frames.size, 0);
    }
  });
  await test('U8: named result regions retain ordinary Back, Play Again and failed-save Retry actions', async () => {
    for(const kind of ['melody', 'chords']) for(const saveState of ['saved', 'error']) {
      const f = fixture(), vm = kind === 'melody' ? instance(f) : chordInstance(f);
      vm.roundTimer = Object.assign({}, vm.roundTimer, { status: 'complete' });
      vm.roundSaveState = saveState;
      vm.roundResult = {
        completionReason: 'manual', durationMs: 2000,
        score: { correct: 1, wrong: 2, missed: 0, accuracy: 33 },
        timing: { early: 0, precise: 0, late: 0, averageAbsoluteOffsetMs: null },
        settings: { inputMode: kind === 'melody' ? 'button' : 'midi', bpm: 50, handMode: 'one' }
      };
      await flush(vm);
      const tree = nodes(vm._render()), region = tree.find(node => node.data && node.data.staticClass === 'flow-result-overlay');
      assert(region); assert.strictEqual(region.data.attrs.role, 'region'); assert.strictEqual(region.data.attrs['aria-modal'], undefined);
      const titleId = kind === 'melody' ? 'flow-result-title' : 'chord-result-title';
      assert.strictEqual(region.data.attrs['aria-labelledby'], titleId);
      assert(nodes(region).some(node => node.tag === 'h2' && node.data.attrs.id === titleId));
      assert.strictEqual(f.doc.count('keydown'), 0); assert.strictEqual(f.controls.getAttribute('inert'), null);
      const buttons = tree.filter(node => node.tag === 'button');
      const back = buttons.find(node => node.data.staticClass === 'flow-training-exit');
      const again = buttons.find(node => node.data.staticClass === 'flow-training-play');
      assert(back && again && !back.data.attrs?.disabled && !again.data.attrs?.disabled);
      const regionButtons = nodes(region).filter(node => node.tag === 'button');
      assert.strictEqual(regionButtons.length, saveState === 'error' ? 1 : 0);
      const savedBeforeRetry = saves.length;
      if(saveState === 'error') await regionButtons[0].data.on.click();
      assert.strictEqual(saves.length - savedBeforeRetry, saveState === 'error' ? 1 : 0);
      assert.strictEqual(vm.roundSaveState, 'saved');
      let backs = 0, repeats = 0;
      vm.$on('back', () => { backs += 1; }); back.data.on.click(); assert.strictEqual(backs, 1);
      vm.restartRound = () => { repeats += 1; }; again.data.on.click(); assert.strictEqual(repeats, 1);
      assert.strictEqual(vm.roundSaveState, 'saved');
    }
  });
  evidence.hashes = hashes;
  evidence.sourceHashesStable = Object.entries(hashes).every(([relative, hash]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, relative))).digest('hex') === hash);
  evidence.passed = evidence.tests.every(test => test.passed) && evidence.sourceHashesStable;
  if(process.env.REPAIR_EVIDENCE) fs.writeFileSync(process.env.REPAIR_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
  if(!evidence.passed) process.exitCode = 1;
  process.stdout.write(JSON.stringify({ passed: evidence.passed, groups: evidence.tests.length, sourceHashesStable: evidence.sourceHashesStable }) + '\n');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => Object.keys(previous).forEach(key => { global[key] = previous[key]; }));

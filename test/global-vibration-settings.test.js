const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');
const originalRuntime = global.regeneratorRuntime;
global.regeneratorRuntime = require('babel-runtime/regenerator');

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const parsed = relative.endsWith('.vue') ? compiler.parseComponent(source) : null;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : source, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(loaded, loaded.exports, name => dependencies[name] || {});
  if(parsed) {
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, [], relative);
    Object.assign(loaded.exports.default, compiler.compileToFunctions(parsed.template.content));
  }
  return loaded.exports;
}
function flatten(node) {
  return !node ? [] : [node].concat((node.children || []).reduce((all, child) => all.concat(flatten(child)), []));
}
function hasClass(node, className) {
  return ((node.data || {}).staticClass || '').split(' ').includes(className);
}
function translate(dictionary) {
  return key => { assert.strictEqual(typeof dictionary[key], 'string', key); return dictionary[key]; };
}

(async () => {
  const stored = {};
  const preparation = load('model/PracticePreparation.js');
  const options = load('model/Options.js', {
    './VerifiedPersistence': load('model/VerifiedPersistence.js'),
    './PersistenceFeedback': load('model/PersistenceFeedback.js'),
    lockr: { get: key => stored[key], set: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); } },
    './NoteRanges': load('model/NoteRanges.js'),
    './ClefSelection': load('model/ClefSelection.js'),
    './NoteNaming': load('model/NoteNaming.js'),
    './AppVolume': load('model/AppVolume.js'),
    './NoteFlowMovement': load('model/NoteFlowMovement.js'),
    './RhythmSensePreferences': load('model/RhythmSensePreferences.js', {
      './RhythmSense': load('model/RhythmSense.js')
    }),
    './PracticePreparation': preparation
  }).default;
  const settings = load('components/AppSettingsMenu.vue', {
    '../model/Options': options,
    '../model/PracticePreparation': preparation,
    '../model/LanguageOptions': { ENABLED_LANGUAGES: ['de', 'en'] },
    './SelectOptionDropdown': load('components/SelectOptionDropdown.vue').default
  }).default;
  const navigationDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  const vibrationCalls = [];
  Object.defineProperty(global, 'navigator', { configurable: true, value: { vibrate(value) { vibrationCalls.push(value); } } });
  try {
    for(const locale of ['de', 'en']) {
      const dictionary = load('resources/' + locale + '.js').default;
      const vm = new Vue(Object.assign({}, settings, {
        created: undefined, beforeDestroy: undefined,
        methods: Object.assign({}, settings.methods, { $t: translate(dictionary) })
      }));
      options.vibration = true;
      await Vue.nextTick();
      const rendered = flatten(vm._render());
      const cards = rendered.filter(node => hasClass(node, 'app-settings-card'));
      assert.deepStrictEqual(cards.slice(0, 6).map(node => node.data.attrs['aria-labelledby']), [
        'app-settings-audio-title', 'app-settings-screen-title', 'app-settings-vibration-title',
        'app-settings-language-title', 'app-settings-note-naming-title', 'app-settings-backup-title'
      ], 'vibration has its own card immediately below Screen');
      const screen = rendered.find(node => hasClass(node, 'app-settings-card-screen'));
      const vibration = rendered.find(node => hasClass(node, 'app-settings-card-vibration'));
      const control = flatten(vibration).find(node => node.componentOptions
        && (node.componentOptions.propsData || {}).label === dictionary.APP_SETTINGS_VIBRATION_ENABLE);
      assert(control, 'central vibration lives in its own card: ' + locale);
      assert(!flatten(screen).some(node => node.componentOptions
        && (node.componentOptions.propsData || {}).label === dictionary.APP_SETTINGS_VIBRATION_ENABLE));
      assert(flatten(vibration).some(node => node.tag === 'svg'), 'the separate card has a matching icon');
      assert.strictEqual(control.componentOptions.propsData.appearance, 'app-settings');
      assert.deepStrictEqual(control.componentOptions.propsData.items.map(item => item.value), [true, false]);
      control.componentOptions.listeners.input('false');
      await Vue.nextTick();
      assert.strictEqual(stored.options.vibration, false, 'the central switch persists without leaving settings');
      assert.strictEqual(vibrationCalls[vibrationCalls.length - 1], 0, 'turning off stops an ongoing pulse');
      options.vibration = true;
      options.loadOptions();
      await Vue.nextTick();
      assert.strictEqual(options.vibration, false, 'off survives reopening persisted settings');
      control.componentOptions.listeners.input('true');
      await Vue.nextTick();
      assert.strictEqual(stored.options.vibration, true);
      vm.backupBusy = true;
      const disabledControl = flatten(vm._render()).find(node => node.componentOptions
        && (node.componentOptions.propsData || {}).label === dictionary.APP_SETTINGS_VIBRATION_ENABLE);
      assert.strictEqual(disabledControl.componentOptions.propsData.disabled, true);
      vm.$destroy();
      process.stdout.write('✓ ' + locale + ' central vibration control persists, cancels, reopens and respects busy settings\n');
    }
    const settingsCss = compiler.parseComponent(fs.readFileSync(path.join(__dirname,
      '../src/components/AppSettingsMenu.vue'), 'utf8')).styles.map(style => style.content).join('\n');
    const color = section => {
      const match = settingsCss.match(new RegExp('\\.app-settings-card-' + section + '\\s*\\{([^}]+)\\}'));
      return match && match[1].match(/--settings-accent:\s*([^;]+);/)[1].trim();
    };
    assert.deepStrictEqual(['screen', 'vibration', 'language', 'note-naming', 'backup'].map(color),
      ['#2d6e7b', '#d7942f', '#8066a2', '#a18c74', '#e76530'], 'the established color cycle continues after insertion');
    process.stdout.write('✓ Settings cards retain the Orange/Petrol/Gold/Violet/Beige color cycle\n');

    const explicitOff = JSON.parse(JSON.stringify(stored.options));
    explicitOff.vibration = false;
    stored.options = explicitOff;
    options.vibration = true;
    options.loadOptions();
    assert.strictEqual(options.vibration, false);
    const olderBackup = JSON.parse(JSON.stringify(explicitOff));
    delete olderBackup.vibration;
    stored.options = olderBackup;
    options.loadOptions();
    assert.strictEqual(options.vibration, true, 'an older backup restores the default, not the previous session choice');
    assert.strictEqual(stored.options.vibration, true, 'the migrated default persists');
    assert.deepStrictEqual(Object.assign({}, stored.options, { vibration: undefined }),
      Object.assign({}, explicitOff, { vibration: undefined }), 'migration preserves all other settings');
    process.stdout.write('✓ Central vibration restores explicit off and migrates missing legacy settings without stale session state\n');

    const rhythm = load('components/RhythmSense.vue', {
      '../model/Options': options,
      '../model/RhythmSense': load('model/RhythmSense.js'),
      '../model/RhythmSensePreferences': load('model/RhythmSensePreferences.js'),
      '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) }
    }).default;
    for(const locale of ['de', 'en']) {
      const dictionary = load('resources/' + locale + '.js').default;
      const vm = new Vue(Object.assign({}, rhythm, { created: undefined, beforeDestroy: undefined,
        methods: Object.assign({}, rhythm.methods, { $t: translate(dictionary) }) }));
      vm.previewVibration = true; vm.tapVibration = true;
      const inputs = () => flatten(vm._render()).filter(node => node.tag === 'input'
        && (node.data.attrs || {}).type === 'checkbox');
      options.vibration = true;
      await Vue.nextTick();
      assert.strictEqual(inputs().length, 2, 'Rhythm Sense shows its two local choices only when global vibration is enabled');
      options.vibration = false;
      await Vue.nextTick();
      assert.strictEqual(inputs().length, 0);
      assert.strictEqual(vm.previewVibration, true);
      assert.strictEqual(vm.tapVibration, true, 'hiding the controls preserves the user choices');
      options.vibration = true;
      await Vue.nextTick();
      assert.strictEqual(inputs().length, 2);
      vm.$destroy();
      process.stdout.write('✓ ' + locale + ' Rhythm Sense hides and restores its local vibration controls without losing choices\n');
    }
    const game = load('components/Game.vue', {
      '../model/Options': options,
      '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) }
    }).default;
    const learningRound = { isAdaptiveMode: true, numWrong: 0, currentExerciseMistakes: 0,
      options: { vibration: false } };
    options.vibration = true;
    game.methods.onWrongAnswer.call(learningRound);
    assert.strictEqual(vibrationCalls[vibrationCalls.length - 1], 200,
      'the central switch overrides an old disabled learning-mode preference');
    const countBeforeOff = vibrationCalls.length;
    options.vibration = false;
    learningRound.options.vibration = true;
    game.methods.onWrongAnswer.call(learningRound);
    assert.strictEqual(vibrationCalls.length, countBeforeOff,
      'an old enabled mode preference cannot bypass central off');
    process.stdout.write('✓ Single Notes feedback follows the central switch despite opposing legacy mode preferences\n');
    options.vibration = true;
    navigator.vibrate = () => { throw new Error('Device declined vibration'); };
    assert.doesNotThrow(() => game.methods.onWrongAnswer.call(learningRound));
    assert.strictEqual(learningRound.feedback, 'wrong', 'feedback survives a blocked vibration API');
    delete navigator.vibrate;
    assert.doesNotThrow(() => game.methods.onWrongAnswer.call(learningRound));
    delete global.navigator;
    assert.doesNotThrow(() => game.methods.onWrongAnswer.call(learningRound));
    process.stdout.write('✓ Unsupported or blocked vibration never interrupts Single Notes feedback\n');

    for(const filename of ['Menu.vue', 'AdaptiveMenu.vue', 'NoteFlowMenu.vue', 'NoteFlowChordMenu.vue',
      'WorkshopPractice.vue', 'WorkshopListening.vue']) {
      const template = compiler.parseComponent(fs.readFileSync(path.join(__dirname,
        '../src/components', filename), 'utf8')).template.content;
      const ast = compiler.compile(template).ast;
      const stack = [ast];
      while(stack.length) {
        const node = stack.pop();
        assert(!(node.attrsList || []).some(attribute => /vibration/i.test(attribute.value)
          && /^(?:v-model|:value|:label|@input|@change)/.test(attribute.name)),
        filename + ' cannot expose an independent vibration switch');
        (node.children || []).forEach(child => stack.push(child));
        (node.ifConditions || []).slice(1).forEach(branch => stack.push(branch.block));
      }
    }
    process.stdout.write('✓ Single Notes, melody, chord and workshop templates contain no local vibration switch\n');
  } finally {
    if(navigationDescriptor) Object.defineProperty(global, 'navigator', navigationDescriptor);
    else delete global.navigator;
  }
})().then(() => { global.regeneratorRuntime = originalRuntime; }).catch(error => {
  global.regeneratorRuntime = originalRuntime;
  console.error(error);
  process.exitCode = 1;
});

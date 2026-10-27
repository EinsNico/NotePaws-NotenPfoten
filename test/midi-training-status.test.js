const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Vue = require("vue");
const compiler = require("vue-template-compiler");

function read(name) {
  return fs.readFileSync(path.join(__dirname, "../src/components", name), "utf8");
}
const source = read("MidiConnectionStatus.vue");
const template = compiler.parseComponent(source).template.content;
const compiled = compiler.compileToFunctions(template);
const vm = new Vue({
  data: { connected: false },
  methods: { $t: key => key },
  render: compiled.render,
  staticRenderFns: compiled.staticRenderFns
});
function text(node) {
  return node.text || (node.children || []).map(text).join("");
}
let rendered = vm._render();
assert(text(rendered).includes("HOME_MIDI_DISCONNECTED"));
assert.strictEqual(rendered.data.class["is-connected"], false);
vm.connected = true;
rendered = vm._render();
assert(text(rendered).includes("HOME_MIDI_CONNECTED"));
assert.strictEqual(rendered.data.class["is-connected"], true);
vm.connected = false;
assert(text(vm._render()).includes("HOME_MIDI_DISCONNECTED"));
assert(!source.includes("WebMidi"), "Status must not install duplicate MIDI listeners");

for (const name of ["Game.vue", "NoteFlowGamePreview.vue", "NoteFlowChordTraining.vue"]) {
  const content = read(name);
  const parsed = compiler.parseComponent(content);
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  assert(content.includes('<MidiConnectionStatus'));
  assert(content.includes(':connected="midiConnected"'));
  assert(content.indexOf('<MidiConnectionStatus') < content.indexOf('class="round-controls"')
    || content.indexOf('<MidiConnectionStatus') < content.indexOf('class="flow-training-controls"'));
  assert(content.includes('@connection-change="midiConnected = $event"')
    || content.includes('@connection-change="handleMidiConnection"'));
}
assert(read("Game.vue").includes('v-if="options.inputMode === \'midi\'"'));
assert(read("NoteFlowGamePreview.vue").includes('v-if="preview.menuOptions.inputMode === \'midi\'"'));
assert(read("NoteFlowRhythmPreview.vue").includes(
  '@connection-change="handleMidiConnection"'
));
process.stdout.write("Training MIDI status render and wiring tests passed.\n");

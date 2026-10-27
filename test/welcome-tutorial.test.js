const assert=require('assert'),fs=require('fs'),path=require('path'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
function load(name,deps={}) {
 const source=fs.readFileSync(path.resolve(__dirname,'../src',name),'utf8');
 const parsed=name.endsWith('.vue')?compiler.parseComponent(source):null; const mod={exports:{}};
 new Function('module','exports','require',babel.transform(parsed?parsed.script.content:source,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code)(mod,mod.exports,n=>deps[n]||{});
 if(parsed){assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);Object.assign(mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
 return mod.exports;
}
const model=load('model/WelcomeTutorial.js');
const dictionaries={de:load('resources/de.js').default,en:load('resources/en.js').default};
const keyboard=load('components/KeyboardInput.vue').default;
const keyLabels=load('model/NoteFlowKeyLabels.js',{'./NoteNaming':load('model/NoteNaming.js')});
const definition=load('components/WelcomeTutorial.vue',{
 'abcjs/src/write/creation/glyphs':require('abcjs/src/write/creation/glyphs'),
 '../model/NoteFlowKeyLabels':keyLabels,'./KeyboardInput':keyboard
}).default;
function test(n,f){f();console.log('✓ '+n);}
function store(initial={}){const m=new Map(Object.entries(initial));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),m};}
function nodes(v){return v?[v].concat((v.children||v.componentOptions&&v.componentOptions.children||[]).flatMap(nodes)):[];}
function text(v){return nodes(v).map(n=>n.text||'').join('');}
function instance(locale='de') {return new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t(key,values={}){assert(Object.prototype.hasOwnProperty.call(dictionaries[locale],key),'missing translation '+locale+' '+key);return dictionaries[locale][key].replace(/\{(\w+)\}/g,(_,n)=>values[n]);}})}));}
test('optional black-key preview uses the real setting, returns to white keys and pauses safely on manual selection',()=>{
 const preview=load('components/WelcomeAccidentalPreview.vue',{'abcjs/src/write/creation/glyphs':require('abcjs/src/write/creation/glyphs'),'./SelectOption':load('components/SelectOption.vue').default}).default;
 const set=global.setTimeout,clear=global.clearTimeout,doc=global.document,tasks=new Map();let id=0,vm;
 global.setTimeout=(callback,delay)=>{tasks.set(++id,{callback,delay});return id;};global.clearTimeout=id=>tasks.delete(id);global.document={hidden:false,removeEventListener(){}};
 const fire=()=>{assert.strictEqual(tasks.size,1);const [key,task]=tasks.entries().next().value;tasks.delete(key);task.callback();};
 try {
  vm=new Vue(Object.assign({},preview,{mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},preview.methods,{$t:key=>dictionaries.de[key]})}));
  const selection=nodes(vm._render()).find(n=>n.componentOptions&&n.componentOptions.Ctor.options.name==='SelectOption');assert(selection,'same component as the actual training settings');
  assert.deepStrictEqual(selection.componentOptions.propsData.items.map(item=>item.value),['no','onlySharp','onlyFlat','sharpAndFlat']);
  vm.queue();assert.strictEqual(vm.selection,'no');fire();assert.strictEqual(vm.selection,'onlySharp');fire();assert.strictEqual(vm.selection,'onlyFlat');fire();assert.strictEqual(vm.selection,'no');
  const pauses=[];vm.$on('pause',()=>pauses.push(true));selection.componentOptions.listeners.input('onlyFlat');assert.strictEqual(vm.selection,'onlyFlat');assert.strictEqual(vm.noteY,68);assert.strictEqual(vm.answerBlackKey,3,'G flat uses the black key to the left of G');assert.strictEqual(tasks.size,0);assert.strictEqual(pauses.length,1);
  vm.select('sharpAndFlat');assert.strictEqual(vm.selection,'sharpAndFlat');assert.strictEqual(vm.noteY,68);assert.strictEqual(vm.answerBlackKey,4,'G sharp uses the black key to the right of G');vm.select('invalid');assert.strictEqual(vm.selection,'sharpAndFlat');assert.strictEqual(tasks.size,0);
  vm.resume();assert.strictEqual(vm.selection,'no');assert.strictEqual(tasks.size,1);document.hidden=true;vm.queue();assert.strictEqual(tasks.size,0);document.hidden=false;vm.queue();assert.strictEqual(tasks.size,1);
  preview.beforeDestroy.call(vm);assert.strictEqual(tasks.size,0,'leaving a scene clears its demonstration timer');
 } finally {if(vm){vm.clear();vm.$destroy();}global.setTimeout=set;global.clearTimeout=clear;if(doc===undefined)delete global.document;else global.document=doc;}
});
test('fresh install is offered the tutorial; existing profiles remain undisturbed',()=>{
 assert.strictEqual(model.shouldShowWelcome(store()),true);
 for(const key of ['options','adaptiveOptions','statistics','roundHistory']) assert.strictEqual(model.shouldShowWelcome(store({[key]:'{}'})),false);
});
test('skip and finish share a persistent marker; forced preview and unavailable storage are handled',()=>{
 const s=store({music:'private-piece'});assert.strictEqual(model.rememberWelcome(s),true);assert.strictEqual(model.shouldShowWelcome(s),false);
 assert.strictEqual(s.getItem('music'),'private-piece');assert.strictEqual(model.shouldShowWelcome(s,'?tutorial=1'),true);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.strictEqual(model.shouldShowWelcome(blocked),false);assert.strictEqual(model.rememberWelcome(blocked),false);
});
test('localized scenes and C–G / same C–F demo use the normal keyboard and show clef mnemonics',()=>{
 for(const locale of ['de','en']) {
  const vm=instance(locale),finished=[];vm.$on('finish',v=>finished.push(v));
  for(let mode=0;mode<4;mode++) {
   vm.selectMode(mode);const preview=nodes(vm._render()).find(n=>n.data&&n.data.staticClass==='discovery-preview');
   assert(preview,'compact discovery includes a mode preview');
   assert(text(preview).includes(dictionaries[locale][vm.discoveryHeadings[mode]]),'preview caption follows the selected mode');
   assert(nodes(preview).some(n=>n.data&&n.data.staticClass==='discovery-caption'&&text(n)===dictionaries[locale][vm.modes[mode].copy]),'mode explanation stays inside the preview card');
   assert(nodes(preview).some(n=>n.data&&n.data.staticClass===['preview-single-note','preview-flow-notes','preview-rhythm','preview-workshop'][mode]),'matching scene follows the selected mode');
   assert(vm.discoverPaused,'manual selection pauses the automatic mode sequence');
  }
  vm.goTo(0);
  for(let i=0;i<4;i++) {
   vm.goTo(i);const tree=vm._render();const buttons=nodes(tree).filter(n=>n.tag==='button');
   const skip=buttons.find(n=>text(n).includes(dictionaries[locale].WELCOME_SKIP));assert(skip);skip.data.on.click();
   assert.strictEqual(finished.pop(),false);
  }
  vm.goTo(-3);assert.strictEqual(vm.step,0);vm.next();assert.strictEqual(vm.step,1);
  for(const input of vm.inputs){
   vm.selectInput(input.id);const tree=vm._render();
   assert(text(tree).includes(dictionaries[locale][input.title]),'input heading follows the selected option');
   const scene=nodes(tree).find(n=>n.data&&n.data.staticClass===({button:'input-screen-buttons',keyboard:'input-screen-keyboard',midi:'input-midi-instrument'})[input.id]);
   assert(scene,'each input has its own recognizable illustration');
   if(input.id==='button')assert.strictEqual(nodes(scene).filter(n=>n.tag==='text'&&n.data.staticClass==='input-button-label').length,7,'screen buttons carry note names');
   if(input.id==='midi')assert(nodes(scene).some(n=>n.data&&n.data.staticClass==='input-midi-cable'),'MIDI shows the connection to a separate instrument');
  }
  vm.next();assert.strictEqual(vm.step,2);
  assert.strictEqual(vm.personalSections.length,6);
  for(let i=0;i<vm.personalSections.length;i++){vm.selectPersonal(i);const tree=vm._render();assert(text(tree).includes(dictionaries[locale][vm.personalSections[i].label]));assert(text(tree).includes(dictionaries[locale][vm.personalSections[i].copy]));}
  assert.deepStrictEqual(vm.noteValuePatterns.map(pattern=>pattern.reduce((beats,note)=>beats+note.beats,0)),[4,4],'both rhythm examples fill exactly one 4/4 bar');
  assert.deepStrictEqual(vm.noteValuePatterns.map(pattern=>pattern.length),[4,6]);
  assert.deepStrictEqual(vm.circleNotes.map(n=>n.label),locale==='de'?['C','G','D','A','E','H','Fis','Des','As','Es','B','F']:['C','G','D','A','E','B','F♯','D♭','A♭','E♭','B♭','F']);
  vm.next();assert.strictEqual(vm.step,3);
  const keyboardNode=()=>nodes(vm._render()).find(n=>n.componentOptions&&n.componentOptions.Ctor.options.name==='KeyboardInput');
  const play=value=>{
   const key=keyboardNode();assert(key,'same KeyboardInput component as the normal game');
   key.componentOptions.listeners.solved(value);
  };
  const feedback=()=>text(nodes(vm._render()).find(n=>n.data&&n.data.staticClass==='welcome-copy-live'));
  assert.strictEqual(nodes(vm._render()).filter(n=>n.data&&n.data.staticClass==='welcome-copy-reserve').length,3,'feedback reserves space for all messages');
  const note=()=>nodes(vm._render()).find(n=>n.tag==='ellipse'&&n.data.staticClass==='welcome-notehead');
  const ledger=()=>nodes(vm._render()).find(n=>n.tag==='path'&&n.data.staticClass==='welcome-ledger');
  const referenceLine=()=>nodes(vm._render()).find(n=>n.tag==='path'&&n.data.staticClass==='welcome-reference-line');
  play(2);assert.strictEqual(vm.solved,false);assert.strictEqual(vm.tried,true);
  assert(feedback().includes(dictionaries[locale].WELCOME_RETRY.replace('{note}','C')));
  assert.strictEqual(note().data.attrs.cy,92);assert.strictEqual(ledger().data.attrs.d,'M136 92h32');
  play(0);assert.strictEqual(vm.solved,true);assert(feedback().includes(dictionaries[locale].WELCOME_CORRECT));
  vm.next();assert.strictEqual(vm.trial.pitch,'G4');assert.strictEqual(vm.solved,false);assert.strictEqual(vm.tried,false);
  assert.strictEqual(note().data.attrs.cy,68);assert.strictEqual(ledger(),undefined);assert.strictEqual(referenceLine(),undefined);
  assert(!text(vm._render()).includes(dictionaries[locale].WELCOME_TIP_TREBLE));
  play(6);assert.strictEqual(vm.solved,false,'F sharp does not count as G');
  play(7);assert.strictEqual(vm.solved,true);assert(text(vm._render()).includes(dictionaries[locale].WELCOME_TIP_TREBLE));
  const sheet=nodes(vm._render()).find(n=>n.data&&n.data.staticClass==='welcome-sheet');
  assert(nodes(sheet).some(n=>n.data&&n.data.staticClass==='welcome-memory-tip'),'mnemonic sits over the sheet');
  assert(!nodes(sheet).some(n=>n.componentOptions&&n.componentOptions.Ctor.options.name==='KeyboardInput'),'keyboard remains outside the blurred sheet');
  assert.strictEqual(nodes(vm._render()).find(n=>n.data&&n.data.staticClass==='memory-point-halo').data.attrs.cx,55);
  assert.strictEqual(referenceLine().data.attrs.d,'M26 68h228','G mnemonic marks the second line from the bottom');
  play(2);assert.strictEqual(vm.solved,true,'a correct answer keeps its readable mnemonic');
  vm.next();assert.strictEqual(vm.trial.clef,'bass');assert.strictEqual(vm.trial.pitch,'C4');assert(keyboardNode(),'same C–C keyboard after the clef change');
  assert.strictEqual(note().data.attrs.cy,20);assert.strictEqual(ledger().data.attrs.d,'M136 20h32');
  assert(text(vm._render()).includes(dictionaries[locale].WELCOME_TRY_C_BASS));
  play(12);assert.strictEqual(vm.solved,true,'either C works, as in the normal on-screen game');vm.next();assert.strictEqual(vm.trial.pitch,'F3');
  assert.strictEqual(note().data.attrs.cy,44);assert.strictEqual(ledger(),undefined);
  play(4);assert.strictEqual(vm.solved,false);play(5);assert.strictEqual(vm.solved,true);
  assert(text(vm._render()).includes(dictionaries[locale].WELCOME_TIP_BASS));
  assert.strictEqual(nodes(vm._render()).find(n=>n.data&&n.data.staticClass==='memory-point-halo').data.attrs.cx,44);
  assert.strictEqual(referenceLine().data.attrs.d,'M26 44h228','F mnemonic marks the second line from the top');
  vm.back();assert.strictEqual(vm.trial.pitch,'C4');assert.strictEqual(vm.trial.clef,'bass');assert.strictEqual(vm.solved,false);
  vm.next();assert.strictEqual(vm.trial.pitch,'F3');
  vm.goTo(2);vm.next();assert.strictEqual(vm.trial.pitch,'C4');assert.strictEqual(vm.trial.clef,'treble');
  assert.strictEqual(vm.solved,false);assert.strictEqual(vm.tried,false);assert.strictEqual(vm.playedKey,null);
  assert(!nodes(vm._render()).some(n=>n.data&&n.data.staticClass==='welcome-memory-tip'),'returning to Try clears the old mnemonic');
  vm.back();assert.strictEqual(vm.step,2);vm.next();assert.strictEqual(vm.tryIndex,0);
  for(let i=0;i<4;i++)vm.next();assert.deepStrictEqual(finished,[true]);vm.$destroy();
 }
});
test('mode selection, tap-to-pause, fresh tab entry and timer cleanup stay in sync',()=>{
 const originalSet=global.setTimeout,originalClear=global.clearTimeout,originalDocument=global.document;
 const tasks=new Map(),removed=[];let id=0,vm;
 global.setTimeout=(callback,delay)=>{tasks.set(++id,{callback,delay});return id;};
 global.clearTimeout=id=>tasks.delete(id);
 global.document={hidden:false,removeEventListener:event=>removed.push(event)};
 const pending=()=>{assert.strictEqual(tasks.size,1);return tasks.values().next().value;};
 const fire=()=>{const [key,task]=tasks.entries().next().value;tasks.delete(key);task.callback();};
 try {
  vm=instance();vm.goTo(0);assert.strictEqual(pending().delay,400);
  for(const expected of [0,1,2,3]){
   fire();assert.strictEqual(vm.discoverIndex,expected);assert.strictEqual(pending().delay,3000);
   assert(text(vm._render()).includes(dictionaries.de[vm.modes[expected].copy]));
   const all=nodes(vm._render()),modes=all.filter(n=>n.data&&n.data.staticClass==='welcome-mode');
   assert.strictEqual(modes[expected].data.attrs['aria-pressed'],'true','selection follows the explained mode');
   assert(!all.some(n=>n.data&&n.data.staticClass==='welcome-mode-arrow'),'no extra arrow or checkmark beside Pause');
  }
  fire();assert.strictEqual(vm.discoverIndex,-1,'all cards return down before restarting');assert.strictEqual(pending().delay,400);
  fire();assert.strictEqual(vm.discoverIndex,0);
  vm.selectMode(2);assert.strictEqual(vm.discoverPaused,true);assert.strictEqual(tasks.size,0,'a tap pauses the carousel');
  vm.selectMode(3);assert.strictEqual(tasks.size,0,'a paused mode can be read manually');
  vm.toggleDiscoveryRotation();assert.strictEqual(pending().delay,3000);
  document.hidden=true;vm.handleVisibility();assert.strictEqual(tasks.size,0);
  document.hidden=false;vm.handleVisibility();assert.strictEqual(pending().delay,3000);
  vm.goTo(1);assert.strictEqual(pending().delay,900,'first input transition starts earlier');
  for(const expected of ['keyboard','midi','button']){fire();assert.strictEqual(vm.input,expected);assert.strictEqual(pending().delay,2500);}
  vm.selectInput('midi');assert.strictEqual(vm.input,'midi');assert.strictEqual(vm.inputPaused,true);assert.strictEqual(tasks.size,0);
  vm.selectInput('keyboard');assert.strictEqual(tasks.size,0,'a manual choice respects the pause');
  vm.toggleInputRotation();assert.strictEqual(pending().delay,2500);
  document.hidden=true;vm.handleVisibility();assert.strictEqual(tasks.size,0);
  document.hidden=false;vm.handleVisibility();assert.strictEqual(pending().delay,2500);
  vm.goTo(2);assert.strictEqual(vm._inputTimer,null,'leaving Input stops its rotation');
  assert.strictEqual(vm.personalIndex,0);assert.strictEqual(vm.personalPaused,false);assert.strictEqual(pending().delay,3000);
  for(const expected of [1,2,3,4,5,0]){fire();assert.strictEqual(vm.personalIndex,expected);assert.strictEqual(pending().delay,expected===0 ? 3000 : 4000);}
  vm.selectPersonal(1);assert.strictEqual(vm.personalPaused,true);assert.strictEqual(vm.personalIndex,1);assert.strictEqual(tasks.size,0,'tapping a customization card pauses it');
  vm.selectPersonal(2);assert.strictEqual(vm.personalIndex,2);assert.strictEqual(tasks.size,0);
  vm.togglePersonalRotation();assert.strictEqual(pending().delay,4000);
  document.hidden=true;vm.handleVisibility();assert.strictEqual(tasks.size,0);
  document.hidden=false;vm.handleVisibility();assert.strictEqual(pending().delay,4000);
  vm.goTo(3);assert.strictEqual(tasks.size,0,'leaving customization clears its timer');
  vm.back();assert.strictEqual(vm.personalIndex,0);assert.strictEqual(vm.personalPaused,false);assert.strictEqual(pending().delay,3000);
  vm.selectPersonal(1);vm.goTo(2);assert.strictEqual(vm.personalIndex,0);assert.strictEqual(vm.personalPaused,false);assert.strictEqual(pending().delay,3000);
  vm.finish(false);assert.strictEqual(tasks.size,0,'skip also stops customization');
  vm.goTo(1);assert.strictEqual(pending().delay,900);assert.strictEqual(vm.input,'button');assert.strictEqual(vm.inputPaused,false);
  vm.selectInput('midi');vm.goTo(1);assert.strictEqual(vm.input,'button');assert.strictEqual(vm.inputPaused,false);assert.strictEqual(pending().delay,900,'same-tab navigation also resets the preview');
  vm.back();assert.strictEqual(vm.discoverIndex,-1);assert.strictEqual(vm.discoverPaused,false);assert.strictEqual(pending().delay,400);
  vm.selectMode(3);vm.next();vm.back();assert.strictEqual(vm.discoverIndex,-1);assert.strictEqual(vm.discoverPaused,false);assert.strictEqual(pending().delay,400);
  vm.finish(false);assert.strictEqual(tasks.size,0,'skip stops rotation before emitting finish');
  vm.goTo(2);assert.strictEqual(pending().delay,3000);definition.beforeDestroy.call(vm);assert.strictEqual(tasks.size,0,'destroy stops the active customization timer');
  assert.deepStrictEqual(removed,['keydown','visibilitychange']);
 } finally {
  if(vm){vm.clearInputTimer();vm.clearDiscoveryTimer();vm.clearPersonalTimer();vm.$destroy();}
  global.setTimeout=originalSet;global.clearTimeout=originalClear;
  if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
 }
});
test('Escape skips the tutorial instead of manipulating practice or learning state',()=>{
 const vm=instance(),events=[];vm.$on('finish',v=>events.push(v));let prevented=0;
 vm.handleKey({key:'Escape',preventDefault(){prevented++;},stopPropagation(){}});
 assert.deepStrictEqual(events,[false]);assert.strictEqual(prevented,1);vm.$destroy();
});
test('Android Back dismisses the tutorial once and preserves the current page',()=>{
 const app=load('App.vue',{'./model/WelcomeTutorial':model,'./model/SaveDataImportNotice':{takeSaveDataImportSuccess:()=>false}}).default;
 const prior=global.localStorage;global.localStorage=store();
 try {
  const vm=Object.assign(app.data(),{$refs:{},showTutorial:true});
  Object.keys(app.methods).forEach(n=>vm[n]=app.methods[n].bind(vm));
  vm.handleAndroidBack({preventDefault(){}});assert.strictEqual(vm.showTutorial,false);assert.strictEqual(vm.page,'home');assert.strictEqual(vm.lastHomeBackAt,0);
  vm.handleAndroidBack({preventDefault(){}});assert.strictEqual(vm.showExitHint,false);assert.strictEqual(global.localStorage.getItem(model.WELCOME_SEEN_KEY),'1');
 } finally {global.localStorage=prior;}
});


test('circle examples include a real clef and matching sharp/flat signatures in both languages',()=>{
 for(const locale of ['de','en']) {
  const vm=instance(locale);vm.goTo(2);vm.selectPersonal(2);const tree=vm._render();
  assert.deepStrictEqual(vm.circleKeys.map(key=>key.id),['c','d','f']);
  assert(vm.circleClef.startsWith('M'));assert(!vm.circleKeys[0].accidental);
  assert(vm.circleKeys[1].accidental.startsWith('M'));assert(vm.circleKeys[2].accidental.startsWith('M'));
  assert.notStrictEqual(vm.circleKeys[1].accidental,vm.circleKeys[2].accidental);
  const all=nodes(tree);assert.strictEqual(all.filter(n=>n.data&&n.data.staticClass==='circle-staff').length,3);
  assert.strictEqual(all.filter(n=>n.data&&n.data.staticClass==='circle-signature').length,2);
  for(const key of vm.circleKeys)assert(text(tree).includes(dictionaries[locale][key.title]));
  vm.clearPersonalTimer();
 }
});
test('horizontal touch swipes select and pause scenes; buttons, piano and vertical gestures retain their behavior',()=>{
 const vm=instance(),target=scene=>({closest:selector=>selector==='.welcome-scene' && scene ? {} : null});
 const swipe=(dx,dy=0,scene=true)=>{vm.beginSwipe({pointerType:'touch',pointerId:1,clientX:200,clientY:100,target:target(scene)});vm.endSwipe({pointerId:1,clientX:200+dx,clientY:100+dy});};
 vm.goTo(2);swipe(-90);assert.strictEqual(vm.personalIndex,1);assert(vm.personalPaused);swipe(90);assert.strictEqual(vm.personalIndex,0);
 swipe(-90,120);assert.strictEqual(vm.personalIndex,0);
 vm.goTo(1);swipe(-90);assert.strictEqual(vm.input,'keyboard');assert(vm.inputPaused);
 vm.beginSwipe({pointerType:'touch',pointerId:1,clientX:0,clientY:0,target:{closest:()=>({})}});assert.strictEqual(vm.swipeStart,null);
 vm.goTo(3);swipe(90,0,false);assert.strictEqual(vm.step,2);assert.strictEqual(vm.personalIndex,0);assert(!vm.personalPaused);
 vm.clearPersonalTimer();vm.clearInputTimer();vm.clearDiscoveryTimer();
});

console.log('All welcome tutorial groups passed.');

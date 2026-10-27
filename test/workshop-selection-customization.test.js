const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};global.document={addEventListener(){},removeEventListener(){}};
const entries=new Map();global.localStorage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(sourceRoot))return original(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),expression=require('../src/model/WorkshopExpression');
const filename=path.resolve(sourceRoot,'components/Workshop.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const componentModule=new Module(filename,module);componentModule.filename=filename;componentModule.paths=Module._nodeModulePaths(path.dirname(filename));
componentModule._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},componentModule.exports.default,compiler.compileToFunctions(parsed.template.content));
definition.components=Object.assign({},definition.components,{WorkshopStaff:{props:['glissandos','tremolos']}});
function editor(){const view=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key})}));view.$i18n={locale:'de'};view.player={play(){},stopAll(){}};view.newPiece();return view;}
function note(id,startSlot=0,extra={}){return Object.assign({id,kind:'note',noteValue:'eighth',startSlot,pitch:{step:'F',alter:0,octave:4}},extra);}
function nodes(node){return [node].concat(...(node.children||(node.componentOptions&&node.componentOptions.children)||[]).map(nodes));}
function test(name,body){body();process.stdout.write('✓ workshop selection customization: '+name+'\n');}

test('every accidental and enclosure mode edits the group while independently preserving courtesy and editorial marks',()=>{
  const view=editor();view.currentBar.events=[note('a'),note('b',1)];view.multiSelect=true;view.restoreSelection(['a','b'],'a');
  view.toggleAccidentalFlag('cautionary');view.toggleAccidentalFlag('editorial');
  for(const alter of model.WORKSHOP_PITCH_ALTERS){
    view.chooseActiveAlter(alter);assert(view.selectedNotes.every(event=>event.pitch.alter===alter));
    for(const mode of ['parentheses','bracket','always','auto']){
      const before=JSON.stringify(view.selectedNotes.map(event=>event.pitch));view.changeAccidentalDisplay(mode);
      assert.strictEqual(view.selectionAccidentalDisplay,mode);assert.strictEqual(JSON.stringify(view.selectedNotes.map(event=>event.pitch)),before);
      assert(view.selectedNotes.every(event=>event.accidentalDisplay.cautionary && event.accidentalDisplay.editorial));
      assert(model.isValidWorkshopScore(view.draft.score));
    }
  }
  view.toggleAccidentalFlag('editorial');assert(view.hasAccidentalFlag('cautionary'));assert(!view.hasAccidentalFlag('editorial'));
  view.toggleAccidentalFlag('cautionary');assert(view.selectedNotes.every(event=>!event.accidentalDisplay));
  view.$destroy();
});

test('changing enclosure keeps imported independent flags and undo restores them exactly',()=>{
  const view=editor(),event=note('imported',0,{accidentalDisplay:{force:true,editorial:true}});view.currentBar.events=[event];view.selectEvent(event);
  view.changeAccidentalDisplay('parentheses');assert.deepStrictEqual(JSON.parse(JSON.stringify(view.selectedEvent.accidentalDisplay)),{force:true,editorial:true,enclosure:'parentheses'});
  view.changeAccidentalDisplay('always');assert.deepStrictEqual(JSON.parse(JSON.stringify(view.selectedEvent.accidentalDisplay)),{force:true,editorial:true});
  view.undo();assert.deepStrictEqual(JSON.parse(JSON.stringify(view.currentBar.events[0].accidentalDisplay)),{force:true,editorial:true,enclosure:'parentheses'});
  view.$destroy();
});

test('rest-attached pedals are visible, editable and removable without changing their timing',()=>{
  const view=editor(),rest={id:'pedal-rest',kind:'rest',pitch:null,startSlot:0,noteValue:'quarter',autoRest:false,pedal:'up'};
  view.currentBar.events=[rest];view.selectEvent(rest);assert.strictEqual(view.selectedPedal,'up');
  const select=nodes(view._render()).find(node=>node.tag==='select' && node.children && node.children.some(option=>option.data && option.data.attrs && option.data.attrs.value==='down'));
  assert(select && !select.data.attrs.disabled);select.data.on.change({target:{value:'down'}});assert.strictEqual(view.selectedEvent.pedal,'down');
  const start=view.selectedEvent.startSlot;view.setPedal('');assert.strictEqual(view.selectedEvent.pedal,undefined);assert.strictEqual(view.selectedEvent.startSlot,start);
  assert(model.isValidWorkshopScore(view.draft.score));view.$destroy();
});

test('fine and tuplet pickup lengths can be created and invalid input restores the current value',()=>{
  const view=editor();for(const units of [.03125,2/3,1.75]){assert(view.setPickupBeats({target:{value:String(units/2)}}));assert.strictEqual(view.draft.score.pickupUnits,units);assert(view.pickupChoices.includes(units));}
  const field={value:'.001'};assert.strictEqual(view.setPickupBeats({target:field}),false);assert.strictEqual(field.value,String(1.75/2));
  assert(view.setPickupBeats({target:{value:''}}));assert.strictEqual(view.draft.score.pickupUnits,undefined);view.$destroy();
});

test('independent staff key edits and extra clefs are reachable while the default still edits both keys',()=>{
  const view=editor();view.toggleSecondStaff();view.selectPart(0);view.currentBar.events=[note('key-note')];const before=JSON.stringify(view.currentBar.events);
  assert.strictEqual(view.keyStaffOnly,false);view.keyStaffOnly=true;assert(view.applyBarKey('G-major'));assert.deepStrictEqual(view.staffContexts.map(context=>context.keyId),['G-major','C-major']);
  view.selectPart(1);assert(view.applyBarKey('F-major'));assert.deepStrictEqual(view.staffContexts.map(context=>context.keyId),['G-major','F-major']);
  view.keyStaffOnly=false;assert(view.applyBarKey('D-major'));assert.deepStrictEqual(view.staffContexts.map(context=>context.keyId),['D-major','D-major']);
  view.selectPart(0);assert.strictEqual(JSON.stringify(view.currentBar.events),before);
  for(const clef of ['alto','tenor']){view.openContextPicker('clef',0);assert(view.clefs.includes(clef));assert(view.applyBarContext(clef));assert.strictEqual(view.currentContext.clef,clef);}
  view.keyStaffOnly=true;view.addBars();view.selectPart(1);assert(view.applyBarKey('A-major'));assert.deepStrictEqual(view.staffContexts.map(context=>context.keyId),['D-major','A-major']);
  view.resetEditor();assert(view.keyStaffOnly,'reopening independent bar profiles keeps their editing scope');view.$destroy();
});

test('mixed note/rest selection makes and removes a triplet with the selected events retained',()=>{
  const view=editor(),rest={id:'rest',kind:'rest',pitch:null,noteValue:'eighth',startSlot:1,autoRest:false};view.currentBar.events=[note('first'),rest,note('last',2)];
  view.multiSelect=true;view.restoreSelection(['first','rest','last'],'first');assert.strictEqual(view.selectedEvents.length,3);assert(view.canTripletSelection);
  view.chooseActiveAlter(1);assert.strictEqual(view.selectedEvents.length,3);assert.strictEqual(view.selectedEvents.find(event=>event.id==='rest').pitch,null);
  view.toggleArticulation('accent');assert.strictEqual(view.selectedEvents.length,3);assert(view.selectedNotes.every(event=>event.articulations.includes('accent')));
  view.connectTriplet();assert.strictEqual(view.selectedEvents.length,3);assert(view.selectedEvents.every(event=>event.tuplet===3));assert(model.isValidWorkshopScore(view.draft.score));
  view.unlinkTriplets();assert.strictEqual(view.selectedEvents.length,3);assert(view.selectedEvents.every(event=>!event.tuplet));view.$destroy();
});

test('guided glissando and slide selection cross a bar and cancel without changing a draft',()=>{
  for(const type of ['glissando','slide']){
    const view=editor();view.addBars();view.selectBar(0);view.currentBar.events=[note('from')];view.selectBar(1);view.currentBar.events=[note('to',0,{pitch:{step:'G',alter:0,octave:4}})];view.selectBar(0);view.selectEvent(view.currentBar.events[0]);
    const before=JSON.stringify(view.draft.score);assert(view.startGlissandoSelection(type));assert.strictEqual(view.connectionMessage('TARGET'),'WORKSHOP_GLISSANDO_TARGET');view.cancelTieSelection();assert.strictEqual(JSON.stringify(view.draft.score),before);
    assert(view.startGlissandoSelection(type));view.selectBar(1);assert.strictEqual(view.tieAnchorId,'from');view.selectEvent(view.currentBar.events[0]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft.score.glissandos)),[{fromId:'from',toId:'to',type}]);assert.strictEqual(view.tieAnchorId,null);assert(model.isValidWorkshopScore(view.draft.score));
    const staff=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');assert.strictEqual(staff.componentOptions.propsData.glissandos.length,1);
    view.undo();assert.strictEqual(view.draft.score.glissandos,undefined);view.$destroy();
  }
});

test('bar copying remaps two-note tremolo and slide edges without losing their type or stroke count',()=>{
  const view=editor();view.addBars();view.selectBar(0);view.currentBar.events=[note('a'),note('b',1,{pitch:{step:'G',alter:0,octave:4}})];
  view.draft.score=expression.connectWorkshopTremolo(view.draft.score,['a','b'],4);assert(view.draft.score);view.draft.score=expression.connectWorkshopGlissando(view.draft.score,['a','b'],'slide');
  view.copyTarget=1;view.copyBar();assert.strictEqual(view.notationError,null);assert.strictEqual(view.draft.score.tremolos.length,2);assert.strictEqual(view.draft.score.glissandos.length,2);
  assert(view.draft.score.tremolos.every(edge=>edge.marks===4));assert(view.draft.score.glissandos.every(edge=>edge.type==='slide'));
  assert(model.isValidWorkshopScore(view.draft.score));view.$destroy();
});
process.stdout.write('Workshop selection customization tests passed.\n');

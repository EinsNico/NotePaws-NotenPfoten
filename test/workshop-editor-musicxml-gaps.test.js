const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};global.document={addEventListener(){},removeEventListener(){}};
const localEntries=new Map();global.localStorage={getItem:key=>localEntries.has(key)?localEntries.get(key):null,setItem:(key,value)=>localEntries.set(key,String(value)),removeItem:key=>localEntries.delete(key)};
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(sourceRoot))return original(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const filename=path.resolve(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const model=require('../src/model/Workshop'),definition=component('Workshop'),contextDefinition=component('WorkshopContextControls'),strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
definition.components=Object.assign({},definition.components,{WorkshopContextControls:contextDefinition});
function editor(locale='de'){const view=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t(key,values={}){return Object.keys(values).reduce((s,name)=>s.replace('{'+name+'}',values[name]),(strings[locale]||strings.en)[key]||strings.en[key]||key);},$tc(key,count,values){return this.$t(key,values);}})}));view.$i18n={locale};view.player={play(){},stopAll(){}};view.newPiece();return view;}
function note(startSlot,alter=0,extra={}){return Object.assign({id:model.workshopId('note'),kind:'note',pitch:{step:'F',alter,octave:4},noteValue:'eighth',startSlot},extra);}
function select(view,events){view.currentBar.events=events;view.multiSelect=true;view.restoreSelection(events.map(event=>event.id),events[0].id);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function content(node){return (node.text||'')+(node.children||[]).map(content).join(' ');}
function test(name,body){body();process.stdout.write('✓ editor MusicXML gaps: '+name+'\n');}

test('courtesy selection supports mixed notes, affects only the selected set and has exact undo/redo',()=>{
 const view=editor(),a=note(0,0,{accidentalDisplay:{force:true,enclosure:'parentheses',cautionary:true}}),b=note(1,1),untouched=note(2,-1,{accidentalDisplay:{force:true,enclosure:'bracket',editorial:true}});
 select(view,[a,b,untouched]);view.restoreSelection([a.id,b.id],a.id);assert.strictEqual(view.selectionAccidentalDisplay,'mixed');const before=clone(view.draft.score),other=clone(untouched),pitches=clone(view.currentBar.events.map(event=>event.pitch));
 for(const mode of ['always','parentheses','bracket','auto']) {
   const previous=clone(view.draft.score);view.changeAccidentalDisplay(mode);assert.strictEqual(view.selectionAccidentalDisplay,mode);
   const after=clone(view.draft.score);assert.deepStrictEqual(clone(view.currentBar.events.map(event=>event.pitch)),pitches);
   assert.deepStrictEqual(clone(view.currentBar.events.find(event=>event.id===untouched.id)),other);
   for(const id of [a.id,b.id]) {
     const expected=mode==='auto' && id===b.id ? undefined:Object.assign({force:mode!=='auto'},id===a.id?{cautionary:true}:{},['parentheses','bracket'].includes(mode)?{enclosure:mode}:{});
     assert.deepStrictEqual(view.currentBar.events.find(event=>event.id===id).accidentalDisplay && clone(view.currentBar.events.find(event=>event.id===id).accidentalDisplay),expected);
   }
   view.undo();assert.deepStrictEqual(clone(view.draft.score),previous);view.redo();assert.deepStrictEqual(clone(view.draft.score),after);view.restoreSelection([a.id,b.id],a.id);
 }
 assert(model.isValidWorkshopScore(view.draft.score));assert.notDeepStrictEqual(clone(view.draft.score),before);view.$destroy();
});

test('quarter-tone editing and note tools preserve courtesy, expression and context data',()=>{
 const view=editor(),a=note(0,0,{accidentalDisplay:{force:true,enclosure:'bracket',editorial:true},fingering:2,articulations:['accent']}),b=note(1,0,{accidentalDisplay:{force:true}});
 view.draft.score=model.setWorkshopContextChange(view.draft.score,0,0,{startSlot:4,clef:'bass',keyId:'G-major'});select(view,[a,b]);const contexts=clone(view.currentBar.contextChanges),aDisplay=clone(a.accidentalDisplay),bDisplay=clone(b.accidentalDisplay);
 for(const alter of [-1.5,-.5,.5,1.5]) {
   view.changeSelectedAlter(alter);assert.strictEqual(view.placementError,null);assert(view.selectedNotes.every(event=>event.pitch.alter===alter));
   assert.deepStrictEqual(clone(view.currentBar.events.find(event=>event.id===a.id).accidentalDisplay),aDisplay);assert.deepStrictEqual(clone(view.currentBar.events.find(event=>event.id===b.id).accidentalDisplay),bDisplay);
   assert(view.eventLabel(view.currentBar.events.find(event=>event.id===a.id)).includes(Math.abs(alter)===.5?'¼':'¾'));assert(!view.alterLabel(alter).startsWith('WORKSHOP_'));
 }
 view.chooseToolValue('sixteenth');assert.deepStrictEqual(clone(view.currentBar.contextChanges),contexts);assert.deepStrictEqual(clone(view.currentBar.events.find(event=>event.id===a.id).accidentalDisplay),aDisplay);
 assert.deepStrictEqual(clone(view.currentBar.events.find(event=>event.id===a.id).articulations),['accent']);assert.strictEqual(view.currentBar.events.find(event=>event.id===a.id).fingering,2);
 view.chooseToolAlter(-.5);assert.strictEqual(view.followKeySignature,false);assert.strictEqual(view.hasSelection,false);assert.strictEqual(view.tool.alter,-.5);
 view.placeOnSheet({slot:2,pitch:{step:'G',alter:-.5,octave:4}});assert.strictEqual(view.placementError,null);assert.strictEqual(view.selectedNotes[0].pitch.alter,-.5);
 assert.deepStrictEqual(clone(view.currentBar.contextChanges),contexts);assert(model.isValidWorkshopScore(view.draft.score));view.$destroy();
});

test('copying a bar refreshes all context identities and keeps the following bar context and undo intact',()=>{
 const view=editor();view.addBarCount=4;view.addBars();view.selectBar(0);view.toggleSecondStaff();view.selectPart(0);
 view.draft.score=model.setWorkshopContextChange(view.draft.score,0,0,{startSlot:2,clef:'bass',keyId:'G-major'});
 view.draft.score=model.setWorkshopContextChange(view.draft.score,0,1,{startSlot:4,clef:'treble'});
 view.draft.score=model.setWorkshopContextChange(view.draft.score,2,0,{startSlot:6,clef:'treble',keyId:'F-major'});
 view.draft.score=model.setWorkshopMeasureContext(view.draft.score,3,{clef:'bass'});
 view.currentBar.events=[note(0,.5,{accidentalDisplay:{force:true,enclosure:'parentheses',cautionary:true}})];
 const before=clone(view.draft.score),nextContexts=view.draft.score.parts.map((part,index)=>model.workshopMeasureContext(view.draft.score,3,index));view.copyTarget=2;view.copyBar();assert.strictEqual(view.notationError,null);
 const after=clone(view.draft.score),allIds=[];
 view.draft.score.parts.forEach((part,index)=>{const source=part.measures[0],copy=part.measures[2];assert.strictEqual(copy.contextChanges.length,source.contextChanges.length);copy.contextChanges.forEach((entry,i)=>{const other=source.contextChanges[i];assert.notStrictEqual(entry.id,other.id);const lhs=clone(entry),rhs=clone(other);delete lhs.id;delete rhs.id;assert.deepStrictEqual(lhs,rhs);});assert.deepStrictEqual(model.workshopMeasureContext(view.draft.score,3,index),nextContexts[index]);part.measures.forEach(bar=>(bar.contextChanges||[]).forEach(entry=>allIds.push(entry.id)));});
 assert.strictEqual(new Set(allIds).size,allIds.length);assert.deepStrictEqual(clone(view.draft.score.parts[0].measures[2].events[0].accidentalDisplay),clone(view.draft.score.parts[0].measures[0].events[0].accidentalDisplay));
 assert(model.isValidWorkshopScore(view.draft.score));view.undo();assert.deepStrictEqual(clone(view.draft.score),before);view.redo();assert.deepStrictEqual(clone(view.draft.score),after);view.$destroy();
});

test('context controls are wired into parent history and show new editor labels in both languages',()=>{
 for(const locale of ['de','en']) {const view=editor(locale);view.addBarCount=1;view.addBars();view.selectBar(0);
 const control=new Vue(Object.assign({},contextDefinition,{propsData:{score:view.draft.score,barIndex:0,partIndex:0,selectedEvents:[],noteNaming:view.noteNaming},methods:Object.assign({},contextDefinition.methods,{$t:view.$t.bind(view)})}));
 control.$on('change',score=>{view.commitAdvancedNotation(score);control.score=view.draft.score;});const before=clone(view.draft.score);control.startBeat=2;control.keyId='D-major';control.clef='bass';assert(control.saveChange());const after=clone(view.draft.score);assert.notDeepStrictEqual(after,before);view.undo();assert.deepStrictEqual(clone(view.draft.score),before);view.redo();assert.deepStrictEqual(clone(view.draft.score),after);
 const rendered=nodes(view._render()),child=rendered.find(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopContextControls');assert(child);assert.strictEqual(child.componentOptions.propsData.score,view.draft.score);assert(child.componentOptions.listeners.change);
 select(view,[note(0)]);assert(!content(view._render()).includes('WORKSHOP_ACCIDENTAL_'));assert(!content(view._render()).includes('WORKSHOP_QUARTERTONE_'));control.$destroy();view.$destroy();}
});

test('accidental annotation validation rejects malformed flags, rests and unknown fields before saving',()=>{
 const valid={force:true,enclosure:'parentheses',cautionary:true};
 for(const display of [{force:"false"},{force:true,enclosure:'square'},{force:true,cautionary:'yes'},{force:true,editorial:1},{force:true,unknown:true},null,[]]) {
  const score=model.createWorkshopDraft().score;score.parts[0].measures[0].events=[note(0,0,{accidentalDisplay:display})];assert(!model.isValidWorkshopScore(score),JSON.stringify(display));
 }
 for(const alter of [-2,-1.5,-1,-.5,0,.5,1,1.5,2]) {const score=model.createWorkshopDraft().score;score.parts[0].measures[0].events=[note(0,alter,{accidentalDisplay:valid})];assert(model.isValidWorkshopScore(score),String(alter));}
 const score=model.createWorkshopDraft().score;score.parts[0].measures[0].events=[{id:'bad-rest',kind:'rest',pitch:null,noteValue:'eighth',startSlot:0,accidentalDisplay:valid}];assert(!model.isValidWorkshopScore(score));
});

test('staff enablement and valid meter or pickup changes keep annotations; truncating a context boundary rejects atomically',()=>{
 let score=model.setWorkshopContextChange(model.createWorkshopDraft('Resize',2).score,0,0,{startSlot:1,clef:'bass',keyId:'G-major'});
 score.parts[0].measures[0].events=[note(0,.5,{accidentalDisplay:{force:true}})];const before=clone(score),changes=clone(score.parts[0].measures[0].contextChanges);
 const resized=model.setWorkshopMeasureContext(score,0,{meter:'3/4'}),pickup=model.setWorkshopPickup(score,2);assert(resized&&pickup);
 for(const next of [resized,pickup,model.setWorkshopSecondStaffEnabled(score,true)]) {assert.deepStrictEqual(next.parts[0].measures[0].contextChanges,changes);assert.deepStrictEqual(next.parts[0].measures[0].events,score.parts[0].measures[0].events);}
 const two=model.setWorkshopSecondStaffEnabled(score,true),bottom=clone(two.parts[1].measures);const hidden=model.setWorkshopSecondStaffEnabled(two,false),shown=model.setWorkshopSecondStaffEnabled(hidden,true);assert.deepStrictEqual(shown.parts[1].measures,bottom);
 assert.strictEqual(model.setWorkshopPickup(score,1),null);assert.deepStrictEqual(score,before);
});

const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(sourceRoot))return original(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
const model=require('../src/model/Workshop');
const strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
const filename=path.resolve(sourceRoot,'components/WorkshopContextControls.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const moduleForComponent=new Module(filename,module);moduleForComponent.filename=filename;moduleForComponent.paths=Module._nodeModulePaths(path.dirname(filename));
moduleForComponent._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const component=Object.assign({},moduleForComponent.exports.default,compiler.compileToFunctions(parsed.template.content));
function fixture(score=model.createWorkshopDraft('Changes',2).score,props={},locale='de') {
 const commits=[];const view=new Vue(Object.assign({},component,{propsData:Object.assign({score,noteNaming:locale==='de'?'german':'international'},props),methods:Object.assign({},component.methods,{$t(key,values={}) {return Object.keys(values).reduce((text,name)=>text.replace('{'+name+'}',values[name]),(strings[locale]||strings.en)[key]||strings.en[key]||key);}})}));
 view.$refs.panel={open:false};view.$on('change',next=>{commits.push(next);view.score=next;});return {view,commits,destroy(){view.$destroy();}};
}
function test(name,body){body();process.stdout.write('✓ in-bar context controls: '+name+'\n');}
function content(node){return (node.text||'')+(node.children||[]).map(content).join(' ');}
function note(startSlot){return {id:'note',kind:'note',noteValue:'eighth',startSlot,pitch:{step:'F',alter:1,octave:4}};}

test('creating a combined change follows denominator beats and persists across both piano staves',()=>{
 let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Changes',2).score,true);score=model.setWorkshopMeasureContext(score,0,{meter:'6/8'});
 score.parts[0].measures[0].events=[note(2)];const before=JSON.stringify(score.parts[0].measures[0].events),f=fixture(score,{selectedEvents:[note(2)]});
 assert.strictEqual(f.view.startBeat,3);f.view.clef='bass';f.view.keyId='G-major';assert(f.view.canSave);assert(f.view.saveChange());assert.strictEqual(f.commits.length,1);
 const entry=f.view.measure.contextChanges[0];assert.strictEqual(entry.startSlot,2);assert.strictEqual(entry.clef,'bass');assert.strictEqual(entry.keyId,'G-major');
 assert.strictEqual(model.workshopMeasureContext(f.view.score,1).keyId,'G-major');assert.strictEqual(f.view.score.parts[1].measures[0].contextChanges[0].keyId,'G-major');
 assert.strictEqual(JSON.stringify(f.view.measure.events),before);assert.strictEqual(f.view.editingId,null);f.destroy();
});

test('existing changes open from the staff, retain their IDs and can remove just one field',()=>{
 let score=model.setWorkshopContextChange(model.createWorkshopDraft('Changes',2).score,0,0,{startSlot:2,clef:'bass',keyId:'F-major'});
 const id=score.parts[0].measures[0].contextChanges[0].id,f=fixture(score);assert(f.view.editChange(id));assert.strictEqual(f.view.$refs.panel.open,true);
 assert.strictEqual(f.view.startBeat,2);f.view.startBeat=3;f.view.keyId='';assert(f.view.saveChange());
 let entry=f.view.measure.contextChanges[0];assert.strictEqual(entry.id,id);assert.strictEqual(entry.startSlot,4);assert.strictEqual(entry.clef,'bass');assert.strictEqual(entry.keyId,undefined);
 f.view.editChange(id);f.view.clef='treble';f.view.cancelEditing();assert.strictEqual(f.commits.length,1);assert.strictEqual(f.view.measure.contextChanges[0].clef,'bass');
 assert(f.view.removeChange(id));assert.strictEqual(f.view.measure.contextChanges,undefined);assert.strictEqual(f.commits.length,2);f.destroy();
});

test('empty, out-of-bar and occupied moved positions cannot silently overwrite another change',()=>{
 let score=model.setWorkshopContextChange(model.createWorkshopDraft('Changes').score,0,0,{startSlot:2,clef:'bass'});
 score=model.setWorkshopContextChange(score,0,0,{startSlot:4,keyId:'F-major'});const f=fixture(score),before=JSON.stringify(f.view.score);
 assert.strictEqual(f.view.canSave,false);assert.strictEqual(f.view.saveChange(),false);
 f.view.clef='treble';for(const beat of [1,0,5,6,NaN]) {f.view.startBeat=beat;assert.strictEqual(f.view.canSave,false);assert.strictEqual(f.view.saveChange(),false);}
 f.view.editChange(f.view.changes[0].id);f.view.startBeat=3;assert.strictEqual(f.view.saveChange(),false);assert(f.view.error);
 assert.strictEqual(f.commits.length,0);assert.strictEqual(JSON.stringify(f.view.score),before);f.destroy();
});

test('changing the selected bar or undo state invalidates a stale edit before Vue watchers run',()=>{
 const score=model.setWorkshopContextChange(model.createWorkshopDraft('Changes',2).score,0,0,{startSlot:2,clef:'bass'}),id=score.parts[0].measures[0].contextChanges[0].id;
 const f=fixture(score);f.view.editChange(id);f.view.barIndex=1;f.view.keyId='F-major';assert.strictEqual(f.view.saveChange(),false);assert.strictEqual(f.commits.length,0);assert.strictEqual(f.view.editingId,null);
 f.view.barIndex=0;f.view.editChange(id);f.view.score=model.setWorkshopContextChange(score,0,0,{id,startSlot:3,clef:'treble'});f.view.keyId='D-major';assert.strictEqual(f.view.saveChange(),false);assert.strictEqual(f.commits.length,0);
 assert.strictEqual(f.view.measure.contextChanges[0].startSlot,3);f.destroy();
});

test('selection defaults and small pickup limits choose a real interior position',()=>{
 const normal=fixture(undefined,{selectedEvents:[note(0),note(6),note(2)]});assert.strictEqual(normal.view.startBeat,2);normal.destroy();
 const score=model.createWorkshopDraft('Pickup').score;score.pickupUnits=.125;const f=fixture(score);const slot=(f.view.startBeat-1)*f.view.beatUnits;
 assert(slot>0 && slot<score.pickupUnits);f.view.keyId='G-major';assert(f.view.canSave);assert(f.view.saveChange());assert.strictEqual(f.view.measure.contextChanges[0].startSlot,slot);f.destroy();
});

test('extra clefs and scoped key changes can be added, moved and removed independently',()=>{
 let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Independent',2).score,true);
 const f=fixture(score,{partIndex:1,partOnly:true});assert(f.view.clefs.includes('alto') && f.view.clefs.includes('tenor'));
 f.view.clef='alto';f.view.keyId='F-major';assert(f.view.saveChange());
 assert.strictEqual(f.view.score.parts[0].measures[0].contextChanges,undefined);
 assert.strictEqual(model.workshopMeasureContext(f.view.score,1,0).keyId,'C-major');assert.strictEqual(model.workshopMeasureContext(f.view.score,1,1).keyId,'F-major');
 const id=f.view.changes[0].id;f.view.editChange(id);f.view.clef='tenor';f.view.startBeat=3;assert(f.view.saveChange());
 assert.strictEqual(f.view.changes[0].clef,'tenor');assert.strictEqual(f.view.changes[0].startSlot,4);
 assert(f.view.removeChange(id));assert.strictEqual(f.view.score.parts[0].measures[0].contextChanges,undefined);assert.strictEqual(f.view.measure.contextChanges,undefined);
 assert(model.isValidWorkshopScore(f.view.score));f.destroy();
});

test('German, English and fallback views translate all controls and key names',()=>{
 for(const locale of ['de','en','fr']) {
   let score=model.setWorkshopContextChange(model.createWorkshopDraft().score,0,0,{startSlot:2,clef:'bass',keyId:'B-major'});const f=fixture(score,{},locale);
   const rendered=content(f.view._render());assert(!rendered.includes('WORKSHOP_'),rendered);assert(!rendered.includes('FLOW_'),rendered);
   assert(rendered.includes(locale==='de' ? 'Schlüssel- und Tonartwechsel im Takt' : 'Clef and key changes within the bar'));
   assert(f.view.keyLabel('B-major').startsWith(locale==='de'?'H ':'B '));assert.strictEqual(f.view.keys.length,30);f.destroy();
 }
});

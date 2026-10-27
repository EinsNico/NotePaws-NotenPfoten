const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
global.document={activeElement:null,addEventListener(){},removeEventListener(){}};
const stored=new Map();
global.localStorage={getItem:key=>stored.has(key)?stored.get(key):null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,oldJs=Module._extensions['.js'],oldVue=Module._extensions['.vue'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : oldJs(mod,filename);
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),store=require('../src/model/WorkshopStorage');
const strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
const filename=sourceRoot+'components/Workshop.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));
loaded._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},loaded.exports.default,compiler.compileToFunctions(parsed.template.content));
Module._extensions['.js']=oldJs;if(oldVue)Module._extensions['.vue']=oldVue;else delete Module._extensions['.vue'];
function view(locale='de'){
  stored.clear();document.activeElement=null;
  const instance=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{$t(key,values={}){return Object.keys(values).reduce((text,name)=>text.replace('{'+name+'}',values[name]),strings[locale][key]||key);},$tc(key,count,values){return this.$t(key,values);}})}));
  instance.$i18n={locale};instance.player={played:[],play(value){this.played.push(value);},stopAll(){}};instance.newPiece();return instance;
}
function nodes(node){return[node].concat(...(node.children||[]).map(nodes));}

const cases=[];function test(name,body){cases.push({name,body});}
function pitched(id,step='C',octave=6,startSlot=0){return {id,kind:'note',noteValue:'quarter',startSlot,pitch:{step,octave,alter:0}};}
function boundary(){const v=view();v.currentBar.transpose={chromatic:24};v.currentBar.events=[pitched('upper')];assert(model.isValidWorkshopScore(v.draft.score));v.selectEvent(v.currentBar.events[0]);return v;}
for(const method of ['accidental','place','move','groupMove','groupAccidental'])test('C1 rejects '+method+' before changing draft, history or audio and can still save',()=>{
 const v=boundary(),draft=JSON.stringify(v.draft),history=JSON.stringify([v.undoStack,v.redoStack]);
 if(method==='accidental')v.chooseActiveAlter(1);
 if(method==='place'){v.clearSelection();v.placeOnSheet({slot:2,pitch:{step:'D',octave:6,alter:0}});}
 if(method==='move')v.moveSheetNote({id:'upper',pitch:{step:'D',octave:6,alter:0},slot:0});
 if(method==='groupMove'){v.multiSelect=true;v.restoreSelection(['upper'],'upper');v.moveSheetNotes({ids:['upper'],anchorId:'upper',pitch:{step:'D',octave:6,alter:0},slot:0});}
 if(method==='groupAccidental'){v.multiSelect=true;v.restoreSelection(['upper'],'upper');v.chooseActiveAlter(1);}
 assert.strictEqual(JSON.stringify(v.draft),draft);assert.strictEqual(JSON.stringify([v.undoStack,v.redoStack]),history);
 assert.strictEqual(v.placementError,'WORKSHOP_SOUNDING_PITCH_BLOCKED');assert.strictEqual(v.player.played.length,0);
 assert(model.isValidWorkshopScore(v.draft.score));assert(v.savePiece());v.$destroy();
});
test('C1 lower sounding boundary is protected and a subsequent valid pitch clears feedback',()=>{
 const v=view();v.currentBar.transpose={chromatic:-12};v.currentBar.events=[pitched('lower','A',1)];v.selectEvent(v.currentBar.events[0]);
 const before=JSON.stringify(v.draft);v.chooseActiveAlter(-1);assert.strictEqual(JSON.stringify(v.draft),before);
 assert.strictEqual(v.placementError,'WORKSHOP_SOUNDING_PITCH_BLOCKED');v.chooseActiveAlter(1);
 assert.strictEqual(v.currentBar.events.find(e=>e.id==='lower').pitch.alter,1);assert.strictEqual(v.placementError,null);assert(v.savePiece());
 v.undo();assert.strictEqual(v.currentBar.events.find(e=>e.id==='lower').pitch.alter,0);v.$destroy();
});
test('C1 moving a note across a mid-bar transpose boundary is atomic',()=>{
 const v=view();v.currentBar.events=[pitched('cross')];v.currentBar.contextChanges=[{id:'transposition',startSlot:4,transpose:{chromatic:24}}];
 v.currentBar.events[0].pitch.step='D';v.selectEvent(v.currentBar.events[0]);assert(model.isValidWorkshopScore(v.draft.score));
 const before=JSON.stringify(v.draft);v.moveSheetNote({id:'cross',pitch:{step:'D',octave:6,alter:0},slot:4});
 assert.strictEqual(JSON.stringify(v.draft),before);assert.strictEqual(v.placementError,'WORKSHOP_SOUNDING_PITCH_BLOCKED');v.$destroy();
});
test('C4 rejected group length then accepted correction removes error and remains undoable',()=>{
 const v=view();v.currentBar.events=[pitched('a','C',4,0),pitched('b','E',4,6)];v.multiSelect=true;v.restoreSelection(['a','b'],'a');
 const before=JSON.stringify(v.draft);v.chooseToolValue('whole');assert.strictEqual(JSON.stringify(v.draft),before);
 assert.strictEqual(v.placementError,'WORKSHOP_PLACEMENT_BLOCKED');assert.strictEqual(v.undoStack.length,0);
 v.chooseToolValue('eighth');assert.strictEqual(v.placementError,null);assert(v.selectedEvents.every(e=>e.noteValue==='eighth'));
 assert.strictEqual(v.selectedEvents.length,2);assert(model.isValidWorkshopScore(v.draft.score));
 v.undo();assert.strictEqual(JSON.stringify(v.draft),before);v.redo();assert(v.currentBar.events.filter(e=>['a','b'].includes(e.id)).every(e=>e.noteValue==='eighth'));v.$destroy();
});
test('C4 successful group accidental also clears a prior placement error',()=>{
 const v=view();v.currentBar.events=[pitched('a','C',4,0),pitched('b','E',4,2)];v.multiSelect=true;v.restoreSelection(['a','b'],'a');v.placementError='WORKSHOP_PLACEMENT_BLOCKED';
 v.chooseActiveAlter(1);assert.strictEqual(v.placementError,null);assert(v.selectedNotes.every(e=>e.pitch.alter===1));assert.strictEqual(v.selectedNotes.length,2);v.$destroy();
});

for(const locale of ['de','en'])test('U1 skipped notes are counted in visible '+locale+' import notice; valid follow-up recovers',async()=>{
 const v=view(locale);v.closeEditor();const audit=path.resolve(__dirname,'../docs/audits/editor-chaos-2026-10-07/fixtures');
 assert(await v.loadMusicXml({data:fs.readFileSync(path.join(audit,'omit-pitch-step.musicxml'),'utf8'),filename:'omit-pitch-step.musicxml'}));
 assert.deepStrictEqual(JSON.parse(JSON.stringify(v.importNoteCounts)),{source:1,imported:0,skipped:1});
 const notice=nodes(v._render()).find(node=>node.data&&node.data.staticClass==='import-note-count');assert(notice);
 const rendered=nodes(notice).map(node=>node.text||'').join('');assert(rendered.includes(locale==='de'?'0 von 1 Noten übernommen':'Imported 0 of 1 notes'));
 assert.strictEqual(stored.size,0);v.closeImportNotice();v.closeEditor();
 assert(await v.loadMusicXml({data:fs.readFileSync(path.join(audit,'stale-rename.musicxml'),'utf8'),filename:'valid-followup.musicxml'}));
 assert(v.importNoteCounts.source>0);assert.strictEqual(v.importNoteCounts.skipped,0);
 assert(!nodes(v._render()).some(node=>node.data&&node.data.staticClass==='import-note-count'));v.$destroy();
});
test('U1 deliberately empty score is accepted without a loss warning',async()=>{
 const v=view();v.closeEditor();const xml=fs.readFileSync(path.resolve(__dirname,'../docs/audits/editor-chaos-2026-10-07/fixtures/omit-pitch-step.musicxml'),'utf8').replace(/<note>[\s\S]*?<\/note>/g,'');
 assert(await v.loadMusicXml({data:xml,filename:'intentional-empty.musicxml'}));assert.deepStrictEqual(JSON.parse(JSON.stringify(v.importNoteCounts)),{source:0,imported:0,skipped:0});
 assert(!nodes(v._render()).some(node=>node.data&&node.data.staticClass==='import-note-count'));assert(model.isValidWorkshopScore(v.draft.score));assert(v.savePiece());v.$destroy();
});

test('validated event edit keeps a focused pending tempo/title and their undo steps',()=>{
 const v=view();v.draft.score.metadata={title:v.draft.title};v.beginTitleEdit();v.draft.title='Pending title';v.tempoInput='90';v.placeOnSheet({slot:0,pitch:{step:'C',octave:4,alter:0}});
 assert.strictEqual(v.draft.score.bpm,90);assert.strictEqual(v.draft.title,'Pending title');assert.strictEqual(v.draft.score.metadata.title,'Pending title');assert.strictEqual(v.tempoInput,null);
 assert(v.currentBar.events.some(e=>e.kind==='note'));v.undo();assert.strictEqual(v.draft.score.bpm,90);assert(!v.currentBar.events.some(e=>e.kind==='note'));
 assert(v.savePiece());v.$destroy();
});
test('validated advanced notation keeps pending document fields',()=>{
 const v=view();v.draft.score.metadata={title:v.draft.title};v.beginTitleEdit();v.draft.title='Pending title';v.tempoInput='90';const candidate=model.cloneWorkshop(v.draft.score);candidate.metadata.composer='New composer';
 assert(v.commitAdvancedNotation(candidate));assert.strictEqual(v.draft.score.bpm,90);assert.strictEqual(v.draft.score.metadata.title,'Pending title');assert.strictEqual(v.draft.score.metadata.composer,'New composer');v.$destroy();
});
test('document layout edits preserve composer-only metadata without creating an undefined title',()=>{
 const v=view();
 assert(v.commitAdvancedNotation(model.setWorkshopMetadata(v.draft.score,{composer:'Nico & Freunde'})));
 for(const layout of [{staffDistance:80},{staffDistance:80,barsPerSystem:2}]){
  assert(v.commitAdvancedNotation(model.setWorkshopLayout(v.draft.score,layout)));
  assert.strictEqual(v.draft.score.metadata.composer,'Nico & Freunde');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(v.draft.score.metadata,'title'),false);
  assert(model.isValidWorkshopScore(v.draft.score));
 }
 assert(v.savePiece());const saved=store.readWorkshopLibrary().pieces[0].revisions[0].score;
 assert.strictEqual(Object.prototype.hasOwnProperty.call(saved.metadata,'title'),false);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(saved.layout)),{staffDistance:80,barsPerSystem:2});v.$destroy();
});
(async()=>{for(const c of cases){await c.body();console.log('✓ workshop chaos entry UI: '+c.name);}console.log('Workshop chaos entry UI tests passed ('+cases.length+').');})().catch(e=>{console.error(e);process.exitCode=1;});

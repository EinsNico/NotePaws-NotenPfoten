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
  instance.$i18n={locale};instance.player={stopAll(){}};instance.newPiece();return instance;
}
function nodes(node){return[node].concat(...(node.children||[]).map(nodes));}
function fakeButton(name){return{name,focus(){document.activeElement=this;}};}
function immediateTicks(instance){instance.$nextTick=callback=>{if(callback)callback();return Promise.resolve();};}
const cases=[];function test(name,body){cases.push({name,body});}

test('a focused tempo edit is immediately unsaved, committed by save, and undoable without duplicating the piece',()=>{
  for(const locale of ['de','en']){
    const instance=view(locale);assert(instance.savePiece());const identity=instance.draft.pieceId;
    const input=nodes(instance._render()).find(node=>node.tag==='input'&&node.data.attrs&&node.data.attrs.min==='25');assert(input);
    input.data.on.input({target:{value:'90'}});
    assert.strictEqual(instance.dirty,true);assert.strictEqual(instance.savedNotice,false);assert.strictEqual(instance.draft.score.bpm,60);
    assert(instance.savePiece());assert.strictEqual(instance.currentPiece.revisions.at(-1).score.bpm,90);assert.strictEqual(instance.dirty,false);
    instance.undo();assert.strictEqual(instance.draft.score.bpm,60);assert.strictEqual(instance.dirty,true);assert.strictEqual(instance.draft.pieceId,identity);
    instance.redo();assert.strictEqual(instance.draft.score.bpm,90);assert.strictEqual(instance.dirty,false);
    instance.undo();assert(instance.savePiece());assert.strictEqual(instance.library.pieces.length,1);assert.strictEqual(instance.draft.pieceId,identity);
    input.data.on.input({target:{value:'110'}});assert(instance.handleBack());assert.strictEqual(instance.confirmExit,true);assert.strictEqual(instance.draft.score.bpm,110);
    instance.$destroy();
  }
});

test('exit confirmation focuses Continue, keeps Tab and Shift-Tab inside, blocks the background and restores its trigger',()=>{
  const instance=view();immediateTicks(instance);
  const trigger=fakeButton('back');trigger.focus();instance.$refs.editorBack=trigger;
  for(const name of ['exitSave','exitDiscard','exitContinue'])instance.$refs[name]=fakeButton(name);
  instance.requestExit();assert.strictEqual(document.activeElement,instance.$refs.exitContinue);
  const shell=nodes(instance._render()).find(node=>node.data&&node.data.staticClass==='shell');assert.strictEqual(shell.data.attrs.inert,'');assert.strictEqual(shell.data.attrs['aria-hidden'],'true');
  instance.trapDecisionFocus({shiftKey:false},'exit');assert.strictEqual(document.activeElement,instance.$refs.exitSave);
  instance.trapDecisionFocus({shiftKey:true},'exit');assert.strictEqual(document.activeElement,instance.$refs.exitContinue);
  instance.trapDecisionFocus({shiftKey:true},'exit');assert.strictEqual(document.activeElement,instance.$refs.exitDiscard);
  instance.$refs.exitSave.focus();const original=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota');};
  assert.strictEqual(instance.saveAndClose(),undefined);assert(instance.confirmExit);assert(instance.draft);assert.strictEqual(instance.saveError,'WORKSHOP_SAVE_ERROR');assert.strictEqual(document.activeElement,instance.$refs.exitSave);
  localStorage.setItem=original;instance.cancelExit();assert.strictEqual(instance.confirmExit,false);assert.strictEqual(document.activeElement,trigger);
  instance.$destroy();
});

test('a 65th saved score gives a specific actionable error; explicit revision deletion frees one slot and keeps unsaved edits',()=>{
  for(const locale of ['de','en']){
    const instance=view(locale);immediateTicks(instance);assert(instance.savePiece());
    for(let index=1;index<64;index++){instance.setTempo({target:{value:String(60+index)}});assert(instance.savePiece());}
    const current=instance.currentPiece.currentRevisionId,older=instance.currentPiece.revisions[0].id;
    instance.setTempo({target:{value:'200'}});const before=JSON.stringify(instance.draft),history=JSON.stringify(instance.undoStack);
    assert.strictEqual(instance.savePiece(),false);assert.strictEqual(instance.saveError,'WORKSHOP_REVISION_LIMIT');assert.strictEqual(instance.currentPiece.revisions.length,64);
    assert(!instance.$t(instance.saveError).includes('WORKSHOP_'));
    instance.toggleRevisionSelection(current,true);assert.strictEqual(instance.revisionSelection.length,0);
    instance.toggleRevisionSelection(older,true);instance.$refs.revisionCancel=fakeButton('cancel');instance.$refs.revisionConfirm=fakeButton('confirm');
    assert(instance.requestRevisionDeletion());assert.strictEqual(document.activeElement,instance.$refs.revisionCancel);
    assert.strictEqual(instance.currentPiece.revisions.length,64,'requesting deletion must not write');
    instance.cancelRevisionDeletion();assert.strictEqual(instance.currentPiece.revisions.length,64,'cancelling deletion must not write');
    assert(instance.requestRevisionDeletion());assert(instance.confirmRevisionDeletion());
    assert.strictEqual(instance.currentPiece.revisions.length,63);assert.strictEqual(instance.currentPiece.currentRevisionId,current);
    assert.strictEqual(JSON.stringify(instance.draft),before);assert.strictEqual(JSON.stringify(instance.undoStack),history);
    assert(instance.savePiece());assert.strictEqual(instance.currentPiece.revisions.length,64);assert.strictEqual(instance.draft.score.bpm,200);
    assert.strictEqual(instance.library.pieces.length,1);instance.$destroy();
  }
});

test('revision deletion failure preserves the selection, draft, stored versions and ability to retry',()=>{
  const instance=view();immediateTicks(instance);assert(instance.savePiece());instance.setTempo({target:{value:'90'}});assert(instance.savePiece());
  const old=instance.currentPiece.revisions[0].id;instance.setTempo({target:{value:'100'}});
  instance.toggleRevisionSelection(old,true);assert(instance.requestRevisionDeletion());
  const original=localStorage.setItem,before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),draft=JSON.stringify(instance.draft);
  localStorage.setItem=()=>{throw new Error('quota');};assert.strictEqual(instance.confirmRevisionDeletion(),false);localStorage.setItem=original;
  assert.strictEqual(instance.revisionDeleteError,'WORKSHOP_REVISIONS_DELETE_ERROR');assert.deepStrictEqual(Array.from(instance.revisionDeleteIds),[old]);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);assert.strictEqual(JSON.stringify(instance.draft),draft);
  assert(instance.confirmRevisionDeletion());assert.strictEqual(instance.currentPiece.revisions.length,1);assert.strictEqual(JSON.stringify(instance.draft),draft);
  instance.$destroy();
});

test('deleting the opened older version preserves its edits and keeps the remaining saved version reachable',()=>{
  for(const locale of ['de','en']){
    const instance=view(locale);immediateTicks(instance);assert(instance.savePiece());
    const older=instance.currentPiece.currentRevisionId;instance.setTempo({target:{value:'90'}});assert(instance.savePiece());
    const current=instance.currentPiece.currentRevisionId;instance.chooseRevision(older);instance.setTempo({target:{value:'70'}});
    const edited=JSON.stringify(instance.draft.score),historySize=instance.undoStack.length;
    instance.toggleRevisionSelection(older,true);assert(instance.requestRevisionDeletion());assert(instance.confirmRevisionDeletion());
    assert.strictEqual(instance.selectedRevisionId,null);assert.strictEqual(JSON.stringify(instance.draft.score),edited);assert.strictEqual(instance.undoStack.length,historySize);
    const selector=nodes(instance._render()).find(node=>node.tag==='label'&&node.data&&node.data.staticClass==='revision-select');assert(selector);
    const select=nodes(selector).find(node=>node.tag==='select');assert(select);assert.strictEqual(instance.revisionChoice,'');
    assert(nodes(select).some(node=>node.tag==='option'&&node.data.attrs&&Object.prototype.hasOwnProperty.call(node.data.attrs,'disabled')&&node.children.some(child=>child.text===strings[locale].WORKSHOP_REVISION_EDITED)));
    select.data.on.change({target:{options:[{value:current,selected:true}]}});assert.strictEqual(instance.selectedRevisionId,current);assert.strictEqual(instance.draft.score.bpm,90);
    instance.undo();assert.strictEqual(instance.selectedRevisionId,null);assert.strictEqual(JSON.stringify(instance.draft.score),edited);
    instance.redo();assert.strictEqual(instance.selectedRevisionId,current);assert.strictEqual(instance.draft.score.bpm,90);
    assert(instance.savePiece());assert.strictEqual(instance.library.pieces.length,1);assert.strictEqual(instance.currentPiece.revisions.length,1);
    instance.$destroy();
  }
});

(async()=>{for(const item of cases){await item.body();console.log('✓ '+item.name);}console.log(cases.length+' workshop audit UI checks passed.');})().catch(error=>{console.error(error);process.exitCode=1;});

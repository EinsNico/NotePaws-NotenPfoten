const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const values=new Map();
global.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
global.window={addEventListener(){},removeEventListener(){},scrollTo(){}};
global.document={addEventListener(){},removeEventListener(){}};
const root=path.resolve(__dirname,'../src')+path.sep,oldJs=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(root))return oldJs(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const filename=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
function view(name,props){const definition=component(name);return new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key}),computed:Object.assign({},definition.computed,{noteNaming:()=> 'german'})}));}
const model=require(root+'model/Workshop'),store=require(root+'model/WorkshopStorage');
const de=require(root+'resources/de').default,en=require(root+'resources/en').default;
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function test(name,body){return Promise.resolve(body()).then(()=>process.stdout.write('✓ '+name+'\n'));}
(async()=>{
 await test('preinstalled piece behaves like a normal editable, renamable and deletable library piece',async()=>{
  const title='La Candeur (Tenderness), Op. 100 Nr. 1';
  const existing=store.storeWorkshopDraft(model.createWorkshopDraft(title)).piece;
  const workshop=view('Workshop');assert(await workshop.initializeLibrary());
  let library=store.readWorkshopLibrary();assert.strictEqual(library.pieces.length,2);
  assert.deepStrictEqual(library.pieces.find(piece=>piece.id===existing.id),existing);
  let saved=library.pieces.find(piece=>piece.id!==existing.id);assert(saved);
  workshop.pieces.forEach(piece=>workshop.togglePieceExpanded(piece));
  const rendered=nodes(workshop._render());
  assert(!rendered.some(node=>node.data&&node.data.staticClass==='card library demo-library'));
  assert.strictEqual(rendered.filter(node=>node.tag==='button'&&node.data.staticClass==='delete-piece').length,2);
  assert.strictEqual(rendered.filter(node=>node.tag==='button'&&node.data.staticClass==='piece-preview').length,2);
  workshop.openPieceDetails(saved);assert.strictEqual(workshop.pieceDetailsDraft.pieceId,saved.id);
  assert.strictEqual(workshop.pieceDetailsDraft.score.metadata.sources.length,3);
  const details=view('WorkshopPieceDetails',{draft:workshop.pieceDetailsDraft});let edited;
  details.$on('save',value=>{edited=value;assert(workshop.savePieceDetails(value));});
  details.title='My edited piece';details.credits.composer='Edited composer';details.save();assert(edited);details.$destroy();
  library=store.readWorkshopLibrary();saved=library.pieces.find(piece=>piece.id===saved.id);
  workshop.openPieceDetails(saved);assert.strictEqual(workshop.pieceDetailsDraft.title,edited.title);
  assert.strictEqual(workshop.pieceDetailsDraft.score.metadata.composer,'Edited composer');
  assert.strictEqual(workshop.pieceDetailsDraft.score.metadata.license,'Public Domain (gemeinfrei laut Mutopia Project)');
  assert.strictEqual(workshop.pieceDetailsDraft.score.metadata.sources.length,3);workshop.closePieceDetails();
  workshop.openPiece(saved);assert.strictEqual(workshop.draft.pieceId,saved.id);assert(workshop.hasNotes);
  workshop.beginTitleEdit();workshop.draft.title='Another name';workshop.commitTitleEdit();
  assert.strictEqual(workshop.draft.score.metadata.title,'Another name');
  workshop.undo();assert.strictEqual(workshop.draft.score.metadata.title,edited.title);
  workshop.redo();assert.strictEqual(workshop.draft.score.metadata.title,'Another name');
  workshop.closeEditor();assert(workshop.requestPieceDeletion(saved));assert(workshop.confirmPieceDeletion());
  assert(await workshop.initializeLibrary());library=store.readWorkshopLibrary();
  assert.strictEqual(library.pieces.length,1);assert.deepStrictEqual(library.pieces[0],existing);
  workshop.$destroy();
 });
 await test('source controls expose clickable safe links, editable values and removable entries',()=>{
  const sources=[{label:'Mutopia',url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=202'}];
  const links=view('WorkshopSourceLinks',{value:sources}),published=[];links.$on('input',value=>published.push(value));
  const anchor=nodes(links._render()).find(node=>node.tag==='a');assert.strictEqual(anchor.data.attrs.href,sources[0].url);assert.strictEqual(anchor.data.attrs.rel,'noopener noreferrer');
  links.entries[0].label='Edited source';links.publish();assert.strictEqual(published[0][0].label,'Edited source');assert.strictEqual(sources[0].label,'Mutopia');
  links.entries[0].url='javascript:alert(1)';assert(links.invalid);assert(!nodes(links._render()).some(node=>node.tag==='a'));
  links.remove(0);assert.deepStrictEqual(published[published.length-1],[]);links.add();assert(links.invalid);
  links.entries[0].url='https://example.org/source';links.publish();assert(!links.invalid);links.$destroy();
 });
 await test('both metadata surfaces and all added controls have German and English labels',()=>{
  const details=component('WorkshopPieceDetails'),draft=model.createWorkshopDraft('Example');details.components.WorkshopSourceLinks=component('WorkshopSourceLinks');draft.score.metadata={copyright:'Notice',license:'Public Domain',sources:[{label:'A',url:'https://example.org/'}]};
  const dialog=new Vue(Object.assign({},details,{mounted:undefined,beforeDestroy:undefined,propsData:{draft},methods:Object.assign({},details.methods,{$t:key=>key})}));
  const rendered=nodes(dialog._render());assert(rendered.some(node=>node.tag==='details'&&node.data.attrs.open));
  assert(rendered.some(node=>node.tag==='textarea'&&node.data.attrs.id==='workshop-piece-license'));
  assert(rendered.some(node=>node.componentOptions&&node.componentOptions.propsData&&node.componentOptions.propsData.value&&node.componentOptions.propsData.value.length===1));
  const notation=view('WorkshopNotationControls',{score:draft.score,section:'document'});assert(notation.metadataFields.includes('license'));
  const keys=['WORKSHOP_PIECE_PREVIEW_LISTEN','WORKSHOP_PIECE_PREVIEW_STOP','WORKSHOP_BUNDLED_INSTALL_ERROR','WORKSHOP_BUNDLED_INSTALL_FULL','WORKSHOP_META_LICENSE','WORKSHOP_META_SOURCES','WORKSHOP_SOURCE_LABEL','WORKSHOP_SOURCE_URL','WORKSHOP_SOURCE_OPEN','WORKSHOP_SOURCE_ADD','WORKSHOP_SOURCE_REMOVE','WORKSHOP_SOURCES_INVALID'];
  keys.forEach(key=>{assert(de[key],key+' DE');assert(en[key],key+' EN');});dialog.$destroy();notation.$destroy();
 });
})().catch(error=>{console.error(error);process.exitCode=1;});

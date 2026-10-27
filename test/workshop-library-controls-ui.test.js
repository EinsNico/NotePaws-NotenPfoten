const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const values=new Map();
global.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
global.window={addEventListener(){},removeEventListener(){},scrollTo(){}};
global.document={addEventListener(){},removeEventListener(){},hidden:false};
const root=path.resolve(__dirname,'../src')+path.sep,oldJs=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(root))return oldJs(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=mod=>{mod.exports={};};
const midi={enabled:false,inputs:[],enable(){throw new Error('library must not request MIDI access');}};
const midiModule=require.resolve('webmidi');require.cache[midiModule]={id:midiModule,filename:midiModule,loaded:true,exports:midi};
const filename=root+'components/Workshop.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
const model=require(root+'model/Workshop'),store=require(root+'model/WorkshopStorage');
const de=require(root+'resources/de').default,en=require(root+'resources/en').default;
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function hasClass(node,name){return node.data&&(node.data.staticClass||'').split(' ').includes(name);}
function fixture(locale='de',expand=true){
 values.clear();
 for(const title of ['First piece','Second piece']){
  const draft=model.createWorkshopDraft(title);draft.score.parts[0].measures[0].events=[{id:model.workshopId('event'),kind:'note',noteValue:'quarter',startSlot:0,pitch:model.workshopPitchFromValue(48)}];store.storeWorkshopDraft(draft);
 }
 const instance=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:(key,args={})=>Object.keys(args).reduce((text,name)=>text.replace('{'+name+'}',args[name]),(locale==='de'?de:en)[key]||key),$tc:key=>key}),computed:Object.assign({},definition.computed,{noteNaming:()=> 'german'})}));
 instance.player=null;instance.loadLibrary();if(expand)instance.pieces.forEach(piece=>instance.togglePieceExpanded(piece));const calls={toggle:[],stop:0,dispose:0};
 instance.libraryPlayback={
  async toggle(piece){calls.toggle.push(piece.id);if(instance.libraryAudio.pieceId===piece.id&&instance.libraryAudio.playing)this.stop();else instance.libraryAudio={pieceId:piece.id,busy:false,playing:true,error:null};return true;},
  stop(){calls.stop++;instance.libraryAudio={pieceId:null,busy:false,playing:false,error:null};},
  dispose(){calls.dispose++;this.stop();}
 };
 return{instance,calls,piece:instance.pieces[0],other:instance.pieces[1]};
}
async function test(name,body){await body();console.log('✓ '+name);}
(async()=>{
 await test('pieces start collapsed, expand independently and reset on a new component without storing disclosure state',()=>{
  for(const locale of ['de','en']){
   const {instance,piece,other}=fixture(locale,false),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
   let rendered=nodes(instance._render());assert.strictEqual(rendered.filter(node=>hasClass(node,'piece-preview')).length,0);
   assert.strictEqual(rendered.filter(node=>hasClass(node,'saved-piece-actions')).length,0);
   let toggles=rendered.filter(node=>hasClass(node,'piece-disclosure'));assert.strictEqual(toggles.length,2);
   assert(toggles.every(node=>node.data.attrs['aria-expanded']===false));assert(toggles.every(node=>node.data.attrs['aria-label'].includes(locale==='de'?'aufklappen':'Expand')));
   assert.strictEqual(toggles[0].data.on.click(),true);assert(instance.pieceExpanded(piece));assert(!instance.pieceExpanded(other));
   rendered=nodes(instance._render());assert.strictEqual(rendered.filter(node=>hasClass(node,'piece-preview')).length,1);
   const content=rendered.find(node=>node.tag==='div'&&node.data.attrs&&node.data.attrs.id==='workshop-piece-'+piece.id);assert(content&&!content.data.attrs.hidden);
   assert.strictEqual(instance.togglePieceExpanded(other),true);assert(instance.pieceExpanded(other));
   assert.strictEqual(instance.togglePieceExpanded(piece),true);assert(!instance.pieceExpanded(piece));assert(instance.pieceExpanded(other));
   instance.xmlBusy=true;assert.strictEqual(instance.togglePieceExpanded(other),false);instance.xmlBusy=false;
   assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
   const reopened=new Vue(instance.$options);reopened.loadLibrary();
   assert.deepStrictEqual(reopened.pieces.map(item=>item.id),instance.pieces.map(item=>item.id));
   assert(reopened.pieces.every(item=>!reopened.pieceExpanded(item)));
   assert.strictEqual(nodes(reopened._render()).filter(node=>hasClass(node,'piece-preview')).length,0);
   reopened.$destroy();instance.$destroy();
  }
 });
 await test('library colors stay in visible position order after deleting, adding and reordering fixture music',()=>{
  const {instance}=fixture('de',false);
  let library={version:1,pieces:[]};
  for(let index=0;index<7;index++){
   library=model.saveWorkshopDraft(library,model.createWorkshopDraft('Palette piece '+index),'2020-01-0'+(index+1)+'T00:00:00.000Z').library;
  }
  localStorage.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({data:library}));instance.loadLibrary();
  function cards(){return nodes(instance._render()).filter(node=>node.tag==='article'&&hasClass(node,'piece-entry'));}
  function assertColors(){
   const before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),rendered=cards();
   assert.deepStrictEqual(rendered.map(node=>node.key),instance.pieces.map(piece=>piece.id));
   assert.deepStrictEqual(rendered.map(node=>node.data.class[0]),rendered.map((node,index)=>'piece-color-'+(index%5)));
   assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before,'color assignment must not write into saved music');
   return rendered;
  }
  assert.strictEqual(assertColors().length,7);
  const first=instance.pieces[0],second=instance.pieces[1];
  assert(instance.requestPieceDeletion(first));assert(instance.confirmPieceDeletion());
  assert.strictEqual(instance.pieces[0].id,second.id);assert.strictEqual(assertColors()[0].data.class[0],'piece-color-0');
  const added=store.storeWorkshopDraft(model.createWorkshopDraft('New palette piece')).piece;instance.loadLibrary();
  assert.strictEqual(instance.pieces[0].id,added.id);assert.strictEqual(assertColors().length,7);
  const moved=instance.pieces[instance.pieces.length-1],draft=model.openWorkshopPiece(moved);draft.title='Updated palette piece';
  const edited=model.saveWorkshopDraft(instance.library,draft,'2030-01-01T00:00:00.000Z');
  localStorage.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({data:edited.library}));instance.loadLibrary();
  assert.strictEqual(instance.pieces[0].id,moved.id);assertColors();
  instance.pieces.forEach(piece=>assert.strictEqual(Object.keys(piece).some(key=>/color|colour|palette/i.test(key)),false));
  instance.$destroy();
 });
 await test('collapsing a playing preview stops its audio and preserves hand selection and saved music',async()=>{
  const {instance,piece}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  instance.togglePracticeHand(piece,'left');await instance.toggleLibraryPiece(piece);assert(instance.libraryAudio.playing);
  assert(instance.togglePieceExpanded(piece));assert(!instance.libraryAudio.playing);assert(!instance.pieceExpanded(piece));
  instance.togglePieceExpanded(piece);assert.deepStrictEqual(JSON.parse(JSON.stringify(instance.practiceHandsFor(piece))),{left:false,right:true});
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);instance.$destroy();
 });
 await test('editor adopts the opening list color and keeps it through saves without storing it in music',()=>{
  const {instance,other}=fixture('de',false),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  instance.$i18n={locale:'de'};
  instance.openPiece(other);
  assert.strictEqual(instance.editorColorIndex,1);
  assert.deepStrictEqual(instance._render().data.class,['is-editing','piece-color-1']);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  instance.draft.title='Recently edited piece';assert(instance.savePiece());
  assert.strictEqual(instance.pieces[0].id,other.id,'saving changes visible list position');
  assert.strictEqual(instance.editorColorIndex,1,'editor must not change color midway through editing');
  instance.closeEditor();assert.strictEqual(instance._render().data.class,null);
  instance.openPiece(instance.pieces[0]);assert.strictEqual(instance.editorColorIndex,0);
  assert.strictEqual(Object.keys(instance.draft).some(key=>/color|colour|palette/i.test(key)),false);
  assert.strictEqual(Object.keys(instance.pieces[0]).some(key=>/color|colour|palette/i.test(key)),false);
  instance.closeEditor();instance.newPiece();assert.strictEqual(instance.editorColorIndex,0);
  instance.$destroy();
 });
 await test('preview click auditions without opening editor or changing storage; second click stops',async()=>{
  const {instance,calls,piece}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  const preview=nodes(instance._render()).find(node=>node.tag==='button'&&hasClass(node,'piece-preview'));
  await preview.data.on.click();assert.deepStrictEqual(calls.toggle,[piece.id]);assert.strictEqual(instance.libraryAudio.playing,true);
  assert.strictEqual(instance.draft,null);assert.strictEqual(instance.listeningView,false);assert.strictEqual(instance.playback,null);assert.strictEqual(instance.dirty,false);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  const active=nodes(instance._render()).find(node=>node.tag==='button'&&hasClass(node,'piece-preview'));
  assert.strictEqual(active.data.attrs['aria-pressed'],true);assert(active.data.attrs['aria-label'].includes('stoppen'));
  await active.data.on.click();assert.strictEqual(instance.libraryAudio.playing,false);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);instance.$destroy();
 });
 await test('hands default to both, are independent per piece, retain at least one and never modify saved score',()=>{
  const {instance,piece,other}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  assert.deepStrictEqual(instance.practiceHandsFor(piece),{left:true,right:true});assert(instance.togglePracticeHand(piece,'left'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(instance.practiceHandsFor(piece))),{left:false,right:true});
  assert.strictEqual(instance.togglePracticeHand(piece,'right'),false);assert.deepStrictEqual(instance.practiceHandsFor(other),{left:true,right:true});
  assert(instance.togglePracticeHand(piece,'left'));assert(instance.togglePracticeHand(piece,'right'));
  const rendered=nodes(instance._render()),start=rendered.filter(node=>node.tag==='button'&&hasClass(node,'practice-start'));
  assert.strictEqual(start.length,2);assert(start.every(node=>!node.data.attrs.disabled));assert(start.every(node=>node.data.on&&node.data.on.click));
  assert.strictEqual(rendered.filter(node=>node.tag==='button'&&hasClass(node,'practice-hand')).length,4);
  assert.strictEqual(instance.togglePracticeHand(piece,'invalid'),false);instance.xmlBusy=true;assert.strictEqual(instance.togglePracticeHand(piece,'left'),false);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);instance.$destroy();
 });
 await test('editor, details, deletion, import picker, library reload and Back stop card audio',async()=>{
  for(const action of ['editor','new','details','delete','import','reload','back','practice']){
   const {instance,calls,piece}=fixture();await instance.toggleLibraryPiece(piece);const before=calls.stop;
   if(action==='editor')instance.openPiece(piece);
   if(action==='practice')instance.startPractice(piece);
   if(action==='new')instance.newPiece();
   if(action==='details')instance.openPieceDetails(piece);
   if(action==='delete')instance.requestPieceDeletion(piece);
   if(action==='import'){instance.$refs.musicFile={click(){assert(calls.stop>before);}};await instance.chooseImportFile();}
   if(action==='reload')instance.loadLibrary();
   if(action==='back'){assert.strictEqual(instance.handleBack(),true);assert.strictEqual(instance.handleBack(),false);}
   assert(calls.stop>before,action);assert.strictEqual(instance.libraryAudio.playing,false,action);instance.$destroy();
  }
 });
 await test('hidden app and component destruction release audio; modal and busy guards cannot start it',async()=>{
  const {instance,calls,piece}=fixture();definition.mounted.call(instance);await instance.toggleLibraryPiece(piece);
  global.document.hidden=true;instance.onVisibility();global.document.hidden=false;assert.strictEqual(instance.libraryAudio.playing,false);
  instance.xmlBusy=true;assert.strictEqual(await instance.toggleLibraryPiece(piece),false);instance.xmlBusy=false;
  instance.openPieceDetails(piece);assert.strictEqual(await instance.toggleLibraryPiece(piece),false);instance.closePieceDetails();
  assert.strictEqual(await instance.toggleLibraryPiece({id:'missing'}),false);
  definition.beforeDestroy.call(instance);assert.strictEqual(calls.dispose,1);instance.$destroy();
 });
 await test('German and English cards expose audio controls, two pressed hands and an enabled practice button',()=>{
  const keys=['WORKSHOP_PIECE_PREVIEW_LISTEN','WORKSHOP_PIECE_PREVIEW_STOP','WORKSHOP_LIBRARY_LISTEN','WORKSHOP_AUDIO_LOADING','WORKSHOP_PRACTICE_HANDS','WORKSHOP_PRACTICE_LEFT','WORKSHOP_PRACTICE_RIGHT','WORKSHOP_PRACTICE','WORKSHOP_PRACTICE_SOON'];
  for(const locale of ['de','en']){
   keys.forEach(key=>assert((locale==='de'?de:en)[key],locale+' '+key));const{instance}=fixture(locale),rendered=nodes(instance._render());
   const hands=rendered.filter(node=>node.tag==='button'&&hasClass(node,'practice-hand'));assert(hands.every(node=>node.data.attrs['aria-pressed']===true));
   assert(rendered.some(node=>node.tag==='button'&&hasClass(node,'practice-start')&&node.children.some(child=>child.text.includes(locale==='de'?'Üben':'Practice'))));instance.$destroy();
  }
 });
 await test('practice starts from a saved snapshot and hand choice; Info and Back never change the library',async()=>{
  const {instance,piece}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  instance.togglePracticeHand(piece,'left');await instance.toggleLibraryPiece(piece);
  const start=nodes(instance._render()).find(node=>node.tag==='button'&&hasClass(node,'practice-start'));
  assert.strictEqual(start.data.on.click(),true);
  assert.strictEqual(instance.libraryAudio.playing,false);assert.strictEqual(instance.draft,null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(instance.practiceSession.hands)),{left:false,right:true});
  assert.notStrictEqual(instance.practiceSession.score,instance.pieceScore(piece));
  assert.strictEqual(instance.practiceSession.showLicense,false);
  instance.openPracticeInfo();assert.strictEqual(instance.infoPiece.title,piece.title);
  assert.strictEqual(instance.handleBack(),true);assert.strictEqual(instance.infoPiece,null);assert(instance.practiceSession);
  assert.strictEqual(instance.handleBack(),true);assert.strictEqual(instance.practiceSession,null);
  assert.strictEqual(instance.openLibraryInfo(piece),true);assert.strictEqual(instance.infoPiece.showLicense,false);
  assert.strictEqual(instance.handleBack(),true);assert.strictEqual(instance.handleBack(),false);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);instance.$destroy();
 });
 await test('outer Back delegates to mounted practice before closing the session so fullscreen and results can handle it',()=>{
  const {instance,piece}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);instance.startPractice(piece);
  const session=instance.practiceSession;let backCalls=0,pauseCalls=0;
  instance.$refs.practice={back(){backCalls++;},pause(){pauseCalls++;}};
  assert.strictEqual(instance.handleBack(),true);assert.strictEqual(backCalls,1);assert.strictEqual(pauseCalls,0);
  assert.strictEqual(instance.practiceSession,session,'the child can first leave fullscreen or show results');
  instance.$refs.practice.back=()=>{backCalls++;instance.closePractice();};
  assert.strictEqual(instance.handleBack(),true);assert.strictEqual(backCalls,2);assert.strictEqual(pauseCalls,1);
  assert.strictEqual(instance.practiceSession,null);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);instance.$destroy();
 });
 await test('library status observes delayed MIDI initialization and device changes without changing data or requesting access',()=>{
  const {instance}=fixture(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  definition.mounted.call(instance);assert.strictEqual(instance.midiConnected,false);
  const status=nodes(instance._render()).find(node=>node.componentOptions&&node.componentOptions.tag==='MidiConnectionStatus');
  assert(status);assert.strictEqual(status.data.attrs.connected,false);
  midi.enabled=true;midi.inputs=[{}];instance.refreshMidiStatus();assert.strictEqual(instance.midiConnected,true);
  midi.inputs=[];instance.refreshMidiStatus();assert.strictEqual(instance.midiConnected,false);
  definition.beforeDestroy.call(instance);midi.inputs=[{}];instance.refreshMidiStatus();assert.strictEqual(instance.midiConnected,false);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  midi.enabled=false;midi.inputs=[];instance.$destroy();
 });
 await test('practice assessments persist locally, update the circle, reload and never change the saved music',async()=>{
  const {instance,piece}=fixture(),musicBefore=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  const plan=require(root+'model/WorkshopPractice').createWorkshopPracticePlan(instance.pieceScore(piece));
  const delta={correct:1,early:2,late:3,wrong:4,missed:5,learnedNoteKeys:plan.totalNoteKeys.slice()};
  assert.strictEqual(instance.practiceProgressFor(piece),0);instance.startPractice(piece);
  const practice=nodes(instance._render()).find(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopPractice');
  assert(practice);assert(practice.componentOptions.listeners.assessment);
  assert.strictEqual(practice.componentOptions.listeners.assessment(delta),true);
  assert.strictEqual(instance.practiceStatisticsFor(piece).correct,1);assert.strictEqual(instance.practiceProgressFor(piece),100);
  instance.closePractice();assert.strictEqual(instance.practiceStatsTimer,null);
  const raw=localStorage.getItem('workshopPracticeStatistics');assert(raw);
  instance.practiceStatistics={version:1,pieces:[]};instance.loadPracticeStatistics();
  assert.strictEqual(instance.practiceProgressFor(piece),100);assert.strictEqual(instance.practiceStatisticsFor(piece).late,3);
  const circle=nodes(instance._render()).find(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopPracticeStatistics');
  assert(circle);assert.strictEqual(circle.data.attrs['progress-percent'],100);assert.strictEqual(circle.data.attrs.statistics.correct,1);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),musicBefore);
  assert.strictEqual(instance.recordPracticeAssessment(delta),false);instance.$destroy();
 });
 await test('renaming preserves mastery while changing a note pitch updates the progress denominator',()=>{
  const {instance,piece}=fixture(),keys=require(root+'model/WorkshopPractice').createWorkshopPracticePlan(instance.pieceScore(piece)).totalNoteKeys;
  instance.startPractice(piece);instance.recordPracticeAssessment({correct:1,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:keys});instance.closePractice();
  const draft=model.openWorkshopPiece(piece);draft.title='Renamed';store.storeWorkshopDraft(draft);instance.loadLibrary();
  let current=instance.pieces.find(item=>item.id===piece.id);assert.strictEqual(instance.practiceProgressFor(current),100);
  const edit=model.openWorkshopPiece(current);edit.score.parts[0].measures[0].events[0].pitch=model.workshopPitchFromValue(50);store.storeWorkshopDraft(edit);instance.loadLibrary();
  current=instance.pieces.find(item=>item.id===piece.id);assert.strictEqual(instance.practiceProgressFor(current),0);
  instance.$destroy();
 });
 await test('deleting a saved piece removes only its statistics and never restores them on a later flush',()=>{
  const {instance,piece,other}=fixture(),key='workshopPracticeStatistics';
  const delta={correct:1,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:['learned']};
  instance.startPractice(piece);instance.recordPracticeAssessment(delta);instance.closePractice();
  instance.startPractice(other);instance.recordPracticeAssessment(delta);instance.closePractice();
  instance.requestPieceDeletion(piece);assert.strictEqual(instance.confirmPieceDeletion(),true);
  assert.strictEqual(JSON.parse(localStorage.getItem(key)).pieces.length,1);assert.strictEqual(JSON.parse(localStorage.getItem(key)).pieces[0].pieceId,other.id);
  instance.flushPracticeStatistics();assert.strictEqual(JSON.parse(localStorage.getItem(key)).pieces.length,1);instance.$destroy();
 });
 await test('a failed local statistics deletion can be retried after the piece itself was deleted',()=>{
  const {instance,piece}=fixture();instance.startPractice(piece);
  instance.recordPracticeAssessment({correct:1,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:['learned']});instance.closePractice();
  const write=localStorage.setItem;let fail=true;
  localStorage.setItem=(key,value)=>{if(key==='workshopPracticeStatistics'&&fail){fail=false;throw Error('quota');}return write(key,value);};
  try {
   instance.requestPieceDeletion(piece);assert(instance.confirmPieceDeletion());assert.strictEqual(instance.practiceStatsError,true);
   assert.strictEqual(instance.pieces.some(item=>item.id===piece.id),false);
   assert(instance.retryPracticeStatistics());assert.strictEqual(instance.practiceStatsError,false);
   assert.strictEqual(JSON.parse(localStorage.getItem('workshopPracticeStatistics')).pieces.length,0);
  } finally {localStorage.setItem=write;instance.$destroy();}
 });
 await test('Back, hiding and destruction pause before flushing final input assessments',()=>{
  for(const action of ['back','hidden','unload','destroy']){
   const {instance,piece}=fixture();instance.startPractice(piece);
   const keys=require(root+'model/WorkshopPractice').createWorkshopPracticePlan(instance.pieceScore(piece)).totalNoteKeys;
   let pauses=0;instance.$refs.practice={pause(){if(pauses++)return;instance.recordPracticeAssessment({correct:1,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:keys});}};
   if(action==='back')instance.closePractice();
   else {definition.mounted.call(instance);if(action==='hidden'){document.hidden=true;instance.onVisibility();document.hidden=false;}
    if(action==='unload')instance.onUnload({});if(action==='destroy')definition.beforeDestroy.call(instance);}
   assert.strictEqual(JSON.parse(localStorage.getItem('workshopPracticeStatistics')).pieces[0].correct,1,action);
   assert.strictEqual(instance.practiceStatsTimer,null,action);
   if(action==='hidden'||action==='unload')definition.beforeDestroy.call(instance);
   instance.$destroy();
  }
 });
 await test('corrupt statistics leave music usable and preserve the corrupt raw data for recovery',()=>{
  const {instance,piece}=fixture(),musicBefore=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  localStorage.setItem('workshopPracticeStatistics','{broken');assert.strictEqual(instance.loadPracticeStatistics(),false);
  assert.strictEqual(instance.practiceStatsError,true);assert(instance.startPractice(piece));
  assert.strictEqual(instance.recordPracticeAssessment({correct:1,early:0,late:0,wrong:0,missed:0,learnedNoteKeys:[]}),false);
  instance.closePractice();assert.strictEqual(localStorage.getItem('workshopPracticeStatistics'),'{broken');
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),musicBefore);instance.$destroy();
 });
})().catch(error=>{console.error(error);process.exitCode=1;});

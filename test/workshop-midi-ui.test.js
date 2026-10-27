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
const filename=root+'components/Workshop.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
function view(){const instance=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key}),computed:Object.assign({},definition.computed,{noteNaming:()=> 'german'})}));instance.$i18n={locale:'de'};instance.player=null;return instance;}
const model=require(root+'model/Workshop'),store=require(root+'model/WorkshopStorage');
const xml=require(root+'model/WorkshopMusicXml');
const de=require(root+'resources/de').default,en=require(root+'resources/en').default;
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function hasClass(node,name){return node.data&&(node.data.staticClass||'').split(' ').includes(name);}
function midiBytes(releaseTicks=480){const track=Buffer.from([0,0xff,3,4,84,101,115,116,0,0x90,60,90,0,0x90,64,90,0,0x90,67,90,0x80|(releaseTicks>>7),releaseTicks&0x7f,0x80,60,0,0,0x80,64,0,0,0x80,67,0,0,0xff,0x2f,0]);const header=Buffer.from('4d546864000000060000000101e0','hex'),chunk=Buffer.alloc(8);chunk.write('MTrk');chunk.writeUInt32BE(track.length,4);return new Uint8Array(Buffer.concat([header,chunk,track]));}
const bytes=midiBytes();
function browserFile(data=bytes){return{name:'Test.mid',size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}
async function test(name,body){await body();process.stdout.write('✓ '+name+'\n');}
(async()=>{
 await test('MIDI release gaps stay exact by default and optional simplification is reversible without touching the source or saved music',async()=>{
  const workshop=view(),short=midiBytes(450),source=Array.from(short),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  assert(await workshop.loadMidi({filename:'short-release.mid',data:short}));assert(workshop.importNotice);assert(workshop.midiImportAvailable);assert.strictEqual(workshop.midiNotationSimplified,false);
  const exact=JSON.stringify(workshop.draft.score),notes=workshop.currentBar.events.filter(event=>event.kind==='note');
  assert(notes.every(event=>event.noteValue==='eighth'&&event.dots===3));assert.strictEqual(workshop.undoStack.length,0);
  const importChoice=nodes(workshop._render()).find(node=>node.data&&node.data.ref==='importNotation');assert(importChoice);assert.strictEqual(importChoice.data.attrs['aria-pressed'],false);
  assert(workshop.setMidiNotation(true));assert(workshop.midiNotationSimplified);assert(workshop.currentBar.events.filter(event=>event.kind==='note').every(event=>event.noteValue==='quarter'&&!event.dots));
  assert.deepStrictEqual(workshop.currentBar.events.filter(event=>event.kind==='note').map(event=>[event.id,event.startSlot,event.pitch]),notes.map(event=>[event.id,event.startSlot,event.pitch]));
  const simple=JSON.stringify(workshop.draft.score);assert.strictEqual(workshop.undoStack.length,1);assert.strictEqual(workshop.setMidiNotation(true),false);assert.strictEqual(workshop.undoStack.length,1);
  workshop.undo();assert.strictEqual(JSON.stringify(workshop.draft.score),exact);assert.strictEqual(workshop.midiNotationSimplified,false);
  workshop.redo();assert.strictEqual(JSON.stringify(workshop.draft.score),simple);assert(workshop.midiNotationSimplified);
  assert(workshop.setMidiNotation(false));assert.strictEqual(JSON.stringify(workshop.draft.score),exact);assert.strictEqual(workshop.midiNotationSimplified,false);
  assert(workshop.setMidiNotation(true));workshop.closeImportNotice();workshop.change(()=>{workshop.draft.score.bpm=95;});
  const edited=JSON.stringify(workshop.draft.score);assert.strictEqual(workshop.setMidiNotation(false),false);assert.strictEqual(JSON.stringify(workshop.draft.score),edited);
  const laterChoice=nodes(workshop._render()).filter(node=>node.tag==='button').filter(node=>(node.children||[]).some(child=>child.text==='WORKSHOP_MIDI_NOTATION_EXACT'));assert.strictEqual(laterChoice.length,0);
  assert.deepStrictEqual(Array.from(short),source);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);assert(model.isValidWorkshopScore(workshop.draft.score));
  workshop.$destroy();
 });
 await test('MIDI notation choices are absent for MusicXML, and already simple MIDI adds no spurious history entry',async()=>{
  const workshop=view(),score=model.createWorkshopDraft('Exact MusicXML').score;score.parts[0].measures[0].events=[{id:'xml-simple',kind:'note',noteValue:'quarter',startSlot:0,pitch:model.workshopPitchFromValue(48)}];
  const plain=await xml.exportWorkshopMusicXml(score,{title:'Exact MusicXML'});assert(await workshop.loadMusicXml({filename:'exact.musicxml',data:plain.data}));
  assert.strictEqual(workshop.midiImportAvailable,false);assert(!nodes(workshop._render()).some(node=>node.data&&node.data.ref==='importNotation'));assert.strictEqual(workshop.setMidiNotation(true),false);
  workshop.closeImportNotice();workshop.closeEditor();assert(await workshop.loadMidi({filename:'simple.mid',data:bytes}));assert.strictEqual(workshop.setMidiNotation(true),false);assert.strictEqual(workshop.undoStack.length,0);assert.strictEqual(workshop.midiNotationSimplified,false);
  for(const strings of [de,en])for(const key of ['WORKSHOP_MIDI_NOTATION','WORKSHOP_MIDI_NOTATION_HINT','WORKSHOP_MIDI_NOTATION_SIMPLIFY','WORKSHOP_MIDI_NOTATION_EXACT','WORKSHOP_MIDI_NOTATION_CHANGED','WORKSHOP_HISTORY_MIDI_NOTATION'])assert(strings[key],key);
  workshop.$destroy();
 });
 await test('MIDI browser import opens an editable unsaved draft and preserves all existing storage',async()=>{
  const saved=store.storeWorkshopDraft(model.createWorkshopDraft('Keep me')).piece,workshop=view();workshop.loadLibrary();const before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  const input={files:[browserFile()],value:'selected'};assert(await workshop.importMusicFile({target:input}));assert.strictEqual(input.value,'');assert(workshop.draft);assert.strictEqual(workshop.draft.pieceId,null);assert.strictEqual(workshop.xmlMessage,'WORKSHOP_MIDI_IMPORTED');assert(workshop.xmlWarnings.includes('notation-inferred'));assert(workshop.hasNotes);assert(model.isValidWorkshopScore(workshop.draft.score));assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  assert(workshop.savePiece());workshop.closeEditor();const imported=store.readWorkshopLibrary().pieces.find(piece=>piece.id!==saved.id);assert(imported);workshop.openPiece(imported);assert(workshop.hasNotes);workshop.$destroy();
 });
 await test('malformed, cancelled and overlapping MIDI imports cannot overwrite drafts or storage',async()=>{
  const workshop=view(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);workshop.loadLibrary();assert.strictEqual(await workshop.loadMidi({filename:'broken.mid',data:new Uint8Array([1,2,3])}),false);assert.strictEqual(workshop.xmlError,'WORKSHOP_MIDI_IMPORT_ERROR');assert.strictEqual(workshop.draft,null);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  const cancelled={target:{files:[],value:'selected'}};await workshop.importMusicFile(cancelled);assert.strictEqual(cancelled.target.value,'');assert.strictEqual(workshop.draft,null);
  let finish;const delayed={name:'delayed.mid',size:bytes.length,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})};const pending=workshop.importMusicFile({target:{files:[delayed],value:'selected'}});assert(workshop.xmlBusy);assert.strictEqual(await workshop.loadMidi({filename:'another.mid',data:bytes}),false);finish(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));assert(await pending);const draft=JSON.stringify(workshop.draft);assert.strictEqual(await workshop.loadMidi({filename:'another.mid',data:bytes}),false);assert.strictEqual(JSON.stringify(workshop.draft),draft);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);workshop.$destroy();
 });
 await test('native MIDI picker uses the existing bounded binary file bridge and closes its stream',async()=>{
  const workshop=view();let closed=false,read=false;global.window.cordova={plugins:{saveDataFile:{openStream(mime,ok){assert.strictEqual(mime,'*/*');ok({status:'selected',token:'midi',size:bytes.length});},readChunk(token,ok){assert.strictEqual(token,'midi');ok({token,data:read?'':Buffer.from(bytes).toString('base64'),done:read});read=true;},closeStream(token,ok){closed=true;ok({});}}}};
  assert(await workshop.chooseImportFile());assert(closed);assert(workshop.hasNotes);assert.strictEqual(workshop.xmlMessage,'WORKSHOP_MIDI_IMPORTED');delete global.window.cordova;workshop.$destroy();
 });
 await test('one translated import button and one browser picker accept every supported notation and MIDI extension',async()=>{
  const workshop=view(),rendered=nodes(workshop._render());
  const actions=rendered.find(node=>node.data&&node.data.staticClass==='import-actions');
  assert.strictEqual(actions.children.filter(node=>node.tag==='button').length,1);
  assert(actions.children.some(node=>node.children&&node.children.some(child=>child.text==='WORKSHOP_MUSIC_IMPORT')));
  const inputs=rendered.filter(node=>node.tag==='input'&&node.data.attrs&&node.data.attrs.type==='file');assert.strictEqual(inputs.length,1);
  ['.xml','.musicxml','.mxl','.mid','.midi'].forEach(ext=>assert(inputs[0].data.attrs.accept.split(',').includes(ext)));
  let clicked=0;workshop.$refs.musicFile={click(){clicked++;}};await workshop.chooseImportFile();assert.strictEqual(clicked,1);
 assert(de.WORKSHOP_MUSIC_IMPORT&&en.WORKSHOP_MUSIC_IMPORT&&de.WORKSHOP_MUSIC_IMPORT_ERROR&&en.WORKSHOP_MUSIC_IMPORT_ERROR);workshop.$destroy();
 });
 await test('each successful import opens a separate notice; dismissing it leaves the draft intact and reopening a saved piece stays quiet',async()=>{
  const source='<score-partwise><work><work-title>Notice test</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';
  const workshop=view();let noticeFocus=0,editorFocus=0;
  workshop.$refs.importNoticeClose={focus(){noticeFocus++;}};workshop.$refs.editorSave={focus(){editorFocus++;}};
  assert(await workshop.loadMusicXml({data:source,filename:'notice.musicxml'}));await Vue.nextTick();
  assert(workshop.importNotice);assert.strictEqual(noticeFocus,1);
  assert.deepStrictEqual(workshop.importNoticeWarnings,['layout-approximate','source-preserved']);
  let rendered=nodes(workshop._render());assert(rendered.some(node=>hasClass(node,'import-notice')));
  const notice=rendered.find(node=>hasClass(node,'import-notice'));
  assert(!nodes(notice).some(node=>node.tag==='p'||node.text==='WORKSHOP_XML_IMPORTED'));
  assert(!rendered.some(node=>hasClass(node,'xml-status')));assert(!rendered.some(node=>hasClass(node,'hero')));
  const shell=rendered.find(node=>hasClass(node,'shell'));assert.strictEqual(shell.data.attrs.inert,'');assert.strictEqual(shell.data.attrs['aria-hidden'],'true');
  const before=JSON.stringify(workshop.draft);assert(workshop.handleBack());await Vue.nextTick();
  assert(!workshop.importNotice);assert.strictEqual(editorFocus,1);assert.strictEqual(JSON.stringify(workshop.draft),before);
  assert.strictEqual(workshop.xmlMessage,null);assert.deepStrictEqual(workshop.xmlWarnings,[]);
  assert(workshop.savePiece());const saved=workshop.currentPiece;workshop.closeEditor();workshop.openPiece(saved);
  assert(!workshop.importNotice);assert.deepStrictEqual(workshop.xmlWarnings,[]);assert(!nodes(workshop._render()).some(node=>hasClass(node,'hero')||hasClass(node,'xml-status')));
  workshop.closeEditor();assert(workshop.startPractice(saved));assert(!nodes(workshop._render()).some(node=>hasClass(node,'hero')));
  workshop.closePractice();assert(nodes(workshop._render()).some(node=>hasClass(node,'hero')));
  assert(await workshop.loadMusicXml({data:source,filename:'notice.musicxml'}));assert(workshop.importNotice);workshop.closeImportNotice();workshop.closeEditor();
  assert.strictEqual(await workshop.loadMusicXml({data:'broken XML',filename:'broken.xml'}),false);assert(!workshop.importNotice);
  workshop.$destroy();
 });
 await test('MusicXML limitations appear only for detected unsupported notation and MIDI keeps its own relevant notices',async()=>{
  const source='<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notations><ornaments><shake/></ornaments></notations></note></measure></part></score-partwise>';
  const workshop=view();assert(await workshop.loadMusicXml({data:source,filename:'special-notation.musicxml'}));
  assert(workshop.importNoticeWarnings.includes('unsupported-notation'));assert.strictEqual(workshop.importNoticeWarnings[0],'layout-approximate');
  workshop.closeImportNotice();workshop.closeEditor();assert(await workshop.loadMidi({filename:'Test.mid',data:bytes}));
  assert(workshop.importNotice);assert(workshop.importNoticeWarnings.includes('notation-inferred'));
  assert(!workshop.importNoticeWarnings.includes('source-preserved'));assert(!workshop.importNoticeWarnings.includes('unsupported-notation'));
  for(const strings of [de,en])assert(strings.WORKSHOP_IMPORT_ACK&&strings.WORKSHOP_EXPORT_DETAILS&&strings.WORKSHOP_XML_WARNING_LAYOUT_APPROXIMATE&&strings.WORKSHOP_XML_WARNING_SOURCE_PRESERVED);
  workshop.closeImportNotice();workshop.$destroy();
 });
 await test('unsupported MusicXML symbols are named with measure locations, grouped without duplicates, and absent for supported notation',async()=>{
  const note=notation=>'<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>'+notation+'</note>';
  const source='<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="2"><attributes><divisions>1</divisions></attributes>'+note('<notations><ornaments><shake/><shake/></ornaments><technical><up-bow/></technical></notations>')+'</measure><measure number="7">'+note('<notations><ornaments><shake/><trill-mark/></ornaments></notations>')+'<harmony><root><root-step>C</root-step></root></harmony></measure></part></score-partwise>';
  const imported=xml.importWorkshopMusicXmlText(source),details=imported.unsupportedElements;
  assert.deepStrictEqual(details.find(item=>item.element==='shake').measures,['2','7']);assert.strictEqual(details.filter(item=>item.element==='shake').length,1);
  assert(details.some(item=>item.element==='up-bow'));assert(details.some(item=>item.element==='harmony'));assert(!details.some(item=>item.element==='trill-mark'));
  assert.strictEqual(imported.score.musicXml.sourceXml,source);assert(model.isValidWorkshopScore(imported.score));assert.deepStrictEqual(Object.keys(imported.warnings),imported.warnings.map((_,i)=>String(i)));
  const timewise=source.replace('<score-partwise>','<score-timewise>').replace('</score-partwise>','</score-timewise>').replace('<part id="P1"><measure number="2">','<measure number="2"><part id="P1">').replace('</measure><measure number="7">','</part></measure><measure number="7"><part id="P1">').replace('</measure></part>','</part></measure>');
  assert.deepStrictEqual(xml.importWorkshopMusicXmlText(timewise).unsupportedElements.find(item=>item.element==='shake').measures,['2','7']);
  const workshop=view(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);assert(await workshop.loadMusicXml({data:source,filename:'symbols.musicxml'}));
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);assert.deepStrictEqual(workshop.importUnsupportedElements,details);
  for(const strings of [de,en]) {
    workshop.$t=key=>strings[key] || key;
    assert.strictEqual(workshop.importSymbolName({element:'shake'}),strings.WORKSHOP_XML_ELEMENT_NAMES.shake);
    assert.strictEqual(workshop.importSymbolName({element:'unfamiliar-vendor-symbol'}),strings.WORKSHOP_IMPORT_UNKNOWN_SYMBOL);
    const box=nodes(workshop._render()).find(node=>hasClass(node,'import-symbols'));assert(box);assert.strictEqual(nodes(box).filter(node=>node.tag==='li').length,details.length);
  }
  workshop.closeImportNotice();assert.deepStrictEqual(workshop.importUnsupportedElements,[]);workshop.closeEditor();
  const clean=source.replace(/<shake\/>|<up-bow\/>|<harmony>[\s\S]*?<\/harmony>/g,'');
  assert.deepStrictEqual(xml.importWorkshopMusicXmlText(clean).unsupportedElements,[]);
  assert(await workshop.loadMusicXml({data:clean,filename:'supported.musicxml'}));assert(!nodes(workshop._render()).some(node=>hasClass(node,'import-symbols')));
  workshop.closeImportNotice();workshop.closeEditor();assert(await workshop.loadMidi({data:bytes,filename:'supported.mid'}));assert.deepStrictEqual(workshop.importUnsupportedElements,[]);workshop.$destroy();
 });
 await test('automatic import routes MIDI, XML and compressed MXL by their content without changing saved pieces',async()=>{
  const score=model.createWorkshopDraft('XML auto').score;score.parts[0].measures[0].events=[{id:'auto-note',kind:'note',noteValue:'quarter',startSlot:0,pitch:model.workshopPitchFromValue(48)}];
  const plain=await xml.exportWorkshopMusicXml(score,{title:'XML auto'}),compressed=await xml.exportWorkshopMusicXml(score,{title:'MXL auto',compressed:true});
  for(const [data,name,message] of [[bytes,'wrong.xml','WORKSHOP_MIDI_IMPORTED'],[new TextEncoder().encode(plain.data),'wrong.mid','WORKSHOP_XML_IMPORTED'],[compressed.data,'no-extension','WORKSHOP_XML_IMPORTED']]){
    const workshop=view(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),file=browserFile(data);file.name=name;
    assert(await workshop.importMusicFile({target:{files:[file],value:'selected'}}));assert.strictEqual(workshop.xmlMessage,message);assert(workshop.hasNotes);
    assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);workshop.$destroy();
  }
 });
 await test('unknown files and native picker cancellation preserve saved data and close import state',async()=>{
  const workshop=view(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),file=browserFile(new Uint8Array([1,2,3]));file.name='unknown.pdf';
  assert.strictEqual(await workshop.importMusicFile({target:{files:[file],value:'selected'}}),false);assert.strictEqual(workshop.xmlError,'WORKSHOP_MUSIC_IMPORT_ERROR');assert.strictEqual(workshop.draft,null);assert.strictEqual(workshop.xmlBusy,false);
  global.window.cordova={plugins:{saveDataFile:{openStream(mime,ok){ok({status:'cancelled'});}}}};
  assert.strictEqual(await workshop.chooseImportFile(),false);assert.strictEqual(workshop.xmlError,null);assert.strictEqual(workshop.xmlBusy,false);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  delete global.window.cordova;workshop.$destroy();
 });
 await test('native XML without metadata remains recognizable after long leading XML whitespace',async()=>{
  const score=model.createWorkshopDraft('Native XML').score,exported=await xml.exportWorkshopMusicXml(score,{title:'Native XML'});
  const data=new TextEncoder().encode(' '.repeat(300)+exported.data.replace(/^<\?xml[^>]*>\s*/,''));let closed=false;
  global.window.cordova={plugins:{saveDataFile:{openStream(mime,ok){ok({status:'selected',token:'xml',size:data.length});},readChunk(token,ok){ok({token,data:Buffer.from(data).toString('base64'),done:true});},closeStream(token,ok){closed=true;ok({});}}}};
  const workshop=view(),before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);assert(await workshop.chooseImportFile());assert(closed);assert.strictEqual(workshop.xmlMessage,'WORKSHOP_XML_IMPORTED');assert.strictEqual(workshop.draft.title,'Native XML');assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  delete global.window.cordova;workshop.$destroy();
 });
 await test('delete requires confirmation, Back cancels, only saved pieces have delete controls',async()=>{
  const workshop=view();workshop.loadLibrary();const piece=workshop.pieces[0],before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),count=workshop.pieces.length;
  assert(!workshop.requestPieceDeletion({id:'not-in-library',title:'Example'}));assert(workshop.requestPieceDeletion(piece));assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);workshop.newPiece();workshop.openPiece(piece);workshop.openPieceDetails(piece);assert.strictEqual(workshop.draft,null);assert.strictEqual(workshop.pieceDetailsDraft,null);assert(workshop.handleBack());assert.strictEqual(workshop.pieceToDelete,null);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  assert.strictEqual(nodes(workshop._render()).filter(node=>node.tag==='button'&&node.data.staticClass==='delete-piece').length,0);
  workshop.pieces.forEach(saved=>workshop.togglePieceExpanded(saved));
  const rendered=nodes(workshop._render());assert(!rendered.some(node=>node.tag==='section'&&node.data.staticClass==='card library demo-library'));
  assert.strictEqual(rendered.filter(node=>node.tag==='button'&&node.data.staticClass==='delete-piece').length,count);
  assert(workshop.requestPieceDeletion(piece));assert(workshop.confirmPieceDeletion());assert.strictEqual(workshop.pieces.length,count-1);assert(!store.readWorkshopLibrary().pieces.some(saved=>saved.id===piece.id));assert.strictEqual(workshop.libraryNotice,'WORKSHOP_PIECE_DELETED');workshop.$destroy();
 });
 await test('failed deletion remains reviewable, and all MIDI/delete UI labels are translated',()=>{
  const workshop=view();workshop.loadLibrary();const piece=workshop.pieces[0];assert(piece);assert(workshop.requestPieceDeletion(piece));store.deleteStoredWorkshopPiece(piece.id);const before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);assert.strictEqual(workshop.confirmPieceDeletion(),false);assert(workshop.pieceToDelete);assert.strictEqual(workshop.pieceDeleteError,'WORKSHOP_PIECE_DELETE_ERROR');assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  const labels=['WORKSHOP_MIDI_IMPORT','WORKSHOP_MIDI_IMPORTED','WORKSHOP_MIDI_IMPORT_ERROR','WORKSHOP_DELETE_PIECE','WORKSHOP_DELETE_PIECE_HINT','WORKSHOP_DELETE_CANCEL','WORKSHOP_DELETE_CONFIRM','WORKSHOP_PIECE_DELETED','WORKSHOP_PIECE_DELETE_ERROR'];
  ['notation-inferred','quantized-timing','instruments-ignored','percussion-ignored','performance-controls-ignored','incomplete-notes','voices-merged'].forEach(code=>labels.push(workshop.xmlWarningKey(code)));
  ['unsupported-midi-format','unsupported-midi-timing','unsupported-midi-score','empty-midi'].forEach(code=>labels.push(workshop.importErrorKey(new Error(code),'midi')));
  labels.forEach(key=>{assert(de[key],key+' DE');assert(en[key],key+' EN');});assert.strictEqual(workshop.importErrorKey(new Error('musicxml-too-large'),'midi'),'WORKSHOP_XML_TOO_LARGE');workshop.$destroy();
 });
})().catch(error=>{console.error(error);process.exitCode=1;});

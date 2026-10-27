const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,loader=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return loader(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
function storage(){const values=new Map();return {get length(){return values.size;},key(index){return Array.from(values.keys())[index]||null;},getItem(key){return values.has(key)?values.get(key):null;},setItem(key,value){values.set(key,String(value));},removeItem(key){values.delete(key);}};}
if(!global.localStorage)global.localStorage=storage();
const model=require('../src/model/Workshop'),editor=require('../src/model/WorkshopScoreEditor'),rests=require('../src/model/WorkshopRests');
const backup=require('../src/model/SaveDataBackup'),imports=require('../src/model/SaveDataImport'),store=require('../src/model/WorkshopStorage');
const musicXml=require('../src/model/WorkshopMusicXml');
function test(name,body){body();process.stdout.write('✓ generated rests: '+name+'\n');}
function note(startSlot=2,voice=1){const event={id:'pitched-note',kind:'note',pitch:{step:'F',alter:.5,octave:4},startSlot,noteValue:'eighth',dots:1,accidentalDisplay:{force:true,enclosure:'parentheses',cautionary:true},fingering:3,articulations:['accent']};if(voice!==1)event.voice=voice;return event;}
function pause(voice=1,extra={}){return Object.assign({id:model.workshopId('rest'),kind:'rest',pitch:null,noteValue:'quarter',startSlot:0},voice!==1?{voice}:{},extra);}
function replaceVoice(measure,voice){const changed=Object.assign({},measure.events.find(event=>event.kind==='note'));if(voice===1)delete changed.voice;else changed.voice=voice;const events=editor.replaceWorkshopEvents(measure,[changed]);assert(events);return Object.assign({},measure,{events});}
function pitchOnly(event){const copy=model.cloneWorkshop(event);delete copy.voice;return copy;}

test('new fillers are marked and cycling a real note through four voices never leaves empty voices behind',()=>{
 const original=note(),saved=model.cloneWorkshop(original);let measure={events:[]};measure.events=editor.placeWorkshopEvent(measure,original.startSlot,original);assert(measure.events);
 assert(measure.events.some(event=>event.kind==='rest' && event.autoRest===true));
 for(const voice of [2,3,4,1,4,2,1]) {
  measure=replaceVoice(measure,voice);assert.deepStrictEqual(Array.from(new Set(measure.events.map(model.workshopEventVoice))),[voice]);
  assert.deepStrictEqual(pitchOnly(measure.events.find(event=>event.kind==='note')),saved);
  assert(measure.events.filter(event=>event.kind==='rest').every(event=>event.autoRest===true));assert(model.isValidWorkshopMeasure(measure));
 }
});

test('manual and imported rest voices remain, including imports whose IDs match generated IDs',()=>{
 const manual=pause(3,{autoRest:false}),imported=pause(4),original=note();let measure={events:[manual,imported,original]};const expected=[model.cloneWorkshop(manual),model.cloneWorkshop(imported)];
 measure=replaceVoice(measure,2);for(const event of expected)assert.deepStrictEqual(measure.events.find(item=>item.id===event.id),event);
 assert.deepStrictEqual(new Set(measure.events.map(model.workshopEventVoice)),new Set([2,3,4]));
 assert(!rests.isWorkshopGeneratedRest(manual,{legacy:true}));assert(!rests.isWorkshopGeneratedRest(imported));
 const explicit=editor.placeWorkshopEvent({events:[]},0,pause(2));assert(explicit);assert.strictEqual(explicit[0].autoRest,false);
 assert(!rests.isWorkshopGeneratedRest(explicit[0],{legacy:true}));
});

test('known local legacy fillers can be marked on a clone without touching saved source data',()=>{
 const old=pause(2),real=note(2,4),measure={events:[old,real]},before=JSON.stringify(measure);
 assert(rests.isWorkshopGeneratedRest(old,{legacy:true}));assert(!rests.isWorkshopGeneratedRest(old));
 assert.deepStrictEqual(rests.pruneWorkshopGeneratedRestVoices(measure.events),measure.events);
 assert.deepStrictEqual(rests.pruneWorkshopGeneratedRestVoices(measure.events,{legacy:true}),[real]);
 const marked=rests.withWorkshopRestProvenance(measure,{legacy:true});assert.notStrictEqual(marked,measure);assert.notStrictEqual(marked.events[0],old);assert.strictEqual(marked.events[0].autoRest,true);
 assert.strictEqual(JSON.stringify(measure),before);const changed=replaceVoice(marked,3);assert(!changed.events.some(event=>model.workshopEventVoice(event)===2));assert.deepStrictEqual(pitchOnly(changed.events.find(event=>event.kind==='note')),pitchOnly(real));
 for(const id of ['rest','rest-one','rest-manual-123','note-a-b-c-d','rest-xyz-dead-beef-cafe'])assert(!rests.isWorkshopGeneratedRest(Object.assign({},old,{id}),{legacy:true}),id);
 assert(rests.isWorkshopGeneratedRest(Object.assign({},old,{id:'rest-mgn12abc-1-somechars12'}),{legacy:true}));
});

test('expressive rests and changed rest durations are protected even if they began as filler',()=>{
 for(const annotation of [{fermata:2},{pedal:'up'},{dots:1},{tuplet:{actual:5,normal:4}}]) {
  const event=pause(3,annotation);assert(!rests.isWorkshopGeneratedRest(event,{legacy:true}));assert.deepStrictEqual(rests.pruneWorkshopGeneratedRestVoices([event,note(2)] ,{legacy:true}),[event,note(2)]);
 }
 for(const annotation of [{fermata:2},{pedal:'down'}])assert(!rests.isWorkshopGeneratedRest(pause(3,Object.assign({autoRest:true},annotation))));
 const original=note();let measure={events:editor.placeWorkshopEvent({events:[]},original.startSlot,original)};
 const filler=measure.events.find(event=>event.kind==='rest'),updated=Object.assign({},filler,{noteValue:'eighth'});
 measure.events=editor.replaceWorkshopEvent(measure,filler.id,updated);assert(measure.events);const manual=measure.events.find(event=>event.id===filler.id);assert.strictEqual(manual.autoRest,false);
 measure=replaceVoice(measure,2);assert.strictEqual(measure.events.find(event=>event.id===filler.id).autoRest,false);assert(measure.events.some(event=>model.workshopEventVoice(event)===1));
});

test('splitting a deliberate rest preserves its manual provenance while new silence is generated',()=>{
 const manual=pause(3,{autoRest:false,noteValue:'half'}),placed=note(1,3);placed.noteValue='eighth';delete placed.dots;
 const events=editor.placeWorkshopEvent({events:[manual]},1,placed);assert(events);
 const fragments=events.filter(event=>event.kind==='rest');assert(fragments.length>=2);assert(fragments.every(event=>event.autoRest===false));
 const changed=replaceVoice({events},4);assert(changed.events.some(event=>model.workshopEventVoice(event)===3 && event.kind==='rest' && event.autoRest===false));
 assert.deepStrictEqual(pitchOnly(changed.events.find(event=>event.kind==='note')),pitchOnly(placed));
});

test('removing the last real note collapses purely generated voices to ordinary single-voice silence',()=>{
 const original=note(2,4),events=editor.placeWorkshopEvent({events:[]},original.startSlot,original);
 const removed=editor.removeWorkshopEvent({events},original.id);assert(removed);assert(removed.every(event=>event.kind==='rest' && model.workshopEventVoice(event)===1 && event.autoRest===true));
 assert.deepStrictEqual(rests.pruneWorkshopGeneratedRestVoices(removed),[]);
 const manual=pause(4,{autoRest:false});assert.deepStrictEqual(rests.pruneWorkshopGeneratedRestVoices([manual]),[manual]);
});

test('rest provenance survives local revisions and app imports while malformed flags reject',()=>{
 const score=model.createWorkshopDraft('Rest provenance').score,original=note();score.parts[0].measures[0].events=editor.placeWorkshopEvent({events:[]},original.startSlot,original);
 score.parts[0].measures[0].events.push(pause(3,{autoRest:false}));assert(model.isValidWorkshopScore(score));
 const source=storage(),saved=store.storeWorkshopDraft({title:'Rest provenance',pieceId:null,score},source),exported=backup.createSaveDataBackup(source);assert(backup.validateSaveDataBackup(exported).valid);
 assert.strictEqual(exported.data.workshopLibrary,undefined);const target=storage();target.setItem(model.WORKSHOP_STORAGE_KEY,source.getItem(model.WORKSHOP_STORAGE_KEY));for(const mode of ['replace','merge','merge']) {imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));assert.deepStrictEqual(store.readWorkshopLibrary(target),saved.library);}
 for(const flag of ['true',1,null,{}]) {const bad=model.cloneWorkshop(score);bad.parts[0].measures[0].events.find(event=>event.kind==='rest').autoRest=flag;assert(!model.isValidWorkshopScore(bad));}
 const bad=model.cloneWorkshop(score);bad.parts[0].measures[0].events.find(event=>event.kind==='note').autoRest=true;assert(!model.isValidWorkshopScore(bad));
 const legacy=model.cloneWorkshop(score);legacy.parts[0].measures[0].events.forEach(event=>delete event.autoRest);const before=JSON.stringify(legacy);assert(model.isValidWorkshopScore(legacy));assert.strictEqual(JSON.stringify(legacy),before);
});

test('export cleans old local filler-only voices on a copy and retains native provenance, notes and deliberate rests',()=>{
 const score=model.createWorkshopDraft('Legacy silence export',1).score,real=note(),activeFiller=pause(),ghost=pause(3);
 const explicit=pause(4,{autoRest:false}),oldManual=pause(2,{id:'note-manual-pause'});
 score.parts[0].measures[0].events=[activeFiller,ghost,explicit,oldManual,real];
 assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score);
 const exported=musicXml.exportWorkshopMusicXmlText(score,{title:'Legacy silence export'}),restored=musicXml.importWorkshopMusicXmlText(exported.data);
 const events=restored.score.parts[0].measures[0].events;
 assert(!events.some(event=>event.id===ghost.id || model.workshopEventVoice(event)===3));
 assert.deepStrictEqual(events.find(event=>event.id===real.id),real);
 assert.deepStrictEqual(events.find(event=>event.id===explicit.id),explicit);
 assert.deepStrictEqual(events.find(event=>event.id===oldManual.id),oldManual);
 assert.deepStrictEqual(events.find(event=>event.id===activeFiller.id),Object.assign({},activeFiller,{autoRest:true}));
 assert.strictEqual(JSON.stringify(score),before,'export must not migrate or mutate the saved caller score');
 assert.strictEqual(musicXml.exportWorkshopMusicXmlText(restored.score,{title:restored.title}).data,exported.data,'the cleaned native roundtrip is stable');
 const moved=replaceVoice({events},2);
 assert(!moved.events.some(event=>event.id===activeFiller.id || model.workshopEventVoice(event)===1));
 assert(moved.events.some(event=>event.id===explicit.id));
});

test('an imported rest-only voice survives later editing and native re-export despite generated-looking rest IDs',()=>{
 const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>12</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><type>quarter</type></note><backup><duration>12</duration></backup><note><rest/><duration>48</duration><voice>3</voice><type>whole</type></note></measure></part></score-partwise>';
 const imported=musicXml.importWorkshopMusicXmlText(xml),bar=imported.score.parts[0].measures[0],manual=bar.events.find(event=>event.kind==='rest');
 assert(manual && /^rest-/.test(manual.id));assert.strictEqual(manual.autoRest,false);assert(!rests.isWorkshopGeneratedRest(manual,{legacy:true}));
 imported.score.bpm=80;const before=JSON.stringify(imported.score),exported=musicXml.exportWorkshopMusicXmlText(imported.score,{title:imported.title});
 const restored=musicXml.importWorkshopMusicXmlText(exported.data);
 assert.deepStrictEqual(restored.score.parts[0].measures[0].events,bar.events);
 assert.strictEqual(JSON.stringify(imported.score),before);
 const moved=replaceVoice({events:restored.score.parts[0].measures[0].events},4);
 assert.deepStrictEqual(moved.events.find(event=>event.id===manual.id),manual);
});

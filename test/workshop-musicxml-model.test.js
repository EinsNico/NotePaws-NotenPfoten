const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
function storage(){const values=new Map();return {get length(){return values.size;},key(index){return Array.from(values.keys())[index]||null;},getItem(key){return values.has(key)?values.get(key):null;},setItem(key,value){values.set(key,String(value));},removeItem(key){values.delete(key);}};}
if (!global.localStorage) global.localStorage=storage();
const root=path.resolve(__dirname,'../src')+path.sep,load=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(root) ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename) : load(mod,filename);
const m=require('../src/model/Workshop'),r=require('../src/model/WorkshopRhythm'),editor=require('../src/model/WorkshopScoreEditor'),{createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const backup=require('../src/model/SaveDataBackup'),imports=require('../src/model/SaveDataImport'),storageModel=require('../src/model/WorkshopStorage');
Module._extensions['.js']=load;
function test(label,fn){fn();process.stdout.write('✓ workshop MusicXML model: '+label+'\n');}
function score(count=1){return m.createWorkshopDraft('Expanded',count).score;}
function note(id,start=0,value=48,noteValue='quarter',extra={}){return Object.assign({id,kind:'note',pitch:m.workshopPitchFromValue(value),noteValue,startSlot:start},extra);}
function direction(id,type,value,startSlot=0,extra={}){return Object.assign({id,type,value,startSlot},extra);}
function close(actual,expected){assert(Math.abs(actual-expected)<1e-5,actual+' versus '+expected);}
function runPlayback(piece){let now=0,next=0;const timers=new Map(),played=[],stopped=[];
 const player={play(value,volume){const sample={value,volume};played.push({value,volume,now,sample});return sample;},stop(sample){stopped.push({sample,now});},stopAll(){}};
 const playback=createWorkshopPlayback(piece,player,{appVolume:100,nowFn:()=>now,setTimeoutFn(fn,delay){const id=++next;timers.set(id,{fn,due:now+delay});return id;},clearTimeoutFn(id){timers.delete(id);}});
 assert(playback.start());while(timers.size){const [id,item]=Array.from(timers.entries()).sort((a,b)=>a[1].due-b[1].due)[0];timers.delete(id);now=item.due;item.fn();assert(now<1000000);}
 return {played,stopped,now};}

test('full piano range and double accidentals survive staff placement and atomic group movement',()=>{
 for(let value=9;value<=96;value++)for(const clef of ['treble','bass']){const pitch=m.workshopPitchFromValue(value);assert(m.isValidWorkshopMeasure({events:[note('n',0,value)]}));assert.deepStrictEqual(editor.workshopPitchAtStaffY(editor.workshopStaffY(pitch,clef),pitch.alter,clef),pitch);}
 for(const alter of [-2,-1,0,1,2]){const n=note('a');n.pitch={step:'C',octave:4,alter};assert(m.isValidWorkshopMeasure({events:[n]}));}
 assert(!m.isValidWorkshopMeasure({events:[note('low',0,8)]}));assert(!m.isValidWorkshopMeasure({events:[note('high',0,97)]}));
});
test('all dotted written values through 1024ths and 2–9 tuplets retain exact durations',()=>{
 for(const [name,units] of Object.entries(r.WORKSHOP_NOTE_UNITS))for(let dots=0;dots<=3;dots++)for(const actual of [2,3,5,7,9]){const normal=actual===2 ? 3 : 2;const event={noteValue:name,dots,tuplet:{actual,normal}};assert(r.workshopTimeOnGrid(r.workshopEventUnits(event)));close(r.workshopEventUnits(event),units*(2-Math.pow(.5,dots))*normal/actual);}
 const s=score();s.meter='3+2/8';s.parts[0].measures[0].events=[note('a',4,48,'eighth')];assert(m.isValidWorkshopScore(s));assert.strictEqual(m.workshopMeterUnits(s.meter),5);
});
test('quintuplet groups support simultaneous chord tones and survive grouped editing',()=>{
 const events=Array.from({length:5},(_,i)=>note('n'+i,i,48,'eighth')),bar={id:'five',events};const grouped=editor.makeWorkshopTuplet(bar,events.map(n=>n.id),5,4);assert(grouped);
 const notes=grouped.filter(n=>n.kind==='note');assert(notes.every(n=>n.tuplet.actual===5));notes.forEach((n,i)=>close(n.startSlot,i*.8));
 assert(m.isValidWorkshopMeasure({events:grouped}));const restored=editor.splitWorkshopTriplets({events:grouped},['n2']);assert(restored);assert(restored.filter(n=>n.kind==='note').every(n=>!n.tuplet));
});
test('tempo changes and linear tempo ramps affect both notes and bar boundaries',()=>{
 let s=score(2);s.parts[0].measures[0].events=[note('first'),note('after',4)];s.parts[0].measures[0].directions=[direction('tempo','tempo',120,4)];
 let timeline=m.workshopTimeline(s);close(timeline.events.find(e=>e.id==='first').durationMs,1000);close(timeline.events.find(e=>e.id==='after').durationMs,500);close(timeline.measures[0].endMs,3000);close(timeline.durationMs,5000);
 s=score();s.parts[0].measures[0].directions=[direction('ramp','tempoRamp',120,0,{endSlot:8})];timeline=m.workshopTimeline(s);close(timeline.durationMs,4000*Math.log(2));
 const played=runPlayback(s);close(played.now,timeline.durationMs);
});
test('a shared fermata holds notes and moves later onsets without double-counting chord tones',()=>{
 const s=score();s.parts[0].measures[0].events=[note('a',0,48,'quarter',{fermata:2}),note('b',0,52,'quarter',{fermata:2}),note('later',2)];const t=m.workshopTimeline(s);close(t.events.find(e=>e.id==='a').durationMs,2000);close(t.events.find(e=>e.id==='later').startMs,2000);close(t.durationMs,5000);
 const p=runPlayback(s);close(p.played.find(e=>e.value===48 && e.now>0).now,2000);
});
test('wedge loudness grows across a bar and retains its endpoint until another dynamic changes',()=>{
 const s=score(2);s.parts[0].measures[0].dynamic='p';s.parts[0].measures[0].directions=[direction('w','wedge','crescendo',0,{endSlot:8})];s.parts[0].measures[0].events=[note('a'),note('b',4)];s.parts[0].measures[1].events=[note('c')];const t=m.workshopTimeline(s);close(t.events.find(e=>e.id==='a').dynamicLevel,.35);close(t.events.find(e=>e.id==='b').dynamicLevel,.5);close(t.events.find(e=>e.id==='c').dynamicLevel,.65);
 const p=runPlayback(s);assert(p.played[0].volume<p.played[1].volume);close(p.played[2].volume,65);
 s.parts[0].measures[1].dynamic='pp';close(m.workshopTimeline(s).events.find(e=>e.id==='c').dynamicLevel,.2);close(runPlayback(s).played[2].volume,20);
});
test('first and second endings and navigation jumps produce finite musical bar orders',()=>{
 const s=score(4),bars=s.parts[0].measures;bars[0].repeatStart=true;bars[1].ending=[1];bars[1].repeatEnd=2;bars[2].ending=[2];assert.deepStrictEqual(m.workshopPlaybackBarOrder(s),[0,1,0,2,3]);
 const dc=score(3);dc.parts[0].measures[1].navigation=['fine'];dc.parts[0].measures[2].navigation=['dc'];assert.deepStrictEqual(m.workshopPlaybackBarOrder(dc),[0,1,2,0,1]);
 const ds=score(5);ds.parts[0].measures[1].navigation=['segno'];ds.parts[0].measures[2].navigation=['toCoda'];ds.parts[0].measures[3].navigation=['ds'];ds.parts[0].measures[4].navigation=['coda','fine'];assert.deepStrictEqual(m.workshopPlaybackBarOrder(ds),[0,1,2,3,1,2,4]);
});
test('grace notes steal a small window from their main onset and arpeggios spread chord attacks',()=>{
 const s=score();s.parts[0].measures[0].events=[note('grace',0,50,'eighth',{grace:true}),note('main',0),note('roll1',2,48,'quarter',{arpeggio:'up'}),note('roll2',2,52,'quarter',{arpeggio:'up'}),note('roll3',2,55,'quarter',{arpeggio:'up'})];const t=m.workshopTimeline(s);close(t.durationMs,4000);assert(t.events.find(e=>e.id==='main').startMs>0);assert(t.events.find(e=>e.id==='grace').durationMs>0);assert(t.events.find(e=>e.id==='roll1').startMs<t.events.find(e=>e.id==='roll2').startMs);assert(t.events.find(e=>e.id==='roll2').startMs<t.events.find(e=>e.id==='roll3').startMs);
 assert.strictEqual(runPlayback(s).played.length,5);
});
test('ornaments create actual note attacks using the active key and octave signs transpose only playback',()=>{
 const s=m.setWorkshopSecondStaffEnabled(score(),true);s.keyId='G-major';s.parts[0].measures[0].events=[note('trill',0,52,'quarter',{ornament:'trill',displayStaff:1})];s.parts[1].measures[0].directions=[direction('ottava','octaveShift',1,0,{endSlot:2})];const t=m.workshopTimeline(s);const attacks=t.events.filter(e=>e.id==='trill');assert(attacks.length>2);assert(attacks.some(e=>e.value===64));assert(attacks.some(e=>e.value===66));assert.strictEqual(m.workshopPitchValue(s.parts[0].measures[0].events[0].pitch),52);assert.strictEqual(runPlayback(s).played.length,attacks.length);
 s.parts[0].measures[0].directions=s.parts[1].measures[0].directions;delete s.parts[1].measures[0].directions;const unshifted=m.workshopTimeline(s).events.filter(e=>e.id==='trill');assert(unshifted.some(e=>e.value===52));assert(unshifted.some(e=>e.value===54));assert(!unshifted.some(e=>e.value===64));
});
test('timed pedal supports release and half-pedal decay without ending live notes',()=>{
 const s=score();s.parts[0].measures[0].events=[note('first'),note('next',2,52)];s.parts[0].measures[0].directions=[direction('half','pedal','half'),direction('release','pedal','up',4)];const p=runPlayback(s);close(p.stopped.find(e=>e.sample.value===48).now,1300);close(p.played.find(e=>e.value===52).now,1000);
});
test('metadata, source XML and layout survive revisions and structural edits without modifying old scores',()=>{
 let s=score(2);const legacy=JSON.stringify(s);s=m.setWorkshopMetadata(s,{title:'Name',composer:'Komponist',copyright:'©',subtitle:'Untertitel'});s=m.setWorkshopLayout(s,{fontFamily:'serif',fontSize:12,barsPerSystem:2,pageWidth:800,systemBreaks:[s.parts[0].measures[1].id]});s.musicXml={sourceXml:'<score-partwise/>',fingerprint:'known',warnings:['unsupported-clef']};assert(m.isValidWorkshopScore(s));
 const saved=m.saveWorkshopDraft(null,{title:'Name',pieceId:null,score:s},'2026-10-03T00:00:00.000Z');const next=m.removeWorkshopMeasure(s,1);assert(next);assert.deepStrictEqual(next.layout.systemBreaks,[]);assert.deepStrictEqual(m.openWorkshopPiece(saved.piece).score,s);assert.strictEqual(JSON.stringify(score()).includes('metadata'),false);assert(!legacy.includes('musicXml'));
});
test('annotation validation rejects malformed timing, unknown fields and unbounded values atomically',()=>{
 for(const d of [direction('bad','tempo',0),direction('bad','wedge','crescendo',2,{endSlot:1}),direction('bad','pedal','always'),direction('bad','text',false)]){const s=score();s.parts[0].measures[0].directions=[d];assert(!m.isValidWorkshopScore(s));}
 const s=score();s.parts[0].measures[0].events=[note('n',0,48,'quarter',{fermata:100})];assert(!m.isValidWorkshopScore(s));s.parts[0].measures[0].events=[note('n',0,48,'quarter',{dots:4})];assert(!m.isValidWorkshopScore(s));
});
test('app imports leave local expanded notation, source archives and all revisions untouched',()=>{
 let s=m.setWorkshopSecondStaffEnabled(score(2),true);s.metadata={title:'XML',composer:'Writer'};s.layout={pageWidth:800,barsPerSystem:2,systemBreaks:[s.parts[0].measures[1].id]};
 s.musicXml={sourceXml:'<score-partwise/>',fingerprint:'source',warnings:['unknown'],rootPath:'scores/piece.musicxml',archiveAssets:[{path:'images/cover.png',data:'aGk='}]};
 s.parts[0].measures[0].events=[note('one',0,48,'eighth',{dots:3,fermata:2,ornament:'turn',lyric:'La',stem:'up',displayStaff:1})];
 s.parts[0].measures[0].directions=[direction('d','tempo',90),direction('w','wedge','crescendo',0,{endSlot:8,endBarId:s.parts[0].measures[1].id})];
 s.parts[0].measures[1].navigation=['fine'];assert(m.isValidWorkshopScore(s));
 const source=storage(),saved=storageModel.storeWorkshopDraft({title:'XML',pieceId:null,score:s},source),before=JSON.stringify(saved.piece.revisions[0]);
 const next=m.openWorkshopPiece(saved.piece);next.score.metadata.composer='Another';storageModel.storeWorkshopDraft(next,source);const exported=backup.createSaveDataBackup(source);assert(backup.validateSaveDataBackup(exported).valid);
 assert.strictEqual(exported.data.workshopLibrary,undefined);const target=storage();target.setItem(m.WORKSHOP_STORAGE_KEY,source.getItem(m.WORKSHOP_STORAGE_KEY));for(const mode of ['replace','merge','merge']){imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));assert.deepStrictEqual(storageModel.readWorkshopLibrary(target),storageModel.readWorkshopLibrary(source));}
 assert.strictEqual(JSON.stringify(storageModel.readWorkshopLibrary(target).pieces[0].revisions[0]),before);
 const invalid=m.cloneWorkshop(s);invalid.musicXml.archiveAssets[0].path='../escape';assert(!m.isValidWorkshopScore(invalid));
});
test('recursive snapshots preserve JSON semantics and immutable source text without sharing mutable objects',()=>{
 const sparse=[];sparse.length=3;sparse[1]=Infinity;
 const input={text:'x'.repeat(2*1024*1024),array:[undefined,NaN,()=>{},Symbol('x'),sparse],omit:undefined,fn:()=>{},symbol:Symbol('s'),date:new Date('2026-10-03T00:00:00.000Z'),nested:{value:1},negativeZero:-0,boxed:new Number(2)};
 Object.defineProperty(input,'__proto__',{value:{safe:true},enumerable:true});const expected=JSON.parse(JSON.stringify(input)),copy=m.cloneWorkshop(input);
 assert.deepStrictEqual(copy,expected);assert.strictEqual(copy.text,input.text);assert.notStrictEqual(copy.nested,input.nested);copy.nested.value=2;assert.strictEqual(input.nested.value,1);assert.strictEqual(Object.getPrototypeOf(copy),Object.prototype);assert(Object.prototype.hasOwnProperty.call(copy,'__proto__'));
 const shared={a:1},cloned=m.cloneWorkshop({one:shared,two:shared});assert.notStrictEqual(cloned.one,cloned.two);const cycle={};cycle.self=cycle;assert.throws(()=>m.cloneWorkshop(cycle),/circular/);assert.throws(()=>m.cloneWorkshop({big:1n}),/BigInt/);assert.throws(()=>m.cloneWorkshop(Object(1n)),/BigInt/);assert.throws(()=>m.cloneWorkshop(undefined),SyntaxError);
});
console.log('Workshop MusicXML model tests passed.');

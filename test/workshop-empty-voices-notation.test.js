const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue'),Glyphs=require('abcjs/src/write/creation/glyphs');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
const model=require('../src/model/Workshop'),{workshopEventVoice,workshopEventUnits}=require('../src/model/WorkshopRhythm');
const filename=path.resolve(sourceRoot,'components/WorkshopStaff.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const staff=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content)),tests=[];
function test(name,body){tests.push([name,body]);}
function note(voice=1,slot=0,step='C',octave=4,noteValue='quarter'){return {id:model.workshopId('note'),kind:'note',pitch:{step,alter:0,octave},startSlot:slot,noteValue,...(voice===1?{}:{voice})};}
function rest(id,voice=1,slot=0,noteValue='whole',extra={}){return Object.assign({id,kind:'rest',pitch:null,startSlot:slot,noteValue},voice===1?{}:{voice},extra);}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function fixture(events,props={}){
 const measure={events},view=new Vue(Object.assign({},staff,{propsData:Object.assign({measure},props),methods:Object.assign({},staff.methods,{$t:key=>key})})),emitted=[],captures=new Set();
 view.$refs.sheet={getScreenCTM(){return {a:1,b:0,c:0,d:1,inverse(){return {};}};},createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);}};
 for(const name of ['place','select','move-note','move-notes'])view.$on(name,payload=>emitted.push({name,payload}));
 const pointer=(x,y)=>({clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,cancelable:true,preventDefault(){},stopPropagation(){}});
 return {view,emitted,pointer,destroy(){view.$destroy();}};
}
function glyphBounds(event,name,scale=1.1){
 const commands=Glyphs.getPathForSymbol(event.x-4,event.y,name,scale,scale),points=[];let x=0,y=0,sx=0,sy=0;
 for(const c of commands){const kind=c[0].toLowerCase(),relative=c[0]===kind;if(kind==='z'){x=sx;y=sy;continue;}const p=c.slice(1).map((v,i)=>v+(relative?(i%2?y:x):0));
   if(kind==='c')for(let i=0;i<=100;i++){const t=i/100,u=1-t;points.push([u*u*u*x+3*u*u*t*p[0]+3*u*t*t*p[2]+t*t*t*p[4],u*u*u*y+3*u*u*t*p[1]+3*u*t*t*p[3]+t*t*t*p[5]]);}
   else assert(['m','l'].includes(kind),'unexpected glyph command '+kind);
   x=p[p.length-2];y=p[p.length-1];if(kind==='m'){sx=x;sy=y;}points.push([x,y]);
 }
 return {left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
}
function overlap(a,b){return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;}
function assertReadableRests(view){
 const rests=view.events.filter(e=>e.kind==='rest').map(event=>({event,box:glyphBounds(event,view.restGlyph(event.noteValue))}));
 const heads=view.events.filter(e=>e.kind==='note').map(event=>({event,box:{left:event.x-7,right:event.x+7,top:event.y-5,bottom:event.y+5}}));
 rests.forEach(({event,box},i)=>{rests.slice(i+1).forEach(other=>assert(!overlap(box,other.box),'rest '+event.id+' voice '+workshopEventVoice(event)+' overlaps rest '+other.event.id+' voice '+workshopEventVoice(other.event)));
   heads.forEach(other=>assert(!overlap(box,other.box),'rest '+event.id+' voice '+workshopEventVoice(event)+' overlaps note '+other.event.id+' voice '+workshopEventVoice(other.event)));
   assert(box.top>=view.geometry.top&&box.bottom<=view.geometry.top+view.geometry.height,'rest lies outside staff paper');
 });
}

test('legacy generated rest-only voices disappear only when the caller knows the piece has local provenance',()=>{
 const events=[note(),note(1,4,'G')],legacy=[];for(const voice of [2,3,4]){const event=rest(model.workshopId('rest'),voice);legacy.push(event);events.push(event);}
 const before=JSON.stringify(events);
 for(const readOnly of [false,true]){
   const local=fixture(events,{allowLegacyGeneratedRests:true,readOnly});assert.deepStrictEqual(Array.from(new Set(local.view.events.map(workshopEventVoice))),[1]);assert.strictEqual(local.view.events.filter(e=>e.kind==='note').length,2);local.destroy();
   const unknown=fixture(events,{allowLegacyGeneratedRests:false,readOnly});for(const entry of legacy)assert(unknown.view.events.some(e=>e.id===entry.id));unknown.destroy();
 }
 assert.strictEqual(JSON.stringify(events),before);
});

test('new generated rest-only voices vanish while manual, imported and annotated silent voices remain',()=>{
 const events=[note(),rest('rest-generated',2,0,'whole',{autoRest:true}),rest('note-manual-rest',3,0,'whole',{autoRest:false}),rest('rest-imported',4,0,'whole',{autoRest:false})];
 const f=fixture(events,{allowLegacyGeneratedRests:true});assert(!f.view.events.some(e=>workshopEventVoice(e)===2));assert(f.view.events.some(e=>e.id==='note-manual-rest'));assert(f.view.events.some(e=>e.id==='rest-imported'));f.destroy();
 const annotated=rest(model.workshopId('rest'),2,0,'whole',{fermata:2}),annotation=fixture([note(),annotated],{allowLegacyGeneratedRests:true});assert(annotation.view.events.some(e=>e.id===annotated.id));annotation.destroy();
});

test('a real MusicXML import preserves an intentionally silent second voice in the renderer',async()=>{
 global.regeneratorRuntime=require('babel-runtime/regenerator');const {importWorkshopMusicXml}=require('../src/model/WorkshopMusicXml');
 const xml='<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note><backup><duration>2</duration></backup><note><rest/><duration>8</duration><voice>2</voice><type>whole</type></note></measure></part></score-partwise>';
 const imported=await importWorkshopMusicXml(xml,{filename:'silent-voice.musicxml'}),events=imported.score.parts[0].measures[0].events,before=JSON.stringify(events),pause=events.find(e=>e.kind==='rest'&&workshopEventVoice(e)===2);assert(pause);
 const f=fixture(events,{allowLegacyGeneratedRests:false});assert(f.view.events.some(e=>e.id===pause.id));assert.strictEqual(f.view.events.filter(e=>workshopEventVoice(e)===2).reduce((sum,e)=>sum+workshopEventUnits(e),0),8);assert.strictEqual(JSON.stringify(events),before);f.destroy();
});

test('choosing an unused tool voice does not add a ghost full-bar rest row to existing music',async()=>{
 const events=[note(2,0,'G'),note(2,4,'B')],before=JSON.stringify(events),f=fixture(events,{voice:1});
 const original=f.view.events.map(e=>[e.kind,e.noteValue,e.startSlot,workshopEventVoice(e),e.x,e.y]);
 for(const voice of [3,4,1,2]){f.view.voice=voice;await Vue.nextTick();assert.deepStrictEqual(f.view.events.map(e=>[e.kind,e.noteValue,e.startSlot,workshopEventVoice(e),e.x,e.y]),original);}
 assert.strictEqual(JSON.stringify(events),before);f.destroy();
 const blank=fixture([],{voice:4});assert(blank.view.events.some(e=>e.kind==='rest'));assert.strictEqual(new Set(blank.view.events.map(workshopEventVoice)).size,1);blank.destroy();
});

test('real music in two, three or four voices retains its timing with separate readable rests',()=>{
 for(const count of [2,3,4])for(const staggered of [false,true])for(const explicitSilence of [false,true]){
   const events=Array.from({length:count},(_,index)=>note(index+1,staggered?index*2:6,['D','G','D','G'][index],[5,4,5,4][index]));
   if(explicitSilence)for(let voice=1;voice<=count;voice++)if(events[voice-1].startSlot>=2)events.push(rest('intentional-'+voice,voice,0,'quarter',{autoRest:false}));
   const before=JSON.stringify(events),f=fixture(events,{voice:1}),drawn=f.view.events.filter(e=>e.kind==='note');
   assert.strictEqual(drawn.length,count);drawn.forEach((e,index)=>{assert.strictEqual(e.id,events[index].id);assert.strictEqual(e.startSlot,events[index].startSlot);assert.deepStrictEqual(e.pitch,events[index].pitch);});
   for(let voice=1;voice<=count;voice++)assert.strictEqual(f.view.events.filter(e=>workshopEventVoice(e)===voice).reduce((sum,e)=>sum+workshopEventUnits(e),0),8);
   assertReadableRests(f.view);assert.strictEqual(JSON.stringify(events),before);f.destroy();
 }
});

test('an intentional explicit pause stays keyboard- and pointer-selectable after layout',()=>{
 const pause=rest('rest-intentional',3,0,'quarter',{autoRest:false}),events=[note(1,2,'F'),pause],before=JSON.stringify(events),f=fixture(events,{voice:3,kind:'rest',selectedEventId:pause.id});
 const rendered=f.view.events.find(e=>e.id===pause.id);assert(rendered&&!rendered.implicit);
 f.view.pointerDown(f.pointer(rendered.x,rendered.y));f.view.pointerUp(f.pointer(rendered.x,rendered.y));assert(f.emitted.some(e=>e.name==='select'&&e.payload.id===pause.id));
 f.view.keyDown({key:'Enter',preventDefault(){}},rendered);assert.strictEqual(f.emitted.filter(e=>e.name==='select'&&e.payload.id===pause.id).length,2);
 assert.strictEqual(f.emitted.filter(e=>e.name==='place').length,0);assert.strictEqual(JSON.stringify(events),before);f.destroy();
});

test('rerendering a draft with different voice contents follows its current data without editing the source',async()=>{
 const first=[note(1,0,'F'),rest('rest-old-empty',2,0,'whole',{autoRest:true})],second=[note(2,0,'C'),rest('rest-new-empty',1,0,'whole',{autoRest:true})];
 const firstBefore=JSON.stringify(first),secondBefore=JSON.stringify(second),f=fixture(first,{allowLegacyGeneratedRests:true});
 assert.deepStrictEqual(Array.from(new Set(f.view.events.map(workshopEventVoice))),[1]);f.view.measure={events:second};await Vue.nextTick();assert.deepStrictEqual(Array.from(new Set(f.view.events.map(workshopEventVoice))),[2]);
 f.view.measure={events:first};await Vue.nextTick();assert.deepStrictEqual(Array.from(new Set(f.view.events.map(workshopEventVoice))),[1]);assert.strictEqual(JSON.stringify(first),firstBefore);assert.strictEqual(JSON.stringify(second),secondBefore);f.destroy();
});

(async()=>{let failed=0;for(const [name,body]of tests){try{await body();process.stdout.write('✓ '+name+'\n');}catch(error){failed++;console.error('FAILED: '+name+'\n'+error.stack);}}assert.strictEqual(failed,0,'empty voice notation groups failed');process.stdout.write('Workshop empty voice notation tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

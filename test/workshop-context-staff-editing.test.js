const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const filename=path.resolve(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const model=require('../src/model/Workshop'),editor=require('../src/model/WorkshopScoreEditor');
const {workshopAccidentalPath,workshopAccidentalEnclosurePath,workshopAccidentalInk}=require('../src/model/WorkshopAccidentalGlyphs');
const {spaceWorkshopAccidentalsTogether}=require('../src/model/WorkshopChordLayout');
const {workshopXAtMappedSlot}=require('../src/model/WorkshopHorizontalMapping');
const staff=component('WorkshopStaff'),cases=[];
function test(name,body){cases.push([name,body]);}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function note(step='F',alter=0,octave=4,slot=0,noteValue='eighth',extra={}){return Object.assign({id:model.workshopId('note'),kind:'note',pitch:{step,alter,octave},startSlot:slot,noteValue},extra);}
function change(startSlot,extra={}){return Object.assign({id:model.workshopId('context'),startSlot},extra);}
function fixture(props={}){
 const view=new Vue(Object.assign({},staff,{propsData:Object.assign({measure:{events:[]}},props),methods:Object.assign({},staff.methods,{$t:key=>key})}));const events=[],captures=new Set();
 view.$refs.sheet={getScreenCTM(){return {a:.8,b:0,c:0,d:.8,inverse(){return {};}};},createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:(this.x-40)/.8,y:(this.y-30)/.8};}};},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);}};
 for(const name of ['place','move-note','move-notes','select','change-clef','change-meter','edit-context'])view.$on(name,payload=>events.push({name,payload}));
 const pointer=(x,y)=>({clientX:x*.8+40,clientY:y*.8+30,pointerId:1,isPrimary:true,button:0,cancelable:true,preventDefault(){},stopPropagation(){}});
 return {view,events,captures,pointer,destroy(){view.$destroy();}};
}
function heads(f){return f.view.events.filter(event=>event.kind==='note');}
function place(f,slot,y){const count=f.events.filter(e=>e.name==='place').length,x=f.view.mappedSlotX(slot);f.view.pointerDown(f.pointer(x,y));f.view.pointerUp(f.pointer(x,y));const event=f.events.filter(e=>e.name==='place').pop();assert(event && f.events.filter(e=>e.name==='place').length===count+1,'no place at slot '+slot+' x='+x+' geometry='+JSON.stringify(f.view.geometry)+' anchors='+JSON.stringify(f.view.horizontalMapping.anchors));return event.payload;}
function close(a,b,label){assert(Math.abs(a-b)<1e-8,label+': '+a+' vs '+b);}

test('clef changes reposition each written pitch and key changes determine each accidental without changing score data',()=>{
 const events=[note('F',0,4,0),note('F',1,4,2),note('F',0,3,3),note('F',0,4,4),note('F',.5,4,5)];
 const changes=[change(2,{clef:'bass',keyId:'G-major'}),change(4,{clef:'treble',keyId:'C-major'})],measure={events,contextChanges:changes},before=JSON.stringify(measure),f=fixture({measure});
 const drawn=heads(f);assert.deepStrictEqual(drawn.map(event=>event.displayClef),['treble','bass','bass','treble','treble']);
 drawn.forEach((event,index)=>assert.strictEqual(event.y,editor.workshopStaffY(events[index].pitch,index>=1&&index<=2?'bass':'treble')));
 assert.deepStrictEqual(drawn.map(event=>event.accidental),[null,null,'nat',null,'halfsharp']);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test('context markers survive raw chord and final beam layout, reserve space and cancel all outgoing key signs',()=>{
 const events=[note('F',1,4,0,'sixteenth',{beamGroupId:'beam'}),note('G',1,4,.5,'sixteenth',{beamGroupId:'beam'}),note('F',0,4,2,'sixteenth'),note('A',0,4,3,'sixteenth')];
 const changed=change(2,{keyId:'C-major',clef:'bass'}),measure={events,contextChanges:[changed]},f=fixture({measure,keyId:'C-sharp-major'});
 assert.strictEqual(f.view.unspacedNotation.contextChanges.length,1);assert.strictEqual(f.view.notation.contextChanges.length,1);assert.strictEqual(f.view.beams.length,2);
 const marker=f.view.notation.contextChanges[0],before=heads(f).filter(event=>event.startSlot<2),after=heads(f).filter(event=>event.startSlot>=2);
 assert.strictEqual(marker.id,changed.id);assert.strictEqual(marker.signature.length,7);assert(marker.signature.every(pitch=>pitch.alter===0));
 assert(before.every(event=>event.x+8<marker.x));assert(after.every(event=>event.x-8>marker.x+marker.width));assert(marker.x+marker.width<f.view.geometry.width-12);
 const rendered=nodes(f.view._render()).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-context-change']===changed.id);assert(rendered);assert.strictEqual(rendered.children.filter(node=>node.tag==='path').length,8);f.destroy();
});

test('pointer placement on either side of an empty context boundary follows displayed clef and key',()=>{
 const f=fixture({measure:{events:[],contextChanges:[change(2,{clef:'bass',keyId:'G-major'})]},followKeySignature:true,noteValue:'sixteenth'});
 for(const [slot,clef,pitch] of [[1.5,'treble',{step:'F',alter:0,octave:4}],[2,'bass',{step:'F',alter:1,octave:3}],[4,'bass',{step:'F',alter:1,octave:3}]]){
   const result=place(f,slot,editor.workshopStaffY(pitch,clef));assert.strictEqual(result.slot,slot);assert.deepStrictEqual(result.pitch,pitch);
 }
 f.destroy();
});

test('pointer placement into an existing time column remains exact after a wide key and clef marker',()=>{
 const f=fixture({measure:{events:[note('C',0,4,0),note('C',0,3,2),note('D',0,3,3)],contextChanges:[change(2,{clef:'bass',keyId:'C-sharp-major'})]},followKeySignature:true,noteValue:'sixteenth'});
 for(const slot of [0,1,2,3,6,7.5]){
   const after=slot>=2,pitch={step:'F',alter:after?1:0,octave:after?3:4};const placed=place(f,slot,editor.workshopStaffY(pitch,after?'bass':'treble'));assert.strictEqual(placed.slot,slot);assert.deepStrictEqual(placed.pitch,pitch);
 }
 f.destroy();
});

test('horizontal drags across clef and key boundaries retain absolute pitch while previewing the new staff position',()=>{
 for(const [start,target,initialClef,laterClef,pitch] of [[0,3,'treble','bass',{step:'F',alter:.5,octave:4}],[3,0,'treble','bass',{step:'B',alter:-1,octave:2}],[0,3,'bass','treble',{step:'D',alter:0,octave:3}]]){
   const event=note(pitch.step,pitch.alter,pitch.octave,start),measure={events:[event],contextChanges:[change(2,{clef:laterClef,keyId:'G-major'})]},before=JSON.stringify(measure),f=fixture({measure,clef:initialClef,noteValue:'sixteenth'}),head=heads(f)[0];
   f.view.pointerDown(f.pointer(head.x,head.y));const map=f.view.gesture.horizontalMapping,targetX=workshopXAtMappedSlot(map,target);
   f.view.pointerMove(f.pointer(targetX,head.y));assert.strictEqual(f.view.gesture.slot,target);assert.deepStrictEqual(f.view.gesture.pitch,pitch);const preview=heads(f).find(item=>item.id===event.id);assert.strictEqual(preview.y,editor.workshopStaffY(pitch,target>=2?laterClef:initialClef));
   f.view.pointerUp(f.pointer(targetX,head.y));const moved=f.events.find(item=>item.name==='move-note');assert(moved);assert.deepStrictEqual(moved.payload.pitch,pitch);assert.strictEqual(moved.payload.slot,target);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
 }
});

test('moving a chord across a clef boundary keeps its members and intervals together',()=>{
 const a=note('C',0,4,0),b=note('E',-.5,4,0),measure={events:[a,b],contextChanges:[change(2,{clef:'bass'})]},before=JSON.stringify(measure),f=fixture({measure,noteValue:'sixteenth'}),head=heads(f).find(item=>item.id===a.id);
 f.view.pointerDown(f.pointer(head.x,head.y));assert(f.view.gesture.group);const x=workshopXAtMappedSlot(f.view.gesture.horizontalMapping,3);
 f.view.pointerMove(f.pointer(x,head.y));assert.deepStrictEqual(heads(f).map(item=>item.pitch),[a.pitch,b.pitch]);assert(heads(f).every(item=>item.displaySlot===3));assert(heads(f).every(item=>item.displayClef==='bass'));
 f.view.pointerUp(f.pointer(x,head.y));const moved=f.events.find(item=>item.name==='move-notes');assert(moved);assert.deepStrictEqual(moved.payload.ids.sort(),[a.id,b.id].sort());assert.deepStrictEqual(moved.payload.pitch,a.pitch);assert.strictEqual(moved.payload.slot,3);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test('vertical keyboard edits use the note local clef and keep microtonal alterations',()=>{
 const event=note('F',.5,3,3),f=fixture({measure:{events:[event],contextChanges:[change(2,{clef:'bass'})]}}),head=heads(f)[0];
 f.view.keyDown({key:'ArrowUp',preventDefault(){}},head);assert.deepStrictEqual(f.events.filter(e=>e.name==='move-note').pop().payload,{id:event.id,pitch:{step:'G',alter:.5,octave:3},slot:3});
 f.view.keyDown({key:'ArrowDown',preventDefault(){}},head);assert.deepStrictEqual(f.events.filter(e=>e.name==='move-note').pop().payload.pitch,{step:'E',alter:.5,octave:3});f.destroy();
});

test('context controls emit edit actions and read-only sheet markers reject gestures',()=>{
 const changed=change(2,{clef:'bass'});
 for(const readOnly of [false,true]){
   const f=fixture({measure:{events:[],contextChanges:[changed]},readOnly}),node=nodes(f.view._render()).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-context-change']===changed.id);
   assert.strictEqual(node.data.attrs.role,readOnly?null:'button');node.data.on.pointerdown(f.pointer(180,116));
   assert.deepStrictEqual(f.events.filter(e=>e.name==='edit-context').map(e=>e.payload),readOnly?[]:[changed.id]);assert.strictEqual(f.events.filter(e=>e.name==='place').length,0);f.destroy();
 }
});

test('both staves share time columns when only one changes clef and has wide enclosed accidentals',()=>{
 const upper={events:[note('C',0,4,0),note('F',.5,3,2,'sixteenth',{accidentalDisplay:{force:true,enclosure:'parentheses'}}),note('G',1.5,3,3)],contextChanges:[change(2,{clef:'bass',keyId:'C-sharp-major'})]};
 const lower={events:[note('C',0,3,0),note('D',0,3,2,'sixteenth'),note('E',0,3,3)]},first=fixture({measure:upper}),second=fixture({measure:lower,clef:'bass'});
 const combined=spaceWorkshopAccidentalsTogether([first.view.unspacedNotation,second.view.unspacedNotation],[{gridStep:first.view.gridStep},{gridStep:second.view.gridStep}]);
 first.view.horizontalColumns=second.view.horizontalColumns=combined.columns;first.view.frameWidth=second.view.frameWidth=combined.width;
 for(const slot of [0,2,3])close(heads(first).find(e=>e.startSlot===slot).x,heads(second).find(e=>e.startSlot===slot).x,'aligned slot '+slot);
 assert.strictEqual(first.view.geometry.width,second.view.geometry.width);assert.strictEqual(first.view.notation.contextChanges.length,1);assert.strictEqual(second.view.notation.contextChanges.length,0);
 first.destroy();second.destroy();
});

test('dense successive context changes stay ordered with all notes selectable through the final slot',()=>{
 const events=Array.from({length:16},(_,index)=>note('F',index%2?.5:0,4,index*.5,'sixteenth'));
 const contextChanges=Array.from({length:15},(_,index)=>change((index+1)*.5,{keyId:index%2?'C-major':'C-sharp-major',clef:index%2?'treble':'bass'}));
 const measure={events,contextChanges},before=JSON.stringify(measure),f=fixture({measure,noteValue:'sixteenth'}),markers=f.view.notation.contextChanges;
 assert.strictEqual(markers.length,15);assert(f.view.geometry.width>360);assert(f.view.geometry.width<10000);
 for(let index=0;index<markers.length;index++){
   const marker=markers[index],following=heads(f).find(item=>item.startSlot===marker.startSlot),preceding=heads(f).find(item=>item.startSlot===marker.startSlot-.5);
   assert(marker.x>preceding.x+8);assert(following.x-8>marker.x+marker.width);assert(marker.x+marker.width<f.view.geometry.width-12);
 }
 for(const head of heads(f)){f.view.pointerDown(f.pointer(head.x,head.y));f.view.pointerUp(f.pointer(head.x,head.y));}
 assert.deepStrictEqual(f.events.filter(item=>item.name==='select').map(item=>item.payload.id),events.map(item=>item.id));
 assert.strictEqual(f.events.filter(item=>item.name==='place').length,0);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test('forced natural, quarter-tone and three-quarter-tone signs and enclosures render exactly their spacing geometry',()=>{
 const events=[note('F',0,4,0,'sixteenth',{accidentalDisplay:{force:true,enclosure:'parentheses'}}),note('F',-.5,4,1,'sixteenth',{accidentalDisplay:{force:true,enclosure:'bracket'}}),note('G',1.5,4,2,'sixteenth'),note('B',-1.5,4,3,'sixteenth')],measure={events},before=JSON.stringify(measure),f=fixture({measure});
 const rendered=nodes(f.view._render()),paths=rendered.filter(node=>node.tag==='path').map(node=>node.data.attrs.d),enclosures=rendered.filter(node=>node.data&&node.data.staticClass==='accidental-enclosure');assert.strictEqual(enclosures.length,2);
 assert.deepStrictEqual(heads(f).map(e=>e.accidental),['nat','halfflat','threequartersharp','threequarterflat']);
 for(const event of heads(f)){
   assert(paths.includes(workshopAccidentalPath(event)));const ink=workshopAccidentalInk(event);assert(ink.right+3<=event.x-7+.01,'sign must clear its head');assert(ink.left>=f.view.geometry.left-6);if(event.accidentalDisplay)assert(paths.includes(workshopAccidentalEnclosurePath(event)));
 }
 assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});
(async()=>{let failures=0;for(const [name,body] of cases){try{await body();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;console.error('FAILED: '+name+'\n'+error.stack);}}assert.strictEqual(failures,0,'context staff test groups failed');process.stdout.write('Workshop context staff editing tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const root=path.resolve(__dirname,'../src')+path.sep,loader=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>file.startsWith(root) ? mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file) : loader(mod,file);
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),editor=require('../src/model/WorkshopScoreEditor'),expression=require('../src/model/WorkshopExpression');
const layout=require('../src/model/WorkshopConnectionLayout');
const file=path.join(root,'components/WorkshopStaff.vue'),parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
const definition=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
function note(value=48,startSlot=0,extra={}) {return Object.assign({id:model.workshopId('note'),kind:'note',pitch:model.workshopPitchFromValue(value),noteValue:'quarter',startSlot},extra);}
function nodes(node) {return [node].concat(...(node.children||[]).map(nodes));}
function view(props={}) {return new Vue(Object.assign({},definition,{propsData:Object.assign({measure:{events:[]}},props),methods:Object.assign({},definition.methods,{$t:key=>key})}));}
const cases=[];function test(name,run){cases.push([name,run]);}
test('four clefs draw distinct symbols and invert pitch placement without changing sound',()=>{
  const c4={step:'C',alter:0,octave:4},expected={treble:176,bass:56,alto:116,tenor:96},paths=[];
  for(const clef of Object.keys(expected)) {
    assert.strictEqual(editor.workshopStaffY(c4,clef),expected[clef]);
    assert.deepStrictEqual(editor.workshopPitchAtStaffY(expected[clef],0,clef),c4);
    const v=view({clef,measure:{events:[note()]}}),head=v.events.find(event=>event.kind==='note');
    assert.strictEqual(head.y,expected[clef]);assert.deepStrictEqual(v.movementPitch(c4,head.y,clef),c4);
    const target=nodes(v._render()).find(node=>node.data && node.data.attrs && node.data.attrs['data-workshop-context']==='clef');
    paths.push(target.children.find(node=>node.tag==='path').data.attrs.d);v.$destroy();
  }
  assert.strictEqual(new Set(paths).size,4);assert(paths.every(value=>value.length>50));
});
test('unslashed grace, fermata shapes and tremolo stroke counts retain separate visible values',()=>{
  const event=note(48,0,{grace:true,graceSlash:false,fermata:1.75,fermataShape:'square'}),v=view({measure:{events:[event]}});
  let all=nodes(v._render());assert(!all.some(node=>node.data && node.data.staticClass==='grace-slash'));
  const marked=v.events.find(item=>item.id===event.id),mark=marked.notationMarks.find(item=>item.kind==='fermata');
  const square=v.notationMarkPath(marked,mark),angled=v.notationMarkPath(Object.assign({},marked,{fermataShape:'angled'}),mark);
  assert(square && angled && square!==angled);
  assert.strictEqual((v.tremoloPath(Object.assign({},marked,{tremoloMarks:1})).match(/M /g)||[]).length,1);
  assert.strictEqual((v.tremoloPath(Object.assign({},marked,{tremoloMarks:4})).match(/M /g)||[]).length,4);v.$destroy();
});
test('multiple lyric verses and melisma extensions enlarge the frame and render each stanza',()=>{
  const first=note(48,0,{lyrics:[{number:'1',text:'Hal',syllabic:'begin'},{number:'2',text:'La',extend:'start'}]}),second=note(50,2),v=view({compact:true,measure:{events:[first,second]}});
  const all=nodes(v._render()),lyrics=all.filter(node=>node.data && node.data.staticClass==='lyric-line');
  assert.strictEqual(lyrics.length,2);assert.deepStrictEqual(lyrics.map(node=>node.data.attrs['data-stanza']),['1','2']);
  assert(all.some(node=>node.data && node.data.staticClass==='lyric-extension'));
  v.selectedEventId=first.id;const selected=v.events.find(item=>item.id===first.id);assert(selected.labelY > selected.lyricY+38);assert(selected.labelY > v.dynamicY+20);
  const head=v.events.find(event=>event.id===first.id);assert(v.geometry.top+v.geometry.height >= head.lyricY+25);v.$destroy();
});
test('global lyric stanza rows survive single-verse bars and relocated source ownership',()=>{
  const event=note(48,0,{lyrics:[{number:'2',text:'Second verse'}]}),v=view({compact:true,measure:{events:[event]},lyricVerseNumbers:['1','2']});
  assert.strictEqual(v.events.find(item=>item.id===event.id).displayLyrics[0].rowIndex,1);assert.strictEqual(v.lyricRows,2);
  const moved=note(48,0,{displayStaff:1,lyrics:[{number:'3',text:'Third verse'}]}),cross=view({staffIndex:1,measure:{events:[]},companionMeasure:{events:[moved]},sourceLyricVerseNumbers:[['1','2','3'],['1']]});
  const rendered=cross.events.find(item=>item.id===moved.id);assert(rendered);assert.strictEqual(rendered.displayLyrics[0].rowIndex,2);assert.strictEqual(cross.lyricRows,3);v.$destroy();cross.$destroy();
});
test('glissando and two-note tremolo render real paths including relocated endpoints',()=>{
  let score=model.createWorkshopDraft('Connections').score;const from=note(48,0),to=note(55,2);score.parts[0].measures[0].events=[from,to];
  score=expression.connectWorkshopGlissando(score,[from.id,to.id]);assert(score);
  const v=view({measure:score.parts[0].measures[0],glissandos:expression.workshopMeasureGlissandos(score,0,0)});
  assert.strictEqual(v.glissandoLines.length,1);assert(v.glissandoLines[0].path.includes(' L '));v.$destroy();
  const tremolo=expression.connectWorkshopTremolo(score,[from.id,to.id],2);assert(tremolo);
  const t=view({measure:tremolo.parts[0].measures[0],tremolos:expression.workshopMeasureTremolos(tremolo,0,0)});
  assert.strictEqual(t.tremoloConnections.length,1);assert.strictEqual((t.tremoloConnections[0].path.match(/M /g)||[]).length,2);t.$destroy();
  const events=[Object.assign({},from,{x:100,y:120,stemX:106,stemEndY:80,visualStaff:0}),Object.assign({},to,{x:180,y:320,stemX:186,stemEndY:280,visualStaff:1})];
  const overlay=layout.layoutWorkshopCrossStaffConnections(events,score.glissandos,tremolo.tremolos);
  assert.strictEqual(overlay.curves.length,2);assert(overlay.curves.every(curve=>curve.path && !curve.path.includes('NaN')));
});
test('nearby short notes retain glissandos and never draw backward melisma strokes',()=>{
  for (const value of ['sixteenth','thirtysecond','sixtyfourth']) {
    const width=value === 'sixteenth' ? .5 : value === 'thirtysecond' ? .25 : .125;
    const first=note(48,0,{noteValue:value,lyrics:[{number:'1',text:'Singen',extend:'start'}]}),last=note(55,width,{noteValue:value});
    const score=model.createWorkshopDraft('Close connections').score;score.parts[0].measures[0].events=[first,last];
    const linked=expression.connectWorkshopGlissando(score,[first.id,last.id]);assert(linked);
    const staff=view({measure:linked.parts[0].measures[0],glissandos:expression.workshopMeasureGlissandos(linked,0,0)});
    assert.strictEqual(staff.glissandoLines.length,1,value);assert(staff.glissandoLines[0].path);
    const extension=nodes(staff._render()).find(node=>node.data && node.data.staticClass==='lyric-extension');
    if (extension) assert(extension.data.attrs.x2 > extension.data.attrs.x1);
    const notes=staff.events.filter(event=>event.kind==='note').map((event,index)=>Object.assign({},event,{visualStaff:index}));
    const overlay=layout.layoutWorkshopCrossStaffConnections(notes,linked.glissandos);assert.strictEqual(overlay.curves.length,1);assert(overlay.curves[0].path);staff.$destroy();
  }
});
test('all extra articulations produce visible symbols and mixed rest selection remains safe',()=>{
  const n=note(48,0,{articulations:['strong-accent','breath-mark','caesura','detached-legato']}),r={id:model.workshopId('rest'),kind:'rest',pitch:null,startSlot:2,noteValue:'quarter'},v=view({measure:{events:[n,r]},multiSelect:true,selectedEventIds:[n.id]});
  const event=v.events.find(item=>item.id===n.id);assert(event.expressionMarks.every(mark=>v.expressionPath(event,mark).length>10));
  const selected=v.selectionFor(v.events.find(item=>item.id===r.id));assert.deepStrictEqual(selected.ids,[n.id,r.id]);assert.strictEqual(selected.group,false);v.$destroy();
});
test('mixed note-rest tuplets can be formed and removed without losing the rest',()=>{
  const first=note(48,0,{noteValue:'eighth'}),rest={id:model.workshopId('rest'),kind:'rest',pitch:null,startSlot:1,noteValue:'eighth',autoRest:false},last=note(52,2,{noteValue:'eighth'}),measure={events:[first,rest,last]},ids=[first.id,rest.id,last.id];
  const triplet=editor.makeWorkshopTuplet(measure,ids,3,2);assert(triplet);
  assert.strictEqual(triplet.find(event=>event.id===rest.id).kind,'rest');assert(model.isValidWorkshopMeasure({events:triplet}));
  const plain=editor.splitWorkshopTriplets({events:triplet},[rest.id]);assert(plain);
  assert(ids.every(id=>plain.some(event=>event.id===id && !event.tuplet)));assert.strictEqual(plain.find(event=>event.id===rest.id).startSlot,1);
});
for(const [name,run] of cases){run();process.stdout.write('✓ '+name+'\n');}
process.stdout.write(cases.length+' workshop audit rendering regressions passed.\n');

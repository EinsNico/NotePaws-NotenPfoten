const assert=require("assert"),fs=require("fs"),path=require("path"),Module=require("module");
const babel=require("babel-core"),compiler=require("vue-template-compiler"),Vue=require("vue");
const sourceRoot=path.resolve(__dirname,"../src")+path.sep,originalLoader=Module._extensions[".js"];
Module._extensions[".js"]=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{ babelrc:false,presets:[["env",{ modules:"commonjs" }]] }).code,filename);
};
Module._extensions[".vue"]=mod => { mod.exports={}; };
const model=require("../src/model/Workshop"),rhythm=require("../src/model/WorkshopRhythm"),expression=require("../src/model/WorkshopExpression"),editor=require("../src/model/WorkshopScoreEditor");
function component(name) {
  const filename=path.resolve(sourceRoot,"components",name+".vue"),parsed=compiler.parseComponent(fs.readFileSync(filename,"utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename]=mod;
  mod._compile(babel.transform(parsed.script.content,{ babelrc:false,presets:[["env",{ modules:"commonjs" }]] }).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component("WorkshopStaff"),sheet=component("WorkshopSheet"),symbol=component("WorkshopSymbol"),bridge=component("WorkshopEditorBeamBridge"),cases=[];
const {workshopMeasureDirectionSpans}=require("../src/model/WorkshopNotationDirections");
const {layoutWorkshopCrossStaffBeams,layoutWorkshopCrossStaffCurves}=require("../src/model/WorkshopBeamLayout");
function test(name,body) { cases.push([name,body]); }
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function note(value=52,startSlot=0,noteValue="quarter",extra={}) {
  return Object.assign({ id:model.workshopId("note"),kind:"note",pitch:model.workshopPitchFromValue(value),startSlot,noteValue },extra);
}
function staffFixture(props={}) {
  const view=new Vue(Object.assign({},staff,{ propsData:Object.assign({ measure:{ events:[] } },props),methods:Object.assign({},staff.methods,{ $t:key => key }) }));
  const events=[],captures=new Set();
  view.$refs.sheet={ getScreenCTM() { return { a:1,b:0,c:0,d:1,inverse() { return {}; } }; },
    createSVGPoint() { return { x:0,y:0,matrixTransform() { return { x:this.x,y:this.y }; } }; },
    setPointerCapture(id) { captures.add(id); },hasPointerCapture(id) { return captures.has(id); },releasePointerCapture(id) { captures.delete(id); } };
  for (const name of ["place","select","select-group","move-note","move-notes","change-clef","change-meter"]) view.$on(name,payload => events.push({ name,payload }));
  const pointer=(x,y) => ({ clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,cancelable:true,preventDefault() {},stopPropagation() {} });
  return { view,events,captures,pointer,destroy() { view.$destroy(); } };
}
function sheetFixture(score,props={}) {
  return new Vue(Object.assign({},sheet,{ propsData:Object.assign({ score },props),components:{ WorkshopStaff:staff },
    mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},sheet.methods,{ $t:key => key }) }));
}
function heads(view) { return view.events.filter(event => event.kind === "note"); }
function staffNodes(view) { return nodes(view._render()).filter(node => node.componentOptions && node.componentOptions.tag === "WorkshopStaff"); }
function assertSiblingKeysUnique(node) {
  const keys=(node.children || []).filter(child => child.key !== undefined).map(child => String(child.key));
  assert.strictEqual(new Set(keys).size,keys.length,"duplicate SVG sibling keys: "+keys.join(", "));
  (node.children || []).forEach(assertSiblingKeysUnique);
}


test("expanded note values, three dots and eight beam levels render without clipping or duplicate keys",() => {
  for (const value of Object.keys(rhythm.WORKSHOP_NOTE_UNITS)) {
    const dots=value === "maxima" ? 0 : 3;
    const measure={meter:"32/1",events:[note(52,0,value,{dots})]},f=staffFixture({measure,noteValue:value,dots});
    assert(model.isValidWorkshopMeasure(measure),value);assertSiblingKeysUnique(f.view._render());
    const flags=nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "flag");
    assert.strictEqual(flags.length,["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"].indexOf(value)+1 > 0 ? ["eighth","sixteenth","thirtysecond","sixtyfourth","onetwentyeighth","twofiftysixth","fivehundredtwelfth","onethousandtwentyfourth"].indexOf(value)+1 : 0,value);
    assert.strictEqual(nodes(f.view._render()).filter(node => node.data && node.data.staticClass === "augmentation-dot").length,dots,value);
    assert(f.view.gridSlots.length <= 257);assert(f.view.geometry.top <= f.view.stems[0].y2);
    const icon=new Vue(Object.assign({},symbol,{propsData:{noteValue:value,dots}}));assertSiblingKeysUnique(icon._render());icon.$destroy();f.destroy();
  }
  const events=[0,1,2].map(index => note(52+index,index/128,"onethousandtwentyfourth",{beamGroupId:"eight-beams"}));
  assert(model.isValidWorkshopMeasure({events}));const f=staffFixture({measure:{events}});
  assert.deepStrictEqual(f.view.beams.map(beam => beam.level),[1,2,3,4,5,6,7,8]);assert(f.view.stems.every(stem => stem.beamed));assertSiblingKeysUnique(f.view._render());f.destroy();
});

test("quintuplets and septuplets retain their actual numbers and exact played note positions",() => {
  for (const actual of [5,7]) {
    const tuplet={actual,normal:4},events=Array.from({length:actual},(_,index) => note(52+index,index*4/actual,"eighth",{tuplet,tupletGroupId:"tuplet-"+actual}));
    assert(model.isValidWorkshopMeasure({events}));const before=JSON.stringify(events),f=staffFixture({measure:{events}});
    const group=f.view.tuplets.find(group => group.id === "tuplet-"+actual);assert(group);assert.strictEqual(group.number,actual);
    assert.strictEqual(rhythm.workshopTimeTicks(heads(f.view).slice(-1)[0].endSlot),rhythm.workshopTimeTicks(4));
    assert(f.view.gridSlots.length <= 257);assert.strictEqual(JSON.stringify(events),before);assertSiblingKeysUnique(f.view._render());f.destroy();
  }
});

test("full piano range, double accidentals, grace notes, ornaments and lyrics stay visible and individually selectable",() => {
  const grace=note(54,0,"eighth",{grace:true}),main=note(52,0,"quarter",{dots:2,ornament:"trill",fermata:2,arpeggio:"up",lyric:"Can-ta",articulations:["staccato"],fingering:3});
  const events=[grace,main,note(9,3),note(96,5)];
  events[2].pitch={step:"B",alter:-2,octave:0};events[3].pitch={step:"B",alter:2,octave:7};
  const before=JSON.stringify(events),f=staffFixture({measure:{events}}),drawn=heads(f.view),rendered=nodes(f.view._render());
  assert(drawn.some(event => event.accidental === "dblflat"));assert(drawn.some(event => event.accidental === "dblsharp"));
  assert(drawn.find(event => event.id === grace.id).x < drawn.find(event => event.id === main.id).x);
  for (const className of ["grace-slash","notation-mark","arpeggio","lyric"]) assert(rendered.some(node => node.data && (node.data.staticClass || "").split(" ").includes(className)),className);
  for (const event of drawn) {assert(event.y >= f.view.geometry.top && event.y <= f.view.geometry.top+f.view.geometry.height);(event.notationMarks || []).forEach(mark => assert(mark.y-17 >= f.view.geometry.top));}
  assert(f.view.dynamicY > drawn.find(event => event.id === main.id).lyricY+20);
  for (const event of drawn) {f.view.pointerDown(f.pointer(event.x,event.y));f.view.pointerUp(f.pointer(event.x,event.y));}
  assert.strictEqual(f.events.filter(event => event.name === "place").length,0);assert.strictEqual(JSON.stringify(events),before);assertSiblingKeysUnique(f.view._render());f.destroy();
  for (const ornament of ["mordent","inverted-mordent","turn","inverted-turn","tremolo"]) {
    const fixture=staffFixture({measure:{events:[note(52,0,"quarter",{ornament})]}});assert(nodes(fixture.view._render()).some(node => node.data && (node.data.staticClass || "").includes(ornament === "tremolo" ? "tremolo" : "notation-mark")));fixture.destroy();
  }
});

test("timed directions, navigation and endings occupy separate lanes and span changing measures",() => {
  const score=model.createWorkshopDraft("",3).score,first=score.parts[0].measures[0],last=score.parts[0].measures[2];
  last.meter="3/4";
  first.directions=[
    {id:"tempo",startSlot:0,type:"tempo",value:80},
    {id:"words",startSlot:0,type:"text",value:"cantabile"},
    {id:"volume",startSlot:2,type:"dynamic",value:"sfz"},
    {id:"crescendo",startSlot:0,endSlot:4,endBarId:last.id,type:"wedge",value:"crescendo"},
    {id:"octave",startSlot:0,endSlot:4,endBarId:last.id,type:"octaveShift",value:1},
    {id:"pedal",startSlot:0,type:"pedal",value:"half"},
    {id:"ramp",startSlot:4,endSlot:8,type:"tempoRamp",value:50}
  ];first.ending=[1,2];first.navigation=["segno","coda","fine","dc","ds","toCoda"];
  for (let barIndex=0;barIndex<3;barIndex++) {
    const measure=model.resolveWorkshopMeasure(score,barIndex),spans=workshopMeasureDirectionSpans(score,0,barIndex);
    const f=staffFixture({measure,barIndex,directionSpans:spans});
    if (barIndex === 0) {assert.strictEqual(f.view.directionMarks.length,7);assert.strictEqual(f.view.navigationMarks.length,6);assert(f.view.endingMark.text.includes("1."));assert(f.view.endingMark.y < Math.min(...f.view.directionMarks.map(mark => mark.minimumY)));}
    else {assert.strictEqual(f.view.directionMarks.length,2);assert(spans.every(span => span.continuation));assert.strictEqual(f.view.directionMarks.find(mark => mark.type === "octaveShift").text,null);}
    f.view.directionMarks.forEach(mark => {assert(mark.minimumY >= f.view.geometry.top);assert(mark.maximumY <= f.view.geometry.top+f.view.geometry.height);});assertSiblingKeysUnique(f.view._render());f.destroy();
  }
  assert.strictEqual(workshopMeasureDirectionSpans(score,0,1)[0].endSlot,8);
  assert.strictEqual(workshopMeasureDirectionSpans(score,0,2)[0].endSlot,4);
});

test("cross-staff notes preserve source ownership, selection and drag geometry while their shared beam spans both staves",async () => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",2).score,true);
  const first=note(52,0,"sixteenth",{beamGroupId:"cross"}),second=note(36,.5,"sixteenth",{beamGroupId:"cross",displayStaff:1});
  score.parts[0].measures[0].events=[first,second];assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score);
  const upper=staffFixture({measure:model.resolveWorkshopMeasure(score,0,0),staffIndex:0,companionMeasure:model.resolveWorkshopMeasure(score,0,1)});
  const lower=staffFixture({measure:model.resolveWorkshopMeasure(score,0,1),clef:"bass",staffIndex:1,companionMeasure:model.resolveWorkshopMeasure(score,0,0)});
  assert.deepStrictEqual(heads(upper.view).map(event => event.id),[first.id]);assert.deepStrictEqual(heads(lower.view).map(event => event.id),[second.id]);
  const hit=heads(lower.view)[0];assert.strictEqual(hit.sourcePartIndex,0);lower.view.pointerDown(lower.pointer(hit.x,hit.y));lower.view.pointerUp(lower.pointer(hit.x,hit.y));
  assert.strictEqual(lower.events[0].name,"select");assert.strictEqual(lower.events[0].payload.id,second.id);
  lower.view.pointerDown(lower.pointer(hit.x,hit.y));lower.view.pointerMove(lower.pointer(hit.x+31,hit.y-10));assert(lower.view.previewEvents);assert(!lower.view.blockedDrag);lower.view.pointerUp(lower.pointer(hit.x+31,hit.y-10));
  assert(lower.events.some(event => event.name === "move-note" && event.payload.id === second.id));
  const sheetView=sheetFixture(score),bar=sheetView.systems[0].bars[0];assert.deepStrictEqual(bar.crossStaff.groupIds,["cross"]);assert.deepStrictEqual(bar.crossStaff.beams.map(beam => beam.level),[1,2]);
  assert(bar.crossStaff.stems.some(stem => stem.direction === -1));assert(bar.crossStaff.stems.some(stem => stem.direction === 1));
  const rendered=staffNodes(sheetView);assert(rendered.filter(node => node.componentOptions.propsData.barIndex === 0).every(node => node.componentOptions.propsData.crossStaffBeamIds.includes("cross")));
  assert.strictEqual(JSON.stringify(score),before);sheetView.$destroy();upper.destroy();lower.destroy();
});

test("same-bar ties and slurs join both piano staves once without misleading boundary fragments",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",2).score,true),from=note(52,0),to=note(52,2,"quarter",{displayStaff:1});
  score.parts[0].measures[0].events=[from,to];score.ties=[{fromId:from.id,toId:to.id}];score.slurs=[{fromId:from.id,toId:to.id}];
  assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score),view=sheetFixture(score),bar=view.systems[0].bars[0];
  assert.deepStrictEqual(bar.crossStaff.curves.map(curve => curve.kind),["tie","slur"]);assert.strictEqual(bar.crossStaff.relationIds.length,2);
  const nodesForBar=staffNodes(view).filter(node => node.componentOptions.propsData.barIndex === 0);
  for (const node of nodesForBar) {
    const props=node.componentOptions.propsData,fixture=staffFixture(props);assert.strictEqual(fixture.view.tieCurves.length,0);assert.strictEqual(fixture.view.slurCurves.length,0);
    assert(props.crossStaffRelationIds.every(id => id.includes(from.id) && id.includes(to.id)));fixture.destroy();
  }
  const drawn=nodes(view._render()).filter(node => node.data && node.data.staticClass === "cross-staff-curve");assert.strictEqual(drawn.length,2);
  assert(bar.crossStaff.curves.every(curve => curve.minimumY >= 0 && curve.maximumY <= view.systems[0].height));assertSiblingKeysUnique(view._render());
  const cramped=layoutWorkshopCrossStaffCurves([{id:from.id,kind:"note",x:100,y:100,startSlot:0,visualStaff:0},{id:to.id,kind:"note",x:100,y:350,startSlot:2,visualStaff:1}],score.ties,score.slurs);
  assert.strictEqual(cramped.curves.length,2);assert(cramped.curves.every(curve => !curve.path.includes("NaN")));
  assert.strictEqual(layoutWorkshopCrossStaffCurves([{id:from.id,kind:"note",x:100,y:100,startSlot:0,visualStaff:0}],score.ties,score.slurs).curves.length,0);
  assert.strictEqual(JSON.stringify(score),before);view.$destroy();
});

test("cross-bar staff changes retain boundary ties instead of being suppressed by the same-bar bridge",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",2).score,true),from=note(52,6),to=note(52,0,"quarter",{displayStaff:1});
  score.parts[0].measures[0].events=[from];score.parts[0].measures[1].events=[to];score.ties=[{fromId:from.id,toId:to.id}];
  assert(model.isValidWorkshopScore(score));const view=sheetFixture(score),bars=view.systems[0].bars;
  assert(bars.every(bar => bar.crossStaff.curves.length === 0 && bar.crossStaff.relationIds.length === 0));
  let segments=0;
  staffNodes(view).forEach(node => {const f=staffFixture(node.componentOptions.propsData);segments+=f.view.tieCurves.length;assert(f.view.tieCurves.every(curve => curve.partial));f.destroy();});
  assert.strictEqual(segments,2);view.$destroy();
});

test("editor beam bridge measures real staff transforms, updates geometry and leaves pointer input unobstructed",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft().score,true),notes=[note(52,0,"eighth",{beamGroupId:"bridge"}),note(36,1,"eighth",{beamGroupId:"bridge",displayStaff:1})];
  score.parts[0].measures[0].events=notes;score.slurs=[{fromId:notes[0].id,toId:notes[1].id}];
  const staves=[0,1].map(index => staffFixture({measure:model.resolveWorkshopMeasure(score,0,index),clef:index ? "bass" : "treble",staffIndex:index,companionMeasure:model.resolveWorkshopMeasure(score,0,index ? 0 : 1)}));
  staves.forEach((fixture,index) => {fixture.view.$refs.sheet.getScreenCTM=() => ({a:1.5,b:0,c:0,d:1.5,e:15,f:20+index*400});});
  const view=new Vue(Object.assign({},bridge,{propsData:{score,getStaffs:() => staves.map(fixture => fixture.view)},mounted:undefined}));
  view.$el={parentElement:{getBoundingClientRect:() => ({left:5,top:10,width:560,height:900})}};
  const groups=[],relations=[];view.$on("groups",ids => groups.push(ids));view.$on("relationgroups",ids => relations.push(ids));view.updateOverlay();
  assert.deepStrictEqual(groups,[['bridge']]);assert.strictEqual(view.width,560);assert.strictEqual(view.height,900);assert.strictEqual(view.overlay.stems.length,2);assert.strictEqual(view.overlay.beams.length,1);assert.strictEqual(view.overlay.curves.length,1);assert.strictEqual(relations[0].length,1);
  assertSiblingKeysUnique(view._render());view.$destroy();assert.deepStrictEqual(groups.slice(-1),[[]]);assert.deepStrictEqual(relations.slice(-1),[[]]);staves.forEach(fixture => fixture.destroy());
});

test("ordinary piano systems use only true compact content bounds and cross-staff pitches do not inflate the wrong row",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",4).score,true);
  score.parts.forEach((part,partIndex) => part.measures.forEach(measure => {measure.events=[note(partIndex ? 36 : 52,0),note(partIndex ? 41 : 55,2)];}));
  const view=sheetFixture(score);view.availableWidth=1200;
  assert.strictEqual(view.systems.length,1);const system=view.systems[0];assert(system.height <= 450,system.height);
  assert(system.frames.every(frame => frame.height <= 200));
  for (const node of staffNodes(view)) {const f=staffFixture(node.componentOptions.propsData);assert(f.view.events.filter(event => event.pitch).every(event => event.y-24 >= f.view.geometry.top && event.y+24 <= f.view.geometry.top+f.view.geometry.height));f.destroy();}
  view.$destroy();
  const transferred=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft().score,true);
  transferred.parts[0].measures[0].events=[note(9,0,"quarter",{displayStaff:1})];
  const shifted=sheetFixture(transferred),upper=shifted.systems[0].frames[0],lower=shifted.systems[0].frames[1];
  assert.strictEqual(upper.top,40);assert.strictEqual(upper.bottom,220);assert(lower.height > upper.height);
  const empty=staffFixture({measure:model.resolveWorkshopMeasure(transferred,0,0),staffIndex:0,companionMeasure:model.resolveWorkshopMeasure(transferred,0,1),readOnly:true,compact:true});
  assert.strictEqual(empty.view.geometry.top,40);assert.strictEqual(empty.view.geometry.height,180);empty.destroy();shifted.$destroy();
});

test("compact piano frames still enclose extreme ledger notes, ornaments, dots, directions and cross-staff bows",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",2).score,true);
  score.parts[0].measures[0].events=[note(9,0,"quarter",{fermata:2,ornament:"trill",fingering:5,lyric:"Low"}),note(96,2,"quarter",{dots:3,arpeggio:"up"})];
  score.parts[1].measures[0].events=[note(9,0,"eighth",{ornament:"tremolo"}),note(96,1,"eighth",{fermata:2,lyric:"High"})];
  score.parts[0].measures[0].directions=[{id:"tight-words",startSlot:0,type:"text",value:"cantabile"},{id:"tight-wedge",startSlot:0,endSlot:7,type:"wedge",value:"crescendo"}];
  const before=JSON.stringify(score),view=sheetFixture(score);
  for (const node of staffNodes(view)) {
    const f=staffFixture(node.componentOptions.propsData),top=f.view.geometry.top,bottom=top+f.view.geometry.height;
    f.view.events.filter(event => event.pitch).forEach(event => {assert(event.y-24 >= top);assert(event.y+24 <= bottom);
      (event.notationMarks || []).forEach(mark => {assert(mark.y-20 >= top);assert(mark.y+12 <= bottom);});if(event.lyric) {assert(event.lyricY-14 >= top);assert(event.lyricY+6 <= bottom);}});
    f.view.stems.forEach(stem => {assert(Math.min(stem.y1,stem.y2)-4 >= top);assert(Math.max(stem.y1,stem.y2)+4 <= bottom);});
    f.view.directionMarks.forEach(mark => {assert(mark.minimumY >= top);assert(mark.maximumY <= bottom);});f.destroy();
  }
  assert.strictEqual(JSON.stringify(score),before);view.$destroy();
});

test("metadata, custom page breaks, original spacing and additive meters keep responsive sheet frames coherent",async () => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",6).score,true);
  score.metadata={title:"Imported title",subtitle:"No. 2",composer:"Composer",arranger:"Arranger",lyricist:"Lyricist",copyright:"© 2026"};
  score.layout={pageWidth:1200,pageHeight:1600,marginLeft:40,marginRight:40,marginTop:20,marginBottom:20,staffDistance:30,systemDistance:25,fontFamily:"serif",fontSize:15,barsPerSystem:2,
    systemBreaks:[score.parts[0].measures[1].id],pageBreaks:[score.parts[0].measures[3].id]};
  score.parts.forEach(part => {part.measures[0].meter="3+2/8";});
  const before=JSON.stringify(score),view=sheetFixture(score,{title:"My edited title",activeBar:4});
  assert.strictEqual(view.pageCount,2);assert.strictEqual(view.pageIndex,1);view.changePage(-1);assert.strictEqual(view.systems[0].bars.length,1);
  assert.strictEqual(view.systems[0].bars[0].headerLeft,12+34+56);assert.strictEqual(view.systems[0].frames[1].y-view.systems[0].frames[0].y-view.systems[0].frames[0].height,30);
  const headings=nodes(view._render()).filter(node => node.tag === "h2");assert(headings.some(node => node.children.some(child => child.text === "My edited title")));
  assert(view.paperStyle.paddingLeft);assert.strictEqual(view.scoreFontStyle['--workshop-score-font'],"serif");
  view.activeBar=0;await Vue.nextTick();view.activeBar=4;await Vue.nextTick();assert.strictEqual(view.pageIndex,1);view.availableWidth=320;assert.strictEqual(view.barsPerSystem,1);assert.strictEqual(JSON.stringify(score),before);assertSiblingKeysUnique(view._render());view.$destroy();
});

test("dense accidental spacing gives both piano rows the same complete paper frame",() => {
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",1).score,true);
  score.parts[0].measures[0].events=Array.from({length:16},(_,index) => note(53,index*.5,"sixteenth",
    {pitch:{step:"F",alter:index%2 ? 0 : 1,octave:4},beamGroupId:"dense-accidentals"}));
  score.parts[1].measures[0].events=[0,2,4,6].map(slot => note(36,slot,"quarter"));
  assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score),view=sheetFixture(score);
  const bar=view.systems[0].bars[0];assert(bar.width > 360);
  const children=staffNodes(view);assert.strictEqual(children.length,2);
  const staffHeads=[];
  children.forEach(child => {
    assert.strictEqual(child.componentOptions.propsData.frameWidth,bar.width);
    const f=staffFixture(child.componentOptions.propsData);
    assert.strictEqual(f.view.geometry.width,bar.width);
    assert(heads(f.view).every(event => event.x+10 < bar.width-12));staffHeads.push(heads(f.view));f.destroy();
  });
  for (const slot of [0,2,4,6]) assert.strictEqual(staffHeads[0].find(event => event.startSlot === slot).x,staffHeads[1].find(event => event.startSlot === slot).x);
  assert.strictEqual(view.systems[0].width,bar.width+view.systems[0].braceSpace);
  assert.strictEqual(JSON.stringify(score),before);view.$destroy();
});

(async () => {for (const [name,body] of cases) {await body();process.stdout.write("✓ "+name+"\n");}process.stdout.write("Workshop MusicXML renderer tests passed.\n");})().catch(error => {console.error(error);process.exitCode=1;});

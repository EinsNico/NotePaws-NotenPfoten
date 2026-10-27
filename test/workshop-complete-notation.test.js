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
const staff=component("WorkshopStaff"),sheet=component("WorkshopSheet"),cases=[];
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

test("triplet symbols and fractional rests keep unique SVG keys through beam and articulation changes",async () => {
  const fractional=staffFixture({ measure:{ events:[note(52,0,"eighth",{ tuplet:3 })] } });
  assert(fractional.view.events.some(event => event.implicit && event.tuplet === 3));
  assertSiblingKeysUnique(fractional.view._render());fractional.destroy();
  const events=[0,1,2].map(index => note(52+index*2,index,"eighth")),ids=events.map(event => event.id),f=staffFixture({ measure:{ events } });
  const verify=marks => {
    const rendered=f.view._render();assertSiblingKeysUnique(rendered);
    assert.strictEqual(nodes(rendered).filter(node => node.data && node.data.staticClass === "note-head").length,3);
    assert.strictEqual(nodes(rendered).filter(node => node.data && node.data.staticClass === "symbol expression-mark").length,marks);
    assert.deepStrictEqual(heads(f.view).map(event => event.id),ids);
  };
  verify(0);
  const triplets=editor.makeWorkshopTriplet(f.view.measure,ids);assert(triplets);f.view.measure={ events:triplets };await Vue.nextTick();verify(0);
  assert.strictEqual(f.view.tuplets.length,1);
  const joined=editor.joinWorkshopNotes(f.view.measure,ids);assert(joined);f.view.measure={ events:joined };await Vue.nextTick();verify(0);
  assert.strictEqual(f.view.beams.length,1);
  for (const articulations of [["staccato"],["staccato","accent"]]) {
    f.view.measure={ events:f.view.measure.events.map(event => ids.includes(event.id) ? Object.assign({},event,{ articulations }) : event) };await Vue.nextTick();verify(articulations.length*3);
  }
  for (const head of heads(f.view)) { f.view.pointerDown(f.pointer(head.x,head.y));f.view.pointerUp(f.pointer(head.x,head.y)); }
  assert.strictEqual(f.events.filter(event => event.name === "place").length,0);
  assert.deepStrictEqual(f.events.filter(event => event.name === "select").map(event => event.payload.id),ids);
  f.destroy();
});

test("multiple voices keep separate duration groups, chord selection and their prescribed stem directions",() => {
  const events=[note(52,0,"quarter",{ voice:1 }),note(55,0,"quarter",{ voice:1 }),note(52,0,"half",{ voice:2 }),note(59,0,"quarter",{ voice:3 }),note(60,0,"quarter",{ voice:4 })];
  const measure={ events },before=JSON.stringify(measure),f=staffFixture({ measure });
  assert.strictEqual(f.view.stems.length,4);
  heads(f.view).forEach(event => assert.strictEqual(event.stemDirection,rhythm.workshopEventVoice(event)%2 ? 1 : -1));
  const upper=heads(f.view).find(event => event.id === events[0].id),group=f.view.selectionFor(upper);
  assert.deepStrictEqual(group.ids.sort(),events.slice(0,2).map(event => event.id).sort());
  assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test("blank duration clicks only concern the active voice while every other-voice head stays individually selectable",() => {
  const event=note(52,0,"whole",{ voice:2 }),f=staffFixture({ measure:{ events:[event] },voice:1 });
  const head=heads(f.view)[0];f.view.pointerDown(f.pointer(head.x,head.y));f.view.pointerUp(f.pointer(head.x,head.y));
  assert.strictEqual(f.events[0].name,"select");assert.strictEqual(f.events[0].payload.id,event.id);
  f.view.pointerDown(f.pointer(240,head.y));assert.strictEqual(f.view.gesture.eventId,null);f.view.pointerUp(f.pointer(240,head.y));
  assert.strictEqual(f.events[f.events.length-1].name,"place");f.destroy();
  const rest={ id:model.workshopId("rest"),kind:"rest",pitch:null,noteValue:"quarter",startSlot:0,voice:2 },r=staffFixture({ measure:{ events:[rest] },voice:1,kind:"rest" });
  const drawn=r.view.events.find(item => item.id === rest.id);r.view.pointerDown(r.pointer(drawn.x,drawn.y));assert.strictEqual(r.view.gesture.eventId,null);r.view.pointerUp(r.pointer(drawn.x,drawn.y));
  assert.strictEqual(r.events[0].name,"place");r.destroy();
});

test("beamed voices remain independent even with simultaneous starts and opposite stems",() => {
  const events=[note(52,0,"eighth",{ voice:1,beamGroupId:"upper" }),note(55,1,"eighth",{ voice:1,beamGroupId:"upper" }),
    note(48,0,"eighth",{ voice:2,beamGroupId:"lower" }),note(50,1,"eighth",{ voice:2,beamGroupId:"lower" })];
  assert(model.isValidWorkshopMeasure({ events }));const f=staffFixture({ measure:{ events } });
  assert.strictEqual(f.view.beams.length,2);assert(f.view.stems.every(stem => stem.beamed));
  f.view.stems.forEach(stem => { const event=events.find(event => event.id === stem.eventIds[0]);assert.strictEqual(stem.direction,event.voice === 1 ? 1 : -1); });f.destroy();
});

test("triplets keep exact tick timing, show a grouped bracket and leave no fictitious rests between onsets",() => {
  const events=[0,1,2].map(index => note(52+index*2,index*2/3,"eighth",{ tuplet:3,tupletGroupId:"triplet" }));
  assert(model.isValidWorkshopMeasure({ events }));const f=staffFixture({ measure:{ events } });
  assert.strictEqual(f.view.tuplets.length,1);assert(f.view.tuplets[0].bracket);assert.strictEqual(f.view.gridStep,1/12);
  assert.deepStrictEqual(heads(f.view).map(event => rhythm.workshopTimeTicks(event.endSlot)),[2/3,4/3,2].map(rhythm.workshopTimeTicks));
  assert(!f.view.events.some(event => event.implicit && event.startSlot < 2));
  assert.strictEqual(f.view.events.filter(event => event.implicit).reduce((sum,event) => sum+rhythm.workshopTimeTicks(rhythm.workshopEventUnits(event)),0),rhythm.workshopTimeTicks(6));
  const single=staffFixture({ measure:{ events:[note(52,0,"eighth",{ tuplet:3 })] } });
  assert(single.view.tuplets.some(tuplet => !tuplet.bracket));single.destroy();f.destroy();
  const high=staffFixture({ measure:{ events:[0,1,2].map(index => note(67,index*2/3,"eighth",{ tuplet:3,tupletGroupId:"high" })) } });
  assert(high.view.tuplets[0].y-17 > 156); assert(high.view.tuplets[0].y-17 > Math.max(...heads(high.view).map(event => event.stemEndY)));high.destroy();
});

test("a one-tick silence stays empty instead of rendering a longer incorrect rest or looping",() => {
  const event=note(52,1/rhythm.WORKSHOP_TICKS_PER_UNIT,"thirtysecond",{ tuplet:3 }),f=staffFixture({ measure:{ events:[event] } });
  assert(!f.view.events.some(item => item.implicit && item.startSlot === 0));
  assert(f.view.events.length < 20);assert(f.view.events.every(item => item.endSlot <= 8+1e-9));f.destroy();
});

test("articulations, fingerings, pedal and dynamics draw without mutating notes and remain within the paper",() => {
  const event=note(64,0,"quarter",{ articulations:["staccato","accent","tenuto"],fingering:5,pedal:"down" }),measure={ events:[event],dynamic:"pp",repeatStart:true,repeatEnd:4 },before=JSON.stringify(measure);
  assert(model.isValidWorkshopMeasure(measure));const f=staffFixture({ measure });
  const drawn=heads(f.view)[0];assert.strictEqual(drawn.expressionMarks.length,3);assert(Number.isFinite(drawn.fingeringY));assert(Number.isFinite(drawn.pedalY));
  const rendered=nodes(f.view._render());assert.strictEqual(rendered.filter(node => node.data && node.data.staticClass === "symbol expression-mark").length,3);
  for (const className of ["fingering","pedal","dynamic-mark","repeat-start","repeat-end"]) assert(rendered.some(node => node.data && node.data.staticClass === className),className);
  assert.strictEqual(f.view.effectiveDynamic,"pp");assert(drawn.expressionMarks.every(mark => mark.y >= f.view.geometry.top && mark.y <= f.view.geometry.top+f.view.geometry.height));
  assert(drawn.pedalY <= f.view.geometry.top+f.view.geometry.height);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test("a fully marked lower-voice triplet keeps separate expression lanes and grows only its real sheet frame",() => {
  const score=model.createWorkshopDraft("",2).score;
  const triplets=[55,57,55].map((value,index) => note(value,index*2/3,"eighth",{ voice:2,tuplet:3,tupletGroupId:"marked-triplet",articulations:["staccato","accent"] }));
  triplets[0].fingering=3;triplets[0].pedal="down";
  score.parts[0].measures[0].events=[note(48,0,"half"),...triplets];
  const marked=expression.connectWorkshopSlur(score,[triplets[0].id,triplets[2].id]);assert(marked);
  const before=JSON.stringify(marked),measure=model.resolveWorkshopMeasure(marked,0),slurs=expression.workshopMeasureSlurs(marked,0,0);
  const f=staffFixture({ measure,readOnly:true,compact:true,slurs }),first=heads(f.view).find(event => event.id === triplets[0].id);
  const tuplet=f.view.tuplets.find(item => item.id === "marked-triplet"),slur=f.view.slurCurves[0];
  assert(Math.max(...first.expressionMarks.map(mark => mark.y+5))+8 <= first.fingeringY-14);
  assert(first.fingeringY+5+8 <= tuplet.y-17);
  assert(tuplet.y+12+8 <= slur.minimumY);
  assert(slur.maximumY+8 <= first.pedalY-15);
  assert(first.pedalY+6+8 <= f.view.dynamicY-22);
  const sheetView=sheetFixture(marked),frame=sheetView.systems[0].frames[0];
  assert(frame.bottom >= f.view.geometry.top+f.view.geometry.height);
  for (const bar of sheetView.systems[0].bars) {
    const part=bar.parts[0],rendered=staffFixture({ measure:part.measure,readOnly:true,compact:true,slurs:part.slurs,ties:part.ties,barIndex:bar.index,
      frameTop:frame.top,frameBottom:frame.bottom,headerLeft:bar.headerLeft,showDynamic:part.showDynamic });
    assert.strictEqual(rendered.view.geometry.top,frame.top);assert.strictEqual(rendered.view.geometry.height,frame.height);rendered.destroy();
  }
  assert.strictEqual(JSON.stringify(marked),before);sheetView.$destroy();f.destroy();
  const empty=sheetFixture(model.createWorkshopDraft().score);assert.strictEqual(empty.systems[0].frames[0].top,40);assert.strictEqual(empty.systems[0].frames[0].bottom,220);empty.$destroy();
});

test("an upbeat uses the shorter real bar for rests, grid, movement and pointer placement",() => {
  const score=model.createWorkshopDraft().score;score.pickupUnits=2;score.parts[0].measures[0].events=[note(52)];
  assert(model.isValidWorkshopScore(score));const measure=model.resolveWorkshopMeasure(score,0),f=staffFixture({ measure,noteValue:"sixteenth" });
  assert.strictEqual(f.view.meterUnits,2);assert.strictEqual(f.view.gridSlots.length,5);assert.strictEqual(f.view.geometry.unitWidth,124);
  assert.strictEqual(f.view.events.filter(event => event.implicit).length,0);assert.strictEqual(f.view.movementBounds([measure.events[0].id],measure.events[0].id).maximum,0);
  f.view.pointerDown(f.pointer(f.view.geometry.width-22,216));assert.strictEqual(f.view.gesture.slot,1.5);f.view.pointerUp(f.pointer(f.view.geometry.width-22,216));f.destroy();
});

test("a per-bar key change renders cancellation naturals and keeps the saved absolute pitches",() => {
  const score=model.createWorkshopDraft("",2).score;score.keyId="C-sharp-major";score.parts[0].measures[1].keyId="C-major";score.parts[0].measures[1].events=[note(53)];
  const measure=model.resolveWorkshopMeasure(score,1),f=staffFixture({ measure,keyId:measure.keyId,previousKeyId:score.keyId });
  assert.strictEqual(f.view.keySignature.length,7);assert(f.view.keySignature.every(pitch => pitch.alter === 0));
  assert.deepStrictEqual(heads(f.view)[0].pitch,score.parts[0].measures[1].events[0].pitch);f.destroy();
  const opposite=staffFixture({ keyId:"C-sharp-major",previousKeyId:"C-flat-major" });
  const group=nodes(opposite.view._render()).find(node => node.data && node.data.staticClass === "key-signature");
  assert.strictEqual(group.children.filter(node => node.tag === "path").length,14);
  assert.strictEqual(new Set(group.children.filter(node => node.tag === "path").map(node => node.key)).size,14);opposite.destroy();
});

test("a multi-bar legato phrase has full and middle boundary segments distinct from notehead ties",() => {
  for (const voice of [1,2]) {
    const score=model.createWorkshopDraft("",3).score,from=note(52,0,"quarter",{ voice }),to=note(64,2,"quarter",{ voice });
    score.parts[0].measures[0].events=[from];score.parts[0].measures[2].events=[to];const slurred=expression.connectWorkshopSlur(score,[from.id,to.id]);assert(slurred);
    for (let barIndex=0;barIndex<3;barIndex++) {
      const f=staffFixture({ measure:model.resolveWorkshopMeasure(slurred,barIndex),barIndex,slurs:expression.workshopMeasureSlurs(slurred,0,barIndex),voice });
      assert.strictEqual(f.view.slurCurves.length,1);assert.strictEqual(f.view.tieCurves.length,0);
      const curve=f.view.slurCurves[0];assert(curve.partial);assert(curve.minimumY >= f.view.geometry.top);assert(curve.maximumY <= f.view.geometry.top+f.view.geometry.height);
      if (barIndex === 1) { assert(curve.path.startsWith("M "+f.view.geometry.left+" "));assert(curve.path.endsWith(" "+(f.view.geometry.width-12)+" "+(voice === 1 ? 47 : 193))); }
      f.destroy();
    }
  }
});

test("read-only compact staves expose no editing buttons or gestures and omit repeated context symbols",() => {
  const event=note(),measure={ events:[event] },before=JSON.stringify(measure),f=staffFixture({ measure,readOnly:true,compact:true,showClef:false,showKey:false,showMeter:false,showDynamic:false });
  assert.strictEqual(f.view.geometry.left,12);assert.strictEqual(f.view.geometry.width,282);
  const rendered=nodes(f.view._render());assert(!rendered.some(node => node.data && node.data.attrs && node.data.attrs.role === "button"));
  const head=heads(f.view)[0];f.view.pointerDown(f.pointer(head.x,head.y));f.view.pointerUp(f.pointer(head.x,head.y));f.view.keyDown({ key:"ArrowRight",preventDefault() {} },head);
  f.view.contextPointerDown(f.pointer(20,100),"clef");assert.strictEqual(f.events.length,0);assert.strictEqual(f.captures.size,0);assert.strictEqual(JSON.stringify(measure),before);f.destroy();
});

test("sheet systems repeat clefs and key only at line starts or changes and align both staffs' time areas",() => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",7).score,true);
  score.parts[1].measures[1].clef="treble";score.parts.forEach(part => { part.measures[2].keyId="G-major";part.measures[2].dynamic="p"; });
  const view=sheetFixture(score);assert.strictEqual(view.barsPerSystem,3);assert.strictEqual(view.systems.length,3);
  const first=view.systems[0];assert.strictEqual(first.frames.length,2);assert(first.bars[0].parts.every(part => part.showClef && part.showKey && part.showMeter));
  assert.strictEqual(first.bars[1].parts[0].showClef,false);assert.strictEqual(first.bars[1].parts[1].showClef,true);assert(first.bars[1].parts.every(part => !part.showKey && !part.showMeter));
  assert(first.bars[2].parts.every(part => part.showKey && part.showDynamic));
  assert(view.systems[1].bars[0].parts.every(part => part.showClef && part.showKey && part.showMeter));
  for (const bar of first.bars) for (const [index,part] of bar.parts.entries()) {
    const frame=first.frames[index],f=staffFixture({ measure:part.measure,clef:part.context.clef,keyId:part.context.keyId,compact:true,readOnly:true,
      showClef:part.showClef,showKey:part.showKey,showMeter:part.showMeter,showDynamic:part.showDynamic,headerLeft:bar.headerLeft,frameTop:frame.top,frameBottom:frame.bottom });
    assert.strictEqual(f.view.geometry.left,bar.headerLeft);assert.strictEqual(f.view.geometry.width,bar.width);
    assert.strictEqual(f.view.geometry.top,frame.top);assert.strictEqual(f.view.geometry.height,frame.height);f.destroy();
  }
  view.$destroy();
});

test("a 1000-bar sheet renders only 24 bars per page, preserves hidden notes and follows the playing page",async () => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("",1000).score,true);score.parts[1].measures[500].events=[note(36)];
  const before=JSON.stringify(score),view=sheetFixture(score);assert.strictEqual(view.pageCount,42);assert.strictEqual(staffNodes(view).length,48);
  view.changePage(41);assert.strictEqual(view.pageIndex,41);assert.strictEqual(staffNodes(view).length,32);assert.strictEqual(view.systems[0].firstBar,984);
  view.changePage(1);assert.strictEqual(view.pageIndex,41);view.changePage(-100);assert.strictEqual(view.pageIndex,0);
  view.activeBar=500;await Vue.nextTick();assert.strictEqual(view.pageIndex,20);assert.strictEqual(JSON.stringify(score),before);view.$destroy();
  const initial=sheetFixture(score,{ activeBar:999 });assert.strictEqual(initial.pageIndex,41);initial.$destroy();
  score=model.setWorkshopSecondStaffEnabled(score,false);const hidden=sheetFixture(score);assert.strictEqual(staffNodes(hidden).length,24);assert(score.parts[1].measures[500].events.length);hidden.$destroy();
});

test("sheet layout adapts to narrow screens, and a bar click or Enter opens exactly that bar for editing",() => {
  const view=sheetFixture(model.createWorkshopDraft("",5).score),events=[];view.$on("select-bar",index => events.push(index));
  view.availableWidth=320;assert.strictEqual(view.barsPerSystem,1);assert.strictEqual(view.systems.length,5);
  const bars=nodes(view._render()).filter(node => node.data && node.data.staticClass === "sheet-bar");assert.strictEqual(bars.length,5);
  bars[3].data.on.click();bars[4].data.on.keydown({ key:"Enter",preventDefault() {} });bars[0].data.on.keydown({ key:"ArrowRight",preventDefault() {} });
  assert.deepStrictEqual(events,[3,4]);view.$destroy();
});

(async () => { for (const [name,body] of cases) { await body();process.stdout.write("✓ "+name+"\n"); }
  process.stdout.write("Workshop complete notation tests passed.\n");
})().catch(error => { console.error(error);process.exitCode=1; });

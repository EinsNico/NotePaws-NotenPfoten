const assert=require("assert"),fs=require("fs"),path=require("path"),Module=require("module");
global.regeneratorRuntime=require("babel-runtime/regenerator");
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

const io=require('../src/model/WorkshopMusicXml');
const imported=()=>io.importWorkshopMusicXmlText(fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bar-10.musicxml'),'utf8')).score;
test('Moonlight source hides both tuplet numbers and brackets without changing notes or beams',()=>{
 const score=imported(),measure=score.parts[0].measures[0],before=JSON.stringify(measure);
 for(const scale of [.6,1,2,3]) {const f=staffFixture({measure,notationScale:scale,compact:true,allowLegacyGeneratedRests:false});assert.strictEqual(f.view.tuplets.length,0);assert.strictEqual(heads(f.view).length,14);assert.strictEqual(f.view.beams.length,6);f.destroy();}
 assert.strictEqual(JSON.stringify(measure),before);
});
test('visible triplets follow actual down stems below the staff and clear both voices at every scale',()=>{
 const score=imported(),measure=model.cloneWorkshop(score.parts[0].measures[0]);measure.events.forEach(e=>delete e.tupletDisplay);
 for(const scale of [.6,1,2,3]) {const f=staffFixture({measure,notationScale:scale,compact:true,allowLegacyGeneratedRests:false});assert.strictEqual(f.view.tuplets.length,4);
  for(const t of f.view.tuplets){assert(t.bracket);assert.strictEqual(t.number,3);assert(t.y-17*scale>156);const members=heads(f.view).filter(e=>t.eventIds.includes(e.id));assert(members.every(e=>e.stemDirection===-1));assert(t.y-17*scale>Math.max(...members.map(e=>e.stemEndY)));}
  const box=f.view._render().data.attrs.viewBox.split(' ').map(Number);for(const t of f.view.tuplets)assert(t.y+12*scale <= box[1]+box[3]);f.destroy();}
});
test('explicit above placement overrides stems while number and bracket visibility remain independent',()=>{
 const score=imported(),measure=model.cloneWorkshop(score.parts[0].measures[0]);measure.events.filter(e=>e.tuplet).forEach(e=>e.tupletDisplay={placement:'above',showNumber:'both',bracket:false});
 const f=staffFixture({measure,compact:true,allowLegacyGeneratedRests:false});assert.strictEqual(f.view.tuplets.length,4);
 for(const t of f.view.tuplets){assert.strictEqual(t.number,'3:2');assert.strictEqual(t.bracket,null);assert(t.y+12<76);}f.destroy();
 measure.events.filter(e=>e.tuplet).forEach(e=>e.tupletDisplay={showNumber:'none',bracket:true});const hidden=staffFixture({measure});assert(hidden.view.tuplets.every(t=>t.number===null&&t.bracket));hidden.destroy();
});
test('generated silent filler carries no tuplet labels while explicit tuplet rests remain visible',()=>{
 const f=staffFixture({measure:{events:[note(52,0,'eighth',{tuplet:3})]}});assert(f.view.tuplets.every(t=>t.eventIds.every(id=>!f.view.events.find(e=>e.id===id).implicit)));f.destroy();
 const rest=staffFixture({measure:{events:[{id:'explicit-rest',kind:'rest',pitch:null,startSlot:0,noteValue:'eighth',tuplet:3,autoRest:false}]}});assert(rest.view.tuplets.some(t=>t.eventIds.includes('explicit-rest')));rest.destroy();
});
test('large short-rest ink leaves clearance for an explicitly below tuplet number',()=>{
 const {workshopRestInk}=require('../src/model/WorkshopRestLayout');
 for(const noteValue of ['sixtyfourth','onetwentyeighth']){const f=staffFixture({measure:{events:[{id:'fine-rest',kind:'rest',pitch:null,startSlot:0,noteValue,tuplet:3,autoRest:false,tupletDisplay:{placement:'below'}}]},notationScale:3});
 const rest=f.view.events.find(e=>e.id==='fine-rest'),ink=workshopRestInk(rest,3);assert(f.view.tuplets[0].y-17*3>ink.bottom);f.destroy();}
});
test('opening an old untouched import restores display without dirtying or writing its saved revision',()=>{
 global.window={scrollTo(){},addEventListener(){},removeEventListener(){},cancelAnimationFrame(){}};
 global.document={addEventListener(){},removeEventListener(){}};
 const entries=new Map();let writes=0;global.localStorage={getItem:k=>entries.get(k)||null,setItem(k,v){writes++;entries.set(k,String(v));},removeItem:k=>entries.delete(k)};
 const score=imported(),title='Moonlight Sonata, 1st Movement';score.parts.forEach(p=>p.measures.forEach(b=>b.events.forEach(e=>delete e.tupletDisplay)));score.musicXml.fingerprint=io.workshopMusicXmlFingerprint(score,title);
 const saved=model.saveWorkshopDraft(null,{title,score}).piece,before=JSON.stringify(saved),definition=component('Workshop');
 const parent=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:k=>k})}));
 parent.player={stopAll(){}};
 const recovered=parent.pieceScore(saved);assert.notStrictEqual(recovered,score);assert(recovered.parts[0].measures[0].events.filter(e=>e.tuplet).every(e=>e.tupletDisplay.showNumber==='none'));
 assert.strictEqual(parent.pieceScore(saved),recovered,'saved-score lookup reuses recovered clone');parent.openPiece(saved);
 assert.strictEqual(parent.dirty,false);assert.strictEqual(parent.undoStack.length,0);assert.strictEqual(JSON.stringify(saved),before);assert.strictEqual(writes,0);
 assert(parent.editorBars[0].events.filter(e=>e.tuplet).every(e=>e.tupletDisplay.showNumber==='none'));parent.$destroy();
});
(async()=>{for(const [name,body]of cases){await body();console.log('✓ '+name);}})().catch(e=>{console.error(e);process.exitCode=1;});

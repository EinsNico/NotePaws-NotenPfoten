const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),Vue=require('vue');
const root=path.resolve(__dirname,'../src')+path.sep;
const original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>file.startsWith(root)?mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file):original(mod,file);
const {createNoteFlowChordPlan}=require('../src/model/NoteFlowChordPlan');
const {generateNoteFlowChordRhythmicScore}=require('../src/model/NoteFlowChordRhythm');
const {createNoteFlowChordRhythmPractice}=require('../src/model/NoteFlowChordRhythmPractice');
function readComponent(name){const file=path.join(root,'components',name+'.vue'),mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(babel.transform(fs.readFileSync(file,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);return mod.exports.default;}
const definition=readComponent('NoteFlowChordRhythmStream');
const Stream=Vue.extend(definition);
Module._extensions['.js']=original;
function test(name,body){body();process.stdout.write('✓ '+name+'\n');}

test('fits real one/two-staff layouts without changing score, practice or stream timing',()=>{
 for(const handMode of ['single','two']){
  const plan=createNoteFlowChordPlan({seed:'fit-regression',handMode,chordSize:handMode==='single'?3:8,bassNotesPerChord:4,bpm:60});
  const score=generateNoteFlowChordRhythmicScore(plan,{allowedValues:['quarter'],bpm:60});
  const practice=createNoteFlowChordRhythmPractice(score,{behavior:'wait'}).practice;
  const before=JSON.stringify({score,practice});
  const view=new Stream({propsData:{score,practiceState:practice,fitHeight:true,elapsedMs:350}});
  const initialOffset=view.offsetX, initialEvents=view.visibleEvents.map(e=>e.id);
  for(const [width,height] of [[666,335],[610,225],[322,354],[486,116],[250,100],[720,500]]){
   view.stageWidth=width;view.stageHeight=height;
   const fit=view.notationFit;
   assert(fit.measured);assert(fit.scale>=0.9);
   assert(Math.abs(fit.width/fit.height-view.viewWidth/view.layout.height)<1e-10);
   assert.strictEqual(fit.fits,width-2>=view.viewWidth*0.9 && height-2>=view.layout.height*0.9);
   if(!fit.fits)assert(fit.overflowWidth>0||fit.overflowHeight>0);
   assert.strictEqual(view.offsetX,initialOffset);
   assert.deepStrictEqual(view.visibleEvents.map(e=>e.id),initialEvents);
   assert.strictEqual(JSON.stringify({score,practice}),before);
  }
  view.fitHeight=false;view.$destroy();
 }
});
test('stage measurement refreshes only dimensions and releases observer/listener',()=>{
 const oldWindow=global.window,oldObserver=global.ResizeObserver;
 const calls=[];let callback;
 global.window={addEventListener:(event,fn)=>calls.push(['add',event,fn]),removeEventListener:(event,fn)=>calls.push(['remove',event,fn])};
 global.ResizeObserver=class {constructor(fn){callback=fn;}observe(el){calls.push(['observe',el]);}disconnect(){calls.push(['disconnect']);}};
 try{
  const el={offsetWidth:610,offsetHeight:225};
  const view={fitHeight:true,$el:el,stageWidth:0,stageHeight:0};
  view.measureStage=definition.methods.measureStage.bind(view);
  definition.mounted.call(view);
  assert.deepStrictEqual([view.stageWidth,view.stageHeight],[610,225]);
  el.offsetHeight=116;callback();
  assert.deepStrictEqual([view.stageWidth,view.stageHeight],[610,116]);
  definition.beforeDestroy.call(view);
  assert(calls.some(c=>c[0]==='observe'&&c[1]===el));
  assert(calls.some(c=>c[0]==='disconnect'));
  assert.deepStrictEqual(calls.filter(c=>['add','remove'].includes(c[0])).map(c=>c.slice(1)),[['resize',view.measureStage],['resize',view.measureStage]]);
 }finally{global.window=oldWindow;global.ResizeObserver=oldObserver;}
});
test('standalone score stream retains its original dimensions with fit disabled',()=>{
 const view={fitHeight:false,measureStage(){throw new Error('must not measure standalone stream');}};
 definition.mounted.call(view);definition.beforeDestroy.call(view);
 assert.strictEqual(definition.computed.notationStyle.call(view),null);
});

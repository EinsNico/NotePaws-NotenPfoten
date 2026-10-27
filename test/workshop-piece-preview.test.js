const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
let rawCalls=0,indexCalls=0;
global.__previewAudit=kind=>{if(kind==='raw') rawCalls++;else indexCalls++;};
Module._extensions['.js']=(mod,file)=>{
  if(!file.startsWith(root)) return original(mod,file);
  const source=fs.readFileSync(file,'utf8')
    .replace('export function createWorkshopStaffRawNotation(view) {','export function createWorkshopStaffRawNotation(view) {global.__previewAudit("raw");')
    .replace('export function indexWorkshopExpressionNotes(score) {','export function indexWorkshopExpressionNotes(score) {global.__previewAudit("index");');
  mod._compile(babel.transform(source,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
};
Module._extensions['.vue']=(mod,file)=>{
  const parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
  mod.exports.default=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
};
const model=require('../src/model/Workshop');
const {createWorkshopPiecePreviewScore,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES}=require('../src/model/WorkshopPiecePreview');
const preview=require('../src/components/WorkshopPiecePreview.vue').default;
const staff=require('../src/components/WorkshopStaff.vue').default;
function note(id,value=48,startSlot=0,noteValue='quarter',extra={}) {return Object.assign({id,kind:'note',pitch:model.workshopPitchFromValue(value),noteValue,startSlot},extra);}
function instance(definition,props) {return new Vue(Object.assign({},definition,{propsData:props,methods:Object.assign({},definition.methods,{$t:key=>key})}));}
function nodes(node) {return [node].concat(...(node.children||[]).map(nodes));}
function frozen(value) {if(value && typeof value==='object'){Object.keys(value).forEach(key=>frozen(value[key]));Object.freeze(value);}return value;}
const cases=[];function test(name,body){cases.push([name,body]);}

test('only two opening measures are read before validation and engraving, without source/archive data',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Long score',201).score,true);
  score.parts.forEach((part,p)=>{
    part.measures[0].events=[note('opening-'+p)];
    part.measures[1].events=[note('next-'+p,50)];
    Object.defineProperty(part.measures,2,{get(){throw Error('third measure must not be read');}});
  });
  const unread=()=>{throw Error('non-musical payload must not be read');};
  score.musicXml={};Object.defineProperty(score.musicXml,'sourceXml',{get:unread});Object.defineProperty(score.musicXml,'archiveAssets',{get:unread});
  Object.defineProperty(score,'metadata',{get:unread});Object.defineProperty(score,'layout',{get:unread});
  const excerpt=createWorkshopPiecePreviewScore(score);
  assert.strictEqual(excerpt.parts[0].measures.length,2);assert.strictEqual(excerpt.parts[1].measures.length,2);
  assert.strictEqual(excerpt.musicXml.sourceXml,'');assert(!excerpt.metadata);assert(!excerpt.layout);
  assert(model.isValidWorkshopScore(excerpt));rawCalls=0;indexCalls=0;
  const view=instance(preview,{score});assert.strictEqual(view.system.bars.length,2);assert.strictEqual(rawCalls,4);assert(indexCalls<=5);
  const rendered=nodes(view._render()),children=rendered.filter(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');
  assert.strictEqual(children.length,4);assert(children.every(node=>node.componentOptions.propsData.readOnly && node.componentOptions.propsData.compact));
  assert.strictEqual(rendered[0].data.attrs['aria-hidden'],'true');view.$destroy();
});

test('opening chords, high ledger notes, both clefs and inherited key/meter changes use the normal engraving',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Two hands',2).score,true);
  score.keyId='D-major';score.meter='3/4';
  score.parts[0].measures[0].events=[note('root',48),note('third',52),note('fifth',55),note('highest',96,2)];
  score.parts[1].measures[0].events=[note('lowest',9)];
  score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].keyId='G-major';score.parts[1].measures[1].keyId='G-major';
  score.parts.forEach(part=>part.measures[1].meter='2/4');
  const before=JSON.stringify(score);frozen(score);
  const view=instance(preview,{score}),first=view.system.bars[0],second=view.system.bars[1];
  assert.strictEqual(view.system.frames.length,2);
  assert.deepStrictEqual(first.parts.map(part=>part.context.clef),['treble','bass']);
  assert(first.parts.every(part=>part.context.keyId==='D-major' && part.context.meter==='3/4' && part.showKey && part.showMeter));
  assert.strictEqual(second.parts[0].context.clef,'bass');assert(second.parts[0].showClef);
  assert(second.parts.every(part=>part.context.meter==='2/4' && part.context.keyId==='G-major' && part.showKey && part.showMeter));
  const chord=first.parts[0].notation.stems.find(stem=>stem.eventIds.includes('root'));assert.strictEqual(chord.eventIds.length,3);
  const rendered=nodes(view._render()),child=rendered.find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');
  const notationView=instance(staff,child.componentOptions.propsData),high=notationView.events.find(event=>event.id==='highest');
  assert(high.ledgers.length>=5);assert(high.y >= notationView.geometry.top && high.y < notationView.geometry.top+notationView.geometry.height);
  assert(!nodes(notationView._render()).some(node=>node.data && node.data.attrs && node.data.attrs.role==='button'));
  assert.strictEqual(JSON.stringify(score),before);notationView.$destroy();view.$destroy();
});

test('disabled lower staff stays disabled and empty new pieces retain a clef and meter',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Empty').score,true);
  score.parts[1].enabled=false;score.parts[1].measures[0].events=[note('hidden',9)];
  const view=instance(preview,{score});assert.strictEqual(view.system.frames.length,1);
  assert.strictEqual(view.system.bars[0].parts.length,1);assert.strictEqual(view.system.bars[0].parts[0].context.clef,'treble');
  assert.strictEqual(view.system.bars[0].parts[0].context.meter,'4/4');assert(!view.system.bars[0].parts[0].notation.events.some(event=>event.id==='hidden'));
  assert(view.system.bars[0].parts[0].showClef && view.system.bars[0].parts[0].showMeter);view.$destroy();
});

test('excerpt keeps visible ties and tempo spans, clips distant endpoints, and leaves stored data unchanged',()=>{
  const score=model.createWorkshopDraft('Relations',3).score,bars=score.parts[0].measures;
  bars[0].events=[note('a',48,4,'half')];bars[1].events=[note('b',48,0,'whole')];bars[2].events=[note('c',48,0,'whole')];
  score.ties=[{fromId:'a',toId:'b'},{fromId:'b',toId:'c'}];
  bars[0].directions=[{id:'tempo-change',type:'tempoRamp',value:120,startSlot:0,endSlot:2,endBarId:bars[2].id}];
  assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score);frozen(score);
  const excerpt=createWorkshopPiecePreviewScore(score);assert(model.isValidWorkshopScore(excerpt));
  assert.deepStrictEqual(excerpt.ties,[{fromId:'a',toId:'b'}]);
  assert.strictEqual(excerpt.parts[0].measures[0].directions[0].endBarId,bars[1].id);
  assert.strictEqual(excerpt.parts[0].measures[0].directions[0].endSlot,8);
  const view=instance(preview,{score});assert(view.system.bars[0].parts[0].ties.some(tie=>tie.fromId==='a' && tie.toId==='b'));
  assert(view.system.bars[1].parts[0].directionSpans.some(direction=>direction.id==='tempo-change' && direction.continuation));
  assert.strictEqual(JSON.stringify(score),before);view.$destroy();
});

test('imported rest provenance and pickup duration are preserved without invoking a player',()=>{
  const score=model.createWorkshopDraft('Pickup').score;score.pickupUnits=2;
  score.musicXml={sourceXml:'<score-partwise/>',fingerprint:'source',warnings:[]};
  score.parts[0].measures[0].events=[{id:'rest-a-b-c-d',kind:'rest',pitch:null,startSlot:0,noteValue:'quarter'}];
  const excerpt=createWorkshopPiecePreviewScore(score);assert(model.isValidWorkshopScore(excerpt));
  assert.strictEqual(excerpt.pickupUnits,2);const view=instance(preview,{score});
  assert.strictEqual(view.system.bars[0].parts[0].context.units,2);
  assert.notStrictEqual(view.system.bars[0].parts[0].measure.events[0].autoRest,true);
  assert(!Object.keys(view.$options.methods).some(key=>/play|audio|timer/i.test(key)));view.$destroy();
});

test('widening the actual card reveals additional bars at the same note scale, without re-engraving on smaller resizes',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Responsive',201).score,true);
  score.parts.forEach((part,p)=>part.measures.forEach((bar,index)=>bar.events=[note('responsive-'+p+'-'+index,p ? 24 : 48)]));
  const view=instance(preview,{score});view.$el={clientWidth:320};view.updateWidth();
  const narrowCount=view.system.bars.length,narrowWindow=view.visibleWidth,narrowScale=(320-16)/narrowWindow;
  view.$el.clientWidth=1000;view.updateWidth();
  assert(view.system.bars.length>narrowCount);assert(view.visibleWidth>narrowWindow);
  const wideScale=(1000-16)/view.visibleWidth;assert(Math.abs(narrowScale-wideScale)<1e-8);
  assert(view.system.width>=view.visibleWidth);assert(view.system.bars.length<=MAX_WORKSHOP_PIECE_PREVIEW_MEASURES);
  const wideSystem=view.system;rawCalls=0;indexCalls=0;
  view.$el.clientWidth=320;view.updateWidth();assert(Math.abs(view.visibleWidth-narrowWindow)<1e-8);
  assert.strictEqual(view.system,wideSystem);assert.strictEqual(rawCalls,0);assert.strictEqual(indexCalls,0);
  view.$el.clientWidth=0;view.updateWidth();assert.strictEqual(view.availableWidth,320);assert.strictEqual(view.system,wideSystem);view.$destroy();
});

test('wide short scores keep their natural scale and huge cards never read or engrave beyond the bounded excerpt',()=>{
  const short=model.createWorkshopDraft('One bar').score;short.parts[0].measures[0].events=[note('short')];
  const shortView=instance(preview,{score:short});shortView.$el={clientWidth:1200};shortView.updateWidth();
  assert.strictEqual(shortView.system.bars.length,1);assert(shortView.visibleWidth>shortView.system.width);shortView.$destroy();
  const long=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Very long',201).score,true);
  long.parts.forEach((part,p)=>{
    for(let index=0;index<MAX_WORKSHOP_PIECE_PREVIEW_MEASURES;index++) part.measures[index].events=[note('bounded-'+p+'-'+index,p ? 24 : 48)];
    Object.defineProperty(part.measures,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES,{get(){throw Error('preview exceeded its bounded excerpt');}});
  });
  const excerpt=createWorkshopPiecePreviewScore(long,100000);assert.strictEqual(excerpt.parts[0].measures.length,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES);
  const view=instance(preview,{score:long});view.$el={clientWidth:100000};rawCalls=0;view.updateWidth();
  assert.strictEqual(view.system.bars.length,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES);
  assert.strictEqual(rawCalls,MAX_WORKSHOP_PIECE_PREVIEW_MEASURES*2);view.$destroy();
});

test('expanded excerpts retain later connections and clip direction endpoints at the selected final bar',()=>{
  const score=model.createWorkshopDraft('Expanded relations',6).score,bars=score.parts[0].measures;
  bars.forEach((bar,index)=>bar.events=[note('edge-'+index,48,0,'whole')]);
  score.ties=bars.slice(1).map((bar,index)=>({fromId:'edge-'+index,toId:'edge-'+(index+1)}));
  bars[0].directions=[{id:'long-tempo',type:'tempoRamp',value:120,startSlot:0,endSlot:2,endBarId:bars[5].id}];
  const excerpt=createWorkshopPiecePreviewScore(score,4);assert(model.isValidWorkshopScore(excerpt));
  assert.strictEqual(excerpt.ties.length,3);assert.strictEqual(excerpt.parts[0].measures[0].directions[0].endBarId,bars[3].id);
  assert.strictEqual(excerpt.parts[0].measures[0].directions[0].endSlot,8);
  assert.strictEqual(score.parts[0].measures[0].directions[0].endBarId,bars[5].id);
});

test('container resize observation coalesces callbacks and cleans up pending work when removed',()=>{
  const originals={ResizeObserver:global.ResizeObserver,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,window:global.window,document:global.document};
  const frames=new Map(),listeners=new Map();let observer,nextFrame=0;
  global.ResizeObserver=class {constructor(callback){this.callback=callback;observer=this;}observe(element){this.element=element;}disconnect(){this.disconnected=true;}};
  global.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};global.cancelAnimationFrame=id=>frames.delete(id);
  global.window={removeEventListener(){},addEventListener(){}};
  global.document={addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
  let view;
  try {
    view=instance(preview,{score:model.createWorkshopDraft('Observed',20).score});view.$el={clientWidth:300};view.$options.mounted[0].call(view);
    assert.strictEqual(observer.element,view.$el);assert.strictEqual(view.availableWidth,300);
    view.$el.clientWidth=1000;observer.callback();observer.callback();assert.strictEqual(frames.size,1);assert.strictEqual(view.availableWidth,300);
    const pending=frames.entries().next().value;frames.delete(pending[0]);pending[1]();assert.strictEqual(view.availableWidth,1000);
    observer.callback();assert.strictEqual(frames.size,1);view.$destroy();assert(observer.disconnected);assert.strictEqual(frames.size,0);assert.strictEqual(listeners.size,0);
    observer.callback();assert.strictEqual(frames.size,0);
  } finally {if(view && !view._isDestroyed) view.$destroy();Object.keys(originals).forEach(key=>{if(originals[key]===undefined) delete global[key];else global[key]=originals[key];});}
});

test('older WebViews detect ancestor visibility changes and remove resize and mutation fallbacks',()=>{
  const originals={ResizeObserver:global.ResizeObserver,MutationObserver:global.MutationObserver,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,window:global.window,document:global.document};
  const frames=new Map(),windowListeners=new Map(),documentListeners=new Map();let observer,nextFrame=0;
  delete global.ResizeObserver;
  global.MutationObserver=class {constructor(callback){this.callback=callback;this.targets=[];observer=this;}observe(element,options){this.targets.push({element,options});}disconnect(){this.disconnected=true;}};
  global.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};global.cancelAnimationFrame=id=>frames.delete(id);
  global.window={addEventListener:(name,callback)=>windowListeners.set(name,callback),removeEventListener:name=>windowListeners.delete(name)};
  global.document={addEventListener:(name,callback)=>documentListeners.set(name,callback),removeEventListener:name=>documentListeners.delete(name)};
  let view;
  try {
    view=instance(preview,{score:model.createWorkshopDraft('Initially hidden',20).score});const parent={parentElement:{parentElement:null}};
    view.$el={clientWidth:0,parentElement:parent};view.$options.mounted[0].call(view);assert.strictEqual(view.availableWidth,0);
    assert.strictEqual(observer.targets.length,2);assert(windowListeners.has('resize'));assert(documentListeners.has('visibilitychange'));
    view.$el.clientWidth=700;observer.callback();const pending=frames.entries().next().value;frames.delete(pending[0]);pending[1]();
    assert.strictEqual(view.availableWidth,700);assert(view.system.bars.length>2);
    windowListeners.get('resize')();view.$destroy();assert(observer.disconnected);assert.strictEqual(frames.size,0);assert.strictEqual(windowListeners.size,0);assert.strictEqual(documentListeners.size,0);
  } finally {if(view && !view._isDestroyed) view.$destroy();Object.keys(originals).forEach(key=>{if(originals[key]===undefined) delete global[key];else global[key]=originals[key];});}
});

test('render updates reuse the bounded cache, while replacing a saved revision refreshes the notes',async()=>{
  const score=model.createWorkshopDraft('Cached',201).score;score.parts[0].measures[0].events=[note('cached')];Vue.observable(score);
  const view=instance(preview,{score}),system=view.system,stop=view.$watch(()=>view._render(),()=>{});
  rawCalls=0;indexCalls=0;for(let i=0;i<20;i++){view._render();assert.strictEqual(view.system,system);}
  assert.strictEqual(rawCalls,0);assert.strictEqual(indexCalls,0);assert(view._computedWatchers.system.deps.length<=2);
  const replacement=model.createWorkshopDraft('New revision',201).score;replacement.parts[0].measures[0].events=[note('changed',55)];
  view.score=replacement;await Vue.nextTick();assert.notStrictEqual(view.system,system);
  assert(view.system.bars[0].parts[0].notation.events.some(event=>event.id==='changed' && event.pitch.step==='G'));
  assert.strictEqual(rawCalls,2);assert(view._computedWatchers.system.deps.length<=2);stop();view.$destroy();
});

(async()=>{for(const [name,body] of cases){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop piece preview checks passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

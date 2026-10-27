const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const root=path.resolve(__dirname,'../src')+path.sep,originalJs=Module._extensions['.js'];
let indexCalls=0,rawCalls=0;global.__workshopRenderAudit=name=>{if(name==='index')indexCalls++;else rawCalls++;};
function instrument(source){return source.replace('export function indexWorkshopExpressionNotes(score) {','export function indexWorkshopExpressionNotes(score) {global.__workshopRenderAudit("index");')
  .replace('export function createWorkshopStaffRawNotation(view) {','export function createWorkshopStaffRawNotation(view) {global.__workshopRenderAudit("raw");');}
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(root))return originalJs(mod,filename);mod._compile(babel.transform(instrument(fs.readFileSync(filename,'utf8')),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=(mod,filename)=>{const parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
function component(name){const filename=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
function instance(name,props){const definition=component(name);return new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},definition.methods,{$t:key=>key})}));}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
const model=require(root+'model/Workshop'),expression=require(root+'model/WorkshopExpression'),ties=require(root+'model/WorkshopTies');
const {createWorkshopRenderContext}=require(root+'model/WorkshopRenderContext'),{createWorkshopSheetSystems}=require(root+'components/WorkshopSheetLayout');
const staff=require(root+'components/WorkshopStaff.vue'),directions=require(root+'model/WorkshopNotationDirections'),rests=require(root+'model/WorkshopRests');
function note(id,slot=0,value='quarter',extra={}){return Object.assign({id,kind:'note',noteValue:value,pitch:{step:'C',alter:0,octave:4},startSlot:slot},extra);}
function score(count){return model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Render',count).score,true);}
function sheetProps(s){return {score:s,scoreLayout:s.layout||{},pageRanges:[{start:0,end:s.parts[0].measures.length}],pageIndex:0,barsPerSystem:3,activeParts:s.parts.map((part,index)=>({part,index}))};}
const tests=[];function test(name,body){tests.push([name,body]);}

test('one request preserves inherited contexts, directions, relation descriptors and rest provenance',()=>{
  let s=score(4),bars=s.parts[0].measures;
  bars[0].events=[note('a',0,'half',{lyric:'One'}),note('b',4,'half')];
  bars[1].events=[note('c')];bars[1].dynamic='p';bars[1].contextChanges=[{id:'mid-context',startSlot:2,clef:'bass',keyId:'D-major'}];
  bars[2].events=[note('d',0,'quarter',{displayStaff:1,lyrics:[{number:'2',text:'Two'}]})];bars[2].dynamic='sf';
  bars[3].events=[note('e'),note('f',2)];
  bars[0].directions=[{id:'ramp',type:'tempoRamp',value:120,startSlot:0,endSlot:2,endBarId:bars[2].id}];
  s.ties=[{fromId:'a',toId:'b'}];s.slurs=[{fromId:'a',toId:'d'}];s.glissandos=[{fromId:'b',toId:'c',type:'slide'}];
  s=expression.connectWorkshopTremolo(s,['e','f'],2);assert(model.isValidWorkshopScore(s));const before=JSON.stringify(s),context=createWorkshopRenderContext(s);assert(context);
  const helpers={ties:ties.workshopMeasureTies,slurs:expression.workshopMeasureSlurs,glissandos:expression.workshopMeasureGlissandos,tremolos:expression.workshopMeasureTremolos};
  s.parts.forEach((part,partIndex)=>part.measures.forEach((bar,index)=>{
    assert.deepStrictEqual(context.contexts[partIndex][index],model.workshopMeasureContext(s,index,partIndex));
    assert.deepStrictEqual(context.endContexts[partIndex][index],model.workshopMeasureContextAtSlot(s,index,Infinity,partIndex));
    assert.deepStrictEqual(context.measure(partIndex,index),rests.withWorkshopRestProvenance(model.resolveWorkshopMeasure(s,index,partIndex),{legacy:!s.musicXml}));
    assert.strictEqual(context.measure(partIndex,index),context.measure(partIndex,index));
    assert.deepStrictEqual(context.directionSpans[partIndex][index],directions.workshopMeasureDirectionSpans(s,partIndex,index));
    Object.keys(helpers).forEach(kind=>assert.deepStrictEqual(context.connections[partIndex][index][kind],helpers[kind](s,partIndex,index),kind));
  }));
  assert.deepStrictEqual(context.lyricVerseNumbers[0],['1','2']);assert.strictEqual(JSON.stringify(s),before);
  assert.strictEqual(createWorkshopRenderContext(Object.assign({},s,{slurs:[{fromId:'missing',toId:'d'}]})),null);
});

test('cached raw notation and geometry match uncached engraving without changing the cached input',()=>{
  const s=score(2);s.parts[0].measures[0].events=[note('a',0,'eighth',{fermata:2,lyrics:[{number:'2',text:'La'}]}),note('b',1,'eighth',{pitch:{step:'G',alter:1,octave:4}})];
  const systems=createWorkshopSheetSystems(sheetProps(s));systems.forEach(system=>system.bars.forEach(bar=>bar.parts.forEach(part=>{
    const props={measure:part.measure,clef:part.context.clef,meter:part.context.meter,keyId:part.context.keyId,dynamic:part.context.dynamic,
      showClef:part.showClef,showKey:part.showKey,showMeter:part.showMeter,showDynamic:part.showDynamic,headerLeft:bar.headerLeft,horizontalColumns:bar.spacing.columns,
      staffIndex:part.partIndex,companionMeasure:part.companionMeasure,lyricVerseNumbers:part.lyricVerseNumbers,sourceLyricVerseNumbers:part.sourceLyricVerseNumbers};
    const raw=staff.workshopStaffRawNotation(props),before=JSON.stringify(raw),cached=staff.workshopStaffNotation(Object.assign({},props,{cachedRawNotation:raw}));
    assert.deepStrictEqual(cached,part.notation);assert.deepStrictEqual(cached,staff.workshopStaffNotation(props));assert.strictEqual(JSON.stringify(raw),before);
    for(const dynamic of ['pp','fff']) {
      const varied=Object.assign({},props,{dynamic,directionSpans:[{id:'varied-words',type:'text',value:dynamic==='pp'?'Piano':'Fortissimo',startSlot:0}]});
      assert.deepStrictEqual(staff.workshopStaffContentGeometry(Object.assign({},varied,{cachedNotation:cached})),staff.workshopStaffContentGeometry(varied));
    }
    assert.strictEqual(JSON.stringify(raw),before);
  })));
});

test('201-bar engraving builds a constant number of whole-score indexes and one raw notation per staff',()=>{
  const s=score(201);s.parts.forEach((part,p)=>part.measures.forEach((bar,b)=>{bar.events=Array.from({length:16},(_,i)=>note('dense-'+p+'-'+b+'-'+i,i*.5,'sixteenth'));}));
  indexCalls=0;rawCalls=0;const systems=createWorkshopSheetSystems(Object.assign(sheetProps(s),{barsPerSystem:201,continuous:true}));
  assert.strictEqual(systems[0].bars.length,201);assert(indexCalls<=5,'full indexes: '+indexCalls);assert.strictEqual(rawCalls,402);
  const oldPitch=systems[0].bars[0].parts[0].notation.events.find(event=>event.id==='dense-0-0-0').pitch;
  s.parts[0].measures[0].events[0].pitch={step:'G',alter:0,octave:4};
  const changed=createWorkshopSheetSystems(Object.assign(sheetProps(s),{pageRanges:[{start:0,end:1}]}));
  assert.strictEqual(changed[0].bars[0].parts[0].notation.events.find(event=>event.id==='dense-0-0-0').pitch.step,'G');assert.strictEqual(oldPitch.step,'C');
});

test('listening positions and active IDs retain engraving and repeat-specific highlighting',()=>{
  const s=score(2);s.parts[0].measures[0].events=[note('repeat-a')];s.parts[0].measures[1].events=[note('repeat-b')];s.parts.forEach(part=>{part.measures[0].repeatStart=true;part.measures[1].repeatEnd=2;});
  const timeline=model.workshopTimeline(s),view=instance('WorkshopListening',{score:s,timeline,activeEventIds:['repeat-a']});
  const engraved=view.sourceSystem,layout=view.layout;indexCalls=0;rawCalls=0;
  for(let i=0;i<30;i++){view.position=i*75;view.activeEventIds=i%2 ? ['repeat-a'] : [];view._render();assert.strictEqual(view.sourceSystem,engraved);assert.strictEqual(view.layout,layout);}
  assert.strictEqual(indexCalls,0);assert.strictEqual(rawCalls,0);
  const childProps=nodes(view._render()).find(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff').componentOptions.propsData,child=instance('WorkshopStaff',childProps),notation=child.notation;
  rawCalls=0;for(let i=0;i<30;i++){child.activeEventIds=i%2 ? ['repeat-a'] : [];child._render();assert.strictEqual(child.notation,notation);}assert.strictEqual(rawCalls,0);
  child.$destroy();view.$destroy();
});
test('an active Vue render watcher depends on the cache revision and refreshes after score or timeline changes',async()=>{
  const s=score(32);s.parts.forEach((part,p)=>part.measures.forEach((bar,b)=>{bar.events=Array.from({length:16},(_,i)=>note('watch-'+p+'-'+b+'-'+i,i*.5,'sixteenth'));}));
  Vue.observable(s);
  const view=instance('WorkshopListening',{score:s,timeline:model.workshopTimeline(s)}),stop=view.$watch(()=>view._render(),()=>{}),engraved=view.sourceSystem,mapping=view.layout;
  assert(view._computedWatchers.sourceSystem.deps.length<=2);assert(view._computedWatchers.layout.deps.length<=2);
  indexCalls=0;rawCalls=0;
  for(let i=0;i<30;i++){view.position=i*33;view.activeEventIds=i%2 ? ['watch-0-0-0'] : [];await Vue.nextTick();}
  assert.strictEqual(view.sourceSystem,engraved);assert.strictEqual(view.layout,mapping);assert.strictEqual(indexCalls,0);assert.strictEqual(rawCalls,0);
  view.score.parts[0].measures[0].events[0].pitch.step='G';await Vue.nextTick();
  assert.notStrictEqual(view.sourceSystem,engraved);assert.strictEqual(view.sourceSystem.bars[0].parts[0].notation.events.find(event=>event.id==='watch-0-0-0').pitch.step,'G');
  const updated=view.sourceSystem,previousMapping=view.layout;view.timeline=Object.freeze(model.workshopTimeline(view.score));await Vue.nextTick();
  assert.strictEqual(view.sourceSystem,updated);assert.notStrictEqual(view.layout,previousMapping);
  assert(view._computedWatchers.sourceSystem.deps.length<=2);assert(view._computedWatchers.layout.deps.length<=2);stop();view.$destroy();
});
(async()=>{for(const [name,body] of tests){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop render context checks passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

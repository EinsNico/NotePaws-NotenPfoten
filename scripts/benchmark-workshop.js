/* Opt-in Node benchmark. Usage: node scripts/benchmark-workshop.js /path/to/score.mxl
 * Prints JSON; never stores a draft or writes the input file. Timings cover JS
 * layout/VNode generation, not browser DOM patching, painting, or piano audio.
 */
const fs=require('fs'),path=require('path'),Module=require('module'),{performance}=require('perf_hooks');
const filename=process.argv[2];
if (!filename || process.argv.length!==3) {process.stderr.write('Usage: node scripts/benchmark-workshop.js <score.mxl|score.musicxml|score.xml>\n');process.exit(2);}
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,originalJs=Module._extensions['.js'];
let calls={};global.__workshopBenchmarkCall=name=>{calls[name]=(calls[name]||0)+1;};
const tracked={indexWorkshopExpressionNotes:'noteIndexes',isValidWorkshopScore:'scoreValidations',workshopMeasureContext:'contextScans',resolveWorkshopMeasure:'resolvedMeasures',createWorkshopStaffRawNotation:'rawStaffNotations',workshopStaffContentGeometry:'staffGeometries',workshopStaffNotation:'staffNotations'};
function instrument(source) {return source.replace(/export function (\w+)\(([^)]*)\) \{/g,(match,name)=>tracked[name] ? match+'global.__workshopBenchmarkCall("'+tracked[name]+'");' : match);}
Module._extensions['.js']=(mod,file)=>{if (!file.startsWith(root)) return originalJs(mod,file);mod._compile(babel.transform(instrument(fs.readFileSync(file,'utf8')),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
Module._extensions['.vue']=(mod,file)=>{const parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));mod._compile(babel.transform(instrument(parsed.script.content),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
function component(name) {
  const file=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(file,'utf8')),compiled=compiler.compile(parsed.template.content);
  if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
  const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod._compile(babel.transform(instrument(parsed.script.content),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
function instance(definition,props) {return new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},definition.methods,{$t:key=>key})}));}
function nodes(node) {return [node].concat(...(node.children||[]).map(nodes));}
const model=require(root+'model/Workshop'),xml=require(root+'model/WorkshopMusicXml'),parser=require(root+'model/WorkshopMusicXmlParser');
const {createWorkshopRenderContext}=require(root+'model/WorkshopRenderContext'),{createWorkshopSheetSystems}=require(root+'components/WorkshopSheetLayout');
const listeningDefinition=component('WorkshopListening'),staffDefinition=component('WorkshopStaff'),stages=[];
function finishStage(name,start) {stages.push({name,milliseconds:Math.round((performance.now()-start)*100)/100,calls:Object.assign({},calls)});}
function measure(name,run) {calls={};const start=performance.now(),result=run();finishStage(name,start);return result;}
async function measureAsync(name,run) {calls={};const start=performance.now(),result=await run();finishStage(name,start);return result;}
function performedTimeline(score,written) {
  const order=model.workshopPlaybackBarOrder(score),byBar=new Map(),events=[],measures=[];let cursor=0;
  written.events.forEach(event=>{if(!byBar.has(event.barIndex))byBar.set(event.barIndex,[]);byBar.get(event.barIndex).push(event);});
  order.forEach((index,measureIndex)=>{
    const source=written.measures[index],duration=source.endMs-source.startMs;
    measures.push(Object.assign({},source,{startMs:cursor,endMs:cursor+duration}));
    (byBar.get(index)||[]).forEach(event=>events.push(Object.assign({},event,{measureIndex,startMs:cursor+event.startMs-source.startMs})));
    cursor+=duration;
  });
  return Object.freeze({measures,events,durationMs:cursor});
}
async function main() {
  const inputPath=path.resolve(filename),bytes=new Uint8Array(fs.readFileSync(inputPath));
  const imported=await measureAsync('import',()=>xml.importWorkshopMusicXml(bytes,{filename:path.basename(inputPath)})),score=imported.score;
  if (!measure('validate',()=>model.isValidWorkshopScore(score))) throw new Error('The imported score is invalid');
  const sourceCounts=measure('sourceCounts',()=>{
    const counts={notes:0,pitchedNotes:0,rests:0,graceNotes:0};
    function visit(node) {if (node.name==='note') {counts.notes++;if(node.children.some(child=>child.name==='rest'))counts.rests++;else counts.pitchedNotes++;if(node.children.some(child=>child.name==='grace'))counts.graceNotes++;}node.children.forEach(visit);}
    visit(parser.parseWorkshopMusicXmlDocument(score.musicXml.sourceXml));return counts;
  });
  const importedCounts={parts:score.parts.length,bars:score.parts[0].measures.length,notes:0,rests:0,ties:(score.ties||[]).length,slurs:(score.slurs||[]).length,glissandos:(score.glissandos||[]).length,tremolos:(score.tremolos||[]).length};
  score.parts.forEach(part=>part.measures.forEach(bar=>bar.events.forEach(event=>{if(event.kind==='note')importedCounts.notes++;else importedCounts.rests++;})));
  const context=measure('renderContext',()=>createWorkshopRenderContext(score));
  const common={score,scoreLayout:score.layout||{},pageRanges:[{start:0,end:Math.min(24,importedCounts.bars)}],pageIndex:0,barsPerSystem:3,
    activeParts:score.parts.map((part,index)=>({part,index})).filter(item=>item.part.enabled!==false)};
  measure('sheetFirst24Bars',()=>createWorkshopSheetSystems(common));
  measure('listeningAllBars',()=>createWorkshopSheetSystems(Object.assign({},common,{scoreLayout:{},pageRanges:[{start:0,end:importedCounts.bars}],barsPerSystem:importedCounts.bars,continuous:true})));
  const writtenTimeline=measure('writtenTimeline',()=>model.workshopTimeline(score));
  const timeline=measure('performedTimeline',()=>performedTimeline(score,writtenTimeline));
  // In the app the parent draft observes the score before passing it as a prop.
  // Plain props alone would miss Vue's computed dependency-forwarding cost.
  measure('reactiveScoreSetup',()=>Vue.observable(score));
  const view=measure('vueSetup',()=>instance(listeningDefinition,{score,timeline,title:imported.title}));
  const engraving=measure('vueListeningSource',()=>view.sourceSystem),mapping=measure('vuePositionMapping',()=>view.layout);
  const children=nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff')
    .map(node=>instance(staffDefinition,node.componentOptions.propsData));
  children.forEach(child=>child._render());
  const frames=Array.from({length:120},(_,index)=>{
    const position=Math.min(timeline.durationMs,index*33);
    return {position,ids:timeline.events.filter(event=>event.value!==null&&event.startMs<=position&&event.startMs+event.durationMs>position).map(event=>event.id)};
  });
  let cached=true;
  measure('vue120PositionsAndActiveIds',()=>frames.forEach(frame=>{
    view.position=frame.position;view.activeEventIds=frame.ids;view._render();
    children.forEach(child=>{child.activeEventIds=frame.ids;child._render();});
    if(view.sourceSystem!==engraving || view.layout!==mapping) cached=false;
  }));
  const stop=view.$watch(()=>view._render(),()=>{}),childStops=children.map(child=>child.$watch(()=>child._render(),()=>{}));
  await measureAsync('vue120WatchedPositionsAndActiveIds',async()=>{
    for(const frame of frames) {
      view.position=frame.position;view.activeEventIds=frame.ids;children.forEach(child=>{child.activeEventIds=frame.ids;});
      await Vue.nextTick();
      if(view.sourceSystem!==engraving || view.layout!==mapping) cached=false;
    }
  });
  const result={input:path.basename(inputPath),inputBytes:bytes.length,sourceXmlBytes:Buffer.byteLength(score.musicXml.sourceXml),scoreBytes:Buffer.byteLength(JSON.stringify(score)),title:imported.title,warnings:imported.warnings,
    source:sourceCounts,imported:importedCounts,context:{partContexts:context.contexts.map(items=>items.length),requestScoped:true},
    timeline:{writtenBars:writtenTimeline.measures.length,performedBars:timeline.measures.length,events:timeline.events.length,durationMs:timeline.durationMs},
    repeatedRendering:{frames:frames.length,visibleStaves:children.length,engravingAndMappingCached:cached,
      sourceSystemDependencies:view._computedWatchers.sourceSystem.deps.length,positionMappingDependencies:view._computedWatchers.layout.deps.length},stages,
    limitation:'Node JavaScript layout and VNode generation only; browser DOM/paint, parent components and audio are not measured.'};
  stop();childStops.forEach(unwatch=>unwatch());children.forEach(child=>child.$destroy());view.$destroy();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(error=>{process.stderr.write((error.code ? error.code+': ' : '')+error.message+'\n');process.exitCode=1;});

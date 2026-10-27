const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const root=path.resolve(__dirname,'../src')+path.sep,originalJs=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(root))return originalJs(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
Module._extensions['.vue']=(mod,filename)=>{const parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
function component(name){const filename=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const model=require(root+'model/Workshop'),editor=require(root+'model/WorkshopScoreEditor'),rhythm=require(root+'model/WorkshopRhythm');
function instance(name,props){const definition=component(name);return new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},definition.methods,{$t:key=>key})}));}
function controls(score,ids=[],section='selection'){const view=instance('WorkshopNotationControls',{score,selectedEvents:score.parts[0].measures[0].events.filter(event=>ids.includes(event.id)),section,barIndex:0,partIndex:0});view.changes=0;view.$on('change',next=>{view.changes++;view.score=next;view.selectedEvents=next.parts[0].measures[0].events.filter(event=>ids.includes(event.id));});return view;}
function nodes(node){return [node].concat(...(node.children||(node.componentOptions&&node.componentOptions.children)||[]).map(nodes));}function text(node){return (node.text||'')+(node.children||[]).map(text).join(' ');}
function labelControl(view,key){const label=nodes(view._render()).find(node=>node.tag==='label'&&text(node).includes(key));assert(label,key);return nodes(label).find(node=>['input','select','textarea'].includes(node.tag));}
function score(events=[]){const s=model.createWorkshopDraft('Test',2).score;s.parts[0].measures[0].events=events;return s;}
function note(id,slot=0,value='quarter',extra={}){return Object.assign({id,kind:'note',noteValue:value,pitch:{step:'C',alter:0,octave:4},startSlot:slot},extra);}
function rest(id,slot=0,value='quarter',extra={}){return Object.assign({id,kind:'rest',noteValue:value,pitch:null,startSlot:slot,autoRest:false},extra);}
function test(name,body){body();process.stdout.write('✓ '+name+'\n');}

test('legacy sequential notes accept requested dots and grace without losing later positions',()=>{
  const first=note('old1'),later=note('old2');delete first.startSlot;delete later.startSlot;const s=score([first,later]);assert(model.isValidWorkshopScore(s));
  const saved=model.saveWorkshopDraft(null,{title:'Legacy',score:s}).piece,opened=model.openWorkshopPiece(saved),view=controls(opened.score,['old1']);
  view.setNoteProperty('dots',1);assert.strictEqual(view.error,false);assert.strictEqual(view.commonValue('dots',0),1);assert.strictEqual(view.score.parts[0].measures[0].events.find(event=>event.id==='old2').startSlot,2);
  view.setNoteProperty('grace',true);assert.strictEqual(view.error,false);assert.strictEqual(view.selectedEvents[0].grace,true);assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('shortened dots show their requested count, expose mixed selection and clear directly',()=>{
  let s=score(),measure=model.resolveWorkshopMeasure(s,0);measure.events=editor.placeWorkshopEvent(measure,0,note('a',0,'quarter',{dots:1}));measure.events=editor.placeWorkshopEvent(measure,2,note('b',2));s.parts[0].measures[0].events=measure.events;
  const view=controls(s,['a']);assert.strictEqual(view.commonValue('dots',0),1);view.selectedEvents=s.parts[0].measures[0].events.filter(event=>['a','b'].includes(event.id));assert.strictEqual(view.commonValue('dots',0),'mixed');view.selectedEvents=s.parts[0].measures[0].events.filter(event=>event.id==='a');
  view.setNoteProperty('dots',0);assert.strictEqual(rhythm.workshopRequestedDots(view.selectedEvents[0]),0);assert.strictEqual(view.selectedEvents[0].originalDots,undefined);assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('rest-only selection disables note attributes and direct calls do not emit no-op history',()=>{
  const view=controls(score([rest('r')]),['r']);for(const key of ['WORKSHOP_ORNAMENT','WORKSHOP_ARPEGGIO','WORKSHOP_GRACE','WORKSHOP_STEM','WORKSHOP_LYRIC'])assert.strictEqual(labelControl(view,key).data.attrs.disabled,true,key);
  for(const key of ['ornament','arpeggio','grace','stem','lyric'])view.setNoteProperty(key,key==='grace'?true:'trill');assert.strictEqual(view.changes,0);assert.strictEqual(view.error,false);view.$destroy();
});
test('fermata factors and shape, grace slash and single tremolo marks remain editable and clear dependencies',()=>{
  const view=controls(score([note('n')]),['n']);view.setNoteProperty('fermata',1.25);view.setNoteProperty('fermataShape','square');assert.strictEqual(view.selectedEvents[0].fermataShape,'square');view.setNoteProperty('fermata',2.35);assert.strictEqual(view.selectedEvents[0].fermata,2.35);
  const before=JSON.stringify(view.score);view.setNoteProperty('fermata',1.2);assert(view.error);assert.strictEqual(JSON.stringify(view.score),before);view.setNoteProperty('fermata',null);assert.strictEqual(view.selectedEvents[0].fermataShape,undefined);
  view.setNoteProperty('grace',true);view.setNoteProperty('graceSlash',false);assert.strictEqual(view.selectedEvents[0].graceSlash,false);view.setNoteProperty('grace',null);assert.strictEqual(view.selectedEvents[0].graceSlash,undefined);
  view.setNoteProperty('ornament','tremolo');view.setNoteProperty('tremoloMarks',4);assert.strictEqual(view.selectedEvents[0].tremoloMarks,4);view.setNoteProperty('ornament','trill');assert.strictEqual(view.selectedEvents[0].tremoloMarks,undefined);assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('full supported text lengths and multiple lyric verses preserve syllables and extensions',()=>{
  const view=controls(score([note('n',0,'quarter',{lyric:'La'})]),['n']);view.setPrimaryLyric('x'.repeat(1024));assert.strictEqual(view.selectedEvents[0].lyric.length,1024);assert.strictEqual(labelControl(view,'WORKSHOP_LYRIC').data.attrs.maxlength,'1024');
  view.changeLyric(0,'syllabic','begin');view.changeLyric(0,'extend','start');view.addLyric();view.changeLyric(1,'text','Zweite Strophe');view.changeLyric(1,'syllabic','end');view.setPrimaryLyric('Erste');
  assert.strictEqual(view.selectedEvents[0].lyric,undefined);assert.deepStrictEqual(JSON.parse(JSON.stringify(view.selectedEvents[0].lyrics)),[{number:'1',text:'Erste',syllabic:'begin',extend:'start'},{number:'2',text:'Zweite Strophe',syllabic:'end'}]);
  const before=JSON.stringify(view.score);view.changeLyric(1,'number','1');assert(view.error);assert.strictEqual(JSON.stringify(view.score),before);view.removeLyric(1);view.removeLyric(0);assert.strictEqual(view.selectedEvents[0].lyrics,undefined);view.$destroy();
  const document=controls(score(),[],'document');document.setMetadata('copyright','y'.repeat(2048));assert.strictEqual(document.score.metadata.copyright.length,2048);assert.strictEqual(labelControl(document,'WORKSHOP_META_COPYRIGHT').data.attrs.maxlength,'2048');document.$destroy();
});
test('rests form and remove tuplets while uniform and mixed ratios load honestly',()=>{
  const view=controls(score([rest('r1',0,'eighth'),rest('r2',1,'eighth'),rest('r3',2,'eighth')]),['r1','r2','r3']);view.actual=3;view.normal=2;view.setTuplet();assert.strictEqual(view.error,false);assert(view.selectedEvents.every(event=>event.tuplet===3));view.syncTupletSelection();assert.strictEqual(view.actual,3);assert.strictEqual(view.normal,2);
  view.selectedEvents=[view.selectedEvents[0],rest('plain',4,'eighth')];view.syncTupletSelection();assert.strictEqual(view.tupletSelectionMixed,true);assert.strictEqual(view.actual,'');assert.strictEqual(view.normal,'');view.selectedEvents=view.score.parts[0].measures[0].events.filter(event=>['r1','r2','r3'].includes(event.id));view.clearTuplet();assert.strictEqual(view.error,false);assert(view.selectedEvents.every(event=>!event.tuplet));assert.deepStrictEqual(view.selectedEvents.map(event=>event.startSlot),[0,1,2]);view.$destroy();
  const imported=controls(score([rest('imported',0,'quarter',{tuplet:3})]),['imported']);imported.clearTuplet();assert.strictEqual(imported.error,false);assert.strictEqual(imported.selectedEvents[0].tuplet,undefined);imported.$destroy();
});
test('tuplet apply stays disabled for incomplete or unchanged selection and permits a valid ratio change',()=>{
  const view=controls(score([rest('r1',0,'eighth'),rest('r2',1,'eighth'),rest('r3',2,'eighth')]),['r1','r2','r3']);view.selectedEvents=[view.selectedEvents[0]];
  const apply=()=>nodes(view._render()).find(node=>node.tag==='button'&&text(node).includes('WORKSHOP_TUPLET_APPLY'));
  assert.strictEqual(view.canApplyTuplet,false);assert.strictEqual(apply().data.attrs.disabled,true);view.setTuplet();assert.strictEqual(view.changes,0);assert.strictEqual(view.error,false);
  view.selectedEvents=view.score.parts[0].measures[0].events;view.actual=3;view.normal=2;assert.strictEqual(view.canApplyTuplet,true);view.setTuplet();assert.strictEqual(view.error,false);
  assert.strictEqual(view.canApplyTuplet,false);assert.strictEqual(apply().data.attrs.disabled,true);view.normal=4;assert.strictEqual(view.canApplyTuplet,true);view.setTuplet();assert.strictEqual(view.error,false);
  assert(view.selectedEvents.every(event=>event.tuplet.actual===3&&event.tuplet.normal===4));assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('zero layout and custom fonts stay visible and render as zero spacing',()=>{
  const s=model.setWorkshopSecondStaffEnabled(score(),true);s.layout={staffDistance:0,systemDistance:0,fontSize:0,marginTop:0,marginBottom:0,fontFamily:'My Music Font'};const view=controls(s,[],'document');assert.strictEqual(labelControl(view,'WORKSHOP_LAYOUT_STAFFDISTANCE').data.domProps.value,0);assert.strictEqual(labelControl(view,'WORKSHOP_LAYOUT_FONTFAMILY').tag,'input');view.setLayout('fontFamily','Arial');assert.strictEqual(view.score.layout.fontFamily,'Arial');view.setLayout('pageWidth','8000');assert.strictEqual(view.score.layout.pageWidth,8000);
  const sheet=instance('WorkshopSheet',{score:view.score});assert.strictEqual(sheet.systems[0].frames[1].y-sheet.systems[0].frames[0].y-sheet.systems[0].frames[0].height,0);const svg=nodes(sheet._render()).find(node=>node.data&&node.data.staticClass==='sheet-system');assert.strictEqual(svg.data.style.marginBottom,'0px');assert.strictEqual(sheet.scoreFontStyle.fontSize,'0px');assert.strictEqual(sheet.paperStyle.paddingTop,'0px');view.$destroy();sheet.$destroy();
});
test('glissando and double tremolo controls preserve timing and expose removable connections',()=>{
  const view=controls(score([note('a'),note('b',2,'quarter',{pitch:{step:'E',alter:0,octave:4}})]),['a','b']);view.connectGlissando('glissando');assert.strictEqual(view.hasSelectedGlissandos,true);view.connectGlissando('slide');assert.strictEqual(view.score.glissandos[0].type,'slide');view.clearGlissandos();assert.strictEqual(view.hasSelectedGlissandos,false);
  const duration=view.selectedEvents.map(rhythm.workshopEventUnits);view.pairMarks=2;view.setPairTremolo();assert.strictEqual(view.error,false);assert.strictEqual(view.score.tremolos[0].marks,2);assert.deepStrictEqual(view.selectedEvents.map(rhythm.workshopEventUnits),duration);assert(view.selectedEvents.every(event=>event.noteValue==='half'));view.pairMarks=4;view.changePairMarks();assert.strictEqual(view.score.tremolos[0].marks,4);assert(view.selectedEvents.every(event=>event.noteValue==='half'));
  const sheet=instance('WorkshopSheet',{score:view.score});assert.strictEqual(sheet.systems[0].bars[0].parts[0].tremolos.length,1);sheet.$destroy();view.clearTremolos();assert.strictEqual(view.hasSelectedTremolos,false);assert(view.selectedEvents.every(event=>event.noteValue==='quarter'));assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('sheet draws cross-staff glissandos and tremolo strokes with finite shared coordinates',()=>{
  const s=model.setWorkshopSecondStaffEnabled(score([note('a'),note('b',2,'quarter',{displayStaff:1,pitch:{step:'E',alter:0,octave:4}})]),true),view=controls(s,['a','b']);
  view.connectGlissando('glissando');view.setPairTremolo();assert.strictEqual(view.error,false);const sheet=instance('WorkshopSheet',{score:view.score}),connections=sheet.systems[0].bars[0].crossStaff;
  assert.strictEqual(connections.curves.filter(curve=>curve.kind==='glissando').length,1);assert.strictEqual(connections.curves.filter(curve=>curve.kind==='tremolo').length,1);
  assert(connections.curves.every(curve=>curve.path && !/NaN|undefined/.test(curve.path)));assert(connections.relationIds.includes('tremolo:a:b'));assert(connections.relationIds.includes('glissando:a:b'));
  const stroke=nodes(sheet._render()).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-connection']==='tremolo');assert(stroke.data.class['cross-staff-tremolo']);sheet.$destroy();view.$destroy();
});
test('verse rows use the owning whole-part order even when a later bar contains only verse two',()=>{
  const s=score([note('first',0,'quarter',{lyric:'One'})]);s.parts[0].measures[1].events=[note('later',0,'quarter',{lyrics:[{number:'2',text:'Two'}]})];const sheet=instance('WorkshopSheet',{score:s}),parts=sheet.systems[0].bars.map(bar=>bar.parts[0]);
  parts.forEach(part=>assert.deepStrictEqual(part.lyricVerseNumbers,['1','2']));const staffNodes=nodes(sheet._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');assert.deepStrictEqual(staffNodes[1].componentOptions.propsData.lyricVerseNumbers,['1','2']);sheet.$destroy();
});
test('new shape, syllable, stanza and connection controls have complete German and English labels',()=>{
  for (const locale of ['de','en']) {
    const strings=require(root+'resources/'+locale).default,view=controls(score([note('n',0,'eighth',{fermata:1.25,fermataShape:'square',grace:true,graceSlash:false,ornament:'tremolo',tremoloMarks:4,lyrics:[{number:'1',text:'La',syllabic:'begin',extend:'start'}]})]),['n']);
    view.$t=key=>strings[key]||key;assert(!/WORKSHOP_[A-Z_]+/.test(text(view._render())),locale);view.$destroy();
  }
});
process.stdout.write('Workshop notation editability checks passed.\n');

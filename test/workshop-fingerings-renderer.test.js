const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){
  const filename=path.join(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=mod;
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component('WorkshopStaff'),sheet=component('WorkshopSheet'),listening=component('WorkshopListening');
const model=require('../src/model/Workshop'),{createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const cases=[];function test(name,body){cases.push([name,body]);}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function note(id='n',extra={}){return Object.assign({id,kind:'note',startSlot:0,noteValue:'quarter',pitch:{step:'C',alter:0,octave:5}},extra);}
function fixture(props={}){return new Vue(Object.assign({},staff,{propsData:Object.assign({measure:{events:[note()]}},props),methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function labels(view){return nodes(view._render()).filter(node=>node.tag==='text'&&node.data&&node.data.staticClass==='fingering');}
function text(node){return (node.children||[]).map(child=>child.text||'').join('');}
function inside(view){
  view.events.forEach(event=>(event.fingeringMarks||[]).forEach(mark=>{
    assert(mark.y-14*view.notationScale>=view.geometry.top,'label top clipped: '+mark.text);
    assert(mark.y+5*view.notationScale<=view.geometry.top+view.geometry.height,'label bottom clipped: '+mark.text);
    if(mark.width){assert(mark.x-mark.width/2>=0,'label left clipped: '+mark.text);assert(mark.x+mark.width/2<=view.geometry.width,'label right clipped: '+mark.text);}
  }));
}
function intersects(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
function labelBox(mark,scale=1){return {left:mark.x-mark.width/2,right:mark.x+mark.width/2,top:mark.y-14*scale,bottom:mark.y+5*scale};}
function childNodes(view){return nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');}

test('legacy numeric fingerings retain their voice layout and align after nonzero header shifts',()=>{
  const event=note('legacy',{fingering:3}),measure={events:[event]},before=JSON.stringify(measure);
  for(const props of [{},{keyId:'D-major'},{headerLeft:170},{showClef:false,showKey:false,showMeter:false}]){
    const view=fixture(Object.assign({measure},props)),drawn=view.events.find(event=>event.id==='legacy');
    assert.deepStrictEqual(labels(view).map(text),['3']);assert.strictEqual(drawn.fingeringX,drawn.x);
    assert.strictEqual(drawn.fingeringY,Math.min(drawn.y,drawn.stemEndY)-19);
    assert.strictEqual(drawn.fingeringMarks[0].x,drawn.fingeringX);inside(view);view.$destroy();
  }
  assert.strictEqual(JSON.stringify(measure),before);
});

test('advanced changes and alternatives render once in order while taking precedence over legacy data',()=>{
  const measure={events:[note('rich',{fingering:5,fingerings:[{value:'1'},{value:'2',substitution:true},{value:'3',alternate:true}]})]},before=JSON.stringify(measure);
  const view=fixture({measure});assert.deepStrictEqual(labels(view).map(text),['1–2 (3)']);
  assert.strictEqual(labels(view)[0].data.attrs['data-fingering-placement'],'above');inside(view);view.$destroy();
  assert.strictEqual(JSON.stringify(measure),before);
});

test('explicit above and below placements override the voice preference and retain combined flags',()=>{
  const measure={events:[note('rich',{voice:2,fingerings:[{value:'1',placement:'above'},{value:'2',substitution:true,alternate:true,placement:'above'},{value:'5',placement:'below'}]}),note('other',{voice:1,pitch:{step:'E',alter:0,octave:4}})]};
  const view=fixture({measure}),event=view.events.find(event=>event.id==='rich'),marks=event.fingeringMarks;
  assert.deepStrictEqual(marks.map(mark=>[mark.text,mark.placement]),[['1–(2)','above'],['5','below']]);
  assert(marks[0].y<Math.min(event.y,event.stemEndY));assert(marks[1].y>Math.max(event.y,event.stemEndY));inside(view);view.$destroy();
});

test('chord fingerings and nearby note labels move vertically clear of expression marks',()=>{
  const events=['C','E','G'].map((step,index)=>note('chord-'+index,{pitch:{step,alter:0,octave:5},articulations:['accent','tenuto'],ornament:'trill',fingerings:[{value:String(index+1)},{value:String(index+2),alternate:true}]}));
  events.push(note('next',{startSlot:1,noteValue:'eighth',pitch:{step:'F',alter:0,octave:5},fingerings:[{value:'2'},{value:'3',substitution:true}]}));
  const measure={events},before=JSON.stringify(measure),view=fixture({measure}),boxes=view.events.flatMap(event=>(event.fingeringMarks||[]).map(mark=>labelBox(mark)));
  boxes.forEach((box,index)=>boxes.slice(index+1).forEach(other=>assert(!intersects(box,other),'fingering labels overlap')));
  view.events.filter(event=>event.pitch).forEach(event=>{
    (event.expressionMarks||[]).forEach(mark=>boxes.forEach(box=>assert(!intersects(box,{left:event.x-14,right:event.x+14,top:mark.y-7,bottom:mark.y+7}),'fingering overlaps articulation')));
    (event.notationMarks||[]).forEach(mark=>boxes.forEach(box=>assert(!intersects(box,{left:event.x-17,right:event.x+17,top:mark.y-20,bottom:mark.y+12}),'fingering overlaps ornament')));
  });
  assert.strictEqual(labels(view).length,4);inside(view);view.$destroy();assert.strictEqual(JSON.stringify(measure),before);
});

test('long imported labels wrap within narrow moving staffs at small and large notation scales',()=>{
  const value='12345123451234512345123451234512',measure={events:[note('long',{fingerings:[{value,placement:'above'},{value,alternate:true,placement:'below'}]})]},before=JSON.stringify(measure);
  for(const notationScale of [.6,1,2,3]){
    const view=fixture({measure,notationScale,practiceLayout:true,readOnly:true,compact:true,showClef:false,showKey:false,showMeter:false}),drawn=view.events.find(event=>event.id==='long');
    assert(labels(view).length>2,'long labels should wrap rather than widen the time grid');
    const above=drawn.fingeringMarks.filter(mark=>mark.placement==='above'),below=drawn.fingeringMarks.filter(mark=>mark.placement==='below');
    assert.strictEqual(above.map(mark=>mark.text).join(''),value);assert.strictEqual(below.map(mark=>mark.text).join(''),'('+value+')');
    assert(view.geometry.width<400,'fingering must not shrink mobile notes by expanding the staff width');inside(view);view.$destroy();
  }
  assert.strictEqual(JSON.stringify(measure),before);
});

test('lower-voice fingerings reserve separate space for tuplets, lyrics, pedals and dynamics',()=>{
  const events=[note('upper',{noteValue:'half',pitch:{step:'C',alter:0,octave:5}}),...['C','D','E'].map((step,index)=>note('triplet-'+index,{voice:2,startSlot:index*2/3,noteValue:'eighth',pitch:{step,alter:0,octave:4},tuplet:3,tupletGroupId:'triplet',fingerings:[{value:String(index+1),placement:'below'},{value:'5',alternate:true,placement:'below'}],articulations:['staccato'],lyrics:[{number:'1',text:'Music',syllabic:'single'}],pedal:index===0?'down':undefined}))];
  const view=fixture({measure:{events},compact:true,readOnly:true}),triplet=view.tuplets[0];
  const maximum=Math.max(...view.events.flatMap(event=>(event.fingeringMarks||[]).map(mark=>mark.y+5)));
  assert(triplet.y-17>maximum,'tuplet number clears all rich fingering rows');
  assert(view.events.find(event=>event.id==='triplet-0').lyricY-14>maximum,'lyrics clear fingerings');
  assert(view.events.find(event=>event.id==='triplet-0').pedalY>triplet.y+12);inside(view);view.$destroy();
});

test('sheet and practice stream frames include rich labels without altering notes or timing',()=>{
  const score=model.createWorkshopDraft('Fingerings',2).score;
  score.parts[0].measures[0].events=[note('rich',{fingerings:[{value:'1'},{value:'2',substitution:true},{value:'5',alternate:true,placement:'below'}]})];
  score.parts[0].measures[1].events=[note('plain')];
  const before=JSON.stringify(score),timeline=createWorkshopPlayback(score,{}).getTimeline(),timing=JSON.stringify(timeline);
  const sheetView=new Vue(Object.assign({},sheet,{propsData:{score},components:{WorkshopStaff:staff},mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},sheet.methods,{$t:key=>key})}));
  const listeningView=new Vue(Object.assign({},listening,{propsData:{score,timeline,practice:true},components:{WorkshopStaff:staff},mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},listening.methods,{$t:key=>key})}));
  for(const parent of [sheetView,listeningView]){
    const children=childNodes(parent);assert(children.length>0);
    let found=false;
    children.forEach(node=>{
      const props=node.componentOptions.propsData,child=fixture(props);inside(child);
      if(Number.isFinite(props.frameTop)&&Number.isFinite(props.frameBottom)){
        assert(child.geometry.top>=props.frameTop,'parent frame clips fingering top');
        assert(child.geometry.top+child.geometry.height<=props.frameBottom,'parent frame clips fingering bottom');
      }
      if(labels(child).length){found=true;assert(labels(child).some(node=>text(node)==='1–2'));assert(labels(child).some(node=>text(node)==='(5)'));}
      child.$destroy();
    });
    assert(found,'parent omits fingering labels');parent.$destroy();
  }
  assert.strictEqual(JSON.stringify(score),before);assert.strictEqual(JSON.stringify(timeline),timing);
});

test('broad current fingering rows stay entirely beside the permanent practice header on phones',()=>{
  const score=model.createWorkshopDraft('Visible fingering',2).score;score.keyId='D-major';
  const fingerings=[{value:'12345123451234512345123451234512'},{value:'4',alternate:true,placement:'below'}];
  score.parts[0].measures[0].events=[note('first',{fingerings})];
  score.parts[0].measures[1].events=[note('later',{startSlot:4,fingerings})];
  const before=JSON.stringify(score),timeline=createWorkshopPlayback(score,{}).getTimeline();
  const view=new Vue(Object.assign({},listening,{propsData:{score,timeline,practice:true},components:{WorkshopStaff:staff},mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},listening.methods,{$t:key=>key})}));
  try{
    for(const width of [260,320,390]){
      view.availableWidth=width;
      for(const event of timeline.events.filter(event=>event.id==='first'||event.id==='later')){
        view.position=event.startMs;
        const bar=view.layout.bars[event.measureIndex],part=view.sourceSystem.bars.find(bar=>bar.index===event.barIndex).parts[0];
        const drawn=part.notation.events.find(note=>note.id===event.id),clip=nodes(view._render()).find(node=>node.tag==='clipPath').children[0];
        assert(drawn.fingeringMarks.length>2,'fixture must exercise long wrapped fingerings');
        drawn.fingeringMarks.forEach(mark=>{
          const left=bar.x+mark.x-mark.width/2+view.translation,right=bar.x+mark.x+mark.width/2+view.translation;
          assert(left>=clip.data.attrs.x,'current fingering left edge is clipped at '+width+'px');
          assert(left>view.headerWidth,'permanent header hides the current fingering');
          assert(right<=view.logicalWidth,'current fingering right edge leaves the phone viewport');
        });
        assert(view.noteClipInset>12*view.notationScale+2,'broad label must increase the ordinary notehead reserve');
      }
    }
  }finally{view.$destroy();}
  assert.strictEqual(JSON.stringify(score),before);
});

(async()=>{let failed=0;for(const[name,body]of cases){try{await body();process.stdout.write('✓ '+name+'\n');}catch(error){failed++;console.error('FAILED: '+name+'\n'+error.stack);}}assert.strictEqual(failed,0,'fingering rendering failed');process.stdout.write('Workshop fingering rendering tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

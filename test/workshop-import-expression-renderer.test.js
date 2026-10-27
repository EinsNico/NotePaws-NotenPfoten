const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop');
function component(name){
  const filename=path.resolve(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=mod;
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component('WorkshopStaff'),sheet=component('WorkshopSheet'),tests=[];
function test(name,body){tests.push([name,body]);}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function note(id='n',voice=1){return {id,kind:'note',startSlot:0,noteValue:'quarter',pitch:{step:'D',alter:0,octave:5},voice};}
function fixture(props={}){return new Vue(Object.assign({},staff,{propsData:Object.assign({measure:{events:[note()]}},props),methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function dynamicNodes(view){return nodes(view._render()).filter(node=>node.tag==='text'&&node.data&&((node.data.staticClass||'').split(' ').includes('dynamic-mark')||node.data.class&&node.data.class['dynamic-mark']));}
function dynamicTexts(view){return dynamicNodes(view).map(node=>(node.children||[]).map(child=>child.text||'').join(''));}
function dynamic(id,startSlot,value){return {id,type:'dynamic',startSlot,value};}
function assertMarkInside(view,mark){assert(mark.minimumY>=view.geometry.top);assert(mark.maximumY<=view.geometry.top+view.geometry.height);}

test('imported initial dynamic is shown once in the editable and compact staff without changing score data',()=>{
  const measure={events:[note()],dynamic:'mp',directions:[dynamic('imported-mp',0,'mp')]},before=JSON.stringify(measure);
  for(const readOnly of [false,true]){
    const view=fixture({measure,readOnly,compact:readOnly});
    assert.deepStrictEqual(dynamicTexts(view),['mp']);assert.strictEqual(view.showContextDynamic,false);
    assert.strictEqual(view.directionMarks[0].id,'imported-mp');assertMarkInside(view,view.directionMarks[0]);
    view.$destroy();
  }
  assert.strictEqual(JSON.stringify(measure),before);
});

test('removing or changing a matching direction restores context while later dynamic marks stay visible',async()=>{
  const measure={events:[note()],dynamic:'mp',directions:[dynamic('initial',0,'mp'),dynamic('repeat',2,'mp'),dynamic('louder',4,'f')]};
  const view=fixture({measure});assert.deepStrictEqual(dynamicTexts(view),['mp','mp','f']);
  view.measure={events:measure.events,dynamic:'mp',directions:measure.directions.slice(1)};await Vue.nextTick();
  assert.deepStrictEqual(dynamicTexts(view),['mp','f','mp']);assert(view.showContextDynamic);
  view.measure={events:measure.events,dynamic:'mp',directions:[dynamic('different',0,'p')]};await Vue.nextTick();
  assert.deepStrictEqual(dynamicTexts(view),['p','mp']);
  view.measure={events:measure.events,dynamic:'mp',directions:[]};await Vue.nextTick();assert.deepStrictEqual(dynamicTexts(view),['mp']);view.$destroy();
});

test('direction span copies deduplicate by ID and explicit dynamics remain when context display is hidden',()=>{
  const initial=dynamic('initial',0,'mp'),measure={events:[note()],dynamic:'mp',directions:[initial]};
  const view=fixture({measure,directionSpans:[Object.assign({},initial)],showDynamic:false});
  assert.deepStrictEqual(dynamicTexts(view),['mp']);assert.strictEqual(view.directionMarks.length,1);view.$destroy();
  const spanOnly=fixture({measure:{events:[note()],dynamic:'mp'},directionSpans:[initial]});
  assert.deepStrictEqual(dynamicTexts(spanOnly),['mp']);spanOnly.$destroy();
});

test('sheet music uses the same single dynamic mark for an imported starting direction',()=>{
  const score=model.createWorkshopDraft('',1).score,measure=score.parts[0].measures[0];
  measure.events=[note()];measure.dynamic='mp';measure.directions=[dynamic('initial',0,'mp')];
  const before=JSON.stringify(score),view=new Vue(Object.assign({},sheet,{propsData:{score},components:{WorkshopStaff:staff},mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},sheet.methods,{$t:key=>key})}));
  const staffs=nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');assert.strictEqual(staffs.length,1);
  const rendered=fixture(staffs[0].componentOptions.propsData);assert.deepStrictEqual(dynamicTexts(rendered),['mp']);rendered.$destroy();view.$destroy();assert.strictEqual(JSON.stringify(score),before);
});

test('staccatissimo draws a filled wedge toward each voice and stays within the staff bounds',()=>{
  const upper=Object.assign(note('upper',1),{articulations:['staccatissimo']}),lower=Object.assign(note('lower',2),{pitch:{step:'G',alter:0,octave:4},articulations:['staccatissimo','tenuto']});
  const measure={events:[upper,lower]},before=JSON.stringify(measure);
  for(const readOnly of [false,true]){
    const view=fixture({measure,readOnly,compact:readOnly}),rendered=nodes(view._render()).filter(node=>node.data&&node.data.attrs&&node.data.attrs['data-articulation']==='staccatissimo');
    assert.strictEqual(rendered.length,2);
    for(const id of ['upper','lower']){
      const event=view.events.find(event=>event.id===id),mark=event.expressionMarks.find(mark=>mark.kind==='staccatissimo');assert(mark);
      const wedge=rendered.find(node=>node.data.attrs.d===view.expressionPath(event,mark));assert(wedge,'missing wedge for '+id);assert(/ Z$/.test(wedge.data.attrs.d));
      const numbers=wedge.data.attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number),baseY=numbers[1],tipY=numbers[5];
      assert.strictEqual(Math.abs(tipY-baseY),10);assert.strictEqual(numbers[2]-numbers[0],6);
      if(id==='upper'){assert(mark.y<event.y);assert(baseY<tipY);}else{assert(mark.y>event.y);assert(baseY>tipY);}
      assert(Math.min(baseY,tipY)>=view.geometry.top);assert(Math.max(baseY,tipY)<=view.geometry.top+view.geometry.height);
    }
    assert.strictEqual(nodes(view._render()).filter(node=>node.data&&node.data.attrs&&node.data.attrs['data-articulation']==='tenuto').length,1);view.$destroy();
  }
  assert.strictEqual(JSON.stringify(measure),before);
});

(async()=>{let failed=0;for(const [name,body]of tests){try{await body();process.stdout.write('✓ '+name+'\n');}catch(error){failed++;console.error('FAILED: '+name+'\n'+error.stack);}}assert.strictEqual(failed,0,'import expression rendering failed');process.stdout.write('Workshop import expression rendering tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});

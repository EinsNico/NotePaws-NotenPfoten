const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const {createWorkshopStreamPosition,workshopStreamXAtTime,workshopStreamTimeAtX,workshopStreamMeasureAtTime}=require('../src/model/WorkshopStreamPosition');
const tests=[];function test(name,run){tests.push([name,run]);}
function near(actual,expected,tolerance=1e-7){assert(Math.abs(actual-expected)<=tolerance,actual+' differs from '+expected);}
function fixture(points,options={smooth:true}) {
  const notes=points.slice(0,-1).map((point,index)=>({id:'head-'+index,x:point[1]}));
  const last=points[points.length-1],system={bars:[{headerLeft:points[0][1]-16,width:last[1]+12}]};
  const timeline={durationMs:last[0],measures:[{index:0,startMs:points[0][0],endMs:last[0]}],events:notes.map((event,index)=>({id:event.id,measureIndex:0,startMs:points[index][0]}))};
  const original=JSON.stringify({system,timeline,notes});let reads=0;
  const layout=createWorkshopStreamPosition(system,timeline,()=>{reads++;return notes;},options);
  return {layout,system,timeline,notes,get reads(){return reads;},assertUnchanged:()=>assert.strictEqual(JSON.stringify({system,timeline,notes}),original)};
}
const headerPoints=[[0,0],[200,24],[400,183],[600,202],[1000,248],[1600,319]];

test('smoothing is opt-in and the original listening interpolation remains exactly linear',()=>{
  for(const options of [{},{smooth:false}]) {
    const f=fixture(headerPoints,options),layout=f.layout;
    assert.strictEqual(layout.motionSegments,undefined);
    for(let index=0;index<headerPoints.length-1;index++) {
      const left=headerPoints[index],right=headerPoints[index+1];
      for(const fraction of [0,.1,.4,.5,.8,1]) {
        const time=left[0]+(right[0]-left[0])*fraction,x=left[1]+(right[1]-left[1])*fraction;
        near(workshopStreamXAtTime(layout,time),x);near(workshopStreamTimeAtX(layout,x),time);
      }
    }
    f.assertUnchanged();
  }
});

test('smooth practice preserves all engraved onset anchors, endpoints, source geometry and musical duration',()=>{
  const f=fixture(headerPoints),linear=fixture(headerPoints,{}).layout,layout=f.layout;
  assert.deepStrictEqual(layout.anchors,linear.anchors);assert.deepStrictEqual(layout.bars,linear.bars);
  assert.strictEqual(layout.width,linear.width);assert.strictEqual(layout.durationMs,linear.durationMs);
  headerPoints.forEach(([time,x])=>{assert.strictEqual(workshopStreamXAtTime(layout,time),x);assert.strictEqual(workshopStreamTimeAtX(layout,x),time);});
  assert.strictEqual(workshopStreamXAtTime(layout,-100),0);assert.strictEqual(workshopStreamTimeAtX(layout,-100),0);
  assert.strictEqual(workshopStreamXAtTime(layout,2000),319);assert.strictEqual(workshopStreamTimeAtX(layout,500),1600);
  assert(Object.isFrozen(layout.motionSegments));assert(layout.motionSegments.every(Object.isFrozen));assert.strictEqual(f.reads,1);f.assertUnchanged();
});

test('a wide header produces continuous position and velocity rather than an abrupt speed change at a note',()=>{
  const layout=fixture(headerPoints).layout,epsilon=.001;
  for(let index=1;index<headerPoints.length-1;index++) {
    const [time,x]=headerPoints[index],before=workshopStreamXAtTime(layout,time-epsilon),after=workshopStreamXAtTime(layout,time+epsilon);
    const leftVelocity=(x-before)/epsilon,rightVelocity=(after-x)/epsilon;
    assert(leftVelocity>0&&rightVelocity>0,'scrolling does not stop at each ordinary note');
    near(leftVelocity,rightVelocity,2e-5);
    assert(before<x&&after>x,'the score advances continuously through its exact note column');
  }
  const linear=fixture(headerPoints,{}).layout;
  const before=(workshopStreamXAtTime(linear,200)-workshopStreamXAtTime(linear,200-epsilon))/epsilon;
  const after=(workshopStreamXAtTime(linear,200+epsilon)-workshopStreamXAtTime(linear,200))/epsilon;
  assert(Math.abs(before-after)>.6,'the fixture actually catches the former wide-header speed jump');
});

test('very uneven and nearly coincident anchors stay monotone without overshooting either neighbouring note',()=>{
  const sets=[headerPoints,[[0,60],[.05,60.000001],[1200,8000],[1200.01,8000.000001],[3000,16000]],
    [[0,0],[300,0],[320,0],[340,0],[360,36],[400,400],[1000,440]]];
  for(const points of sets) {
    const layout=fixture(points).layout;let previous=-Infinity;
    for(let index=0;index<layout.anchors.length-1;index++) {
      const left=layout.anchors[index],right=layout.anchors[index+1];
      for(let sample=0;sample<=1000;sample++) {
        const x=workshopStreamXAtTime(layout,left.time+(right.time-left.time)*sample/1000);
        assert(Number.isFinite(x));assert(x>=left.x-1e-10&&x<=right.x+1e-10,'curve stays within its engraved segment');
        assert(x>=previous-1e-10,'seeking and playback cannot move backwards');previous=x;
      }
    }
  }
});

test('dragging inverts the smooth curve, including slow ornaments and a fast clef transition',()=>{
  for(const points of [headerPoints,[[0,60],[40,60],[80,60],[120,60],[180,80],[300,400],[600,440]]]) {
    const layout=fixture(points).layout;
    for(let index=0;index<layout.anchors.length-1;index++) {
      const left=layout.anchors[index],right=layout.anchors[index+1],tiny=right.x-left.x<1e-4;
      for(const fraction of [.001,.02,.1,.3,.5,.7,.9,.98,.999]) {
        const time=left.time+(right.time-left.time)*fraction,x=workshopStreamXAtTime(layout,time);
        near(workshopStreamTimeAtX(layout,x),time,tiny ? .001 : 1e-6);
        const target=left.x+(right.x-left.x)*fraction;
        near(workshopStreamXAtTime(layout,workshopStreamTimeAtX(layout,target)),target,1e-8);
      }
    }
  }
});

test('repeated passages keep separate onset positions and source-bar seeking with unchanged performed timing',()=>{
  const system={bars:[{index:0,headerLeft:90,width:400},{index:1,headerLeft:210,width:580}]};
  const written=[[{id:'a',x:110},{id:'b',x:300}],[{id:'c',x:230},{id:'d',x:470}]],order=[0,1,0,1];
  const timeline={durationMs:8000,measures:order.map((index,occurrence)=>({index,startMs:occurrence*2000,endMs:(occurrence+1)*2000})),events:[]};
  order.forEach((index,occurrence)=>written[index].forEach((event,note)=>timeline.events.push({id:event.id,measureIndex:occurrence,startMs:occurrence*2000+note*1000})));
  const source=JSON.stringify({system,timeline,written});
  const smooth=createWorkshopStreamPosition(system,timeline,bar=>written[system.bars.indexOf(bar)],{smooth:true});
  const linear=createWorkshopStreamPosition(system,timeline,bar=>written[system.bars.indexOf(bar)]);
  assert.deepStrictEqual(smooth.anchors,linear.anchors);assert.deepStrictEqual(smooth.bars.map(bar=>bar.index),order);
  for(const event of timeline.events) {
    const bar=smooth.bars[event.measureIndex],head=written[bar.index].find(note=>note.id===event.id),x=bar.x+head.x;
    assert.strictEqual(workshopStreamXAtTime(smooth,event.startMs),x);near(workshopStreamTimeAtX(smooth,x),event.startMs);
    assert.strictEqual(workshopStreamMeasureAtTime(smooth,event.startMs).measureIndex,event.measureIndex);
  }
  assert.strictEqual(JSON.stringify({system,timeline,written}),source);
});

test('empty and two-anchor layouts retain safe constant motion without an unnecessary cubic distortion',()=>{
  const empty=createWorkshopStreamPosition({bars:[]},{events:[],measures:[],durationMs:0},()=>[],{smooth:true});
  assert.strictEqual(workshopStreamXAtTime(empty,20),0);assert.strictEqual(workshopStreamTimeAtX(empty,20),0);assert.deepStrictEqual(empty.motionSegments,[]);
  const layout=fixture([[0,30],[4000,190]]).layout;
  for(const time of [0,1,100,500,1999,3999,4000]) {
    const x=30+time*.04;near(workshopStreamXAtTime(layout,time),x);near(workshopStreamTimeAtX(layout,x),time);
  }
});

test('cached motion coefficients and binary segment lookup keep each animation tick independent of score length',()=>{
  const points=Array.from({length:4097},(_,index)=>[index*100,index*30+(index%19===0 ? 10 : 0)]),f=fixture(points),layout=f.layout;
  const segments=layout.motionSegments,anchors=layout.anchors;let anchorReads=0,segmentReads=0;
  const measured=Object.assign({},layout,{anchors:new Proxy(anchors,{get(target,property){if(/^\d+$/.test(String(property)))anchorReads++;return target[property];}}),
    motionSegments:new Proxy(segments,{get(target,property){if(/^\d+$/.test(String(property)))segmentReads++;return target[property];}})});
  for(let index=0;index<1000;index++) {
    const time=(index*401.71)%layout.durationMs,x=workshopStreamXAtTime(measured,time);
    near(workshopStreamTimeAtX(measured,x),time,1e-6);
  }
  assert(anchorReads<60000,'per-tick work uses logarithmic lookups instead of traversing all4097 anchors');
  assert(segmentReads<=2000,'each direction reads only its cached segment');assert.strictEqual(f.reads,1,'notation is only read during construction');
  assert.strictEqual(layout.motionSegments,segments);assert.strictEqual(layout.anchors,anchors);f.assertUnchanged();
});

let failures=0;for(const [name,run] of tests){try{run();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;process.stderr.write('✗ '+name+'\n'+error.stack+'\n');}}
if(failures)process.exitCode=1;else process.stdout.write(tests.length+' workshop smooth stream motion tests passed.\n');

'use strict';
// Synthetic localStorage and actual Vue handlers. --source-root also exercises
// the unchanged audit baseline with the same behavioral expectations.
const assert=require('assert'),fs=require('fs'),path=require('path');
const project=path.resolve(__dirname,'..');
const sourceArgument=process.argv.find(argument=>argument.startsWith('--source-root='));
const sourceRoot=sourceArgument?path.resolve(sourceArgument.slice('--source-root='.length)):project;
const source=path.join(sourceRoot,'src'),requireProject=require('module').createRequire(path.join(project,'package.json'));
const babel=requireProject('babel-core'),compiler=requireProject('vue-template-compiler'),Vue=requireProject('vue');
global.regeneratorRuntime=requireProject('babel-runtime/regenerator');
const timers=new Map();let timerId=0;
global.setTimeout=(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
global.clearTimeout=id=>timers.delete(id);global.setInterval=global.setTimeout;global.clearInterval=global.clearTimeout;
global.window={addEventListener(){},removeEventListener(){},scrollTo(){}};
global.document={hidden:false,addEventListener(){},removeEventListener(){}};
const syntheticPlayer=()=>({prepare:async()=>true,play(){return{pause(){},currentTime:0};},stopAll(){}});
function memoryStorage(){
  const values=new Map(),writes=[];let failure=null,hook=null;
  return {
    getItem:key=>values.has(key)?values.get(key):null,removeItem:key=>values.delete(key),
    setItem(key,value){
      writes.push({key,value:String(value)});
      if(hook && hook.key===key){const callback=hook.callback;hook=null;callback();}
      if(failure && (!failure.key || failure.key===key)){
        if(failure.skip>0)failure.skip--;
        else {
          const mode=failure.mode;if(failure.once)failure=null;
          if(mode==='quota')throw Error('synthetic quota');
          if(mode==='silent')return;
          if(mode==='corrupt'){values.set(key,'synthetic corrupt write');return;}
          if(mode==='after'){values.set(key,String(value));throw Error('synthetic post-write error');}
        }
      }
      values.set(key,String(value));
    },
    fail(mode,key=null,once=false,skip=0){failure=mode?{mode,key,once,skip}:null;},
    onNextWrite(key,callback){hook={key,callback};},
    writes,values
  };
}
function realm(){
  const storage=memoryStorage();global.localStorage=storage;
  const cache=new Map(),overrides={
    'model/PianoAudio.js':{createPianoSamplePlayer:syntheticPlayer},
    'model/WorkshopPianoAudio.js':{createWorkshopPianoPlayer:syntheticPlayer},
    'model/AudioSynchronization.js':{resume:async()=>true,getContext:()=>null,getDelayMs:()=>0,subscribe:()=>()=>{},getState:()=>({revision:1})},
    'model/AudioSynchronizationPlayback.js':{watchAudioTimingChanges:()=>()=>{}},
    webmidi:{inputs:[],enabled:false}
  };
  function load(relative){
    if(overrides[relative])return overrides[relative];
    const file=path.join(source,relative);if(cache.has(file))return cache.get(file);
    const raw=fs.readFileSync(file,'utf8'),parsed=file.endsWith('.vue')?compiler.parseComponent(raw):null,module={exports:{}};
    cache.set(file,module.exports);
    const transformed=babel.transform(parsed?parsed.script.content:raw,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code;
    new Function('module','exports','require',transformed)(module,module.exports,name=>{
      if(overrides[name])return overrides[name];if(!name.startsWith('.'))return requireProject(name);
      const base=path.resolve(path.dirname(file),name),target=fs.existsSync(base)?base:fs.existsSync(base+'.js')?base+'.js':base+'.vue';
      if(target.endsWith('.vue'))return{};
      return load(path.relative(source,target).replace(/\\/g,'/'));
    });
    cache.set(file,module.exports);return module.exports;
  }
  const file=path.join(source,'components/Workshop.vue'),parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const definition=Object.assign({},load('components/Workshop.vue').default,compiler.compileToFunctions(parsed.template.content));
  function view(){
    const vm=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,
      methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key})}));
    vm.player=syntheticPlayer();vm.$i18n={locale:'de'};vm.loadLibrary();return vm;
  }
  return{load,view,storage};
}
function assessment(correct=2,wrong=1,keys=['synthetic-learned']){
  return{correct,early:0,late:0,wrong,missed:0,learnedNoteKeys:keys};
}
function fixture(){
  timers.clear();const context=realm(),model=context.load('model/Workshop.js'),library=context.load('model/WorkshopStorage.js');
  for(const title of ['Synthetic first piece','Synthetic other piece']){
    const draft=model.createWorkshopDraft(title);draft.score.parts[0].measures[0].events=[{id:model.workshopId('event'),kind:'note',noteValue:'quarter',startSlot:0,pitch:model.workshopPitchFromValue(48)}];
    library.storeWorkshopDraft(draft);
  }
  const vm=context.view(),[piece,other]=vm.pieces,stats=context.load('model/WorkshopPracticeStatistics.js');
  return Object.assign(context,{vm,piece,other,stats,model,feedback:context.load('model/PersistenceFeedback.js'),music:context.storage.getItem(model.WORKSHOP_STORAGE_KEY)});
}
function record(context,delta=assessment()){
  assert(context.vm.startPractice(context.piece));assert(context.vm.recordPracticeAssessment(delta));
}
function nodes(node){return[node].concat(...(node.children||[]).map(nodes));}
function leaveWorkshop(vm){
  let backEvents=0;vm.$on('back',()=>{backEvents++;vm.$destroy();});
  const back=nodes(vm._render()).find(node=>node.tag==='button' && node.data && node.data.staticClass==='back');
  assert(back);assert.strictEqual(back.data.attrs.disabled,false);back.data.on.click({});
  assert.strictEqual(backEvents,1);assert(vm._isDestroyed);
}
function storedCounts(context,piece=context.piece){return context.stats.workshopPracticeStatisticsFor(context.stats.readWorkshopPracticeStatistics(),piece.id);}
function assertMusicUnchanged(context){assert.strictEqual(context.storage.getItem(context.model.WORKSHOP_STORAGE_KEY),context.music);}
const results=[];
async function test(name,body){
  try{await body();results.push({name,passed:true});console.log('✓ '+name);}
  catch(error){results.push({name,passed:false,error:error.message});console.error('✗ '+name+'\n'+error.stack);}
  finally{timers.clear();}
}
(async()=>{
  await test('failed answers survive actual ClosePractice and Home destruction, and global retry works while Workshop is absent',async()=>{
    const context=fixture();record(context);context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);
    context.vm.closePractice();assert(context.vm.practiceStatsError);assert.strictEqual(context.vm.practiceStatsTimer,null);
    leaveWorkshop(context.vm);assert.strictEqual(context.storage.getItem(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY),null);
    context.storage.fail(null);await context.feedback.retryPersistenceFailures();
    const reopened=context.view();assert.strictEqual(reopened.practiceStatisticsFor(context.piece).correct,2);
    assert.strictEqual(reopened.practiceStatisticsFor(context.piece).wrong,1);assert(!reopened.practiceStatsError);
    assert(reopened.retryPracticeStatistics());await context.feedback.retryPersistenceFailures();
    assert.strictEqual(storedCounts(context).correct,2);assert.strictEqual(context.feedback.persistenceFeedback.sources.length,0);
    assertMusicUnchanged(context);reopened.$destroy();assert.strictEqual(timers.size,0);
  });
  await test('reopening retains unsaved totals and warning; new answers and local/global duplicate retries add exactly once',async()=>{
    const context=fixture();record(context);context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);
    context.vm.closePractice();leaveWorkshop(context.vm);
    const reopened=context.view();assert.strictEqual(reopened.practiceStatisticsFor(context.piece).correct,2);
    assert(reopened.practiceStatsError);assert(reopened.loadPracticeStatistics());assert(reopened.practiceStatsError);
    assert(context.feedback.hasPersistenceFailure('workshop-practice'));
    assert(reopened.startPractice(context.piece));assert(reopened.recordPracticeAssessment(assessment(1,0,['another-key'])));
    reopened.closePractice();context.storage.fail(null);
    await Promise.all([context.feedback.retryPersistenceFailures(),context.feedback.retryPersistenceFailures(),Promise.resolve(reopened.retryPracticeStatistics())]);
    await Vue.nextTick();assert.strictEqual(reopened.practiceStatisticsFor(context.piece).correct,3);
    assert.strictEqual(storedCounts(context).correct,3);assert.strictEqual(storedCounts(context).wrong,1);
    assert(!reopened.practiceStatsError);assert.strictEqual(context.feedback.persistenceFeedback.sources.length,0);
    assertMusicUnchanged(context);reopened.$destroy();
  });
  await test('captured deltas clone learned keys and coalesce repeated inputs into one batched write',()=>{
    const context=fixture(),delta=assessment(2,1,['original-key']);record(context,delta);
    delta.correct=900;delta.learnedNoteKeys[0]='mutated-key';
    for(let i=0;i<25;i++)assert(context.vm.recordPracticeAssessment(assessment(1,0,['shared-key'])));
    assert.strictEqual(Array.from(timers.values()).filter(timer=>timer.delay===750).length,1);
    const before=context.storage.writes.length;context.vm.closePractice();
    assert.strictEqual(context.storage.writes.slice(before).filter(write=>write.key===context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY).length,1);
    assert.strictEqual(storedCounts(context).correct,27);assert.deepStrictEqual(storedCounts(context).learnedNoteKeys,['original-key','shared-key']);
    assertMusicUnchanged(context);context.vm.$destroy();
  });
  await test('confirmed piece deletion cancels its failed answers and retains failed statistics deletion across Home',async()=>{
    const context=fixture();context.stats.storeWorkshopPracticeAssessments([{pieceId:context.piece.id,assessment:assessment(4,0)},{pieceId:context.other.id,assessment:assessment(5,0)}]);
    context.vm.loadPracticeStatistics();record(context);context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);context.vm.closePractice();
    assert(context.vm.requestPieceDeletion(context.piece));assert(context.vm.confirmPieceDeletion());
    assert(context.vm.practiceStatsError);assert(!context.vm.pieces.some(piece=>piece.id===context.piece.id));leaveWorkshop(context.vm);
    const reopened=context.view();assert(!reopened.pieces.some(piece=>piece.id===context.piece.id));
    context.storage.fail(null);await context.feedback.retryPersistenceFailures();
    assert.strictEqual(storedCounts(context).correct,0);assert.strictEqual(storedCounts(context,context.other).correct,5);
    assert(!reopened.practiceStatsError);assert.strictEqual(context.feedback.persistenceFeedback.sources.length,0);reopened.$destroy();
  });
  await test('failed piece deletion preserves its retained practice answers',async()=>{
    const context=fixture();record(context);context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);context.vm.closePractice();
    context.storage.fail('quota',context.model.WORKSHOP_STORAGE_KEY);assert(context.vm.requestPieceDeletion(context.piece));
    assert.strictEqual(context.vm.confirmPieceDeletion(),false);assert(context.vm.pieces.some(piece=>piece.id===context.piece.id));
    context.vm.cancelPieceDeletion();context.storage.fail(null);await context.feedback.retryPersistenceFailures();
    assert.strictEqual(storedCounts(context).correct,2);assertMusicUnchanged(context);context.vm.$destroy();
  });
  await test('a saved answer batch is never replayed when a later deletion fails and is retried after remount',async()=>{
    const context=fixture();context.stats.storeWorkshopPracticeAssessments([{pieceId:context.piece.id,assessment:assessment(4,0)},{pieceId:context.other.id,assessment:assessment(5,0)}]);
    context.vm.loadPracticeStatistics();context.vm.practiceSession={pieceId:context.other.id};assert(context.vm.recordPracticeAssessment(assessment(2,0)));
    context.vm.practiceSession=null;context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY,false,1);
    assert(context.vm.requestPieceDeletion(context.piece));assert(context.vm.confirmPieceDeletion());assert(context.vm.practiceStatsError);
    assert.strictEqual(storedCounts(context,context.other).correct,7);leaveWorkshop(context.vm);
    const reopened=context.view();context.storage.fail(null);await context.feedback.retryPersistenceFailures();
    assert.strictEqual(storedCounts(context).correct,0);assert.strictEqual(storedCounts(context,context.other).correct,7);
    assert.strictEqual(reopened.practiceStatisticsFor(context.other).correct,7);reopened.$destroy();
  });
  await test('new deltas captured during an older write keep ownership across both success and failure',async()=>{
    for(const failed of [false,true]){
      const context=fixture();record(context,assessment(2,0,['old-key']));
      context.storage.onNextWrite(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY,()=>assert(context.vm.recordPracticeAssessment(assessment(1,0,['new-key']))));
      if(failed)context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);
      context.vm.flushPracticeStatistics();assert.strictEqual(context.vm.practiceStatisticsFor(context.piece).correct,3);
      context.storage.fail(null);await context.feedback.retryPersistenceFailures();context.vm.retryPracticeStatistics();
      assert.strictEqual(storedCounts(context).correct,3);assert.deepStrictEqual(storedCounts(context).learnedNoteKeys,['old-key','new-key']);
      assertMusicUnchanged(context);context.vm.$destroy();
    }
  });
  await test('quota, ignored, corrupted and post-write failures preserve bytes and retry only pending deltas against fresh stored data',async()=>{
    for(const mode of ['quota','silent','corrupt','after']){
      const context=fixture();context.stats.storeWorkshopPracticeAssessments([{pieceId:context.piece.id,assessment:assessment(3,0,['saved-key'])}]);
      context.vm.loadPracticeStatistics();const before=context.storage.getItem(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);record(context);
      context.storage.fail(mode,context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY,true);context.vm.closePractice();
      assert.strictEqual(context.storage.getItem(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY),before);
      context.storage.fail(mode,context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY,true);leaveWorkshop(context.vm);
      assert.strictEqual(context.storage.getItem(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY),before);
      context.storage.fail(null);context.stats.storeWorkshopPracticeAssessments([{pieceId:context.piece.id,assessment:assessment(1,0,['external-key'])}]);
      await context.feedback.retryPersistenceFailures();const reopened=context.view();
      assert.strictEqual(storedCounts(context).correct,6);assert.strictEqual(storedCounts(context).wrong,1);
      assert.strictEqual(reopened.practiceStatisticsFor(context.piece).correct,6);assertMusicUnchanged(context);reopened.$destroy();
    }
  });
  await test('a corrupt read after failed storage retains the queue and raw bytes until the original data is repaired',async()=>{
    const context=fixture();record(context);context.storage.fail('quota',context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);
    context.vm.closePractice();leaveWorkshop(context.vm);context.storage.fail(null);context.storage.values.set(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY,'{broken');
    const reopened=context.view();assert(reopened.practiceStatsError);assert.strictEqual(reopened.practiceStatsLoaded,false);
    assert(reopened.startPractice(context.piece));assert.strictEqual(reopened.recordPracticeAssessment(assessment(1,0)),false);
    await context.feedback.retryPersistenceFailures();assert.strictEqual(context.storage.getItem(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY),'{broken');
    context.storage.values.delete(context.stats.WORKSHOP_PRACTICE_STATISTICS_KEY);await context.feedback.retryPersistenceFailures();
    assert.strictEqual(storedCounts(context).correct,2);assert(!reopened.practiceStatsError);assert(reopened.practiceStatsLoaded);
    assertMusicUnchanged(context);reopened.$destroy();
  });
  console.log(JSON.stringify({sourceRoot,passed:results.filter(result=>result.passed).length,failed:results.filter(result=>!result.passed).length,results}));
  if(results.some(result=>!result.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

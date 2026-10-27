const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const original=Module._extensions['.js'],root=path.resolve(__dirname,'../src')+'/';
Module._extensions['.js']=(mod,file)=>file.startsWith(root)?mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file):original(mod,file);
const {dailyTaskDay,createDailyTasks,dailyRoundContribution,readDailyRoundProgress,readDailyTasks}=require('../src/model/DailyTasks');
Module._extensions['.js']=original;
let checks=0;
async function test(name,body){await body();checks++;console.log('✓ '+name);}
const now=new Date(2026,9,20,12),day=dailyTaskDay(now);
function round(id,extra={}){return Object.assign({id,completedAt:now.toISOString(),durationMs:1000,score:{correct:2,wrong:0,missed:0},timing:{early:0,late:1}},extra);}
// Only the readonly cursor contract is emulated here. Browser tests use real IDB.
function database(blocks=[],buckets=[]){
  const seen=[];let closed=false;
  return {seen,get closed(){return closed;},close(){closed=true;},keyRange:{only:value=>value},database:{transaction(name,mode){
    assert.strictEqual(mode,'readonly');seen.push(name);
    const tx={pending:0,objectStore(){return {index(indexName){return {
      openCursor(scope){const req={},items=blocks.filter(x=>x.scope===scope).slice().reverse();tx.pending++;
        // Finish a cursor once no continuation was requested (goal reached).
        let requested=0;
        const next=()=>{const value=items[requested++];queueMicrotask(()=>{let continued=false;req.onsuccess({target:{result:value?{value,continue(){continued=true;next();}}:null}});if(!continued){tx.pending--;if(!tx.pending&&tx.oncomplete)tx.oncomplete();}});};next();return req;},
      get(key){const req={};tx.pending++;queueMicrotask(()=>{req.result=buckets.find(x=>x.scope===key[0]&&x.day===key[1]);req.onsuccess();tx.pending--;if(!tx.pending&&tx.oncomplete)tx.oncomplete();});return req;}
    };}};}};return tx;
  }}};
}
(async()=>{
await test('exactly three distinct supported modes per day, stable across reloads',()=>{
 for(let d=0;d<40;d++){
  const date=new Date(2026,9,1+d,12),tasks=createDailyTasks(date);assert.strictEqual(tasks.length,3);assert.strictEqual(new Set(tasks.map(x=>x.mode)).size,3);
  assert(tasks.every(x=>['single','melody','chords','rhythm'].includes(x.mode)));
  assert.deepStrictEqual(tasks,createDailyTasks(new Date(2026,9,1+d,23,59)));
  if(d)assert.notDeepStrictEqual(tasks.map(x=>x.mode),createDailyTasks(new Date(2026,9,d,12)).map(x=>x.mode));
 }
});
await test('all four areas appear, with varied goals and no workshop tasks',()=>{
 const modes=new Set(),goals=new Set();for(let i=0;i<12;i++)createDailyTasks(new Date(2026,9,1+i)).forEach(x=>{modes.add(x.mode);goals.add(x.goal);});
 assert.strictEqual(modes.size,4);assert(goals.size>=6);assert(!modes.has('workshop'));
});
await test('local calendar rollover is independent of UTC and daylight saving length',()=>{
 assert.notStrictEqual(dailyTaskDay(new Date(2026,9,20,23,59)).key,dailyTaskDay(new Date(2026,9,21,0,0)).key);
 const before=dailyTaskDay(new Date(2026,9,25)),after=dailyTaskDay(new Date(2026,9,26));assert.strictEqual(after.number-before.number,1);
 if(process.env.TZ==='Europe/Berlin')assert.strictEqual(before.end-before.start,25*3600000);
 assert.throws(()=>dailyTaskDay('invalid'),/valid local date/);
});
await test('progress clamps to the goal and only all three completed tasks turn green',()=>{
 const tasks=createDailyTasks(now,{single:100,melody:100,chords:100,rhythm:100});assert(tasks.every(x=>x.complete&&x.value===x.goal));
 assert(createDailyTasks(now).every(x=>!x.complete&&x.value===0));
});
await test('only today counts, future and yesterday records do not',()=>{
 assert.strictEqual(dailyRoundContribution('single',round('a',{numCorrect:8}),day),8);
 for(const completedAt of [day.start-1,day.end,'invalid'])assert.strictEqual(dailyRoundContribution('single',round('x',{numCorrect:8,completedAt}),day),0);
 assert.strictEqual(dailyRoundContribution('single',round('a',{numCorrect:8,completedAt:day.start}),day),8);
});
await test('late correct grips count as practice; empty and wholly missed rounds do not',()=>{
 assert.strictEqual(dailyRoundContribution('melody',round('a',{score:{correct:0,wrong:1,missed:0},timing:{late:1}}),day),1);
 assert.strictEqual(dailyRoundContribution('chords',round('b',{exerciseType:'chord'}),day),3);
 assert.strictEqual(dailyRoundContribution('melody',round('b',{exerciseType:'chord'}),day),0);
 assert.strictEqual(dailyRoundContribution('melody',round('a',{score:{correct:0,missed:10},timing:{late:0}}),day),0);
 assert.strictEqual(dailyRoundContribution('rhythm',round('r',{exerciseType:'rhythm',score:{correct:0,missed:10},taps:[]}),day),0);
 assert.strictEqual(dailyRoundContribution('rhythm',round('r',{exerciseType:'rhythm',score:{correct:0,missed:10},taps:[{}]}),day),1);
});
await test('readonly cursor counts beyond 500 records and tolerates out-of-order dates',async()=>{
 const records=[round('today'),...Array.from({length:650},(_,i)=>round('old-'+i,{completedAt:day.start-1}))];
 const blocks=[];for(let i=0;i<records.length;i+=100)blocks.push({scope:'screen:note-flow',rounds:records.slice(i,i+100)});
 const db=database(blocks);
 assert.strictEqual(await readDailyRoundProgress(db,'melody',day,2),1);
 assert.deepStrictEqual(db.seen,['noteFlowRoundBlocks']);
});
await test('duplicate IDs across MIDI and screen do not award two rounds',async()=>{
 const db=database([{scope:'screen:note-flow',rounds:[round('same')]},{scope:'midi:note-flow',rounds:[round('same')]}]);
 assert.strictEqual(await readDailyRoundProgress(db,'melody',day,2),1);
});
await test('all local free rounds and adaptive day buckets contribute without writes',async()=>{
 let date=now;while(!createDailyTasks(date).some(x=>x.mode==='single'))date=new Date(date.getTime()+86400000);
 const selected=dailyTaskDay(date),db=database([], [{scope:'screen:single-notes',day:selected.key,attemptCount:2},{scope:'midi:single-notes',day:selected.key,attemptCount:3}]);
 const one={id:'a',completedAt:selected.start+1000,numCorrect:3};
 const result=await readDailyTasks(date,{openDatabase:async()=>db,readFreeRounds:()=>({rounds:[one,one]})});
 assert.strictEqual(result.error,false);assert.strictEqual(result.tasks.find(x=>x.mode==='single').value,8);assert(db.closed);
});
await test('read failure is explicit and cannot pretend all goals are completed',async()=>{
 const result=await readDailyTasks(now,{openDatabase:async()=>{throw new Error('blocked');}});
 assert.strictEqual(result.error,true);assert.strictEqual(result.tasks.length,3);assert(result.tasks.every(x=>!x.complete));
});
await test('German and English goals interpolate their counts and melody plurals',()=>{
 const Vue=require('vue'),VueI18n=require('vue-i18n');Vue.use(VueI18n);
 const messages={};for(const locale of ['de','en']){const holder={exports:{}};new Function('module','exports',babel.transform(fs.readFileSync(root+'resources/'+locale+'.js','utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code)(holder,holder.exports);messages[locale]=holder.exports.default;}
 const i18n=new VueI18n({locale:'de',messages});
 for(const locale of ['de','en']){i18n.locale=locale;for(const mode of ['SINGLE','MELODY','CHORDS','RHYTHM']){
  const label=i18n.tc('DAILY_TASK_'+mode,2,{count:2});assert(!label.includes('{count}'));assert(label.includes('2'));
 }assert(!i18n.tc('DAILY_TASK_MELODY',1,{count:1}).includes(' | '));}
});
await test('home, popover and root templates compile in both language configurations',()=>{
 const compiler=require('vue-template-compiler');
 for(const name of ['components/DailyTasksButton.vue','components/HomeMenu.vue','App.vue']){
  const parsed=compiler.parseComponent(fs.readFileSync(root+name,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
 }
});
console.log('All '+checks+' daily task groups passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

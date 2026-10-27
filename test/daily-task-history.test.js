const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const original=Module._extensions['.js'],root=path.resolve(__dirname,'../src')+'/';
Module._extensions['.js']=(mod,file)=>file.startsWith(root)?mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file):original(mod,file);
const h=require('../src/model/DailyTaskHistory'),d=require('../src/model/DailyTasks');
const {readDailyTaskRange}=require('../src/model/DailyTaskHistoryProgress');
Module._extensions['.js']=original;
let groups=0;async function test(name,run){await run();groups++;console.log('✓ '+name);}
function snapshot(day,complete=true){return {day,error:false,tasks:d.createDailyTasks(h.dailyHistoryDate(day),complete?{single:100,melody:100,chords:100,rhythm:100}:{})};}
function archive(start='2026-10-16'){return {version:1,startDay:start,checkedThrough:h.shiftDailyHistoryDay(start,-1),days:{}};}
function fill(days,start='2026-10-16'){return h.mergeDailyTaskHistory(archive(start),days.map(day=>snapshot(day)),'2026-10-20','2026-10-19');}
function memoryDB(initial){let record=initial,puts=0,fail=false;const queued=[];let busy=false;
 function pump(){if(busy||!queued.length)return;busy=true;queued.shift()();}
 return {close(){},get record(){return record;},get puts(){return puts;},set fail(value){fail=value;},database:{transaction(name,mode){assert.strictEqual(name,'meta');let pendingDone;const tx={abort(){this.aborted=true;},objectStore(){return {get(key){assert.strictEqual(key,h.DAILY_TASK_HISTORY_KEY);const req={};queued.push(()=>queueMicrotask(()=>{req.result=record;req.onsuccess();queueMicrotask(()=>{if(tx.aborted){if(tx.onabort)tx.onabort();}else{if(pendingDone)record=pendingDone;if(tx.oncomplete)tx.oncomplete();}busy=false;pump();});}));pump();return req;},put(value){if(fail)throw new Error('Quota');puts++;pendingDone=JSON.parse(JSON.stringify(value));}};}};return tx;}}};}
(async()=>{
 await test('first use starts today without inventing past achievements',()=>{
  const a=h.mergeDailyTaskHistory(null,[snapshot('2026-10-19'),snapshot('2026-10-20',false)],'2026-10-20','2026-10-19');
  assert.strictEqual(a.startDay,'2026-10-20');assert.deepStrictEqual(Object.keys(a.days),['2026-10-20']);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-20'),0);
 });
 await test('five completed days display five in a row',()=>{
  const a=fill(['2026-10-16','2026-10-17','2026-10-18','2026-10-19','2026-10-20']);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-20'),5);
 });
 await test('today remains a grace day, then a missed yesterday ends the streak',()=>{
  const a=fill(['2026-10-16','2026-10-17','2026-10-18','2026-10-19']);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-20'),4);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-21'),0);
 });
 await test('a gap followed by a completed today starts a new one-day streak',()=>{
  const a=fill(['2026-10-16','2026-10-17','2026-10-20']);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-20'),1);
 });
 await test('calendar includes leap years, Monday columns, today and unavailable future days',()=>{
  const a=archive('2024-02-01'),cells=h.dailyTaskMonth('2024-02','2024-02-20',a);assert.strictEqual(cells.filter(Boolean).length,29);assert.strictEqual(cells[3].number,1);assert(cells.find(x=>x&&x.day==='2024-02-20').today);assert(!cells.find(x=>x&&x.number===21).available);
  assert.strictEqual(h.dailyTaskMonth('2026-02','2026-02-28',archive('2026-02-01')).filter(Boolean).length,28);
 });
 await test('streaks cross year, month and DST boundaries as calendar days',()=>{
  assert.strictEqual(h.shiftDailyHistoryDay('2026-01-01',-1),'2025-12-31');assert.strictEqual(h.shiftDailyHistoryDay('2026-10-25',1),'2026-10-26');
  const a=h.mergeDailyTaskHistory(archive('2025-12-30'),['2025-12-30','2025-12-31','2026-01-01'].map(day=>snapshot(day)),'2026-01-01','2025-12-31');assert.strictEqual(h.dailyTaskStreak(a,'2026-01-01'),3);
 });
 await test('outdated snapshots cannot lower earned progress or replace historical goals',()=>{
  const a=fill(['2026-10-20']),old=snapshot('2026-10-20',false),before=JSON.stringify(a.days['2026-10-20']);
  const merged=h.mergeDailyTaskHistory(a,[old],'2026-10-20','2026-10-19');assert.strictEqual(JSON.stringify(merged.days['2026-10-20']),before);
  old.tasks[0].goal+=10;assert.strictEqual(h.mergeDailyTaskHistory(a,[old],'2026-10-20','2026-10-19').days['2026-10-20'].tasks[0].goal,a.days['2026-10-20'].tasks[0].goal);
 });
 await test('future evidence never grants an earlier streak and malformed history is rejected',()=>{
  const a=fill(['2026-10-20']);assert.strictEqual(h.dailyTaskStreak(a,'2026-10-18'),0);
  for(const key of ['2026-02-30','bad','__proto__'])assert.throws(()=>h.dailyHistoryDate(key));
  const bad=archive();bad.days['2026-10-16']={tasks:[]};assert.throws(()=>h.normalizeDailyTaskHistory(bad));
 });
 await test('atomic commits merge two independent tabs without losing a completed day',async()=>{
  const db=memoryDB(Object.assign({key:h.DAILY_TASK_HISTORY_KEY},archive()));
  await Promise.all([h.commitDailyTaskHistory(db,archive(),[snapshot('2026-10-19')],'2026-10-20','2026-10-19'),h.commitDailyTaskHistory(db,archive(),[snapshot('2026-10-20')],'2026-10-20','2026-10-19')]);
  assert(db.record.days['2026-10-19']);assert(db.record.days['2026-10-20']);assert.strictEqual(db.puts,2);
 });
 await test('quota failures, cancelled checks and cleared history do not report a successful save',async()=>{
  const db=memoryDB(Object.assign({key:h.DAILY_TASK_HISTORY_KEY},archive()));db.fail=true;
  await assert.rejects(h.commitDailyTaskHistory(db,archive(),[snapshot('2026-10-20')],'2026-10-20','2026-10-19'),/Quota/);assert(!db.record.days['2026-10-20']);
  await assert.rejects(h.commitDailyTaskHistory(memoryDB(null),archive(),[],'2026-10-20','2026-10-19'),/cleared/);
  await assert.rejects(h.commitDailyTaskHistory(memoryDB(null),null,[],'2026-10-20','2026-10-19',()=>true),/changed/);
 });
 await test('unchanged snapshots do not rewrite the archive',async()=>{
  const a=Object.assign({key:h.DAILY_TASK_HISTORY_KEY},fill(['2026-10-20'])),db=memoryDB(a);
  await h.commitDailyTaskHistory(db,a,[snapshot('2026-10-20')],'2026-10-20','2026-10-19');assert.strictEqual(db.puts,0);
 });
 await test('failed practice reads are not recorded as successful daily history',async()=>{
  const result=await h.updateDailyTaskHistory({day:d.dailyTaskDay().key,error:true,tasks:[]});assert.strictEqual(result.error,true);assert.strictEqual(result.archive,null);
 });
 await test('a failed backfill keeps its checkpoint; retry recovers all missed days',async()=>{
  const today=d.dailyTaskDay().key,start=h.shiftDailyHistoryDay(today,-2),initial={key:h.DAILY_TASK_HISTORY_KEY,version:1,startDay:start,checkedThrough:h.shiftDailyHistoryDay(start,-1),days:{}};
  const db=memoryDB(initial),snapshotToday=snapshot(today);
  const failed=await h.updateDailyTaskHistory(snapshotToday,{openDatabase:async()=>db,readRange:async()=>{throw new Error('Read failed');}});
  assert(failed.error);assert.strictEqual(db.record.checkedThrough,initial.checkedThrough);assert.deepStrictEqual(db.record.days,{});
  const recovered=await h.updateDailyTaskHistory(snapshotToday,{openDatabase:async()=>db,readRange:async dates=>dates.map(date=>snapshot(d.dailyTaskDay(date).key))});
  assert.strictEqual(recovered.error,false);assert.strictEqual(h.dailyTaskStreak(recovered.archive,today),3);assert.strictEqual(db.record.checkedThrough,h.shiftDailyHistoryDay(today,-1));
 });
 await test('an unmounted home screen cannot commit stale history',async()=>{
  const today=d.dailyTaskDay().key,db=memoryDB(null);
  const result=await h.updateDailyTaskHistory(snapshot(today),{openDatabase:async()=>db,cancelled:()=>true});
  assert(result.error);assert.strictEqual(db.puts,0);assert.strictEqual(db.record,null);
 });
 await test('a cancelled range check stops before opening or scanning learning storage',async()=>{
  let opened=false;await assert.rejects(readDailyTaskRange([new Date()],{cancelled:()=>true,openDatabase:async()=>{opened=true;throw new Error('unexpected');}}),/cancelled/);assert.strictEqual(opened,false);
 });
 await test('history range readers reject excessive or duplicate batches before writes',async()=>{
  await assert.rejects(readDailyTaskRange([]),/1 to 31/);await assert.rejects(readDailyTaskRange(Array(32).fill(new Date())),/1 to 31/);await assert.rejects(readDailyTaskRange([new Date(),new Date()]),/unique/);
 });
 await test('calendar and changed task surface compile; DE and EN streak plurals interpolate',()=>{
  const compiler=require('vue-template-compiler');for(const name of ['DailyTaskCalendar','DailyTasksButton'])assert.deepStrictEqual(compiler.compile(compiler.parseComponent(fs.readFileSync(root+'components/'+name+'.vue','utf8')).template.content).errors,[]);
  const Vue=require('vue'),VueI18n=require('vue-i18n');Vue.use(VueI18n);const messages={};for(const locale of ['de','en']){const mod={exports:{}};new Function('module','exports',babel.transform(fs.readFileSync(root+'resources/'+locale+'.js','utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code)(mod,mod.exports);messages[locale]=mod.exports.default;}
  const i18n=new VueI18n({locale:'de',messages});assert.strictEqual(i18n.tc('DAILY_HISTORY_STREAK',5,{count:5}),'5 Tage in Folge');assert.strictEqual(i18n.tc('DAILY_HISTORY_STREAK',1,{count:1}),'1 Tag in Folge');assert.strictEqual(i18n.tc('DAILY_HISTORY_STREAK',0,{count:0}),'Noch keine Serie');i18n.locale='en';assert.strictEqual(i18n.tc('DAILY_HISTORY_STREAK',5,{count:5}),'5 days in a row');
 });
 console.log('All '+groups+' daily history groups passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

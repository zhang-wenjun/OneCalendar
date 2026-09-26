import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Files, Store } from '../src/store';
import { make, dateKey, matchesTask, validate } from '../src/model';
import { patchMarkdown, readMarkdown, writeMarkdown } from '../src/markdown';
import { firstDate, nextDate, instanceId } from '../src/recurrence';
import { CalendarProvider, Reminders, Feishu } from '../src/calendar';

function memory(){
  const map=new Map<string,string>();
  const files:Files={list:()=>[...map.keys()],read:async p=>{if(!map.has(p))throw Error('missing');return map.get(p)!;},
    exists:p=>map.has(p),mkdir:async()=>{},create:async(p,c)=>{if(map.has(p))throw Error('duplicate');map.set(p,c);},
    process:async(p,fn)=>{map.set(p,fn(map.get(p)!));}};
  return {store:new Store(files),map};
}
test('Markdown roundtrip preserves body, unknown fields, and comments on patch',()=>{
  const e=make('task','包含 : 符号',{status:'todo',custom:['a','b']});
  const raw=writeMarkdown(e,'\n# 正文\n- [ ] 原始内容\n');
  const withComment=raw.replace('title:', '# 用户注释\ntitle:');
  const changed=patchMarkdown(withComment,{status:'done'});
  const r=readMarkdown('a.md',changed)!;
  assert.equal(r.data.title,e.title);assert.deepEqual(r.data.custom,['a','b']);assert.equal(r.body,'\n# 正文\n- [ ] 原始内容\n');assert.ok(changed.includes('# 用户注释'));
});
test('Invalid dates, duration, status and repeat input rejected',()=>{
  assert.throws(()=>validate(make('task','x',{plan:'2026-02-30'})));
  assert.throws(()=>validate(make('event','x',{start:'2026-09-22T10:00',end:'2026-09-22T09:00'})));
  assert.throws(()=>validate(make('series','x',{rule:'weekly',interval:1,weekdays:[]})));
  assert.throws(()=>validate(make('task','x',{status:'unknown'})));
});
test('Date filters distinguish overdue deadlines from missed planned day',()=>{
  const e=make('task','x',{plan:'2026-09-20',status:'todo'});
  assert.equal(matchesTask(e,'overdue','2026-09-22'),false);
  e.due='2026-09-21';assert.equal(matchesTask(e,'overdue','2026-09-22'),true);
  e.status='done';assert.equal(matchesTask(e,'overdue','2026-09-22'),false);
  assert.equal(matchesTask(make('task','none'),'unplanned'),true);
});
test('Monthly recurrence clamps February without drifting March to 28th',()=>{
  const s=make('series','x',{rule:'monthly',monthday:31,interval:1});
  assert.equal(nextDate(s,'2026-01-31'),'2026-02-28');assert.equal(nextDate(s,'2026-02-28'),'2026-03-31');
  assert.equal(nextDate(s,'2028-01-31'),'2028-02-29');
});
test('Weekly weekdays, interval and first occurrence are correct',()=>{
  const s=make('series','x',{rule:'weekly',interval:2,weekdays:[1,3],occurrence:'2026-09-21'});
  assert.equal(firstDate(s,'2026-09-22'),'2026-09-23');
  assert.equal(nextDate(s,'2026-09-23'),'2026-10-05');
  assert.equal(nextDate({...s,rule:'weekdays'},'2026-09-25'),'2026-09-28');
  assert.equal(nextDate({...s,rule:'after',interval:7},'2026-09-21','2026-09-25'),'2026-10-02');
});
test('One task is shared by two projects; status has one authoritative record',async()=>{
  const {store}=memory();const a=await store.create(make('project','A')),b=await store.create(make('project','B'));
  const t=await store.create(make('task','shared',{projects:[a.data.id,b.data.id],status:'todo'}));
  await store.setStatus(t.data.id,'done');assert.equal(store.all('task').length,1);
  for(const p of [a,b])assert.equal(store.all('task').find(t=>t.data.projects?.includes(p.data.id))?.data.status,'done');
});
test('New memo replaces default selection but retains every history entry',async()=>{
  const {store}=memory();await store.memo('p','旧进展');const newest=await store.memo('p','新进展');
  await store.update(newest.data.id,{created:'2099-01-01T00:00:00Z'});
  assert.equal(store.memos('p')[0].body,'新进展');assert.equal(store.memos('p').length,2);
});
test('Idea conversion is idempotent and preserves source',async()=>{
  const {store}=memory();const idea=await store.create(make('idea','想法'), '想法全文');
  const [a,b]=await Promise.all([store.convertIdea(idea.data.id),store.convertIdea(idea.data.id)]);
  assert.equal(a.data.id,b.data.id);assert.equal(store.all('task').length,1);assert.equal(a.data.source,idea.data.id);assert.equal(store.find(idea.data.id)?.data.status,'processed');
});
test('Optimistic edit refuses conflicting changes without overwriting remote body',async()=>{
  const {store,map}=memory();const r=await store.create(make('task','old'),'body');
  map.set(r.path,patchMarkdown(r.raw,{title:'external'},'remote'));
  await assert.rejects(store.update(r.data.id,{title:'local'},'local',r),/changed elsewhere/);
  assert.equal(readMarkdown(r.path,map.get(r.path)!)?.body,'remote');
});
test('Unrelated frontmatter changes can merge, rename preserves associations',async()=>{
  const {store,map}=memory();const r=await store.create(make('task','x',{status:'todo'}),'body');
  map.set(r.path,patchMarkdown(r.raw,{custom:'remote'}));await store.update(r.data.id,{status:'doing'},undefined,r);
  const raw=map.get(r.path)!;map.delete(r.path);store.remove(r.path);map.set('Elsewhere/renamed.md',raw);await store.load('Elsewhere/renamed.md');
  assert.equal(store.find(r.data.id)?.data.custom,'remote');assert.equal(store.find(r.data.id)?.data.status,'doing');
});
test('Duplicate IDs and malformed files are surfaced; mutations do not choose a copy',async()=>{
  const {store,map}=memory();const r=await store.create(make('task','x'));
  map.set('copy.md',r.raw);await store.load('copy.md');assert.throws(()=>store.find(r.data.id),/Duplicate ID/);assert.equal(store.problems().length,2);
  map.set('broken.md','---\ntc: task\nid: [bad\n---\nbody');await store.load('broken.md');assert.ok(store.issues.has('broken.md'));
});
test('Fixed recurrence records backlog and one future instance without duplicates',async()=>{
  const {store}=memory();const s=make('series','daily',{rule:'daily',interval:1,next:'2026-09-20',occurrence:'2026-09-20'});
  await store.create(s);await store.tick('2026-09-22');await store.tick('2026-09-22');
  assert.equal(store.all('task').length,4);assert.ok(store.find(instanceId(s.id,'2026-09-23')));
  await store.update(s.id,{paused:true});await store.tick('2026-09-30');assert.equal(store.all('task').length,4);
});
test('Completion-relative recurrence only creates a new task after completion',async()=>{
  const {store}=memory();const s=make('series','after',{rule:'after',interval:7,next:'2026-09-22',occurrence:'2026-09-22'});
  await store.create(s);await store.tick('2026-09-22');await store.tick('2026-09-25');assert.equal(store.all('task').length,1);
  await store.setStatus(`${s.id}_cycle_0`,'done','2026-09-25');assert.equal(store.find(`${s.id}_cycle_1`)?.data.plan,'2026-10-02');assert.equal(store.all('task').length,2);
});
test('Reminder queue survives failure and retries with same idempotency key',async()=>{
  const {store}=memory();const r=await store.create(make('task','reminder',{status:'todo',remind:'2099-09-22T09:00'}));const reminders=new Reminders(store);
  const keys:string[]=[];let fail=true,removed=0;
  const provider:CalendarProvider={list:async()=>[],put:async(c,k)=>{keys.push(k);if(fail)throw Error('offline');return 'event1';},remove:async()=>{removed++;}};
  await reminders.sync(provider,'cal');assert.equal(store.find(`rem_${r.data.id}`)?.data.status,'Sync failed');
  await reminders.sync(provider,'cal');assert.equal(keys.length,1,'automatic retry respects backoff');
  fail=false;await reminders.sync(provider,'cal',true);assert.equal(keys[0],keys[1]);assert.equal(store.find(`rem_${r.data.id}`)?.data.status,'Synced');
  await reminders.sync(provider,'cal');assert.equal(keys.length,2);
  await store.setStatus(r.data.id,'done');await reminders.sync(provider,'cal');assert.equal(removed,1);assert.equal(store.find(`rem_${r.data.id}`)?.data.status,'Cancelled');
});
test('Reminder records remain pending without provider, past reminders do not send',async()=>{
  const {store}=memory();const r=await store.create(make('task','past',{remind:'2000-01-01T09:00'}));const q=new Reminders(store);
  await q.sync(undefined,'');assert.equal(store.find(`rem_${r.data.id}`)?.data.status,'Pending sync');
  const p:CalendarProvider={list:async()=>[],put:async()=>{throw Error('must not send');},remove:async()=>{}};
  await q.sync(p,'cal');assert.equal(store.find(`rem_${r.data.id}`)?.data.status,'Expired');
});
test('Feishu adapter expands instances and does not return cancelled events (mock transport)',async()=>{
  const api=new Feishu(async()=>({items:[{event_id:'1',summary:'meeting',start_time:{timestamp:'1790038800'},end_time:{timestamp:'1790042400'}},{event_id:'2',status:'cancelled'}]}));
  const result=await api.list('cal',new Date('2026-09-21'),new Date('2026-09-23'));assert.equal(result.length,1);assert.equal(result[0].title,'meeting');
});
test('Index of 6100 Markdown records can be rebuilt and queried',async()=>{
  const {store,map}=memory();for(let i=0;i<6100;i++){const kind=i<5000?'task':i<6000?'idea':'project';const d=make(kind,`record ${i}`,{id:`bench_${i}`,plan:i<5000?dateKey():undefined});map.set(`${i}.md`,writeMarkdown(d,'content'));}
  const start=performance.now();await store.init();assert.equal(store.all('task').length,5000);assert.equal(store.all('idea').length,1000);assert.equal(store.all('project').length,100);
  console.log(`6100 records index: ${Math.round(performance.now()-start)}ms (in-memory test adapter)`);
});
test('Early completion on same day keeps distinct completion-relative instances',async()=>{
  const {store}=memory();const s=make('series','early',{rule:'after',interval:7,next:'2099-01-01',occurrence:'2099-01-01'});
  await store.create(s);await store.tick('2099-01-01');
  await store.setStatus(`${s.id}_cycle_0`,'done','2099-01-01');await store.setStatus(`${s.id}_cycle_1`,'done','2099-01-01');
  assert.equal(store.find(`${s.id}_cycle_2`)?.data.plan,'2099-01-08');assert.equal(store.find(`${s.id}_cycle_2`)?.data.status,'todo');
});
test('Changing a fixed rule supersedes future tasks but preserves history',async()=>{
  const {store}=memory();const today=dateKey();const s=make('series','daily',{rule:'daily',interval:1,next:today,occurrence:today});await store.create(s);await store.tick(today);
  const original=store.find(s.id)!;await store.editSeries(original,{title:'updated',rule:'daily',interval:3,occurrence:today},'new body');
  const future=store.all('task').filter(t=>t.data.series===s.id&&t.data.status==='todo'&&t.data.plan!>today);
  assert.equal(future.length,1);assert.equal(future[0].data.plan,addDaysForTest(today,3));
  assert.equal(store.find(instanceId(s.id,today))?.data.title,'daily');
});
function addDaysForTest(day:string,n:number){const d=new Date(`${day}T12:00`);d.setDate(d.getDate()+n);return dateKey(d);}
test('Replanning a future completion-relative task leaves an active replacement',async()=>{
  const {store}=memory();const day=addDaysForTest(dateKey(),7);const s=make('series','after',{rule:'after',interval:7,next:day,occurrence:day});await store.create(s);await store.tick();
  await store.editSeries(store.find(s.id)!,{interval:3,occurrence:day},'');
  assert.equal(store.all('task').filter(t=>t.data.series===s.id&&t.data.status==='todo').length,1);
});
test('Orphan reminders retain mapping and can explicitly cancel or recover',async()=>{
  const {store,map}=memory();const task=await store.create(make('task','x',{remind:'2099-01-01T10:00'}));const q=new Reminders(store);let deleted=0;
  const p:CalendarProvider={list:async()=>[],put:async()=> 'e1',remove:async()=>{deleted++;}};
  await q.sync(p,'cal');const raw=map.get(task.path)!;map.delete(task.path);store.remove(task.path);await q.sync(p,'cal');assert.equal(deleted,0);assert.equal(store.find(`rem_${task.data.id}`)?.data.status,'Source missing');
  map.set(task.path,raw);await store.load(task.path);await q.sync(p,'cal');assert.equal(store.find(`rem_${task.data.id}`)?.data.status,'Synced');
  map.delete(task.path);store.remove(task.path);await q.sync(p,'cal');await q.cancelOrphan(`rem_${task.data.id}`);await q.sync(p,'cal');assert.equal(deleted,1);assert.equal(store.find(`rem_${task.data.id}`)?.data.status,'Cancelled');
});
test('Reopening a completed reminded task uses a new creation key after deletion',async()=>{
  const {store}=memory();const task=await store.create(make('task','x',{remind:'2099-01-01T10:00',status:'todo'}));const q=new Reminders(store);const keys:string[]=[];
  const p:CalendarProvider={list:async()=>[],put:async(c,k)=>{keys.push(k);return 'e';},remove:async()=>{}};
  await q.sync(p,'cal');await store.setStatus(task.data.id,'done');await q.sync(p,'cal');await store.setStatus(task.data.id,'todo');await q.sync(p,'cal');assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
});
test('Reloading an index removes old paths after folder rename',async()=>{
  const {store,map}=memory();const r=await store.create(make('task','x'));map.set('Moved/x.md',map.get(r.path)!);map.delete(r.path);await store.init();assert.equal(store.all('task').length,1);assert.equal(store.find(r.data.id)?.path,'Moved/x.md');
});
test('Completing a repeat directly in Markdown advances its completion-relative rule',async()=>{
  const {store,map}=memory();const s=await store.createSeries({title:'manual',rule:'after',interval:7,occurrence:dateKey()});
  const t=store.all('task').find(t=>t.data.series===s.data.id)!;
  map.set(t.path,patchMarkdown(t.raw,{status:'done'}));await store.load(t.path);await store.tick();
  assert.ok(store.find(t.data.id)?.data.completed);
  assert.equal(store.find(`${s.data.id}_cycle_1`)?.data.plan,addDaysForTest(dateKey(),7));
});
test('Backup restoration rebuilds projects, histories, repeats and reminder mappings',async()=>{
  const {store,map}=memory();const p=await store.create(make('project','restore'));
  await store.memo(p.data.id,'first');await store.memo(p.data.id,'second');
  const s=await store.createSeries({title:'restore repeat',rule:'daily',interval:1,occurrence:dateKey(),projects:[p.data.id]});
  const t=store.all('task').find(t=>t.data.series===s.data.id)!;await store.update(t.data.id,{remind:'2099-01-01T12:00'});
  const q=new Reminders(store);await q.sync({list:async()=>[],put:async()=> 'external-preserved',remove:async()=>{}},'calendar-preserved');
  const restored=memory();for(const [path,raw]of map)restored.map.set(path,raw);await restored.store.init();
  assert.equal(restored.store.memos(p.data.id).length,2);
  assert.deepEqual(restored.store.find(t.data.id)?.data.projects,[p.data.id]);
  assert.equal(restored.store.find(`rem_${t.data.id}`)?.data.externalId,'external-preserved');
  const count=restored.store.all('task').length;await restored.store.tick();assert.equal(restored.store.all('task').length,count);
});

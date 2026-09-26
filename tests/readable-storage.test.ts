import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,Files} from '../src/store';
import {Details} from '../src/details';
import {dateKey,make} from '../src/model';
function memory(){
  const map=new Map<string,string>();let reads=0;
  const files:Files={list:()=>[...map.keys()].filter(p=>p.endsWith('.md')),exists:p=>map.has(p),read:async p=>{reads++;return map.get(p)!;},mkdir:async()=>{},create:async(p,c)=>{if(map.has(p))throw Error('exists');map.set(p,c);},process:async(p,fn)=>{map.set(p,fn(map.get(p)!));}};
  const s=new Store(files);s.details=new Details(files,'TaskCalendar/关联信息.md');s.diaryDate=p=>/^diary\/\d{4}-\d{2}-\d{2}\.md$/.test(p)?p.slice(6,-3):undefined;s.journal={path:d=>`diary/${d}.md`,ensure:async d=>{if(!map.has(`diary/${d}.md`))map.set(`diary/${d}.md`,'# 日记\n');}};return {s,map,files,reads:()=>reads};
}
test('Readable ID stays stable when typing at the end, and lookups perform no file reads',async()=>{
  const {s,map,reads}=memory();await s.init();const t=await s.create(make('task','检查脚本',{status:'todo',plan:dateKey()}));let raw=map.get(t.path)!;assert.match(raw,/🆔〔[a-z0-9]{8}〕/);assert.ok(raw.includes('📅 '+dateKey()));assert.ok(!raw.includes('<!--'));
  raw=raw.replace(/(🆔〔[a-z0-9]{8}〕)/,'$1继续补充English');map.set(t.path,raw);await s.load(t.path);assert.ok(s.find(t.data.id)!.data.title.endsWith('继续补充English'));const before=reads();for(let n=0;n<100;n++){s.find(t.data.id);s.lookup(t.data.id);s.details!.rows.get(s.details!.tokens.get(t.data.id)!);}assert.equal(reads(),before);
  await s.setStatus(t.data.id,'done');assert.ok(map.get(t.path)!.includes('- [x]'));assert.ok(map.get(t.path)!.includes('继续补充English'));
});
test('Date summaries are editable, metadata updates reindex cached notes without rereading them',async()=>{
  const {s,map,reads}=memory();const t=await s.create(make('task','安排实验',{status:'todo',plan:'2026-09-23',due:'2026-09-25'}));map.set(t.path,map.get(t.path)!.replace('📅 2026-09-23','📅 2026-09-24'));await s.load(t.path);assert.equal(s.find(t.data.id)!.data.plan,'2026-09-24');
  map.set(t.path,map.get(t.path)!.replace('⏳ 2026-09-25',''));await s.load(t.path);assert.equal(s.find(t.data.id)!.data.due,undefined);
  const details=s.details!,rows=details.parse(map.get(details.path)!);rows[details.tokens.get(t.data.id)!].projects=['new-project'];map.set(details.path,details.format(rows));const before=reads();await s.load(details.path);assert.equal(reads()-before,1);assert.deepEqual(s.find(t.data.id)!.data.projects,['new-project']);
});
test('Existing comments including appended text migrate with backups and preserve relationships',async()=>{
  const {s,map}=memory(),details=s.details!;s.details=undefined;const p=await s.create(make('project','实验'));await s.memo(p.data.id,'当前进展');const t=await s.create(make('task','原任务',{status:'doing',projects:[p.data.id]}));map.set(t.path,map.get(t.path)!.replace(/(-->)/,'$1 后加文字'));await s.load(t.path);s.details=details;await s.init();assert.equal(await s.migrateReadable(),2);assert.ok(s.find(t.data.id)!.data.title.includes('后加文字'));assert.deepEqual(s.find(t.data.id)!.data.projects,[p.data.id]);assert.equal(s.memos(p.data.id).length,1);assert.ok(!map.get(t.path)!.includes('<!--'));assert.ok(!map.get(p.path)!.includes('<!--'));assert.equal([...map.keys()].filter(p=>p.endsWith('.bak')).length,2);assert.equal(await s.migrateReadable(),0);
});
test('Fresh short markers survive restart, direct plain task editing and idea conversion',async()=>{
  const {s,map}=memory();const p=await s.create(make('project','写作'));await s.memo(p.data.id,'进展');const idea=await s.create(make('idea','一个想法',{projects:[p.data.id]}),'一个想法\n补充说明');const task=await s.convertIdea(idea.data.id);await s.init();assert.equal(s.find(task.data.id)!.data.source,idea.data.id);assert.equal(s.find(idea.data.id)!.data.status,'processed');
  map.set(task.path,map.get(task.path)!+'\n- [ ] 手写任务\n');await s.load(task.path);const plain=s.all('task').find(r=>r.data.title==='手写任务')!;await s.setStatus(plain.data.id,'done');assert.ok(s.find(plain.data.id));assert.ok(!map.get(task.path)!.includes('<!--'));
});
test('Missing or malformed details surface a problem instead of losing associations',async()=>{
  const {s,map}=memory();const t=await s.create(make('task','不可丢关联',{status:'todo'}));map.delete(s.details!.path);await s.load(s.details!.path);assert.ok(s.problems().some(p=>/details/i.test(p.error)));assert.equal(s.find(t.data.id),undefined);
  map.set(s.details!.path,'bad');await s.load(s.details!.path);assert.ok(s.problems().some(p=>p.path===s.details!.path));
});

test('Nested bodies survive and unrelated example tokens are ignored',async()=>{
  const {s,map}=memory();const t=await s.create(make('task','嵌套',{status:'todo'}),'说明');map.set(t.path,map.get(t.path)!.replace('- [ ]','  - [ ]').replace('  >','    >')+'\n示例 🆔〔badbad00〕\n<!--\n- [ ] 注释 🆔〔badbad00〕\n-->\n');await s.load(t.path);assert.equal(s.find(t.data.id)!.body,'说明');await s.setStatus(t.data.id,'done');assert.match(map.get(t.path)!,/  - \[x\]/);assert.equal(s.find(t.data.id)!.body,'说明');
});

test('Failed source write restores the previous details without dropping other rows',async()=>{
  const {s,files}=memory();const t=await s.create(make('task','冲突保护',{status:'todo',projects:['old']}));const original=files.process;files.process=async(p,fn)=>{if(p===t.path)throw Error('source conflict');return original(p,fn);};await assert.rejects(s.update(t.data.id,{projects:['new']}),/source conflict/);await s.init();assert.deepEqual(s.find(t.data.id)!.data.projects,['old']);
});

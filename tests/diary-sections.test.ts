import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diaryTasks,diaryEntry,patchDiary,diaryRecordAtLine} from '../src/diary';
import {appendDiaryEntry,diaryTemplate} from '../src/diary-sections';
import {Store,Files} from '../src/store';
import {Details} from '../src/details';
import {make} from '../src/model';
const path='diary/2026-09-23.md',day='2026-09-23';
test('Only designated sections are indexed, including nested headings and completed tasks',()=>{
 const raw='# Daily\n- [ ] Outside\n## Tasks\n- [ ] Task\n### Work\n- [x] Done\n- not a task 🆔〔badbad00〕\n## Journal\n- [ ] Private checklist 🆔〔badbad00〕\n- Private thought\n## Ideas\n- First idea\n  > Detail\n-  [ ] Not a task here\n- \n### Later\n- Another idea\n## Other\n- Outside idea';
 const r=diaryTasks(path,raw,day);assert.deepEqual(r.map(x=>[x.data.tc,x.data.title]),[['task','Task'],['task','Done'],['idea','First idea'],['idea','Another idea']]);assert.equal(r[2].body,'First idea\nDetail');
 assert.equal(diaryRecordAtLine(path,raw,day,raw.split('\n').indexOf('  > Detail'))?.data.id,r[2].data.id);assert.equal(diaryRecordAtLine(path,raw,day,9),undefined);
});
test('Fake headings in YAML, comments, and fences never define write boundaries',()=>{
 const raw='---\nfoo: |\n  ## Tasks\n---\n<!--\n## Ideas\n-->\n## Journal\n```md\n## Tasks\n- [ ] Example\n```\n## Tasks\n- [ ] Real\n## Ideas\n- Thought\n';
 const saved=appendDiaryEntry(raw,'Tasks','- [ ] Added');assert.equal(saved.slice(0,raw.indexOf('## Tasks\n- [ ] Real')),raw.slice(0,raw.indexOf('## Tasks\n- [ ] Real')));assert.deepEqual(diaryTasks(path,saved,day).map(r=>r.data.title),['Real','Added','Thought']);
 const ideas=appendDiaryEntry(saved,'Ideas','- Another');assert.equal(diaryTasks(path,ideas,day).filter(r=>r.data.tc==='idea').length,2);
 assert.throws(()=>appendDiaryEntry('## Tasks\n## Tasks','Tasks','- [ ] A'),/Multiple/);
});
test('Writeback preserves Journal byte-for-byte and refuses records moved outside Tasks',()=>{
 const journal='## Journal\r\n- [ ] Personal\r\nKeep these words.\r\n';const raw='## Tasks\r\n- [ ] Work\r\n'+journal+'## Ideas\r\n- Thought\r\n';const task=diaryTasks(path,raw,day)[0];
 const saved=patchDiary(raw,task,{status:'done'});assert.ok(saved.includes(journal));assert.equal(diaryTasks(path,saved,day)[0].data.status,'done');
 assert.throws(()=>patchDiary(raw.replace('## Tasks','## Other'),task,{status:'done'}),/changed/);
 assert.equal(diaryTasks(path,saved.replace(/^.*Work.*\r\n/m,''),day).filter(r=>r.data.tc==='task').length,0);
});
test('Legacy marked entries migrate once with IDs and backups; ordinary journal checklists stay untouched',async()=>{
 const map=new Map<string,string>();const files:Files={list:()=>[...map.keys()].filter(p=>p.endsWith('.md')),read:async p=>map.get(p)!,exists:p=>map.has(p),mkdir:async()=>{},create:async(p,c)=>{map.set(p,c);},process:async(p,fn)=>{map.set(p,fn(map.get(p)!));}};
 const s=new Store(files);s.details=new Details(files,'TaskCalendar/Details.md');s.diaryDate=p=>p===path?day:undefined;
 const task=make('task','Work',{status:'todo',id:'original_task',plan:day}),idea=make('idea','Thought',{id:'original_idea'});
 const raw='# Daily\n\n## 今日记录\nPersonal writing\n- [ ] Personal checklist\n'+diaryEntry(task,'Details',day)+'\n'+diaryEntry(idea,'Thought',day).replace('- Thought','- #闪念 Thought')+'\n';map.set(path,raw);
 assert.equal(await s.migrateDiarySections(),1);await s.init();assert.equal(s.all('task').length,1);assert.equal(s.find(task.id)!.body,'Details');assert.equal(s.find(idea.id)!.data.title,'Thought');assert.ok(map.get(path)!.includes('Personal writing\n- [ ] Personal checklist'));assert.equal(map.get('TaskCalendar/SectionBackups/'+path+'.bak'),raw);assert.equal(await s.migrateDiarySections(),0);
 // Moving a managed task into Journal is intentional; migration must not bring it back.
 map.set(path,map.get(path)!.replace('## Tasks','## Other'));assert.equal(await s.migrateDiarySections(),0);await s.init();assert.equal(s.find(task.id),undefined);
});
test('Default template has all three sections with no phantom records',()=>{assert.equal(diaryTasks(path,diaryTemplate,day).length,0);assert.ok(!/^# /m.test(diaryTemplate));for(const section of ['Tasks','Journal','Ideas'])assert.ok(diaryTemplate.includes('## '+section));});

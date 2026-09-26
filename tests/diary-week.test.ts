import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diaryTasks,patchDiary} from '../src/diary';
import {weekStart,timeRange,layoutEvents,minuteOf} from '../src/week';
import {Store,Files} from '../src/store';
const day='2026-09-22',path='diary/2026-09-22.md';
test('Diary plain tasks, nested tasks and completed status; ignore YAML, fences and comments',()=>{
  const raw='---\ntitle: diary\n- [ ] YAML\n---\n# 日记\n## Tasks\n- [ ] 阅读论文\n  - [x] 实验\n```md\n- [ ] 示例\n```\n<!--\n- [ ] 注释\n-->\n';
  const records=diaryTasks(path,raw,day);assert.equal(records.length,2);assert.equal(records[0].data.plan,day);assert.equal(records[1].data.status,'done');
});
test('Diary writeback preserves other lines, CRLF, nesting, and gives edited task stable identity',()=>{
  const raw='# 日记\r\n## Tasks\r\n\r\n  - [ ] 论文\r\n\t正文 [[链接]]\r\n- [ ] 论文\r\n';
  const first=diaryTasks(path,raw,day)[0];const saved=patchDiary(raw,first,{status:'done',title:'论文已读',projects:['project_1']},'备注\n<!-- special -->');
  assert.ok(saved.startsWith('# 日记\r\n## Tasks\r\n\r\n  - [x] 论文已读'));assert.ok(saved.endsWith('\t正文 [[链接]]\r\n- [ ] 论文\r\n'));
  const tasks=diaryTasks(path,saved,day);assert.equal(tasks[0].data.id,first.data.id);assert.equal(tasks[0].body,'备注\n<!-- special -->');assert.deepEqual(tasks[0].data.projects,['project_1']);
  const moved=diaryTasks('diary/moved.md','前面插入\r\n'+saved,day);assert.equal(moved[0].data.id,first.data.id);
  assert.notEqual(tasks[0].data.id,tasks[1].data.id);
});
test('Diary concurrent edit refuses overwrite but unrelated insertion is preserved',()=>{
  const raw='## Tasks\n- [ ] 论文\n';const first=diaryTasks(path,raw,day)[0];assert.throws(()=>patchDiary('## Tasks\n- [x] 论文\n',first,{status:'doing'}));
  assert.ok(patchDiary('前言\n'+raw,first,{status:'done'}).startsWith('前言\n## Tasks\n- [x]'));
});
test('Diary explicit unplanned and dates survive reread, and manual checkbox edit wins',()=>{
  const raw='## Tasks\n- [ ] 论文';const first=diaryTasks(path,raw,day)[0];const saved=patchDiary(raw,first,{plan:undefined,due:'2026-09-25',status:'doing'});
  const rec=diaryTasks(path,saved.replace('- [/]','- [x]'),day)[0];assert.equal(rec.data.plan,undefined);assert.equal(rec.data.due,'2026-09-25');assert.equal(rec.data.status,'done');
});
test('Diary duplicate titles are separate and malformed properties never overwrite data',()=>{
  const rows=diaryTasks(path,'## Tasks\n- [ ] 论文\n- [ ] 论文',day);assert.notEqual(rows[0].data.id,rows[1].data.id);
  assert.throws(()=>diaryTasks(path,'## Tasks\n- [ ] 论文 <!-- task-calendar:broken -->',day));
});
test('Store indexes diary and updates original, then clears removed or excluded diaries',async()=>{
  const map=new Map([[path,'# 学习\n## Tasks\n- [ ] 阅读\n']]);const files:Files={list:()=>[...map.keys()],read:async p=>map.get(p)!,exists:p=>map.has(p),mkdir:async()=>{},create:async(p,s)=>{map.set(p,s);},process:async(p,fn)=>{map.set(p,fn(map.get(p)!));}};
  const store=new Store(files);store.diaryDate=p=>p===path?day:undefined;await store.init();const id=store.all('task')[0].data.id;
  await store.setStatus(id,'done');assert.ok(map.get(path)!.includes('- [x] 阅读'));assert.equal(map.size,1);assert.equal(store.all('task').length,1);
  store.diaryDate=()=>undefined;await store.init();assert.equal(store.all().length,0);
  store.diaryDate=()=>day;await store.init();map.delete(path);await store.init();assert.equal(store.all().length,0);
});
test('Week navigation starts Monday and crosses year boundaries',()=>{assert.equal(weekStart('2027-01-01'),'2026-12-28');assert.equal(weekStart('2026-09-27'),'2026-09-21');});
test('Week click and drag map half-hours including reverse drag and midnight',()=>{assert.deepEqual(timeRange(day,780,960),{start:day+'T13:00',end:day+'T16:30'});assert.deepEqual(timeRange(day,960,780),timeRange(day,780,960));assert.equal(timeRange(day,1410,1410).end,'2026-09-23T00:00');});
test('Week clipping and overlap layout preserve each simultaneous event',()=>{
  const events=[{start:'2026-09-21T23:00',end:day+'T01:00'},{start:day+'T00:30',end:day+'T02:00'},{start:day+'T02:00',end:day+'T03:00'}];
  const rows=layoutEvents(events,day);assert.equal(rows[0].start,0);assert.equal(rows[0].columns,2);assert.equal(rows[1].column,1);assert.equal(rows[2].columns,1);assert.equal(minuteOf('2026-09-23T00:00',day),1440);
});

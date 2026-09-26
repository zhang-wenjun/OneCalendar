import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,Files} from '../src/store';
import {dateKey,make} from '../src/model';
import {writeMarkdown} from '../src/markdown';
import {diaryTasks} from '../src/diary';
function memory(){
  const map=new Map<string,string>(),dirs=new Set<string>();
  const files:Files={list:()=>[...map.keys()].filter(p=>p.endsWith('.md')),read:async p=>map.get(p)!,exists:p=>map.has(p)||dirs.has(p),create:async(p,c)=>{if(map.has(p))throw Error('exists');map.set(p,c);},mkdir:async p=>{dirs.add(p);},process:async(p,fn)=>{map.set(p,fn(map.get(p)!));},rename:async(from,to)=>{if(map.has(to)||dirs.has(to))throw Error('exists');if(map.has(from)){map.set(to,map.get(from)!);map.delete(from);}else {for(const [p,c]of [...map])if(p.startsWith(from+'/')){map.set(to+p.slice(from.length),c);map.delete(p);}dirs.delete(from);dirs.add(to);}}};
  const store=new Store(files);store.diaryDate=p=>/^diary\/\d{4}-\d{2}-\d{2}\.md$/.test(p)?p.slice(6,-3):undefined;
  store.journal={path:d=>`diary/${d}.md`,ensure:async d=>{const p=`diary/${d}.md`;if(!map.has(p))map.set(p,`# ${d}\n\n个人随记\n`);}};return {store,map,dirs};
}
test('Quick captures share one diary; ideas and descriptions are visible Markdown and editable',async()=>{
  const {store:s,map}=memory();const a=await s.create(make('task','代码检查',{status:'todo'}),'检查边界\n保留 [[链接]]');
  const b=await s.create(make('idea','一个想法',{status:'inbox'}),'一个想法\n第二行细节');
  assert.equal(a.path,b.path);assert.equal(map.size,1);assert.ok(map.get(a.path)!.includes('- 一个想法'));assert.ok(map.get(a.path)!.includes('  > 第二行细节'));assert.equal(b.body,'一个想法\n第二行细节');
  await s.update(b.data.id,{status:'archived'},'改过的想法\n更多内容');assert.equal(s.find(b.data.id)!.data.title,'改过的想法');assert.equal(s.find(b.data.id)!.data.status,'archived');
  await s.setStatus(a.data.id,'done');assert.ok(map.get(a.path)!.includes('- [x] 代码检查'));assert.ok(map.get(a.path)!.includes('个人随记'));
  const raw=map.get(b.path)!.replace('改过的想法','手动修改');map.set(b.path,raw);await s.load(b.path);assert.equal(s.find(b.data.id)!.body,'手动修改\n更多内容');
});
test('Idea conversion stays in diary and is idempotent; multi-project links survive reload',async()=>{
  const {store:s,map}=memory();const p=await s.create(make('project','代码开发')),q=await s.create(make('project','文档'));
  const idea=await s.create(make('idea','关联想法',{status:'inbox',projects:[p.data.id,q.data.id]}),'关联想法\n展开内容');
  const t=await s.convertIdea(idea.data.id);await s.convertIdea(idea.data.id);await s.init();assert.deepEqual(s.find(t.data.id)!.data.projects,[p.data.id,q.data.id]);assert.equal(s.all('task').length,1);assert.equal(t.path,idea.path);assert.equal(map.size,3);assert.equal(s.problems().length,0);
});
test('Project folder contains one ordinary Memo with latest and historical entries',async()=>{
  const {store:s,map}=memory();const p=await s.create(make('project','科研'));const first=await s.memo(p.data.id,'旧进展\n细节');await s.update(first.data.id,{created:'2026-01-01T09:00:00Z'});await s.memo(p.data.id,'最新进展');
  assert.equal(p.path,'Projects/科研/科研-Memo.md');assert.equal(map.size,1);assert.equal(s.memos(p.data.id).length,2);assert.equal(s.memos(p.data.id)[0].body,'最新进展');assert.ok(!map.get(p.path)!.startsWith('---'));assert.ok(map.get(p.path)!.includes('旧进展'));
  await s.update(p.data.id,{title:'研究'});assert.ok(map.has('Projects/研究/研究-Memo.md'));assert.equal(s.memos(p.data.id).length,2);assert.equal(s.find(p.data.id)!.data.title,'研究');
});
test('Existing ordinary project Memo is recognized and preserved when new memo is added',async()=>{
  const {store:s,map}=memory();const path='Projects/实验/实验-Memo.md';map.set(path,'# 实验\n\n我的既有笔记\n\n### 链接\n[[资料]]\n');await s.init();const p=s.all('project')[0];assert.equal(s.memos(p.data.id)[0].body,'我的既有笔记\n\n### 链接\n[[资料]]');
  await s.memo(p.data.id,'新进展');assert.equal(s.memos(p.data.id).length,2);assert.ok(map.get(path)!.includes('[[资料]]'));assert.equal(s.memos(p.data.id)[0].body,'新进展');
});
test('Legacy migration preserves IDs, relationships, source backups and is repeatable',async()=>{
  const {store:s,map}=memory();const p=make('project','迁移项目'),memo=make('memo','旧备忘',{project:p.id}),idea=make('idea','旧闪念',{status:'inbox'}),task=make('task','旧任务',{status:'doing',projects:[p.id],source:idea.id,plan:dateKey()});
  for(const d of [p,memo,idea,task])map.set(`legacy/${d.id}.md`,writeMarkdown(d,d.tc==='memo'?'旧备忘':d.tc==='idea'?'旧闪念\n正文':''));
  await s.init();assert.equal(await s.migrateLegacy(),4);await s.init();assert.equal(s.all('task').length,1);assert.equal(s.find(task.id)!.diary?.day,dateKey());assert.equal(s.find(idea.id)!.body,'旧闪念\n正文');assert.deepEqual(s.find(task.id)!.data.projects,[p.id]);assert.equal(s.memos(p.id)[0].body,'旧备忘');assert.equal([...map.keys()].filter(p=>p.endsWith('.bak')).length,4);assert.equal(await s.migrateLegacy(),0);assert.equal(s.problems().length,0);
});
test('Repeated instances are written into occurrence diaries and retain completion-relative scheduling',async()=>{
  const {store:s,map}=memory();const series=await s.createSeries({title:'复查',rule:'after',interval:2,occurrence:dateKey()});const t=s.all('task')[0];assert.ok(t.diary);await s.setStatus(t.data.id,'done');assert.equal(s.all('task').length,2);assert.ok(s.find(t.data.id)!.data.completed);assert.equal(s.all('task').filter(r=>r.data.series===series.data.id).length,2);assert.ok(![...map.keys()].some(p=>p.includes('/Tasks/')));
});
test('Manual idea lines are readable without plugin properties; code examples are ignored',()=>{
  const records=diaryTasks('diary/2026-09-22.md','## Ideas\n- 今天想到的\n  > 详细记录\n```md\n- #闪念 示例\n```','2026-09-22');assert.equal(records.length,1);assert.equal(records[0].data.tc,'idea');assert.equal(records[0].body,'今天想到的\n详细记录');
});
test('Idea capture accepts whitespace and multiline notes without creating an empty entry',async()=>{
  const {store:s}=memory();const idea=await s.create(make('idea','有内容'),'\n  有内容\n第二行\n');assert.equal(idea.body,'有内容\n第二行');
});
test('Existing project frontmatter is preserved while adding memo history',async()=>{
  const {store:s,map}=memory(),path='Projects/原文/原文-Memo.md';const prefix='---\naliases: [资料]\ncustom: keep\n---\n';map.set(path,prefix+'# 原文\n\n原备忘\n');await s.init();const p=s.all('project')[0];await s.memo(p.data.id,'新备忘');assert.ok(map.get(path)!.startsWith(prefix));assert.ok(map.get(path)!.includes('原备忘'));assert.equal(s.problems().length,0);
});

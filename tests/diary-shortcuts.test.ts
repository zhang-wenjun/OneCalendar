import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diaryShortcut} from '../src/diary-shortcuts';
import {Store,Files} from '../src/store';
import {make} from '../src/model';
const day='2025-01-02',path=`diary/${day}.md`;
test('Separate shortcuts edit matching entries and descriptions; blank lines create',()=>{
 const raw='## Tasks\n- [ ] Work\n  > Detail\n\n## Journal\nPersonal text\n\n## Ideas\n- Thought\n  > More\n- \n- [ ] \n';
 for(const line of [1,2])assert.equal(diaryShortcut('task',path,raw,day,line).record?.data.title,'Work');
 for(const line of [8,9])assert.equal(diaryShortcut('idea',path,raw,day,line).record?.data.title,'Thought');
 assert.throws(()=>diaryShortcut('idea',path,raw,day,1),/task shortcut/);assert.throws(()=>diaryShortcut('task',path,raw,day,8),/idea shortcut/);
 for(const kind of ['task','idea'] as const)for(const line of [3,6,10,11])assert.equal(diaryShortcut(kind,path,raw,day,line).record,undefined);
 assert.throws(()=>diaryShortcut('task',path,raw,day,5),/blank line/);
});
test('A blank-line capture targets the open diary date and its own section, preserving creation time',async()=>{
 const map=new Map([[path,'## Tasks\n\n## Journal\nKeep this text.\n\n## Ideas\n']]);
 const files:Files={list:()=>[...map.keys()],exists:p=>map.has(p),read:async p=>map.get(p)!,mkdir:async()=>{},create:async(p,c)=>{map.set(p,c);},process:async(p,f)=>{map.set(p,f(map.get(p)!));}};
 const s=new Store(files);s.diaryDate=p=>p.slice(6,-3);s.journal={path:d=>`diary/${d}.md`,ensure:async d=>{assert.equal(d,day);}};
 const task=make('task','Historical note task',{status:'todo',plan:day}),idea=make('idea','Historical idea');
 for(const entity of [task,idea]){const r=await s.create(entity,'',day);assert.equal(r.path,path);assert.equal(r.data.created,entity.created);}
 assert.equal(map.size,1);assert.equal(s.all('task').length,1);assert.equal(s.all('idea').length,1);assert.match(map.get(path)!,/## Journal\nKeep this text\.\n/);
});

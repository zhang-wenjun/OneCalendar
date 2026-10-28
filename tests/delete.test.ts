import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,Files} from '../src/store';
import {make} from '../src/model';
test('Deleting one diary entry preserves its neighbours and recovery copy',async()=>{
 const map=new Map<string,string>();
 const files:Files={list:()=>[...map.keys()],exists:p=>map.has(p),read:async p=>map.get(p)!,mkdir:async()=>{},create:async(p,c)=>{map.set(p,c);},process:async(p,f)=>{map.set(p,f(map.get(p)!));}};
 const store=new Store(files);store.diaryDate=p=>p==='diary/2026-10-28.md'?'2026-10-28':undefined;
 store.journal={path:()=> 'diary/2026-10-28.md',ensure:async()=>{if(!map.has('diary/2026-10-28.md'))map.set('diary/2026-10-28.md','## Tasks\n\n## Journal\nKeep this journal.\n\n## Ideas\n');}};
 const task=await store.create(make('task','Delete me'));
 const idea=await store.create(make('idea','Keep idea'));
 const original=map.get(task.path);
 await store.deleteRecord(task);assert.equal(store.find(task.data.id),undefined);assert.ok(store.find(idea.data.id));assert.ok(map.get(task.path)!.includes('Keep this journal.'));assert.ok([...map].some(([p,c])=>p.endsWith('.txt')&&c===original));
 await store.init();assert.equal(store.find(task.data.id),undefined);
 const old=store.find(idea.data.id)!;await store.update(idea.data.id,{title:'Changed'});await assert.rejects(()=>store.deleteRecord(old),/changed/);
 const event=await store.create(make('event','Event',{start:'2026-10-28T10:00',end:'2026-10-28T11:00'}));await store.deleteRecord(event);assert.equal(store.find(event.data.id),undefined);
});

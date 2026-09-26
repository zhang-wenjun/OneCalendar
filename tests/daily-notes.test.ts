import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DailyNotes} from '../src/daily-notes';
import {TFile} from 'obsidian';
import {dateKey} from '../src/model';
function host(config?:object){
  const contents=new Map<string,string>();if(config)contents.set('.obsidian/daily-notes.json',JSON.stringify(config));
  const files=new Map<string,unknown>();let opened='';
  const app:any={vault:{configDir:'.obsidian',adapter:{exists:async(p:string)=>contents.has(p),read:async(p:string)=>contents.get(p)},getAbstractFileByPath:(p:string)=>files.get(p),read:async(f:TFile)=>contents.get(f.path),createFolder:async(p:string)=>{files.set(p,{});},create:async(p:string,c:string)=>{contents.set(p,c);const f=new (TFile as any)(p);files.set(p,f);return f;}},workspace:{getLeaf:()=>({openFile:async(f:TFile)=>{opened=f.path;}})}};
  return {diary:new DailyNotes(app,async()=>true),app,contents,files,opened:()=>opened};
}
test('Daily notes inherits configured folder, nested date format and template',async()=>{
  const h=host({folder:'Journal',format:'YYYY/MM/YYYY-MM-DD',template:'Templates/Daily'});
  await h.app.vault.create('Templates/Daily.md','# {{date:YYYY-MM-DD}}\n{{title}}\n- [ ] 阅读\n');await h.diary.configure();
  const path='Journal/2026/09/2026-09-22.md';assert.equal(h.diary.path('2026-09-22'),path);assert.equal(h.diary.date(path),'2026-09-22');assert.equal(h.diary.date('Journal/2026/09/2026-09-99.md'),undefined);
  await h.diary.open('2026-09-22');assert.equal(h.opened(),path);assert.ok(h.contents.get(path)!.startsWith('# 2026-09-22\n2026-09-22\n- [ ] 阅读\n'));for(const section of ['Tasks','Journal','Ideas'])assert.ok(h.contents.get(path)!.includes('## '+section));
  h.contents.set(path,'我的原文');await h.diary.open('2026-09-22');assert.equal(h.contents.get(path),'我的原文');
});
test('Non-today diary confirmation coalesces requests, cancellation writes nothing, explicit open retries',async()=>{
  const h=host();let asks=0,accept=false;
  const diary=new DailyNotes(h.app,async()=>{asks++;return accept;});
  await assert.rejects(diary.ensure('2030-01-02'),/cancelled/);
  assert.equal(h.files.size,0);assert.equal(h.contents.size,0);
  await assert.rejects(diary.ensure('2030-01-02'),/cancelled/);assert.equal(asks,1);
  accept=true;await Promise.all([diary.open('2030-01-02'),diary.ensure('2030-01-02')]);
  assert.equal(asks,2);assert.equal(h.opened(),'diary/2030-01-02.md');
  await diary.open('2030-01-02');await diary.ensure(dateKey());assert.equal(asks,2);
});
test('Daily notes uses fallback and supports root daily notes and explicit Diary override',async()=>{
  const fallback=host();await fallback.diary.configure();assert.equal(fallback.diary.path('2026-09-22'),'diary/2026-09-22.md');
  const h=host({folder:'',format:'YYYY-MM-DD'});await h.diary.configure();assert.equal(h.diary.path('2026-09-22'),'2026-09-22.md');
  await h.diary.configure('diary','YYYY-MM-DD');assert.equal(h.diary.path('2026-09-22'),'diary/2026-09-22.md');assert.equal(h.diary.date('Other/2026-09-22.md'),undefined);
});

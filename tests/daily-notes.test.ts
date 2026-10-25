import {test} from 'node:test';
import assert from 'node:assert/strict';
import moment from 'moment';
import {DailyNotes} from '../src/daily-notes';
import {diaryTemplate} from '../src/diary-sections';
import {TFile} from 'obsidian';
import {dateKey} from '../src/model';
function host(options={folder:'diary',format:'YYYY-MM-DD',template:'Templates/Daily'}){
 const contents=new Map<string,string>([['Templates/Daily.md',diaryTemplate]]);
 const files=new Map<string,unknown>([['Templates/Daily.md',new (TFile as any)('Templates/Daily.md')]]);let opened='',createCalls=0;
 const core={enabled:true,instance:{options}};
 const app:any={internalPlugins:{plugins:{'daily-notes':core},getPluginById:()=>core},plugins:{getPlugin:()=>undefined},foldManager:{load:()=>null,save:()=>{}},metadataCache:{getFirstLinkpathDest:(p:string)=>files.get(p.replace(/\.md$/,'')+'.md')},vault:{getAbstractFileByPath:(p:string)=>files.get(p),read:async(f:TFile)=>contents.get(f.path),cachedRead:async(f:TFile)=>contents.get(f.path),createFolder:async(p:string)=>{files.set(p,{});},create:async(p:string,c:string)=>{assert.ok(!files.has(p));createCalls++;contents.set(p,c);const f=new (TFile as any)(p);files.set(p,f);return f;}},workspace:{getLeaf:(newLeaf:boolean)=>{assert.equal(newLeaf,false);return {openFile:async(f:TFile)=>{opened=f.path;}};}}};
 Object.assign(globalThis,{window:{app,moment}});
 return {diary:new DailyNotes(app,async()=>true),app,core,contents,files,opened:()=>opened,creates:()=>createCalls};
}
test('Daily notes interface uses live settings and preserves custom template content exactly',async()=>{
 const h=host({folder:'Journal',format:'YYYY/MM/YYYY-MM-DD',template:'Templates/Daily'});
 h.contents.set('Templates/Daily.md','# {{date:YYYY-MM-DD}}\n{{yesterday}}\nMy custom template\n');await h.diary.configure();
 const path='Journal/2026/09/2026-09-22.md';assert.equal(h.diary.path('2026-09-22'),path);assert.equal(h.diary.date(path),'2026-09-22');
 await h.diary.open('2026-09-22');assert.equal(h.opened(),path);assert.equal(h.contents.get(path),'# 2026-09-22\n2026/09/2026-09-21\nMy custom template\n');
 h.contents.set(path,'Keep my existing diary');await h.diary.open('2026-09-22');assert.equal(h.contents.get(path),'Keep my existing diary');
 h.core.instance.options.folder='';assert.equal(h.diary.path('2026-09-23'),'2026/09/2026-09-23.md');
});
test('Non-today creation asks once, cancellation writes nothing, explicit open retries',async()=>{
 const h=host();let asks=0,accept=false;const diary=new DailyNotes(h.app,async()=>{asks++;return accept;});
 await assert.rejects(diary.ensure('2030-01-02'),/cancelled/);assert.equal(h.creates(),0);
 await assert.rejects(diary.ensure('2030-01-02'),/cancelled/);assert.equal(asks,1);
 accept=true;await Promise.all([diary.open('2030-01-02'),diary.ensure('2030-01-02')]);assert.equal(asks,2);assert.equal(h.creates(),1);
 await diary.open('2030-01-02');await diary.ensure(dateKey());assert.equal(asks,2);
});
test('Generated template is idempotent, editable and contains only the three level-two sections',async()=>{
 const h=host();const [a,b]=await Promise.all([h.diary.ensureTemplate(),h.diary.ensureTemplate()]);assert.equal(a,b);assert.equal(h.creates(),1);
 assert.equal(h.contents.get(h.diary.templatePath),diaryTemplate);assert.equal(h.diary.templatePath,'diary/one-cal-template.md');assert.equal(diaryTemplate,'## Tasks\n\n## Journal\n\n## Ideas\n');
 h.contents.set(h.diary.templatePath,'My customized template');await h.diary.ensureTemplate();assert.equal(h.contents.get(h.diary.templatePath),'My customized template');
});
test('Disabled Daily notes and missing templates never create blank diaries; existing notes still open',async()=>{
 const h=host();h.core.enabled=false;await assert.rejects(h.diary.ensure(dateKey()),/Enable Daily notes/);assert.equal(h.creates(),0);
 const path=h.diary.path(dateKey());await h.app.vault.create(path,'Existing');await h.diary.open(dateKey());assert.equal(h.opened(),path);
 h.core.enabled=true;h.core.instance.options.template='Missing';await assert.rejects(h.diary.ensure('2030-01-02'),/template missing/);
 h.core.instance.options.template='';await assert.rejects(h.diary.ensure('2030-01-02'),/Select .*one-cal-template/);assert.equal(h.creates(),1);
});
test('A settings change during confirmation aborts creation rather than using a stale path',async()=>{
 const h=host();const diary=new DailyNotes(h.app,async()=>{h.core.instance.options.folder='Changed';return true;});
 await assert.rejects(diary.ensure('2030-01-02'),/settings changed/);assert.equal(h.creates(),0);
});

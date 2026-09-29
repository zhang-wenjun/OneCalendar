import {Notice} from 'obsidian';
import type OneCalendar from './main';
import {Editor} from './forms';
import {dateKey,make} from './model';
import {VIEW,CalendarView} from './view';
import {Store} from './store';
import {Details} from './details';
import {diarySections,appendDiaryEntry} from './diary-sections';
import {diaryRecordAtLine} from './diary';

/** Explicit, local-only acceptance commands; no external calendar calls. */
export async function runJournalQA(plugin:OneCalendar){
 if(plugin.app.vault.getName()!=='AITestBed')throw Error('AITestBed only');
 const s=plugin.store,vault=plugin.app.vault,run=Date.now().toString(36),results:string[]=[];let failure:unknown;
 const check=(name:string,value:unknown)=>{if(!value)throw Error(name);results.push(`- [x] ${name}`);};
 try{
  await s.init();const p=await s.create(make('project',`QA project ${run}`));
  const task=await s.create(make('task',`QA task ${run}`,{status:'todo',projects:[p.data.id]}),'Task description');
  const idea=await s.create(make('idea',`QA idea ${run}`,{projects:[p.data.id]}),`QA idea ${run}\nMore detail`);
  let raw=await vault.read(plugin.file(task.path)),sections=diarySections(raw);
  check('Captures share the daily note',task.path===idea.path&&task.path===plugin.diary.path(dateKey()));
  check('Task and idea are in their own sections',[task,idea].every(r=>sections.some(sec=>sec.name===(r.data.tc==='task'?'Tasks':'Ideas')&&r.diary!.line>sec.start&&r.diary!.line<sec.end)));
  const privateTitle=`QA private checklist ${run}`;await vault.process(plugin.file(task.path),raw=>appendDiaryEntry(raw,'Journal',`- [ ] ${privateTitle}`));await s.load(task.path);
  check('Journal checklist is ignored',!s.all().some(r=>r.data.title===privateTitle));
  await s.setStatus(task.data.id,'done');raw=await vault.read(plugin.file(task.path));check('Completion writes to Tasks and preserves Journal',raw.includes(`- [x] QA task ${run}`)&&raw.includes(`- [ ] ${privateTitle}`));
  const current=s.find(task.data.id);check('Cursor on description resolves original task',diaryRecordAtLine(task.path,raw,dateKey(),current.diary!.line+1,s.details)?.data.id===task.data.id);
  const modal=new Editor(plugin.app,s,'task',current);modal.open();check('Task editor exposes dates and reminder',!!modal.contentEl.querySelector('input[type=date]')&&!!modal.contentEl.querySelector('input[type=datetime-local]'));check('Editor uses English',modal.titleEl.textContent==='Edit Task');modal.close();
  const converted=await s.convertIdea(idea.data.id);await s.convertIdea(idea.data.id);check('Idea conversion is idempotent',converted.path===idea.path&&s.all('task').filter(t=>t.data.source===idea.data.id).length===1);
  const first=await s.memo(p.data.id,'Earlier update');await s.update(first.data.id,{created:'2026-01-01T00:00:00Z'});await s.memo(p.data.id,'Latest update');check('Memo history survives',s.memos(p.data.id).length===2&&s.memos(p.data.id)[0].body==='Latest update');
  const fresh=new Store(s.files,s.root);fresh.details=new Details(s.files,s.details!.path);fresh.diaryDate=s.diaryDate;await fresh.init();check('Rebuilt index preserves all records and links',fresh.all().length===s.all().length&&fresh.find(task.data.id)?.data.projects?.includes(p.data.id));check('No index errors',s.problems().length===0);
  await plugin.open();const view=plugin.app.workspace.getLeavesOfType(VIEW)[0].view as CalendarView;for(const page of ['overview','board','tasks','projects','ideas','calendar','series']){view.go(page);check(`${page} renders`,!!view.contentEl.querySelector('h1'));}view.go('overview');
 }catch(e){failure=e;results.push(`- [ ] FAILED: ${(e as Error).message}`);}
 await vault.create(`QA-storage-${run}.md`, `# Storage acceptance\n\n${results.join('\n')}\n\nLocal Obsidian only; external calendars, Android and two-device sync were not tested.\n`);new Notice(failure?'Storage test failed; see report':`Storage tests passed: ${results.length}`,8000);if(failure)throw failure instanceof Error?failure:new Error(typeof failure==='string'?failure:'Storage test failed');
}
export async function runRevisionQA(plugin:OneCalendar){
 if(plugin.app.vault.getName()!=='AITestBed')throw Error('AITestBed only');
 await plugin.open();const view=plugin.app.workspace.getLeavesOfType(VIEW)[0].view as CalendarView;view.day=dateKey();view.calendarMode='week';view.go('calendar');
 if(view.contentEl.querySelectorAll('.tc-week-column').length!==7||view.contentEl.querySelectorAll('.tc-time-slot').length!==336)throw Error('Invalid week grid');
 view.calendarMode='month';view.render();if(view.contentEl.querySelectorAll('.tc-day').length!==42)throw Error('Invalid month grid');view.calendarMode='week';view.go('overview');new Notice('Week and month view checks passed.');
}

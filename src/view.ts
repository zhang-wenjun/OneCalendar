import { setIcon, ItemView, WorkspaceLeaf, Platform, MarkdownRenderer, Notice, Component } from 'obsidian';
import type OneCalendar from './main';
import { RecordFile, active, addDays, dateKey, labels, matchesTask, parseDate } from './model';
import { Editor, MemoEditor, button } from './forms';
import { weekStart, atMinute, timeRange, layoutEvents } from './week';
import {EventDetails} from './event-details';
import {safeColor} from './calendar-sources';
import type {ExternalEvent} from './calendar';
export const VIEW='task-calendar-view';
const pages:Record<string,string>={overview:'Overview',board:'Tasks',projects:'Projects',ideas:'Ideas',calendar:'Calendar',series:'Repeats'};
export class CalendarView extends ItemView {
  page='overview'; filter='active'; project=''; search=''; ideaFilter='inbox';
  day=dateKey(); month=dateKey().slice(0,7); showArchived=false; limit=80; expanded=false;
  calendarMode:'three'|'week'|'month'=Platform.isMobile?'three':'week'; private weekScroll?:number; private clockTimer?:number;
  private renderer?:Component; private frame?:number;
  private update=()=>{if(this.frame===undefined)this.frame=window.requestAnimationFrame(()=>{this.frame=undefined;this.render();});};
  constructor(leaf:WorkspaceLeaf,public plugin:OneCalendar){super(leaf);}
  getViewType(){return VIEW;}getDisplayText(){return 'OneCalendar';}getIcon(){return 'calendar-check';}
  async onOpen(){this.plugin.store.listeners.add(this.update);this.clockTimer=window.setInterval(()=>this.updateClock(),30000);this.render();}
  async onClose(){this.plugin.store.listeners.delete(this.update);if(this.frame!==undefined)window.cancelAnimationFrame(this.frame);if(this.clockTimer)window.clearInterval(this.clockTimer);}
  go(page:string){this.page=page==='tasks'?'board':page;this.project='';this.search='';this.limit=80;if(page==='board')this.filter='all';this.render();}
  render(){
    if(this.page==='tasks')this.page='board';if(this.page==='today')this.page='overview';
    if(this.renderer)this.removeChild(this.renderer);this.renderer=this.addChild(new Component());
    const root=this.contentEl;const oldViewport=root.querySelector('.tc-calendar-viewport');const scroll=oldViewport?.scrollTop??root.scrollTop; root.empty();root.addClass('tc-root');
    root.toggleClass('tc-mobile',Platform.isMobile);
    root.toggleClass('tc-calendar-page',this.page==='calendar');
    const shell=root.createDiv({cls:'tc-shell'});
    const top=shell.createDiv({cls:'tc-header'});
    top.createEl('h1',{text:pages[this.page]??'Project'});
    const quick=top.createDiv({cls:'tc-actions tc-quick'});
    this.iconButton(quick,'lightbulb','＋ Idea',()=>this.plugin.capture('idea'));
    this.iconButton(quick,'square-check','＋ Task',()=>this.plugin.capture('task'));
    this.iconButton(quick,'calendar-plus','＋ Event',()=>this.newTimedEvent(this.day,540,570));
    this.iconButton(quick,'notebook-pen','Today journal',()=>this.plugin.openDiary(dateKey()));
    const nav=shell.createDiv({cls:'tc-nav',attr:{role:'navigation','aria-label':'Dashboard navigation'}});
    const menu=pages;
    for(const [key,name] of Object.entries(menu))button(nav,name,()=>this.go(key),key===this.page?'is-active':'');
    const problems=this.plugin.store.problems();
    if(problems.length){const box=root.createEl('details',{cls:'tc-warning'});box.createEl('summary',{text:`${problems.length} data issues need attention (original files preserved)`});for(const p of problems){const line=box.createDiv();button(line,p.path,()=>this.app.workspace.openLinkText(p.path,'',true));line.createSpan({text:p.error});}}
    if(['tasks','board'].includes(this.page))this.taskToolbar(root);
    if(this.page==='overview')this.overview(root);
    if(this.page==='tasks')this.taskList(root,this.tasks());
    if(this.page==='board')this.board(root);
    if(this.page==='projects')this.projects(root);
    if(this.page==='project')this.projectPage(root);
    if(this.page==='ideas')this.ideas(root);
    if(this.page==='calendar')this.calendar(root);
    if(this.page==='series')this.series(root);
    const viewport=root.querySelector('.tc-calendar-viewport');if(viewport)viewport.scrollTop=scroll;else root.scrollTop=scroll;
  }
  taskToolbar(root:HTMLElement){
    const bar=root.createDiv({cls:'tc-toolbar'});
    this.searchBox(bar);
    const select=bar.createEl('select',{attr:{'aria-label':'Task filter'}});
    for(const [k,v]of Object.entries({active:'Active',today:'Today',overdue:'Overdue',upcoming:'Next seven days',inbox:'Inbox',unplanned:'Unscheduled',done:'Done',all:'All'}))select.createEl('option',{value:k,text:v});
    select.value=this.filter;select.onchange=()=>{this.filter=select.value;this.render();};
    const p=bar.createEl('select',{attr:{'aria-label':'Filter by project'}});p.createEl('option',{value:'',text:'All projects'});
    for(const r of this.plugin.store.all('project'))p.createEl('option',{value:r.data.id,text:r.data.title});
    p.value=this.project;p.onchange=()=>{this.project=p.value;this.render();};
  }
  searchBox(root:HTMLElement){
    const i=root.createEl('input',{type:'search',placeholder:'Search titles or text...',value:this.search,attr:{'aria-label':'Search'}});
    let timer:number;
    i.oninput=()=>{this.search=i.value;window.clearTimeout(timer);timer=window.setTimeout(()=>{const n=i.selectionStart;this.render();const next=this.contentEl.querySelector<HTMLInputElement>('input[type=search]');next?.focus();if(n!==null)next?.setSelectionRange(n,n);},180);};
  }
  tasks(){return this.plugin.store.all('task').filter(r=>matchesTask(r.data,this.filter)&&(!this.project||r.data.projects?.includes(this.project))&&this.matches(r)).sort((a,b)=>(a.data.plan||a.data.due||'9999').localeCompare(b.data.plan||b.data.due||'9999')||b.data.created.localeCompare(a.data.created));}
  matches(r:RecordFile){return !this.search||`${r.data.title}\n${r.body}`.toLowerCase().includes(this.search.toLowerCase());}
  empty(root:HTMLElement,text:string){root.createDiv({cls:'tc-empty',text});}
  section(root:HTMLElement,title:string){const s=root.createEl('section',{cls:'tc-panel'});s.createEl('h2',{text:title});return s;}
  markdown(root:HTMLElement,r:RecordFile){void MarkdownRenderer.render(this.app,r.body,root,r.path,this.renderer!);}
  taskCard(root:HTMLElement,r:RecordFile){
    const d=r.data;const card=root.createDiv({cls:`tc-task ${active(d)?'':'tc-complete'}`,attr:{'data-task':d.id}});
    const line=card.createDiv({cls:'tc-task-heading'});const check=line.createEl('input',{type:'checkbox',attr:{'aria-label':`Complete ${d.title}`}});check.checked=d.status==='done';
    check.onchange=()=>void this.plugin.run(()=>this.plugin.store.setStatus(d.id,check.checked?'done':'todo'));
    button(line,d.title,()=>new Editor(this.app,this.plugin.store,'task',r).open(),'tc-title-button');
    const meta=card.createDiv({cls:'tc-meta'});
    if(d.plan)meta.createSpan({text:`Plan ${d.plan}`,cls:'tc-chip'});
    if(d.due)meta.createSpan({text:`Due ${d.due}`,cls:active(d)&&d.due<dateKey()?'tc-chip tc-danger':'tc-chip'});
    if(d.series)meta.createSpan({text:'↻ Repeat',cls:'tc-chip'});
    if(r.diary)meta.createSpan({text:'From diary',cls:'tc-chip'});
    for(const p of d.projects ?? []){let name='Missing project';try{name=this.plugin.store.find(p)?.data.title ?? name;}catch{/* A missing project remains visible with its fallback label. */}button(meta,name,()=>{this.page='project';this.project=p;this.render();},'tc-chip');}
    if(d.remind){const reminder=this.plugin.store.lookup(`rem_${d.id}`);meta.createSpan({text:`Reminder ${new Date(d.remind).toLocaleString('en-US')} · ${reminder?.data.status ?? 'Pending sync'}`,cls:'tc-chip'});if(reminder?.data.error)meta.createSpan({text:String(reminder.data.error),cls:'tc-danger'});}
    const actions=card.createDiv({cls:'tc-card-actions'});
    const status=actions.createEl('select',{attr:{'aria-label':`${d.title} Status`}});for(const [k,v]of Object.entries(labels))status.createEl('option',{value:k,text:v});status.value=d.status ?? 'todo';
    status.onchange=()=>void this.plugin.run(()=>this.plugin.store.setStatus(d.id,status.value));
    button(actions,'Open note',()=>this.app.workspace.openLinkText(r.path,'',true));
    if(d.source)button(actions,'Source idea',()=>{const idea=this.plugin.store.find(d.source!);if(idea)return this.app.workspace.openLinkText(idea.path,'',true);new Notice('Source idea not found yet');});
    card.draggable=!Platform.isMobile;card.ondragstart=e=>e.dataTransfer?.setData('text/task-calendar',d.id);
  }
  taskList(root:HTMLElement,list:RecordFile[]){
    const old=list.filter(r=>r.data.series&&active(r.data)&&r.data.plan&&r.data.plan<dateKey());
    if(!this.expanded&&old.length>1){button(root,`${old.length} past occurrences need attention · Expand`,()=>{this.expanded=true;this.render();},'tc-warning');list=list.filter(r=>!old.includes(r));}
    if(this.expanded&&old.length>1)button(root,'Collapse past occurrences',()=>{this.expanded=false;this.render();});
    if(!list.length && !old.length)this.empty(root,'No tasks yet. Capture one now and schedule it later.');
    for(const r of list.slice(0,this.limit))this.taskCard(root,r);
    if(list.length>this.limit)button(root,`Show more (${list.length-this.limit} remaining)`,()=>{this.limit+=80;this.render();});
  }
  overview(root:HTMLElement){
    const all=this.plugin.store.all('task'),today=all.filter(r=>matchesTask(r.data,'today')),overdue=all.filter(r=>matchesTask(r.data,'overdue'));
    const grid=root.createDiv({cls:'tc-overview-grid tc-today-grid'});
    const focus=this.section(grid,'Today tasks');this.taskList(focus.createDiv({cls:'tc-today-content'}),today);
    const agenda=this.section(grid,'Today events');this.agenda(agenda.createDiv({cls:'tc-today-content'}),dateKey());
    const projects=this.section(root,'Projects · Latest memos');this.projectCards(projects,false);
    const secondary=root.createDiv({cls:'tc-overview-grid'});
    const attention=this.section(secondary,'Needs attention');if(overdue.length)this.taskList(attention,overdue);else this.empty(attention,'No overdue tasks');
    const ideas=this.section(secondary,'Unprocessed ideas');const pending=this.plugin.store.all('idea').filter(r=>(r.data.status??'inbox')==='inbox');
    if(!pending.length)this.empty(ideas,'Capture a thought now and decide what to do with it later.');
    for(const r of pending.slice(-4).reverse())button(ideas,r.data.title,()=>{this.page='ideas';this.render();},'tc-idea-preview');
    const upcoming=this.section(root,'Next seven days · Events');let any=false;for(let n=1;n<=7;n++){const day=addDays(dateKey(),n);if(this.eventsFor(day).length){any=true;upcoming.createEl('h3',{text:day});this.agenda(upcoming,day);}}if(!any)this.empty(upcoming,'No events in the next seven days');
  }
  board(root:HTMLElement){
    const board=root.createDiv({cls:'tc-board'});const list=this.tasks();
    for(const [k,title]of Object.entries({todo:'To do',doing:'In progress',done:'Done'})){
      const col=board.createDiv({cls:'tc-column'});const items=list.filter(r=>(r.data.status??'todo')===k);col.createEl('h2',{text:`${title} · ${items.length}`});
      col.ondragover=e=>e.preventDefault();col.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('text/task-calendar');if(id)void this.plugin.run(()=>this.plugin.store.setStatus(id,k));};
      this.taskList(col,items);
    }
  }
  projects(root:HTMLElement){
    const bar=root.createDiv({cls:'tc-toolbar'});button(bar,'＋ Project',()=>new Editor(this.app,this.plugin.store,'project').open(),'mod-cta');
    button(bar,this.showArchived?'Hide archived':'Show archived',()=>{this.showArchived=!this.showArchived;this.render();});this.projectCards(root,this.showArchived);
  }
  projectCards(root:HTMLElement,archived:boolean){
    const list=this.plugin.store.all('project').filter(r=>archived||!r.data.archived);if(!list.length)this.empty(root,'No projects yet. Create a project to link tasks and add memos.');
    const grid=root.createDiv({cls:'tc-project-grid'});
    for(const p of list){const card=grid.createDiv({cls:'tc-project-card'});
      button(card,`${p.data.archived?'[Archived] ':''}${p.data.title}`,()=>{this.project=p.data.id;this.page='project';this.render();},'tc-project-title');
      const latest=this.plugin.store.memos(p.data.id)[0];
      if(latest){const body=card.createDiv({cls:'tc-memo-preview'});this.markdown(body,latest);card.createDiv({cls:'tc-muted',text:`Memo updated ${new Date(latest.data.created).toLocaleString('en-US')}`});if(Date.now()-Date.parse(latest.data.created)>7*86400000)card.createDiv({cls:'tc-chip',text:'No memo update for 7 days; time for a review'});}else card.createDiv({cls:'tc-muted',text:'No memo yet'});
      const n=this.plugin.store.all('task').filter(t=>active(t.data)&&t.data.projects?.includes(p.data.id)).length;
      card.createDiv({cls:'tc-project-footer',text:`${n} active tasks`});button(card,'Update memo',()=>new MemoEditor(this.app,this.plugin.store,p.data.id).open());
    }
  }
  projectPage(root:HTMLElement){
    const p=this.plugin.store.lookup(this.project);if(!p){this.empty(root,'Project missing, not synced yet, or duplicated by a conflict.');return;}
    root.createEl('h2',{text:p.data.title});const bar=root.createDiv({cls:'tc-toolbar'});
    button(bar,'Update memo',()=>new MemoEditor(this.app,this.plugin.store,p.data.id).open(),'mod-cta');
    button(bar,'＋ Linked tasks',()=>new Editor(this.app,this.plugin.store,'task',undefined,{projects:[p.data.id]}).open());
    button(bar,'Edit project',()=>new Editor(this.app,this.plugin.store,'project',p).open());
    button(bar,'Open project memo',()=>this.app.workspace.openLinkText(p.path,'',true));
    button(bar,p.data.archived?'Restore project':'Archive project',()=>this.plugin.store.update(p.data.id,{archived:!p.data.archived}));
    const memos=this.plugin.store.memos(p.data.id);const section=this.section(root,'Latest memo');
    if(memos[0])this.markdown(section,memos[0]);else this.empty(section,'No memo yet. Record your progress and next steps.');
    if(memos.length>1){const history=root.createEl('details',{cls:'tc-panel'});history.createEl('summary',{text:`Memo history (${memos.length-1})`});for(const r of memos.slice(1)){const el=history.createDiv({cls:'tc-history'});el.createDiv({text:new Date(r.data.created).toLocaleString('en-US'),cls:'tc-muted'});this.markdown(el,r);}}
    root.createEl('h2',{text:'Linked tasks'});const filter=root.createEl('select',{attr:{'aria-label':'Project task status'}});for(const [k,v]of Object.entries({all:'All',active:'Active',done:'Done'}))filter.createEl('option',{value:k,text:v});filter.value=['all','active','done'].includes(this.filter)?this.filter:'all';
    filter.onchange=()=>{this.filter=filter.value;this.render();};this.taskList(root,this.plugin.store.all('task').filter(t=>t.data.projects?.includes(p.data.id)&&matchesTask(t.data,filter.value)));
  }
  ideas(root:HTMLElement){
    const toolbar=root.createDiv({cls:'tc-toolbar'});this.searchBox(toolbar);for(const [key,value]of Object.entries({inbox:'Inbox',processed:'Processed',archived:'Archived'}))button(toolbar,value,()=>{this.ideaFilter=key;this.render();},this.ideaFilter===key?'is-active':'');
    const list=this.plugin.store.all('idea').filter(r=>(r.data.status??'inbox')===this.ideaFilter&&this.matches(r)).sort((a,b)=>b.data.created.localeCompare(a.data.created));
    if(!list.length)this.empty(root,'No ideas yet. Capture a thought and organize it later.');
    for(const r of list.slice(0,this.limit)){const card=root.createDiv({cls:'tc-panel'});card.createDiv({text:new Date(r.data.created).toLocaleString('en-US'),cls:'tc-muted'});this.markdown(card,r);const actions=card.createDiv({cls:'tc-actions'});
      button(actions,'Edit / link projects',()=>new Editor(this.app,this.plugin.store,'idea',r).open());
      button(actions,r.data.task?'View task':'Convert to task',async()=>{const t=await this.plugin.store.convertIdea(r.data.id);new Editor(this.app,this.plugin.store,'task',t).open();});
      button(actions,'Expand in note',async()=>{await this.plugin.store.update(r.data.id,{status:'processed'});await this.app.workspace.openLinkText(r.path,'',true);});
      button(actions,this.ideaFilter==='archived'?'Restore to inbox':'Archive',()=>this.plugin.store.update(r.data.id,{status:this.ideaFilter==='archived'?'inbox':'archived'}));
    }
    if(list.length>this.limit)button(root,'Show more',()=>{this.limit+=80;this.render();});
  }
  series(root:HTMLElement){
    button(root,'＋ Repeating tasks',()=>new Editor(this.app,this.plugin.store,'series').open(),'mod-cta');
    const rules:Record<string,string>={daily:'Daily',weekly:'Weekly',monthly:'Monthly',weekdays:'Monday to Friday',after:'After completion'};
    for(const r of this.plugin.store.all('series')){const card=root.createDiv({cls:'tc-panel'});card.createEl('h3',{text:r.data.title});card.createDiv({text:`${rules[r.data.rule!]} · Interval ${r.data.interval} · ${r.data.ended?'Ended':r.data.paused?'Paused':'In progress'}`,cls:'tc-muted'});
      const bar=card.createDiv({cls:'tc-actions'});button(bar,'Edit future occurrences',()=>new Editor(this.app,this.plugin.store,'series',r).open());
      if(!r.data.ended){button(bar,r.data.paused?'Resume repeat':'Pause repeat',async()=>{await this.plugin.store.update(r.data.id,{paused:!r.data.paused});await this.plugin.store.tick();});button(bar,'End repeat',()=>this.plugin.store.update(r.data.id,{ended:true}));}
      button(bar,'View occurrences',()=>{this.page='tasks';this.filter='all';this.search=r.data.title;this.render();});
    }
    if(!this.plugin.store.all('series').length)this.empty(root,'Repeat daily, weekly, monthly or after completion.');
  }
  iconButton(root:HTMLElement,icon:string,label:string,action:()=>unknown){const b=button(root,'',action,'tc-icon');setIcon(b,icon);b.setAttribute('aria-label',label);b.title=label;return b;}
  calendarFooter(root:HTMLElement){
    const footer=root.createDiv({cls:'tc-calendar-footer'});
    const legend=footer.createDiv({cls:'tc-calendar-legend'});
    for(const source of this.plugin.settings?.caldavSources??[])if(source.enabled){const item=legend.createSpan({text:source.name,cls:'tc-calendar-key'});item.style.setProperty('--tc-calendar-color',safeColor(source.color));}
    this.iconButton(footer,'refresh-cw','Refresh calendar',()=>this.plugin.syncCalendar(true));
    footer.createDiv({text:this.plugin.calendarStatus,cls:'tc-muted'});
  }
  calendar(root:HTMLElement){
    const modes=root.createDiv({cls:'tc-toolbar tc-calendar-modes'});for(const [key,label]of [['three','3 days'],['week','Week'],['month','Month']] as const)button(modes,label,()=>{this.calendarMode=key;this.month=this.day.slice(0,7);this.render();},this.calendarMode===key?'is-active':'');
    if(this.calendarMode==='week'||this.calendarMode==='three')this.week(root);
    else this.monthView(root);
    const controls=root.createDiv({cls:'tc-calendar-controls'});controls.append(modes,root.querySelector('.tc-date-controls')!);root.querySelector('.tc-shell')!.append(controls);
    const viewport=root.createDiv({cls:'tc-calendar-viewport'});
    const content=root.querySelector('.tc-week-scroll,.tc-month');if(content)viewport.append(content);
    this.calendarFooter(viewport);
  }
  monthView(root:HTMLElement){
    const bar=root.createDiv({cls:'tc-toolbar tc-date-controls'});this.iconButton(bar,'chevron-left','Previous month',()=>this.shiftMonth(-1));bar.createEl('strong',{text:this.month});this.iconButton(bar,'chevron-right','Next month',()=>this.shiftMonth(1));this.iconButton(bar,'locate-fixed','Today',()=>{this.day=dateKey();this.month=this.day.slice(0,7);this.render();});
    const grid=root.createDiv({cls:'tc-month'});for(const v of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.createDiv({cls:'tc-weekday',text:v});
    const first=parseDate(`${this.month}-01`);const offset=(first.getDay()+6)%7;const begin=addDays(dateKey(first),-offset);
    for(let n=0;n<42;n++){const day=addDays(begin,n);const cell=button(grid,String(Number(day.slice(-2))),()=>{this.day=day;return this.plugin.openDiary(day);},`tc-day ${day===this.day?'is-selected':''} ${day.slice(0,7)!==this.month?'tc-outside':''}`);
      cell.setAttribute('aria-label',`Open journal ${day}`);
      const count=this.eventsFor(day).length;if(count)cell.createSpan({text:`${count} ·`,cls:'tc-day-dot'});
    }
  }
  shiftMonth(n:number){const d=parseDate(`${this.month}-01`);d.setMonth(d.getMonth()+n);this.month=dateKey(d).slice(0,7);this.render();}
  week(root:HTMLElement){
    const count=this.calendarMode==='three'?3:7,begin=count===3?this.day:weekStart(this.day),days=Array.from({length:count},(_,n)=>addDays(begin,n));
    const bar=root.createDiv({cls:'tc-toolbar'});
    const shift=(n:number)=>{this.day=addDays(this.day,n);this.render();};
    bar.addClass('tc-date-controls');this.iconButton(bar,'chevron-left',count===3?'Previous 3 days':'Previous week',()=>shift(-count));this.iconButton(bar,'chevron-right',count===3?'Next 3 days':'Next week',()=>shift(count));
    this.iconButton(bar,'locate-fixed','Today',()=>{this.day=dateKey();this.weekScroll=undefined;this.render();});
    const pick=bar.createEl('input',{type:'date',value:begin,attr:{'aria-label':'Jump to date'}});bar.insertBefore(pick,bar.children[1]);pick.onchange=()=>{if(pick.value){this.day=pick.value;this.render();}};
    const scroll=root.createDiv({cls:'tc-week-scroll'}),canvas=scroll.createDiv({cls:'tc-week-canvas'});
    canvas.style.setProperty('--tc-days',String(count));if(count===3)canvas.addClass('tc-three-days');
    const header=canvas.createDiv({cls:'tc-week-head'});header.createDiv({cls:'tc-week-zone',text:`UTC${-new Date().getTimezoneOffset()/60>=0?'+':''}${-new Date().getTimezoneOffset()/60}`});
    days.forEach(day=>{const h=header.createDiv({cls:day===dateKey()?'tc-week-heading is-today':'tc-week-heading'});const b=button(h,`${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseDate(day).getDay()]} ${day.slice(5)}`,()=>this.plugin.openDiary(day),day===this.day?'is-active':'');b.title='Open journal';});
    const allday=canvas.createDiv({cls:'tc-week-all-day'});allday.createDiv({text:'All day',cls:'tc-muted'});for(const day of days){const col=allday.createDiv();for(const e of this.eventsFor(day).filter(e=>e.allDay)){const b=button(col,e.title,()=>this.openEvent(e),'tc-all-day-event');b.style.setProperty('--tc-calendar-color',safeColor(e.color));}}
    allday.hidden=!days.some(day=>this.eventsFor(day).some(e=>e.allDay));
    const body=canvas.createDiv({cls:'tc-week-body',attr:{'data-week':begin,'data-days':String(count)}}),axis=body.createDiv({cls:'tc-week-axis'});
    for(let h=0;h<24;h++){const label=axis.createDiv({text:`${String(h).padStart(2,'0')}:00`});label.style.top=`${h*60}px`;}
    for(const day of days){
      const col=body.createDiv({cls:'tc-week-column',attr:{'data-day':day}});
      let suppressClickUntil=0;
      for(let m=0;m<1440;m+=30){const slot=col.createEl('button',{cls:'tc-time-slot',attr:{'aria-label':`${day} ${atMinute(day,m).slice(-5)} Add event`,type:'button'}});slot.onclick=e=>{if(Date.now()>=suppressClickUntil&&(e.detail===0||Platform.isMobile))this.newTimedEvent(day,m,m);};}
      let anchor:number|undefined,selection:HTMLElement|undefined;
      const minute=(e:PointerEvent)=>Math.min(1410,Math.max(0,Math.floor((e.clientY-col.getBoundingClientRect().top)/30)*30));
      col.onpointerdown=e=>{if(Platform.isMobile||e.button!==0||e.pointerType==='touch'||(e.target as HTMLElement).closest('.tc-week-event'))return;e.preventDefault();anchor=minute(e);selection=col.createDiv({cls:'tc-time-selection'});selection.style.top=`${anchor}px`;col.setPointerCapture(e.pointerId);};
      col.onpointermove=e=>{if(e.pointerType==='touch')return;if(anchor===undefined||!selection)return;const m=minute(e);selection.style.top=`${Math.min(anchor,m)}px`;selection.style.height=`${Math.abs(anchor-m)+30}px`;const range=timeRange(day,anchor,m);selection.setText(`${range.start.slice(-5)} — ${range.end.slice(-5)}`);};
      col.onpointerup=e=>{if(e.pointerType==='touch')return;if(anchor===undefined)return;const a=anchor;anchor=undefined;selection?.remove();selection=undefined;col.releasePointerCapture(e.pointerId);this.newTimedEvent(day,a,minute(e));};
      col.onpointercancel=e=>{if(e.pointerType==='touch')return;anchor=undefined;selection?.remove();selection=undefined;};
      let hold:number|undefined,origin:{x:number;y:number}|undefined,lastY=0;
      const cancelHold=()=>{if(hold)window.clearTimeout(hold);hold=undefined;};
      const touchMinute=(y:number)=>Math.min(1410,Math.max(0,Math.floor((y-col.getBoundingClientRect().top)/30)*30));
      col.addEventListener('touchstart',e=>{if(e.touches.length!==1||(e.target as HTMLElement).closest('.tc-week-event'))return;const t=e.touches[0];origin={x:t.clientX,y:t.clientY};lastY=t.clientY;cancelHold();hold=window.setTimeout(()=>{anchor=touchMinute(lastY);selection=col.createDiv({cls:'tc-time-selection'});selection.style.top=`${anchor}px`;},450);},{passive:true});
      col.addEventListener('touchmove',e=>{const t=e.touches[0];if(!t)return;lastY=t.clientY;if(anchor===undefined){if(origin&&Math.hypot(t.clientX-origin.x,t.clientY-origin.y)>8)cancelHold();return;}e.preventDefault();const m=touchMinute(lastY);selection!.style.top=`${Math.min(anchor,m)}px`;selection!.style.height=`${Math.abs(m-anchor)+30}px`;},{passive:false});
      col.addEventListener('touchend',e=>{cancelHold();origin=undefined;if(anchor===undefined)return;e.preventDefault();const a=anchor;anchor=undefined;selection?.remove();selection=undefined;suppressClickUntil=Date.now()+700;this.newTimedEvent(day,a,touchMinute(lastY));},{passive:false});
      col.addEventListener('touchcancel',()=>{cancelHold();origin=undefined;anchor=undefined;selection?.remove();selection=undefined;});
      this.renderer?.register(cancelHold);
      for(const r of layoutEvents(this.eventsFor(day),day)){
        const e=r.event;const title=`${e.title} · ${new Date(e.start).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} — ${new Date(e.end).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · ${e.source}`;
        const event=button(col,'',()=>this.openEvent(e),`tc-week-event ${e.record?'':'tc-external-event'}`);
        event.style.setProperty('--tc-calendar-color',safeColor(e.color));
        event.title=title;event.setAttribute('aria-label',title);event.createEl('strong',{text:e.title});event.createDiv({text:`${atMinute(day,r.start).slice(-5)} — ${atMinute(day,r.end).slice(-5)}`});
        event.style.top=`${r.start}px`;event.style.height=`${Math.max(18,r.end-r.start-2)}px`;event.style.left=`${r.column/r.columns*100}%`;event.style.width=`calc(${100/r.columns}% - 3px)`;
      }
    }
    const line=body.createDiv({cls:'tc-now-line'});line.createSpan({cls:'tc-now-label'});line.createSpan({cls:'tc-now-dot'});this.updateClock();

  }
  newTimedEvent(day:string,a:number,b:number){this.day=day;new Editor(this.app,this.plugin.store,'event',undefined,timeRange(day,a,b)).open();}
  openEvent(e:{record?:RecordFile;title:string;start:string;end:string;allDay:boolean}){if(e.record)new Editor(this.app,this.plugin.store,'event',e.record).open();else new EventDetails(this.app,e as ExternalEvent).open();}
  updateClock(){const body=this.contentEl.querySelector<HTMLElement>('.tc-week-body'),line=body?.querySelector<HTMLElement>('.tc-now-line');if(!body||!line)return;const now=new Date(),today=dateKey(now),begin=body.dataset.week!;line.hidden=today<begin||today>addDays(begin,Number(body.dataset.days??7)-1);line.style.top=`${now.getHours()*60+now.getMinutes()}px`;line.querySelector('.tc-now-label')!.textContent=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});const dot=line.querySelector<HTMLElement>('.tc-now-dot')!;dot.style.left=`${Math.round((parseDate(today).getTime()-parseDate(begin).getTime())/86400000)/Number(body.dataset.days??7)*100}%`;}
  eventsFor(day:string){
    const start=new Date(`${day}T00:00`).getTime(),end=new Date(`${addDays(day,1)}T00:00`).getTime();
    const local=this.plugin.store.all('event').filter(r=>!r.data.archived).map(r=>({id:r.data.id,title:r.data.title,start:r.data.start!,end:r.data.end!,record:r,source:'Local',allDay:false,color:'#2563eb'}));
    const external=this.plugin.externalEvents.map(e=>{const source=this.plugin.settings?.caldavSources?.find(s=>s.id===e.sourceId);return {...e,color:source?.color??e.color,calendarName:source?.name??e.calendarName,record:undefined,source:`${source?.name||e.calendarName||(e.provider==='caldav'?'CalDAV':'Feishu')} · Read only`};});
    return [...local,...external].filter(e=>Date.parse(e.start)<end&&Date.parse(e.end)>start).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  }
  agenda(root:HTMLElement,day:string){
    const events=this.eventsFor(day);if(!events.length)this.empty(root,'No events on this day');
    for(const e of events){const row=root.createDiv({cls:'tc-agenda-item'});row.createDiv({text:e.allDay?'All day':`${new Date(e.start).toLocaleString('en-US',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} — ${new Date(e.end).toLocaleString('en-US',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`,cls:'tc-muted'});button(row,e.title,()=>this.openEvent(e),'tc-title-button');row.createSpan({text:e.source,cls:'tc-chip'});
      row.style.setProperty('--tc-calendar-color',safeColor(e.color));
      if(e.record){button(row,'Edit ',()=>new Editor(this.app,this.plugin.store,'event',e.record).open());button(row,'Archive',()=>this.plugin.store.update(e.id,{archived:true}));}else button(row,'View details',()=>this.openEvent(e));
    }
  }
}



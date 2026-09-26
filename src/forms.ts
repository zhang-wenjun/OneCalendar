import { App, Modal, Notice, Platform } from 'obsidian';
import { Entity, RecordFile, dateKey, make, stamp } from './model';
import { shareEventCalendar } from './phone-calendar';
import { Store } from './store';

export function button(parent:HTMLElement,text:string,action:()=>unknown,cls='') {
  const b=parent.createEl('button',{text,cls,attr:{type:'button'}});
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){new Notice((e as Error).message);}finally{b.disabled=false;}};
  return b;
}
export class Editor extends Modal {
  constructor(app:App,public store:Store,public kind:'task'|'idea'|'project'|'event'|'series',public record?:RecordFile, public defaults:Partial<Entity>={},public captureDay?:string) {super(app);}
  onOpen() {
    this.contentEl.addClass('tc-form');
    if(Platform.isMobile)this.modalEl.addClass('tc-mobile-modal');
    this.titleEl.setText(`${this.record?'Edit ':'New '}${{task:'Task',idea:'Idea',project:'Project',event:'Event',series:'Repeating task'}[this.kind]}`);
    const d=this.record?.data ?? this.defaults;
    const text=(label:string,value='',type='text')=>{
      const row=this.contentEl.createEl('label',{cls:'tc-field'});row.createSpan({text:label});
      const el=row.createEl('input',{type,value});return el;
    };
    const select=(label:string,choices:Record<string,string>,value='')=>{
      const row=this.contentEl.createEl('label',{cls:'tc-field'});row.createSpan({text:label});
      const el=row.createEl('select');for(const [k,v]of Object.entries(choices))el.createEl('option',{text:v,value:k});el.value=value;return el;
    };
    const title=this.kind==='idea'?null:text('Title',d.title ?? '');
    const bodyLabel=this.contentEl.createEl('label',{cls:'tc-field'});
    bodyLabel.createSpan({text:this.kind==='idea'?'What came to mind?':'Description / note links (optional)'});
    const body=bodyLabel.createEl('textarea',{attr:{rows:this.kind==='idea'?6:4}}); body.value=this.record?.body ?? '';
    const selected=new Set(d.projects ?? []);
    let options=this.contentEl;
    if(Platform.isMobile&&['task','idea'].includes(this.kind)){
      const details=this.contentEl.createEl('details',{cls:'tc-capture-options'});
      details.createEl('summary',{text:this.kind==='task'?'Dates, reminder and projects':'Linked projects'});
      details.open=!!this.record;options=details;
    }
    if(['task','idea','series'].includes(this.kind)) {
      const box=options.createEl('fieldset',{cls:'tc-project-choices'});box.createEl('legend',{text:'Linked projects (select any)'});
      for(const p of this.store.all('project').filter(p=>!p.data.archived || selected.has(p.data.id))) {
        const label=box.createEl('label');const c=label.createEl('input',{type:'checkbox'});c.checked=selected.has(p.data.id);label.appendText(p.data.title);
        c.onchange=()=>c.checked?selected.add(p.data.id):selected.delete(p.data.id);
      }
      if(!box.querySelector('input'))box.createSpan({text:'No projects yet. Link one later.',cls:'tc-muted'});
      for(const key of selected) if(!this.store.lookup(key)) box.createSpan({text:`Missing or conflicting project: ${key} (link preserved)`,cls:'tc-muted'});
    }
    const status=this.kind==='task'?select('Status',{todo:'To do',doing:'In progress',done:'Done',cancelled:'Cancelled',skipped:'Skipped'},d.status ?? 'todo'):null;
    const plan=this.kind==='task'?text('Planned date (optional)',d.plan ?? '','date'):null;
    const due=this.kind==='task'?text('Due date (optional)',d.due ?? '','date'):null;
    const remind=['task','event'].includes(this.kind)?text('Reminder time',localDateTime(d.remind),'datetime-local'):null;
    for(const field of [status,plan,due,remind])if(field&&options!==this.contentEl)options.appendChild(field.parentElement!);
    if(remind&&this.kind==='task')options.createEl('p',{cls:'tc-muted',text:'Reminders require a connected calendar and notifications enabled in your calendar app. Obsidian cannot notify you while it is closed. Sync before leaving the app.'});
    const start=this.kind==='event'?text('Start time',localDateTime(d.start),'datetime-local'):null;
    const end=this.kind==='event'?text('End time',localDateTime(d.end),'datetime-local'):null;
    if(start&&end)start.onchange=()=>{if(start.value&&(!end.value||Date.parse(end.value)<=Date.parse(start.value)))end.value=localDateTime(new Date(Date.parse(start.value)+30*60000).toISOString());};
    const linked=this.kind==='event'?select('Linked task (optional)',{'':'None',...Object.fromEntries(this.store.all('task').filter(t=>t.data.status==='doing'||t.data.id===d.task).map(t=>[t.data.id,t.data.title+(t.data.status!=='doing'?' (current link)':'')]))},d.task ?? ''):null;
    const rule=this.kind==='series'?select('Repeat mode',{daily:'Every day / every N days',weekly:'Selected weekdays',monthly:'Selected day of month',weekdays:'Monday to Friday',after:'After completion'},d.rule ?? 'daily'):null;
    const interval=this.kind==='series'?text('Interval (days / weeks / months; weekdays use 1)',String(d.interval ?? 1),'number'):null;
    const first=this.kind==='series'?text(this.record?'Effective date (reschedules future pending instances)':'Start date',this.record?dateKey():d.next ?? d.occurrence ?? dateKey(),'date'):null;
    const monthday=this.kind==='series'?text('Day of month (clamped to month end)',String(d.monthday ?? 1),'number'):null;
    const weekdays=new Set(d.weekdays ?? [1]);
    if(this.kind==='series') {
      const days=this.contentEl.createEl('fieldset');days.createEl('legend',{text:'Repeat on weekdays'});
      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((v,i)=>{const l=days.createEl('label');const c=l.createEl('input',{type:'checkbox'});c.checked=weekdays.has(i);l.appendText(v);c.onchange=()=>c.checked?weekdays.add(i):weekdays.delete(i);});
    }
    const repeatReminder=this.kind==='series'?text('Reminder time for each occurrence (optional)',d.reminderTime ?? '','time'):null;
    const dueOffset=this.kind==='series'?text('Days from plan to deadline (optional; 0 = same day)',d.dueOffset===undefined?'':String(d.dueOffset),'number'):null;
    const error=this.contentEl.createDiv({cls:'tc-error',attr:{role:'alert'}});
    const actions=this.contentEl.createDiv({cls:'tc-form-actions'});
    button(actions,'Cancel',()=>this.close());
    let savedEvent:RecordFile|undefined=this.record;let exportCalendar=false;
    const save=button(actions,'Save',async()=>{
      error.empty();
      try {
        const fields:Partial<Entity>={title:this.kind==='idea'?body.value.trim().split('\n')[0].slice(0,100):title!.value.trim()};
        if(!fields.title)throw new Error(this.kind==='idea'?'Enter an idea':'Enter a title');
        if(['task','idea','series'].includes(this.kind))fields.projects=[...selected];
        for(const id of fields.projects??[]){const project=this.store.find(id);if(project?.bundle)await this.store.update(id,{});}
        if(status)Object.assign(fields,{status:status.value,plan:plan!.value||undefined,due:due!.value||undefined,remind:remind!.value||undefined});
        if(start)Object.assign(fields,{start:start.value,end:end!.value,task:linked!.value||undefined,remind:remind!.value||undefined});
        if(fields.task){const task=this.store.find(fields.task);if(task?.diary)await this.store.update(task.data.id,{});}
        if(rule) {
          Object.assign(fields,{rule:rule.value,interval:Number(interval!.value),next:first!.value,occurrence:first!.value,monthday:Number(monthday!.value),weekdays:[...weekdays],reminderTime:repeatReminder!.value||undefined,dueOffset:dueOffset!.value===''?undefined:Number(dueOffset!.value)});
          if(!first!.value)throw new Error('Select a start date');
          if(fields.dueOffset!==undefined && !Number.isInteger(fields.dueOffset))throw new Error('Deadline offset must be an integer');
        }
        if(this.record && this.kind==='series')await this.store.editSeries(this.record,fields,body.value);
        else if(this.record) {
          const statusChanged=fields.status && fields.status!==this.record.data.status;
          if(statusChanged)fields.completed=['done','skipped'].includes(fields.status!)?stamp():undefined;
          const saved=await this.store.update(this.record.data.id,fields,body.value,this.record);
          savedEvent=saved;
          if(statusChanged)await this.store.afterStatus(saved);
        } else if(this.kind==='series') await this.store.createSeries(fields,body.value);
        else savedEvent=await this.store.create(make(this.kind,fields.title!,{status:this.kind==='idea'?'inbox':this.kind==='task'?'todo':undefined,...fields}),body.value,this.captureDay);
        if(this.kind==='series')await this.store.tick();
        if(exportCalendar&&savedEvent)await shareEventCalendar(this.app,savedEvent);
        this.close();
      }catch(e){error.setText((e as Error).message);}finally{exportCalendar=false;}
    },'mod-cta');
    if(this.kind==='event'){
      button(actions,Platform.isMobile?'Save & add to phone calendar':'Save & export calendar',()=>{
        if(!remind?.value){error.setText('Set a reminder time first.');return;}
        exportCalendar=true;save.click();
      });
      this.contentEl.createEl('p',{cls:'tc-muted',text:'Import into your calendar to enable reminders. Later edits need a new import.'});
    }
    this.scope.register(['Mod'],'Enter',()=>{save.click();return false;});
    setTimeout(()=> {if(this.contentEl.isConnected)(title ?? body).focus();},50);
  }
  onClose(){this.contentEl.empty();}
}
export function localDateTime(value?:string) {
  if(!value)return '';
  const d=new Date(value); if(!Number.isFinite(d.getTime()))return '';
  return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export class MemoEditor extends Modal {
  constructor(app:App,public store:Store,public project:string){super(app);}
  onOpen(){
    this.contentEl.addClass('tc-form');this.titleEl.setText(`Update memo · ${this.store.find(this.project)?.data.title??'Project'}`);
    const text=this.contentEl.createEl('textarea',{cls:'tc-memo-input',attr:{rows:8,placeholder:'Progress, blockers, next steps...'}});
    this.contentEl.createEl('p',{cls:'tc-muted',text:'Previous memos are kept in history.'});
    button(this.contentEl,'Save new memo',async()=>{await this.store.memo(this.project,text.value);this.close();},'mod-cta');text.focus();
  }
}

import {App,Modal,Platform} from 'obsidian';
import type {ExternalEvent} from './calendar';
import {button} from './forms';

export class EventDetails extends Modal {
  constructor(app:App,private event:ExternalEvent){super(app);}
  onOpen(){
    this.modalEl.addClass('tc-event-modal');
    if(Platform.isMobile)this.modalEl.addClass('tc-mobile-modal');
    this.contentEl.addClass('tc-form');this.titleEl.setText(this.event.title);
    const e=this.event;
    this.contentEl.createDiv({text:`${e.calendarName||e.provider||'External calendar'} · Read only`,cls:'tc-chip'});
    const field=(name:string,value:string)=>{const row=this.contentEl.createDiv({cls:'tc-event-detail'});row.createEl('h3',{text:name});row.createDiv({text:value||'Not provided',cls:'tc-event-detail-text'});};
    const time=(v:string)=>e.allDay?v.slice(0,10):new Date(v).toLocaleString('en-US',{dateStyle:'full',timeStyle:'short'});
    field(e.allDay?'Start · All day':'Start',time(e.start));field(e.allDay?'End · Exclusive':'End',time(e.end));
    if(!e.allDay)field('Display timezone',Intl.DateTimeFormat().resolvedOptions().timeZone);
    field('Location',e.location??'');field('Description',e.description??'');
    this.contentEl.createEl('p',{text:'To change this event, edit it in its original calendar, then refresh TaskCalendar.',cls:'tc-muted'});
    button(this.contentEl.createDiv({cls:'tc-form-actions'}),'Close',()=>this.close(),'mod-cta');
  }
  onClose(){this.contentEl.empty();}
}

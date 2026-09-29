import {setIcon,ItemView,WorkspaceLeaf} from 'obsidian';
import type OneCalendar from './main';
import {addDays,dateKey,parseDate} from './model';
import {button} from './forms';
export const DIARY_VIEW='task-calendar-diary';
export class DiaryCalendar extends ItemView {
  month=dateKey().slice(0,7);
  constructor(leaf:WorkspaceLeaf,private plugin:OneCalendar){super(leaf);}
  getViewType(){return DIARY_VIEW;}getDisplayText(){return 'Diary calendar';}getIcon(){return 'calendar-days';}
  async onOpen(){
    this.registerEvent(this.app.workspace.on('file-open',()=>this.render()));
    this.registerEvent(this.app.vault.on('create',()=>this.render()));
    this.registerEvent(this.app.vault.on('delete',()=>this.render()));
    this.render();
  }
  render(){
    const root=this.contentEl;root.empty();root.addClass('tc-root','tc-diary-calendar');
    const bar=root.createDiv({cls:'tc-toolbar'});
    bar.createEl('strong',{text:parseDate(this.month+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'})});
    const shift=(n:number)=>{const d=parseDate(this.month+'-01');d.setMonth(d.getMonth()+n);this.month=dateKey(d).slice(0,7);this.render();};
    for(const [label,title,action] of [['chevron-left','Previous month',()=>shift(-1)],['locate-fixed','Today',()=>{this.month=dateKey().slice(0,7);this.render();}],['chevron-right','Next month',()=>shift(1)]] as const){const b=button(bar,'',action,'tc-icon');setIcon(b,label);b.setAttribute('aria-label',title);}
    const grid=root.createDiv({cls:'tc-mini-month'});
    for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.createSpan({text:day,cls:'tc-muted'});
    const first=parseDate(this.month+'-01'),begin=addDays(dateKey(first),-(first.getDay()+6)%7);
    const active=this.app.workspace.getActiveFile()?.path;
    for(let n=0;n<42;n++){
      const day=addDays(begin,n),path=this.plugin.diary.path(day);
      const b=button(grid,String(Number(day.slice(-2))),()=>this.plugin.openDiary(day));
      b.setAttribute('aria-label',`Open diary ${day}`);
      b.toggleClass('tc-outside',day.slice(0,7)!==this.month);b.toggleClass('is-active',active===path);b.toggleClass('tc-mini-today',day===dateKey());
      if(this.app.vault.getAbstractFileByPath(path))b.createSpan({cls:'tc-mini-dot'});
    }
  }
}

import { App, TFile, moment as obsidianMoment, normalizePath } from 'obsidian';
import type momentFunction from 'moment';
import {appHasDailyNotesPluginLoaded,createDailyNote,getDailyNoteSettings} from 'obsidian-daily-notes-interface';
import {diaryTemplate} from './diary-sections';
import {dateKey} from './model';
import {confirmDiary} from './diary-confirm';
const moment=obsidianMoment as unknown as typeof momentFunction;
export const dailyTemplatePath='Templates/OneCalendar Daily.md';
export interface DiaryConfig {folder:string;format:string;template:string}
export class DailyNotes {
  config:DiaryConfig={folder:'',format:'YYYY-MM-DD',template:''};
  private pending=new Map<string,Promise<TFile>>();
  private templatePending?:Promise<TFile>;
  private declined=new Set<string>();
  constructor(private app:App,private confirm:(day:string)=>Promise<boolean>=day=>confirmDiary(app,day)){}
  refresh(){
    const settings=getDailyNoteSettings();
    this.config={folder:settings?.folder??'',format:settings?.format||'YYYY-MM-DD',template:settings?.template??''};
  }
  configure(){this.refresh();return Promise.resolve();}
  ensureTemplate(){
    if(this.templatePending)return this.templatePending;
    this.templatePending=this.createTemplate().finally(()=>{this.templatePending=undefined;});return this.templatePending;
  }
  private async createTemplate(){
    const vault=this.app.vault,existing=vault.getAbstractFileByPath(dailyTemplatePath);
    if(existing instanceof TFile)return existing;
    if(existing)throw Error('A folder occupies the daily template path.');
    if(!vault.getAbstractFileByPath('Templates'))await vault.createFolder('Templates');
    const raced=vault.getAbstractFileByPath(dailyTemplatePath);if(raced instanceof TFile)return raced;
    return vault.create(dailyTemplatePath,diaryTemplate);
  }
  path(day:string){this.refresh();return normalizePath([this.config.folder,moment(day,'YYYY-MM-DD',true).format(this.config.format)+'.md'].filter(Boolean).join('/'));}
  date(path:string){
    this.refresh();const prefix=this.config.folder?normalizePath(this.config.folder)+'/':'';
    if(!path.startsWith(prefix)||!path.endsWith('.md'))return;
    const name=path.slice(prefix.length,-3),d=moment(name,this.config.format,true);
    if(d.isValid()&&d.format(this.config.format)===name)return d.format('YYYY-MM-DD');
  }
  async ensure(day:string){
    const pending=this.pending.get(day);if(pending)return pending;
    const work=this.create(day);this.pending.set(day,work);
    try{return await work;}finally{this.pending.delete(day);}
  }
  private async create(day:string){
    if(!moment(day,'YYYY-MM-DD',true).isValid())throw Error('Invalid diary date.');
    const path=this.path(day),configuration=JSON.stringify(this.config),vault=this.app.vault;let file=vault.getAbstractFileByPath(path);
    if(!file){
      if(!appHasDailyNotesPluginLoaded())throw Error('Enable Daily notes in Settings → Core plugins before creating a diary.');
      if(!this.config.template)throw Error('Select Templates/OneCalendar Daily in the Daily notes template setting.');
      const template=this.app.metadataCache.getFirstLinkpathDest(this.config.template,'');
      if(!(template instanceof TFile))throw Error('Daily note template missing. Check Daily notes settings.');
      // Validate before calling the interface, which otherwise falls back to an empty template.
      await vault.read(template);
      if(day!==dateKey()){
        if(this.declined.has(day))throw Error('Diary creation cancelled.');
        if(!await this.confirm(day)){this.declined.add(day);throw Error('Diary creation cancelled.');}
      }
      if(this.path(day)!==path||JSON.stringify(this.config)!==configuration)throw Error('Daily notes settings changed. Please try again.');
      file=vault.getAbstractFileByPath(path);
      if(!file)file=await createDailyNote(moment(day,'YYYY-MM-DD',true))??vault.getAbstractFileByPath(path);
    }
    if(!(file instanceof TFile))throw Error('Unable to open the daily note. Check its folder and template settings.');
    return file;
  }
  async open(day:string){
    this.declined.delete(day);
    const file=await this.ensure(day);await this.app.workspace.getLeaf(false).openFile(file);return file;
  }
}

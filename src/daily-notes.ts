import { App, TFile, moment as obsidianMoment, normalizePath } from 'obsidian';
import type momentFunction from 'moment';
import {diaryTemplate,diarySections,appendDiaryEntry} from './diary-sections';
import {dateKey} from './model';
import {confirmDiary} from './diary-confirm';
const moment=obsidianMoment as unknown as typeof momentFunction;
export interface DiaryConfig {folder:string;format:string;template:string}
export class DailyNotes {
  config:DiaryConfig={folder:'diary',format:'YYYY-MM-DD',template:''};
  private pending=new Map<string,Promise<TFile>>();
  private declined=new Set<string>();
  constructor(private app:App,private confirm:(day:string)=>Promise<boolean>=day=>confirmDiary(app,day)){}
  async configure(folder?:string,format?:string){
    let core:Partial<DiaryConfig>={};
    const path=`${this.app.vault.configDir}/daily-notes.json`;
    if(await this.app.vault.adapter.exists(path))core=JSON.parse(await this.app.vault.adapter.read(path));
    this.config={folder:folder?.trim()||core.folder||'diary',format:format?.trim()||core.format||'YYYY-MM-DD',template:core.template||''};
    if(core.folder===''&&!folder?.trim())this.config.folder='';
  }
  path(day:string){return normalizePath([this.config.folder,moment(day,'YYYY-MM-DD',true).format(this.config.format)+'.md'].filter(Boolean).join('/'));}
  date(path:string){
    const prefix=this.config.folder?normalizePath(this.config.folder)+'/':'';
    if(!path.startsWith(prefix)||!path.endsWith('.md'))return;
    const name=path.slice(prefix.length,-3),d=moment(name,this.config.format,true);
    if(d.isValid()&&d.format(this.config.format)===name)return d.format('YYYY-MM-DD');
  }
  async ensure(day:string){
    const key=this.path(day);const pending=this.pending.get(key);if(pending)return pending;
    const work=this.create(day);this.pending.set(key,work);
    try{return await work;}finally{this.pending.delete(key);}
  }
  private async create(day:string){
    const path=this.path(day),vault=this.app.vault;let file=vault.getAbstractFileByPath(path);
    if(!file){
      if(day!==dateKey()){
        if(this.declined.has(day))throw Error('Diary creation cancelled.');
        if(!await this.confirm(day)){this.declined.add(day);throw Error('Diary creation cancelled.');}
      }
      let body=diaryTemplate.replace('{{date:YYYY-MM-DD}}',day);
      if(this.config.template){const template=vault.getAbstractFileByPath(this.config.template.replace(/\.md$/,'')+'.md');if(!(template instanceof TFile))throw Error('Daily note template missing. Check Daily notes settings.');
        body=(await vault.read(template)).replace(/\{\{date(?::([^}]+))?\}\}/g,(_,format)=>moment(day,'YYYY-MM-DD').format(format||this.config.format)).replace(/\{\{time(?::([^}]+))?\}\}/g,(_,format)=>moment().format(format||'HH:mm')).replace(/\{\{title\}\}/g,path.split('/').pop()!.slice(0,-3));}
      for(const section of ['Tasks','Journal','Ideas'] as const)if(!diarySections(body).some(s=>s.name===section))body=appendDiaryEntry(body,section,'');
      let dir='';for(const part of path.split('/').slice(0,-1)){dir=dir?`${dir}/${part}`:part;if(!vault.getAbstractFileByPath(dir))await vault.createFolder(dir);}
      // Another open request can finish creating the note while the template is read.
      file=vault.getAbstractFileByPath(path)??await vault.create(path,body);
    }
    if(!(file instanceof TFile))throw Error('A folder occupies the diary path.');
    return file;
  }
  async open(day:string){
    this.declined.delete(day);
    const file=await this.ensure(day);await this.app.workspace.getLeaf(false).openFile(file);return file;
  }
}

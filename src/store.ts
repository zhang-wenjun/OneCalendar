import { Entity, Kind, RecordFile, active, dateKey, folders, make, stamp } from './model';
import { patchMarkdown, readMarkdown, writeMarkdown } from './markdown';
import { firstDate, instance, nextDate } from './recurrence';
import { diaryTasks, patchDiary, diaryEntry } from './diary';
import { projectPath, projectRecords, projectText, memoText, patchProject } from './projects';
import { Details } from './details';
import {appendDiaryEntry,diarySections} from './diary-sections';

export interface Files {
  list(): string[];
  read(path:string): Promise<string>;
  create(path:string,content:string): Promise<void>;
  process(path:string,fn:(raw:string)=>string): Promise<void>;
  mkdir(path:string): Promise<void>;
  exists(path:string): boolean;
  rename?(from:string,to:string):Promise<void>;
}
export class Store {
  records = new Map<string, RecordFile>();
  diaries = new Map<string,RecordFile[]>();
  diaryDate:(path:string)=>string|undefined=()=>undefined;
  journal?:{path:(day:string)=>string;ensure:(day:string)=>Promise<unknown>};
  projectFiles=new Map<string,RecordFile[]>();
  migrating=false;
  details?:Details;
  private noteText=new Map<string,string>();
  issues = new Map<string,string>();
  listeners = new Set<()=>void>();
  private tail: Promise<unknown> = Promise.resolve();
  private ticks = false;
  constructor(public files:Files, public root='TaskCalendar') {}
  async init() { await this.details?.reload();const paths=this.files.list().filter(p=>p!==this.details?.path); const present=new Set(paths);for(const path of this.noteText.keys())if(!present.has(path))this.noteText.delete(path);for(const path of this.projectFiles.keys())if(!present.has(path))this.projectFiles.delete(path); for(const path of this.diaries.keys())if(!present.has(path))this.diaries.delete(path);for(const path of this.records.keys())if(!present.has(path))this.records.delete(path);for(const path of this.issues.keys())if(!present.has(path))this.issues.delete(path);for(const path of paths) await this.load(path,false); this.changed(); }
  all(kind?:Kind) { return [...this.records.values(),...[...this.diaries.values()].flat(),...[...this.projectFiles.values()].flat()].filter(r=>!kind||r.data.tc===kind); }
  find(key:string) {
    const found=this.all().filter(r=>r.data.id===key);
    if(found.length>1) throw new Error(`Duplicate ID ${key}; resolve conflicting copies first`);
    return found[0];
  }
  lookup(key:string) {const found=this.all().filter(r=>r.data.id===key);return found.length===1?found[0]:undefined;}
  changed() { if(!this.migrating)for(const fn of this.listeners) fn(); }
  async load(path:string,notify=true) {
    if(!path.endsWith('.md')) return;
    if(path===this.details?.path){try{await this.details.reload();this.issues.delete(path);this.reindex();}catch(e){this.issues.set(path,(e as Error).message);}if(notify)this.changed();return;}
    this.diaries.delete(path);
    this.projectFiles.delete(path);
    try {
      if(!this.files.exists(path)) { this.noteText.delete(path);this.records.delete(path); this.issues.delete(path); }
      else {
        const raw=await this.files.read(path);this.noteText.set(path,raw);this.indexText(path,raw);
      }
    } catch(e) { this.records.delete(path); this.issues.set(path, String((e as Error).message)); }
    if(notify) this.changed();
  }
  private indexText(path:string,raw:string){
        this.diaries.delete(path);this.projectFiles.delete(path);const record=readMarkdown(path,raw);
        if(record) this.records.set(path,record); else this.records.delete(path);
        const day=this.diaryDate(path);if(!record&&day)this.diaries.set(path,diaryTasks(path,raw,day,this.details));
        if(!record&&!day){const projects=projectRecords(path,raw,this.details);if(projects.length)this.projectFiles.set(path,projects);}
        this.issues.delete(path);
  }
  private reindex(){for(const [path,raw]of this.noteText){try{this.indexText(path,raw);}catch(e){this.issues.set(path,(e as Error).message);}}}
  remove(path:string) { this.noteText.delete(path);this.records.delete(path); this.diaries.delete(path); this.projectFiles.delete(path);this.issues.delete(path);if(path===this.details?.path)void this.load(path); this.changed(); }
  serial<T>(fn:()=>Promise<T>):Promise<T> {
    const job=this.tail.then(fn); this.tail=job.catch(()=>{}); return job;
  }
  private async createJournal(data:Entity,body:string,captureDay?:string):Promise<RecordFile>{
    if(data.tc!=='task'&&data.tc!=='idea')await this.details?.save(data);
    let path:string;
    if(data.tc==='task'||data.tc==='idea'){
      // Capture belongs to the creation day; generated repeat instances belong to their occurrence day.
      const day=data.series&&data.occurrence?data.occurrence:captureDay??dateKey(new Date(data.created));
      path=this.journal!.path(day);await this.journal!.ensure(day);await this.details?.save(data);
      await this.files.process(path,raw=>appendDiaryEntry(raw,data.tc==='task'?'Tasks':'Ideas',diaryEntry(data,body,day,'- ',this.details)));
    }else if(data.tc==='project'){
      path=projectPath(data.title);if(this.files.exists(path))throw Error('A project with this name already exists. Use the existing project.');
      await this.files.mkdir(path.slice(0,path.lastIndexOf('/')));await this.files.create(path,projectText(data,body,this.details));
    }else{
      const project=this.find(data.project!);if(!project?.bundle)throw Error('Migrate the project into Projects first.');path=project.path;
      await this.details?.save(project.data);
      const initial=this.memos(project.data.id).find(r=>r.data.id.endsWith('_initial'));if(initial)await this.details?.save(initial.data);
      await this.files.process(path,raw=>{
        const records=projectRecords(path,raw,this.details),p=records[0];if(!p||p.data.id!==data.project)throw Error('Projectidentity changed');
        // Pin a plain project's identity before linking tasks or adding a memo.
        let text=patchProject(raw,p,{},undefined,this.details);const parsed=projectRecords(path,text,this.details),first=parsed.find(r=>r.data.tc==='memo');
        if(first?.data.id.endsWith('_initial')){
          text=raw.slice(0,p.bundle!.headerStart??0)+projectText(p.data,'',this.details)+memoText(data,body,this.details)+memoText(first.data,first.body,this.details);
        }else{const before=parsed.find(r=>r.data.tc==='memo'&&r.data.created<=data.created);const at=before?.bundle!.start??text.length;text=text.slice(0,at)+memoText(data,body,this.details)+text.slice(at);}
        return text;
      });
    }
    await this.load(path);const result=this.find(data.id);if(!result)throw Error('Record not found after saving. Check the diary or project settings.');return result;
  }
  async create(data:Entity,body='',captureDay?:string):Promise<RecordFile> {
    return this.serial(async()=> {
      const found=this.find(data.id); if(found) return found;
      if(this.journal&&['task','idea','project','memo'].includes(data.tc))return this.createJournal(data,body,captureDay);
      const dir=`${this.root}/${folders[data.tc]}`;
      await this.files.mkdir(dir);
      const path=`${dir}/${data.id}.md`;
      if(!this.files.exists(path)) await this.files.create(path,writeMarkdown(data,body));
      await this.load(path);
      const result=this.find(data.id); if(!result) throw new Error('The file already exists with invalid formatting. Nothing was overwritten.');
      return result;
    });
  }
  async migrateLegacy(){
    if(!this.journal||!this.files.rename)return 0;
    return this.serial(async()=>{
      this.migrating=true;let count=0;
      try{
        const order=['project','memo','task','idea'];const legacy=[...this.records.values()].filter(r=>order.includes(r.data.tc)).sort((a,b)=>order.indexOf(a.data.tc)-order.indexOf(b.data.tc));
        for(const old of legacy){
          // A vault.process or sync can change the source after the index was built.
          const current=await this.files.read(old.path);if(current!==old.raw)throw Error(`Source changed before migration: ${old.path}. Rescan and retry`);
          const backup=`${this.root}/LegacyBackup/${old.path}.bak`;if(this.files.exists(backup))throw Error(`Backup already exists; not overwritten: ${backup}`);
          this.records.delete(old.path);
          try{
            let saved=this.find(old.data.id);
            if(!saved){
              const data={...old.data};
              if(data.tc==='project'&&this.files.exists(projectPath(data.title))){data.originalTitle=data.title;data.title=`${data.title} (${data.id})`;}
              saved=await this.createJournal(data,old.body);
            }else if(saved.data.tc!==old.data.tc||saved.body.trim()!==old.body.trim()||saved.data.title!==old.data.title){throw Error(`Migration target differs: ${old.path}. Both copies preserved`);}
            if(saved.data.id!==old.data.id||saved.body.trim()!==old.body.trim())throw Error(`Migration verification failed: ${old.path}`);
            if(await this.files.read(old.path)!==current)throw Error(`Source changed during migration: ${old.path}. Original preserved`);
            await this.files.mkdir(backup.slice(0,backup.lastIndexOf('/')));await this.files.rename!(old.path,backup);this.records.delete(old.path);count++;
          }catch(e){this.records.set(old.path,old);throw e;}
        }
        return count;
      }finally{this.migrating=false;this.changed();}
    });
  }
  async update(key:string,changes:Partial<Entity>,body?:string,expected?:RecordFile) {
    return this.serial(async()=>{
      const rec=this.find(key); if(!rec) throw new Error('Record missing or invalid file format.');
      let savedToken:string|undefined,previous:Partial<Entity>|undefined,written:Partial<Entity>|undefined;
      const processSource=async(fn:(raw:string)=>string)=>{try{await this.files.process(rec.path,fn);}catch(e){if(savedToken)await this.details!.restore(savedToken,previous,written);throw e;}};
      if(this.details&&(rec.diary||rec.bundle)){
        const baseline=expected??rec;for(const k of Object.keys(changes))if(JSON.stringify(rec.data[k])!==JSON.stringify(baseline.data[k]))throw Error('Record changed. Reopen it before saving.');
        const source=await this.files.read(rec.path);if(rec.diary)patchDiary(source,baseline,changes,body,this.details);else patchProject(source,baseline,changes,body,this.details);
        previous=this.details.rows.get(this.details.tokens.get(key)!);savedToken=await this.details.save({...rec.data,...changes,updated:stamp()});written=this.details.rows.get(savedToken);
      }
      if(rec.diary){await processSource(raw=>patchDiary(raw,expected??rec,changes,body,this.details));await this.load(rec.path);return this.find(key)!;}
      if(rec.bundle){
        if(rec.data.tc==='project'&&changes.title&&changes.title!==rec.data.title){
          if(!this.files.rename)throw Error('The current file adapter does not support renaming.');
          const next=projectPath(changes.title),folder=next.slice(0,next.lastIndexOf('/')),oldFolder=rec.path.slice(0,rec.path.lastIndexOf('/'));
          if(this.files.exists(folder)||this.files.exists(next))throw Error('Destination project folder already exists. Nothing was overwritten.');
          await processSource(raw=>patchProject(raw,expected??rec,changes,body,this.details));
          await this.files.rename(oldFolder,folder);await this.files.rename(`${folder}/${rec.path.split('/').pop()}`,next);await this.init();return this.find(key)!;
        }
        await processSource(raw=>patchProject(raw,expected??rec,changes,body,this.details));await this.load(rec.path);return this.find(key)!;
      }
      await this.files.process(rec.path,raw=>{
        const current=readMarkdown(rec.path,raw); if(!current) throw new Error('Record format changed');
        const baseline=expected ?? rec;
        for(const k of Object.keys(changes)) {
          if(JSON.stringify(current.data[k])!==JSON.stringify(baseline.data[k])) throw new Error('This record changed elsewhere. Reopen it before saving. Nothing was overwritten.');
        }
        if(body!==undefined && current.body!==baseline.body) throw new Error('The body changed. Reopen it to merge your edits.');
        return patchMarkdown(raw,{...changes, updated:stamp(), revision:(Number(current.data.revision)||0)+1},body);
      });
      await this.load(rec.path);
      return this.find(key)!;
    });
  }
  async migrateReadable(){
    if(!this.details)return 0;
    return this.serial(async()=>{
      const paths=new Set(this.all().filter(r=>(r.diary||r.bundle)&&r.raw.includes('<!-- task-calendar')).map(r=>r.path));let count=0;
      for(const path of paths){
        const raw=await this.files.read(path),records=this.all().filter(r=>r.path===path&&(r.diary||r.bundle));
        const indexed=this.noteText.get(path);if(raw!==indexed)throw Error('Note changed before migration. Rescan first.');
        const backup=`${this.root}/MetadataBackups/${path}.bak`;await this.files.mkdir(backup.slice(0,backup.lastIndexOf('/')));if(!this.files.exists(backup))await this.files.create(backup,raw);
        const positions=new Set<number>();
        for(const r of records){await this.details!.save(r.data);const offset=r.diary?undefined:r.data.tc==='project'?r.bundle!.headerStart??0:r.bundle!.start;positions.add(r.diary?r.diary.line:raw.slice(0,offset).split('\n').length-1);}
        await this.files.process(path,current=>{if(current!==raw)throw Error('Note changed during migration. Nothing was overwritten.');return current.split('\n').map((line,i)=>positions.has(i)?this.details!.compact(line):line).join('\n');});
        await this.load(path);count++;
      }return count;
    });
  }
  async migrateDiarySections(){
    return this.serial(async()=>{await this.details?.reload();let count=0;
      for(const path of this.files.list()){
        const day=this.diaryDate(path);if(!day)continue;const raw=await this.files.read(path);
        if(diarySections(raw).some(s=>s.name==='Tasks'||s.name==='Ideas'))continue;
        const records=diaryTasks(path,raw,day,this.details,true).filter(r=>/🆔〔|<!--\s*task-calendar:/.test(r.raw));if(!records.length)continue;
        const backup=`${this.root}/SectionBackups/${path}.bak`;await this.files.mkdir(backup.slice(0,backup.lastIndexOf('/')));if(!this.files.exists(backup))await this.files.create(backup,raw);
        const lines=raw.split(/(?<=\n)/);for(const r of [...records].reverse())lines.splice(r.diary!.line,r.diary!.endLine!-r.diary!.line);
        let next=lines.join('').replace(/^## (?:今日记录|今日待办|随记)\s*$/gm,'## Journal');
        if(!diarySections(next).some(s=>s.name==='Journal'))next=appendDiaryEntry(next,'Journal','');
        for(const r of records){await this.details?.save(r.data);next=appendDiaryEntry(next,r.data.tc==='task'?'Tasks':'Ideas',diaryEntry(r.data,r.body,day,'- ',this.details));}
        for(const section of ['Tasks','Ideas'] as const)if(!diarySections(next).some(s=>s.name===section))next=appendDiaryEntry(next,section,'');
        await this.files.process(path,current=>{if(current!==raw)throw Error('Diary changed during migration; original preserved.');return next;});count++;
      }return count;
    });
  }
  async convertIdea(key:string) {
    const idea=this.find(key); if(!idea) throw new Error('Ideanot found');
    const task=await this.create(make('task',idea.data.title,{id:`from_${key}`,status:'todo',projects:idea.data.projects ?? [],source:key}),idea.body);
    await this.update(key,{status:'processed',task:task.data.id});
    return task;
  }
  async memo(project:string,body:string) {
    if(!body.trim()) throw new Error('Memocannot be empty');
    const previous=this.memos(project)[0];const created=new Date(Math.max(Date.now(),previous?Date.parse(previous.data.created)+1:0)).toISOString();
    return this.create(make('memo',body.trim().split('\n')[0].slice(0,80),{project,created}),body);
  }
  memos(project:string) {
    return this.all('memo').filter(r=>r.data.project===project).sort((a,b)=>b.data.created.localeCompare(a.data.created)||b.data.id.localeCompare(a.data.id));
  }
  async setStatus(key:string,status:string,today=dateKey()) {
    const r=await this.update(key,{status,completed:['done','skipped'].includes(status)?stamp():undefined});
    await this.afterStatus(r,today);
  }
  async afterStatus(r:RecordFile,today=dateKey()) {
    const status=r.data.status;
    if(r.data.series && ['done','skipped'].includes(status!)) {
      const s=this.find(r.data.series);
      if(s?.data.rule==='after' && !s.data.ended && !s.data.paused) {
        await this.create(instance(s.data,nextDate(s.data,r.data.occurrence!,today),Number(r.data.sequence??0)+1),s.body);
      }
    }
    await this.tick(today);
  }
  async createSeries(data:Partial<Entity>,body='') {
    const s=make('series',data.title ?? '',{interval:1,occurrence:dateKey(),...data});
    s.next=firstDate(s,s.occurrence!);
    const record=await this.create(s,body); await this.tick(); return record;
  }
  async editSeries(r:RecordFile,fields:Partial<Entity>,body:string) {
    const candidate={...r.data,...fields};
    if(candidate.occurrence!<dateKey())throw new Error('The effective date cannot precede today. Past records are preserved.');
    fields.next=firstDate(candidate,candidate.occurrence!);
    await this.update(r.data.id,fields,body,r);
    for(const t of this.all('task').filter(t=>t.data.series===r.data.id&&t.data.status==='todo'&&t.data.plan!>dateKey()))await this.update(t.data.id,{status:'cancelled',superseded:true});
    await this.tick();
  }
  async ensureInstance(s:Entity,day:string,body:string) {
    const data=instance(s,day);const existing=this.find(data.id);
    if(existing?.data.superseded)await this.update(existing.data.id,{title:data.title,projects:data.projects,status:'todo',superseded:undefined,plan:data.plan,due:data.due,remind:data.remind},body);
    else await this.create(data,body);
  }
  async tick(today=dateKey()) {
    if(this.ticks||this.migrating) return; this.ticks=true;
    try {
      for(const r of this.all('series')) {
        const s=r.data; if(s.paused||s.ended) continue;
        const tasks=this.all('task').filter(t=>t.data.series===s.id).sort((a,b)=>s.rule==='after'?Number(b.data.sequence??0)-Number(a.data.sequence??0):(b.data.occurrence ?? '').localeCompare(a.data.occurrence ?? ''));
        if(s.rule==='after') {
          if(!tasks.length) await this.create(instance(s, s.next ?? firstDate(s,s.occurrence!),0),r.body);
          else if(!tasks.some(t=>active(t.data))) {
            const last=tasks[0].data;
            if(last.superseded)await this.create(instance(s,s.next!,Number(last.sequence??0)+1),r.body);
            else if(['done','skipped'].includes(last.status!)) {
              // A Markdown edit can change status without supplying a completion time.
              const completed=last.completed ?? stamp();
              if(!last.completed)await this.update(last.id,{completed});
              await this.create(instance(s,nextDate(s,last.occurrence!,dateKey(new Date(completed))),Number(last.sequence??0)+1),r.body);
            }
          }
          continue;
        }
        let day=s.next ?? firstDate(s,s.occurrence!); let count=0;
        // Persist the cursor in bounded batches, so long absences never freeze the app.
        while(count++<90) {
          await this.ensureInstance(s,day,r.body);
          if(day>today) break;
          day=nextDate(s,day);
        }
        if(day!==s.next) await this.update(s.id,{next:day});
      }
    } finally {this.ticks=false;}
  }
  problems() {
    const items=[...this.issues.entries()].map(([path,error])=>({path,error}));
    const ids=new Map<string,string[]>();
    for(const r of this.all()) ids.set(r.data.id,[...(ids.get(r.data.id)||[]),r.path]);
    for(const paths of ids.values()) if(paths.length>1) for(const path of paths) items.push({path,error:'Duplicate ID: all copies were preserved. Compare them to resolve the conflict.'});
    for(const r of this.all()) for(const project of r.data.projects ?? []) if(!ids.has(project)) items.push({path:r.path,error:`Linked project missing: ${project}`});
    return items;
  }
}

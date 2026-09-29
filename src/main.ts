import {renamedPluginData} from './legacy-settings';
import {DiaryCalendar,DIARY_VIEW} from './diary-calendar';
import { Platform, Plugin, TFile, TFolder, Notice, PluginSettingTab, Setting, App, requestUrl, normalizePath } from 'obsidian';
import { Store, Files } from './store';
import { Editor, button } from './forms';
import { CalendarView, VIEW } from './view';
import { ExternalEvent, Feishu, Reminders } from './calendar';
import { dateKey, addDays } from './model';
import { runJournalQA, runRevisionQA } from './qa';
import { DailyNotes } from './daily-notes';
import { Details } from './details';
import {renderCalDavSettings} from './caldav-settings';
import {CalDav,basicAuth,calendarUrl,DavCalendar} from './caldav';
import {diaryShortcut} from './diary-shortcuts';
import {CalendarSource,calendarColors,safeColor,refreshMinutes} from './calendar-sources';

interface Settings {caldavSources?:CalendarSource[];refreshMinutes?:number;calendarProvider?:'feishu'|'caldav';caldavUrl?:string;caldavUsername?:string;caldavSecretName?:string;caldavCalendarUrl?:string;caldavCalendars?:DavCalendar[];diarySectionsVersion?:number;root:string; calendarIds:string; reminderCalendar:string; readEnabled:boolean; writeEnabled:boolean; secretName:string;diaryFolder?:string;diaryFormat?:string}
const defaults:Settings={calendarProvider:'feishu',root:'TaskCalendar',calendarIds:'',reminderCalendar:'',readEnabled:false,writeEnabled:false,secretName:'task-calendar-feishu-user-token'};
export default class OneCalendar extends Plugin {
  store!:Store; reminders!:Reminders; settings=defaults; externalEvents:ExternalEvent[]=[];
  diary!:DailyNotes;
  sourcePasswords=new Map<string,string>();private lastRefreshAttempt=0;
  refreshDue(now=Date.now()){return now-this.lastRefreshAttempt>=refreshMinutes(this.settings.refreshMinutes)*60000;}
  calendarStatus='No calendar connected. Local features work offline.'; sessionToken=''; sessionCalDavPassword=''; caldavStatus='Enter your server, username and app password, then connect.'; private savedAt=''; private syncing=false; private timer?:number; private disposed=false; private ready=false;
  async onload(){
    const current=await this.loadData();const imported=await renamedPluginData(current,this.app.vault.adapter,this.app.vault.configDir);
    if(current==null&&imported)await this.saveData(imported);
    const data=imported??{};this.settings={...defaults,...data.settings};this.externalEvents=data.externalEvents ?? [];this.savedAt=data.savedAt ?? '';
    if(this.settings.caldavSources===undefined&&this.settings.caldavCalendarUrl){const s=this.currentSource();this.settings.caldavSources=[s];this.externalEvents=this.externalEvents.map(e=>e.provider==='caldav'&&e.calendarId===s.url?{...e,sourceId:s.id,calendarName:s.name,color:s.color}:e);}
    if(this.savedAt)this.calendarStatus=`Cache updated: ${new Date(this.savedAt).toLocaleString('en-US')}`;
    const vault=this.app.vault;
    const files:Files={list:()=>vault.getMarkdownFiles().map(f=>f.path),exists:p=>!!vault.getAbstractFileByPath(p),read:async p=>vault.read(this.file(p)),
      create:async(p,c)=>{await vault.create(p,c);},process:async(p,fn)=>{await vault.process(this.file(p),fn);},rename:async(from,to)=>{const f=vault.getAbstractFileByPath(from);if(!f)throw Error('Original file missing');await this.app.fileManager.renameFile(f,to);},
      mkdir:async p=>{let current='';for(const part of normalizePath(p).split('/')){current=current?`${current}/${part}`:part;if(!vault.getAbstractFileByPath(current))await vault.createFolder(current);}}};
    this.store=new Store(files,this.settings.root);this.reminders=new Reminders(this.store);
    this.store.details=new Details(files,`${this.settings.root}/Details.md`);
    this.diary=new DailyNotes(this.app);await this.diary.configure(this.settings.diaryFolder,this.settings.diaryFormat);this.store.diaryDate=p=>this.diary.date(p);
    this.store.journal={path:day=>this.diary.path(day),ensure:day=>this.diary.ensure(day)};
    this.registerView(DIARY_VIEW,leaf=>new DiaryCalendar(leaf,this));
    this.addCommand({id:'open-diary-calendar',name:'Open diary calendar',callback:()=>void this.openDiaryCalendar()});
    if(!Platform.isMobile)this.app.workspace.onLayoutReady(()=>void this.openDiaryCalendar(false));
    this.registerView(VIEW,leaf=>new CalendarView(leaf,this));this.addRibbonIcon('calendar-check','Open OneCalendar',()=>void this.open());
    this.addRibbonIcon('lightbulb','New idea',()=>this.requestIdeaCapture());
    this.addCommand({id:'open',name:'Open dashboard',callback:()=>void this.open()});
    this.addCommand({id:'open-diary',name:'Open today journal',callback:()=>void this.run(()=>this.openDiary(dateKey()))});
    for(const [kind,key]of [['task','t'],['idea','i']] as const)this.addCommand({id:`diary-${kind}`,name:`Edit or create ${kind} in diary`,hotkeys:[{modifiers:['Alt'],key}],editorCallback:(editor,view)=>{
      const file=view.file,path=file?.path,day=path&&this.diary.date(path);if(!file||!path||!day){new Notice('Open a daily note first.');return;}
      void this.run(async()=>{if(!this.ready)throw Error('The diary index is not ready yet.');const raw=editor.getValue(),action=diaryShortcut(kind,path,raw,day,editor.getCursor().line,this.store.details);await this.app.vault.modify(file,raw);await this.store.load(path);
        const current=action.record?this.store.find(action.record.data.id):undefined;if(action.record&&!current)throw Error('Record changed; try again.');new Editor(this.app,this.store,kind,current,kind==='task'?{plan:day}:{},day).open();
      });
    }});
    this.registerObsidianProtocolHandler('one-calendar-idea',()=>this.requestIdeaCapture());
    this.registerObsidianProtocolHandler('task-calendar-idea',()=>this.requestIdeaCapture());
    this.addCommand({id:'copy-idea-link',name:'Copy Ideas shortcut link',callback:()=>void this.run(async()=>{await navigator.clipboard.writeText(this.ideaCaptureLink());new Notice('Ideas shortcut link copied.');})});
    this.addCommand({id:'capture-idea',name:'Capture an idea',icon:'lightbulb',callback:()=>this.capture('idea')});
    this.addCommand({id:'capture-task',name:'Capture a task',icon:'check-square',callback:()=>this.capture('task')});
    this.addCommand({id:'create-event',name:'New event',callback:()=>new Editor(this.app,this.store,'event').open()});
    this.addCommand({id:'sync-calendar',name:'Sync calendars and reminders',callback:()=>void this.run(async()=>{if(this.settings.readEnabled)await this.syncCalendar();await this.syncReminders(true);})});
    this.addSettingTab(new CalendarSettings(this.app,this));
    if(this.app.vault.getName()==='AITestBed')this.addCommand({id:'local-acceptance',name:'Test journal storage (AITestBed only)',callback:()=>void this.run(()=>runJournalQA(this))});
    this.addCommand({id:'migrate-journal',name:'Rescan and migrate legacy records',callback:()=>void this.run(async()=>{await this.prepareDetails();await this.store.migrateDiarySections();await this.store.init();const count=await this.store.migrateLegacy();await this.store.migrateReadable();new Notice(`Migrated ${count} legacy records. Original files are backed up.`);})});
    if(this.app.vault.getName()==='AITestBed')this.addCommand({id:'revision-acceptance',name:'Test week view and diary (AITestBed only)',callback:()=>void this.run(()=>runRevisionQA(this))});
    this.registerEvent(vault.on('create',f=>{if(f instanceof TFile)void this.changed(f.path);}));
    this.registerEvent(vault.on('modify',f=>{if(f instanceof TFile)void this.changed(f.path);}));
    this.registerEvent(vault.on('delete',f=>{if(f instanceof TFile)this.store.remove(f.path);else if(f instanceof TFolder)for(const path of [...this.store.records.keys(),...this.store.diaries.keys(),...this.store.projectFiles.keys()])if(path.startsWith(f.path+'/'))this.store.remove(path);this.schedule();}));
    this.registerEvent(vault.on('rename',(f,old)=>{this.store.remove(old);if(f instanceof TFile)void this.changed(f.path);else void this.run(()=>this.store.init());}));
    this.app.workspace.onLayoutReady(()=>void this.run(async()=>{await this.prepareDetails();if(this.settings.diarySectionsVersion!==1){await this.store.migrateDiarySections();this.settings.diarySectionsVersion=1;await this.saveSettings();}await this.store.init();const migrated=await this.store.migrateLegacy();if(migrated)new Notice(`Migrated ${migrated} records into daily notes and Projects. Originals are in LegacyBackup.`);await this.store.migrateReadable();this.ready=true;this.flushIdeaCapture();await this.store.tick();await this.syncReminders();if(this.settings.readEnabled&&this.hasCredentials())await this.syncCalendar();}));
    this.registerInterval(window.setInterval(()=>void this.run(async()=>{if(!this.ready)return;await this.store.tick();await this.syncReminders();}),60000));
    this.registerInterval(window.setInterval(()=>{if(this.ready&&this.settings.readEnabled&&this.hasCredentials()&&this.refreshDue())void this.run(()=>this.syncCalendar());},30000));
    if(typeof document!=='undefined')this.registerDomEvent(document,'visibilitychange',()=>{if(document.visibilityState==='visible')void this.run(()=>this.resume());});
  }
  private pendingIdea=false;
  ideaCaptureLink(){return `obsidian://one-calendar-idea?vault=${encodeURIComponent(this.app.vault.getName())}`;}
  requestIdeaCapture(){if(this.disposed)return;this.pendingIdea=true;this.flushIdeaCapture();}
  flushIdeaCapture(){if(!this.ready||this.disposed||!this.pendingIdea)return;this.pendingIdea=false;this.capture('idea');}
  capture(kind:'task'|'idea'){
    if(!this.ready){new Notice('The diary index is not ready yet. Try again in a moment.');return;}
    new Editor(this.app,this.store,kind).open();
  }
  private resuming=false;
  async resume(){
    if(!this.ready||this.disposed||this.resuming)return;
    this.resuming=true;
    try{await this.store.tick();await this.syncReminders();if(this.settings.readEnabled&&this.hasCredentials()&&this.refreshDue())await this.syncCalendar();}
    finally{this.resuming=false;this.store.changed();}
  }
  file(path:string){const f=this.app.vault.getAbstractFileByPath(path);if(!(f instanceof TFile))throw new Error(`File missing: ${path}`);return f;}
  async prepareDetails(){
    const files=this.store.files,oldPath=`${this.settings.root}/\u5173\u8054\u4fe1\u606f.md`,next=this.store.details!.path;
    if(files.exists(oldPath)){if(files.exists(next))throw Error('Both legacy and current Details files exist. Resolve the sync conflict before migrating.');await files.rename!(oldPath,next);}
  }
  async changed(path:string){await this.store.load(path);const kind=this.store.records.get(path)?.data.tc;if(kind==='task'||kind==='series'||this.diary.date(path)||path===this.store.details?.path)this.schedule();}
  async openDiaryCalendar(reveal=true){
    let leaf=this.app.workspace.getLeavesOfType(DIARY_VIEW)[0];
    if(!leaf){const right=this.app.workspace.getRightLeaf(false);if(!right)return;leaf=right;await leaf.setViewState({type:DIARY_VIEW,active:reveal});}
    if(reveal)await this.app.workspace.revealLeaf(leaf);
  }
  async openDiary(day:string){await this.diary.configure(this.settings.diaryFolder,this.settings.diaryFormat);await this.store.init();return this.diary.open(day);}
  schedule(){if(this.timer)window.clearTimeout(this.timer);if(this.ready&&!this.disposed&&!this.store.migrating)this.timer=window.setTimeout(()=>void this.run(()=>this.syncReminders()),1500);}
  async run(fn:()=>Promise<unknown>){try{await fn();}catch(e){if((e as Error).message==='Diary creation cancelled.')return;new Notice(`OneCalendar: ${(e as Error).message}`,8000);}}
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);}
  token(){return this.sessionToken||this.app.secretStorage?.getSecret(this.settings.secretName)||'';}
  hasCredentials(){return this.settings.calendarProvider==='caldav'?(this.settings.caldavSources?.length?this.settings.caldavSources.some(s=>s.enabled&&!!this.sourcePassword(s)):!!this.calDavPassword()&&!!this.settings.caldavCalendarUrl):!!this.token();}
  currentSource():CalendarSource{const url=calendarUrl(this.settings.caldavCalendarUrl??'');const c=this.settings.caldavCalendars?.find(c=>calendarUrl(c.url)===url);return {id:crypto.randomUUID(),name:c?.name||'Calendar',url,server:this.settings.caldavUrl??url,username:this.settings.caldavUsername??'',secretName:this.settings.caldavSecretName??'task-calendar-caldav-password',color:calendarColors[(this.settings.caldavSources?.length??0)%calendarColors.length],enabled:true,readOnly:c?.readOnly};}
  sourcePassword(s:CalendarSource){return (s.secretName===(this.settings.caldavSecretName??'task-calendar-caldav-password')?this.sessionCalDavPassword:'')||this.sourcePasswords.get(s.secretName)||this.app.secretStorage?.getSecret(s.secretName)||'';}
  async addCurrentCalendar(){
    const s=this.currentSource(),list=this.settings.caldavSources??[];const old=list.find(c=>c.url===s.url&&c.username===s.username);
    if(old)Object.assign(s,{id:old.id,name:old.name,color:old.color,enabled:old.enabled});
    const password=this.calDavPassword();if(!password)throw Error('Connect with a password first.');this.sourcePasswords.set(s.secretName,password);
    this.settings.caldavSources=[...list.filter(c=>c.id!==s.id),s];await this.saveSettings();this.store.changed();
  }
  async updateCalendarSource(id:string,patch:Partial<Pick<CalendarSource,'name'|'color'|'enabled'>>){const source=this.settings.caldavSources?.find(s=>s.id===id);if(!source)return;Object.assign(source,patch);source.color=safeColor(source.color);if(!source.enabled)this.externalEvents=this.externalEvents.filter(e=>e.sourceId!==id);await this.saveSettings();this.store.changed();}
  async removeCalendarSource(id:string){this.settings.caldavSources=this.settings.caldavSources?.filter(s=>s.id!==id);this.externalEvents=this.externalEvents.filter(e=>e.sourceId!==id);await this.saveSettings();this.store.changed();}
  async editCalendarSource(id:string){const s=this.settings.caldavSources?.find(s=>s.id===id);if(!s)return;Object.assign(this.settings,{caldavUrl:s.server,caldavUsername:s.username,caldavSecretName:s.secretName,caldavCalendarUrl:s.url,caldavCalendars:[{url:s.url,name:s.name,readOnly:s.readOnly}]});this.sessionCalDavPassword=this.sourcePassword(s);await this.saveSettings();}
  async newCalendarConnection(){Object.assign(this.settings,{caldavUrl:'',caldavUsername:'',caldavCalendarUrl:undefined,caldavCalendars:[],caldavSecretName:'task-calendar-caldav-'+crypto.randomUUID()});this.sessionCalDavPassword='';await this.saveSettings();}
  calDavPassword(){return this.sessionCalDavPassword||this.app.secretStorage?.getSecret(this.settings.caldavSecretName??'task-calendar-caldav-password')||'';}
  async changeCalDavConnection(field:'caldavUrl'|'caldavUsername',value:string){
    if(this.settings[field]===value)return;
    this.settings[field]=value;this.settings.caldavCalendarUrl=undefined;this.settings.caldavCalendars=[];this.sessionCalDavPassword='';
    this.settings.caldavSecretName='task-calendar-caldav-'+crypto.randomUUID();
    this.clearCalendarCache();await this.saveSettings();
  }
  clearCalendarCache(){this.externalEvents=this.externalEvents.filter(e=>e.sourceId&&this.settings.caldavSources?.some(s=>s.id===e.sourceId&&s.enabled));this.savedAt='';this.calendarStatus='Connection changed. Enter credentials and refresh events.';this.store.changed();}
  calDavTarget(){return this.settings.caldavCalendarUrl||this.settings.caldavUrl||'';}
  async discoverCalDav(){
    const connection=JSON.stringify([this.settings.caldavUrl,this.settings.caldavUsername,this.settings.caldavCalendarUrl]);
    const calendars=await this.calDav(this.settings.caldavUrl).discover();
    if(connection!==JSON.stringify([this.settings.caldavUrl,this.settings.caldavUsername,this.settings.caldavCalendarUrl]))throw Error('Connection changed. Connect again.');
    this.settings.caldavCalendars=calendars;
    if(!calendars.some(c=>c.url===this.settings.caldavCalendarUrl))this.settings.caldavCalendarUrl=calendars.length===1?calendars[0].url:undefined;
    this.clearCalendarCache();await this.saveSettings();return calendars;
  }
  async selectCalDav(url:string){
    if(!this.settings.caldavCalendars?.some(c=>c.url===url))throw Error('Select a discovered calendar first.');
    this.settings.caldavCalendarUrl=url;this.clearCalendarCache();await this.saveSettings();
  }
  async pullCalDav(){
    if(!this.settings.caldavCalendarUrl&&!this.settings.caldavSources?.length)throw Error('Connect and select a calendar before pulling events.');
    await this.syncCalendar(true);
    return this.calendarStatus;
  }
  calDav(url=this.calDavTarget(),username=this.settings.caldavUsername??'',password=this.calDavPassword()){
    const authorization=basicAuth(username,password);
    return new CalDav(url??'',async(method,url,headers,body)=>{
      const r=await requestUrl({url,method,headers:{...headers,Authorization:authorization},body,throw:false});
      return {status:r.status,text:r.text,headers:r.headers};
    });
  }
  provider(){
    if(this.settings.calendarProvider==='caldav')return this.calDavPassword()?this.calDav():undefined;
    if(!this.token())return undefined;
    return new Feishu(async(method,path,body)=>{
      const result=await requestUrl({url:`https://open.feishu.cn/open-apis${path}`,method,headers:{Authorization:`Bearer ${this.token()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,throw:false});
      if(result.status===401||result.json?.code===99991663||result.json?.code===99991668)throw new Error('Feishu authorization expired. Renew your access token.');
      if(result.status<200||result.status>=300||result.json?.code!==0)throw new Error(`Feishu request failed (HTTP ${result.status}, code ${result.json?.code ?? 'Unknown'}). Check permissions and calendar settings.`);
      return result.json.data ?? {};
    });
  }
  async saveSettings(){await this.saveData({settings:this.settings,externalEvents:this.externalEvents,savedAt:this.savedAt});}
  async syncReminders(force=false){if(!this.ready)return;if(this.settings.calendarProvider==='caldav'&&!this.settings.caldavCalendarUrl)return;if(this.settings.calendarProvider==='caldav'&&this.settings.caldavCalendars?.find(c=>c.url===this.settings.caldavCalendarUrl)?.readOnly){if(force)throw Error('Selected CalDAV calendar is read only.');return;}await this.reminders.sync(this.settings.writeEnabled?this.provider():undefined,this.settings.calendarProvider==='caldav'&&this.calDavTarget()?calendarUrl(this.calDavTarget()):this.settings.reminderCalendar,force,this.settings.calendarProvider??'feishu');}
  async syncCalendar(manual=false){
    if(this.syncing){if(manual)throw Error('A calendar refresh is already running. Try again when it finishes.');return;}
    if(!manual&&!this.settings.readEnabled){new Notice('Enable calendar read access in plugin settings first.');return;}
    this.lastRefreshAttempt=Date.now();
    if(this.settings.calendarProvider==='caldav'&&this.settings.caldavSources!==undefined)return this.syncCalendarSources();
    if(this.settings.calendarProvider==='caldav'&&!this.settings.caldavCalendarUrl)throw Error('Connect and select a CalDAV calendar in settings first.');
    const provider=this.provider();if(!provider)throw new Error('No calendar credentials. Cached events are still available.');
    const connection=JSON.stringify([this.settings.calendarProvider,this.settings.calendarIds,this.settings.caldavUrl,this.settings.caldavUsername,this.settings.caldavCalendarUrl]);
    const providerName=this.settings.calendarProvider??'feishu';
    const ids=this.settings.calendarProvider==='caldav'?[calendarUrl(this.calDavTarget())]:this.settings.calendarIds.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);if(!ids.length)throw new Error('Configure the calendar connection first.');
    this.syncing=true;
    try{
      const events:ExternalEvent[]=[];
      for(const id of ids)events.push(...await provider.list(id,new Date(`${addDays(dateKey(),-90)}T00:00:00`),new Date(`${addDays(dateKey(),180)}T00:00:00`)));
      if(connection!==JSON.stringify([this.settings.calendarProvider,this.settings.calendarIds,this.settings.caldavUrl,this.settings.caldavUsername,this.settings.caldavCalendarUrl])||this.disposed)return;
      const own=new Set(this.store.all('reminder').filter(r=>r.data.externalId&&(r.data.provider??'feishu')===(this.settings.calendarProvider??'feishu')).map(r=>`${r.data.calendarId}/${r.data.externalId}`));
      this.externalEvents=events.filter(e=>!own.has(`${e.calendarId}/${e.id}`));this.savedAt=new Date().toISOString();
      this.calendarStatus=`${providerName==='caldav'?'CalDAV':'Feishu'} refreshed: ${new Date(this.savedAt).toLocaleString('en-US')} · ${this.externalEvents.length} events · Past 90 days through next 180 days`;
      await this.saveSettings();
    }catch(e){if(connection!==JSON.stringify([this.settings.calendarProvider,this.settings.calendarIds,this.settings.caldavUrl,this.settings.caldavUsername,this.settings.caldavCalendarUrl]))return;this.calendarStatus=`Refresh failed; cache preserved. ${(e as Error).message} · Last success: ${this.savedAt?new Date(this.savedAt).toLocaleString('en-US'):'Never'}`;throw e;}
    finally{this.syncing=false;this.store.changed();}
  }
  async syncCalendarSources(){
    const sources=(this.settings.caldavSources??[]).filter(s=>s.enabled).map(s=>({...s}));if(!sources.length)throw Error('Add and enable a calendar in settings first.');
    const snapshot=JSON.stringify([this.settings.calendarProvider,this.settings.caldavSources]);this.syncing=true;
    const events:ExternalEvent[]=[],errors:string[]=[];let succeeded=0;
    try{
      for(const s of sources){try{
        const data=await this.calDav(s.url,s.username,this.sourcePassword(s)).list(s.url,new Date(`${addDays(dateKey(),-90)}T00:00:00`),new Date(`${addDays(dateKey(),180)}T00:00:00`));
        events.push(...data.map(e=>({...e,sourceId:s.id,calendarName:s.name,color:s.color})));succeeded++;
      }catch(e){errors.push(`${s.name}: ${(e as Error).message}`);events.push(...this.externalEvents.filter(e=>e.sourceId===s.id));}}
      if(this.disposed||snapshot!==JSON.stringify([this.settings.calendarProvider,this.settings.caldavSources]))return;
      if(!succeeded)throw Error(errors.join('\n'));
      const own=new Set(this.store.all('reminder').filter(r=>r.data.provider==='caldav'&&r.data.externalId).map(r=>`${r.data.calendarId}/${r.data.externalId}`));
      this.externalEvents=events.filter(e=>!own.has(`${e.calendarId}/${e.id}`));this.savedAt=new Date().toISOString();
      this.calendarStatus=`Refreshed ${succeeded}/${sources.length} calendars · ${events.length} events · ${new Date().toLocaleString('en-US')}${errors.length?'\nFailed calendars kept their cache:\n'+errors.join('\n'):''}`;await this.saveSettings();
    }catch(e){this.calendarStatus=`Refresh failed; cache preserved. ${(e as Error).message}`;throw e;}finally{this.syncing=false;this.store.changed();}
  }
  onunload(){this.disposed=true;if(this.timer)window.clearTimeout(this.timer);this.sessionToken='';this.sessionCalDavPassword='';this.sourcePasswords.clear();}
}
class CalendarSettings extends PluginSettingTab {
  constructor(app:App,public plugin:OneCalendar){super(app,plugin);}
  display(){
    const el=this.containerEl;el.empty();el.addClass('tc-settings');el.createEl('h2',{text:`OneCalendar ${this.plugin.manifest.version}`});
    el.createEl('p',{text:'Tasks and ideas live in daily notes. Project memos live in Projects/<name>/<name>-Memo.md. Sync diary, Projects and TaskCalendar together. Calendar write access depends on the service. Android notification delivery has not been device-tested.'});
    el.createEl('h3',{text:'Diary'});
    el.createEl('p',{text:'Uses the Daily notes folder, date format and template, or diary/YYYY-MM-DD.md by default. Only checkboxes under Tasks and bullets under Ideas are indexed. Journal stays private to your writing.'});
    new Setting(el).setName('Override diary folder').setDesc('Leave blank to use Daily notes settings, e.g. diary.').addText(c=>c.setValue(this.plugin.settings.diaryFolder??'').onChange(v=>{this.plugin.settings.diaryFolder=v;}));
    new Setting(el).setName('Override diary date format').setDesc('Leave blank to use Daily notes settings, e.g. YYYY/MM/YYYY-MM-DD.').addText(c=>c.setValue(this.plugin.settings.diaryFormat??'').onChange(v=>{this.plugin.settings.diaryFormat=v;}));
    button(el,'Apply diary settings and rescan',async()=>{await this.plugin.diary.configure(this.plugin.settings.diaryFolder,this.plugin.settings.diaryFormat);await this.plugin.saveSettings();await this.plugin.store.init();new Notice('Diary index updated');});
    el.createEl('h3',{text:'Third-party calendars'});
    new Setting(el).setName('Calendar provider').setDesc('Read external events and write task reminders. Existing reminders stay with their original provider.').addDropdown(c=>c.addOptions({feishu:'Feishu',caldav:'CalDAV'}).setValue(this.plugin.settings.calendarProvider??'feishu').onChange(async v=>{this.plugin.settings.calendarProvider=v as 'feishu'|'caldav';this.plugin.clearCalendarCache();await this.plugin.saveSettings();this.plugin.store.changed();this.display();}));
    if(this.plugin.settings.calendarProvider==='caldav')renderCalDavSettings(el,this.plugin);
    new Setting(el).setName('Read external calendar events').setDesc('Periodically fetch events without editing existing external events.').addToggle(c=>c.setValue(this.plugin.settings.readEnabled).onChange(async v=>{this.plugin.settings.readEnabled=v;await this.plugin.saveSettings();}));
    const refresh=el.createEl('label',{cls:'tc-field'});refresh.createSpan({text:'Auto-refresh interval (minutes)'});
    const interval=refresh.createEl('input',{type:'number',value:String(refreshMinutes(this.plugin.settings.refreshMinutes)),attr:{min:'1',max:'1440',step:'1','aria-label':'Auto-refresh interval (minutes)'}});
    interval.onchange=()=>{const n=Number(interval.value);if(!Number.isInteger(n)||n<1||n>1440){new Notice('Enter a whole number from 1 to 1440 minutes.');interval.value=String(refreshMinutes(this.plugin.settings.refreshMinutes));return;}this.plugin.settings.refreshMinutes=n;void this.plugin.saveSettings();};
    el.createEl('p',{cls:'tc-muted',text:'Applies while Obsidian is running and automatic reading is enabled. Refresh is checked every 30 seconds. On returning to the app, overdue refreshes run once. Manual refresh works at any time.'});
    if(this.plugin.settings.calendarProvider!=='caldav')new Setting(el).setName('Read calendar IDs').setDesc('Separate calendar IDs with commas. Your account needs read access.').addTextArea(c=>c.setValue(this.plugin.settings.calendarIds).onChange(async v=>{this.plugin.settings.calendarIds=v;await this.plugin.saveSettings();}));
    new Setting(el).setName('Write task reminders to calendar').setDesc('Only manages reminders created by this plugin. Reminders remain pending until configured.').addToggle(c=>c.setValue(this.plugin.settings.writeEnabled).onChange(async v=>{this.plugin.settings.writeEnabled=v;await this.plugin.saveSettings();}));
    if(this.plugin.settings.calendarProvider!=='caldav')new Setting(el).setName('Reminder calendar ID').setDesc('Use a dedicated calendar with write access. Existing reminders keep their original calendar.').addText(c=>c.setValue(this.plugin.settings.reminderCalendar).onChange(async v=>{this.plugin.settings.reminderCalendar=v;await this.plugin.saveSettings();}));
    if(this.plugin.settings.calendarProvider!=='caldav'){
    el.createEl('h3',{text:'Feishu user token'});el.createEl('p',{text:'Use a user_access_token from an administrator-approved app. This version has no embedded app secret or OAuth service; renew expired credentials.'});
    const input=el.createEl('input',{type:'password',attr:{placeholder:'Paste access token (existing value is never displayed)',autocomplete:'off'}});
    button(el,'Use for this session',()=>{this.plugin.sessionToken=input.value.trim();input.value='';new Notice('Session token set');});
    if(this.app.secretStorage)button(el,'Save to Obsidian secret storage',()=>{this.app.secretStorage.setSecret(this.plugin.settings.secretName,input.value.trim());this.plugin.sessionToken='';input.value='';new Notice('Saved. Do not export credentials to ordinary notes.');});
    button(el,'Disconnect token',()=>{this.plugin.sessionToken='';this.app.secretStorage?.setSecret(this.plugin.settings.secretName,'');new Notice('Credentials cleared. Existing Feishu reminders must be cancelled separately.');});
    }
    if(this.plugin.settings.calendarProvider!=='caldav')button(el,'Refresh events',()=>this.plugin.syncCalendar(true));button(el,'Sync / retry reminders',async()=>{await this.plugin.syncReminders(true);this.display();});
    const records=this.plugin.store.all('reminder').filter(r=>r.data.status!=='Synced'&&r.data.status!=='Cancelled');
    el.createEl('h3',{text:`Pending reminders (${records.length})`});
    el.createEl('p',{text:'Reminders stay on their original service and calendar. Switch back to that connection to update or cancel them; changing providers does not move or duplicate them.'});
    for(const r of records){const row=el.createDiv({cls:'tc-panel'});row.createDiv({text:`${r.data.title} · ${r.data.status} · ${r.data.provider??(r.data.calendarId?'feishu':'Not assigned')}`});if(r.data.error)row.createDiv({text:r.data.error,cls:'tc-muted'});if(r.data.status==='Source missing')button(row,'Cancel this reminder',async()=>{await this.plugin.reminders.cancelOrphan(r.data.id);await this.plugin.syncReminders();this.display();});}
  }
}

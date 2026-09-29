import type {Files} from './store';
import type {Entity} from './model';

export class Details {
  rows=new Map<string,Partial<Entity>>();
  tokens=new Map<string,string>();
  raw='';
  constructor(public files:Files,public path:string){}
  parse(raw:string){
    const m=raw.match(/```json\s*\n([\s\S]*?)\n```/);if(!m)throw Error('Details file is malformed. Nothing was overwritten.');
    const doc=JSON.parse(m[1]);if(doc.version!==1||!doc.records||typeof doc.records!=='object'||Array.isArray(doc.records))throw Error('Invalid details version or record format.');
    const ids=new Set<string>();for(const [token,value]of Object.entries(doc.records)){
      const row=value as Entity;if(!/^[a-z0-9]{8}$/.test(token)||!row||typeof row.id!=='string'||ids.has(row.id))throw Error('Invalid or duplicate ID in details.');ids.add(row.id);
    }return doc.records as Record<string,Partial<Entity>>;
  }
  accept(raw:string){const rows=this.parse(raw);this.raw=raw;this.rows=new Map(Object.entries(rows));this.tokens=new Map(Object.entries(rows).map(([t,d])=>[d.id!,t]));}
  async reload(){if(!this.files.exists(this.path)){this.rows.clear();this.tokens.clear();this.raw='';return;}const raw=await this.files.read(this.path);if(raw!==this.raw)this.accept(raw);}
  token(id:string){let t=this.tokens.get(id);if(t)return t;do{t=crypto.randomUUID().replace(/-/g,'').slice(0,8);}while(this.rows.has(t));return t;}
  format(rows:Record<string,Partial<Entity>>){return '# OneCalendar Details\n\nTask text lives in daily notes. This file stores IDs, project links and recurrence metadata. Sync it with diary and Projects. The plugin refreshes its memory index when files change; queries do not read this file.\n\n```json\n'+JSON.stringify({version:1,records:rows},null,2)+'\n```\n';}
  async save(data:Partial<Entity>&{id:string}){
    const token=this.token(data.id),expected=this.rows.get(token);const value={...data};delete value.title;delete value.body;
    // A missing plan means explicitly unplanned, rather than the diary's default date.
    if(data.tc==='task'&&data.plan===undefined)(value as Record<string,unknown>).plan=null;
    if(!this.files.exists(this.path)){
      if(this.raw)throw Error('Details file was removed. Reload or restore it first.');
      await this.files.mkdir(this.path.slice(0,this.path.lastIndexOf('/')));await this.files.create(this.path,this.format({}));
    }
    let result='';await this.files.process(this.path,raw=>{
      const rows=this.parse(raw);if(JSON.stringify(rows[token])!==JSON.stringify(expected))throw Error('Details changed elsewhere. Reload before saving.');
      if(Object.entries(rows).some(([key,r])=>key!==token&&r.id===data.id))throw Error('Another device assigned this record an ID. Reload first.');
      rows[token]=value;result=this.format(rows);return result;
    });this.accept(result);return token;
  }
  async restore(token:string,previous:Partial<Entity>|undefined,written:Partial<Entity>|undefined){
    let result='';await this.files.process(this.path,raw=>{const rows=this.parse(raw);if(JSON.stringify(rows[token])!==JSON.stringify(written))throw Error('Note save failed and details also changed. Resolve the conflict.');if(previous)rows[token]=previous;else delete rows[token];result=this.format(rows);return result;});this.accept(result);
  }
  // Readable tokens may occur anywhere in the title line, so typing after them is safe.
  expand(line:string,kind:'task'|'project'|'memo'='task'){
    const matches=Array.from(line.matchAll(/🆔〔([a-z0-9]{8})〕/g));if(!matches.length)return line;if(matches.length>1)throw Error('Multiple IDs on one record.');
    const m=matches[0],stored=this.rows.get(m[1]);if(!stored)throw Error(`ID ${m[1]} has missing or unsynced details. Restore the details file.`);
    const meta={...stored};let visible=line.replace(new RegExp(`[ \\t]*${m[0]}`),'');
    if(/^\s*[-*+]\s+\[/.test(line)){(meta as Record<string,unknown>).plan=null;delete meta.due;}
    for(const [icon,key]of [['📅','plan'],['⏳','due']] as const){const dates=Array.from(visible.matchAll(new RegExp(`${icon}\\s*(\\d{4}-\\d{2}-\\d{2})`,'g')));if(dates.length>1)throw Error('Duplicate dates on one record.');if(dates.length){meta[key]=dates[0][1];visible=visible.replace(new RegExp(`[ \\t]*${dates[0][0]}`),'');}}
    visible=visible.trimEnd();
    const tag=kind==='task'?'task-calendar':`task-calendar-${kind}`;
    return `${visible} <!-- ${tag}:${JSON.stringify(meta)} -->`;
  }
  compact(line:string){
    const m=line.match(/\s*<!--\s*task-calendar(?:-project|-memo)?:([\s\S]*?)\s*-->/);if(!m)return line;
    const inline=JSON.parse(m[1]) as Entity,token=this.tokens.get(inline.id);if(!token)return line;const meta={...this.rows.get(token),...inline};
    const dates=meta.tc==='project'||meta.tc==='memo'||line.startsWith('#')?'':`${meta.plan?' 📅 '+meta.plan:''}${meta.due?' ⏳ '+meta.due:''}`;
    return line.replace(m[0],`${dates} 🆔〔${token}〕`);
  }
}

import { Entity, RecordFile, validate } from './model';
import type {Details} from './details';
import {diarySections} from './diary-sections';
const marker=/\s*<!--\s*task-calendar:(.*?)\s*-->/;
const states:Record<string,string>={' ':'todo','x':'done','X':'done','/':'doing','-':'cancelled','>':'skipped'};
const checks:Record<string,string>={todo:' ',done:'x',doing:'/',cancelled:'-',skipped:'>'};
export function textHash(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
export function hiddenMeta(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');}
// Ordinary Markdown checkboxes and tagged idea list items are authoritative.
export function diaryTasks(path:string,raw:string,day:string,details?:Details,legacy=false):RecordFile[]{
  const out:RecordFile[]=[],lines=raw.split(/\r?\n/);const seen=new Map<string,number>(),reserved=new Set<string>();
  const sections=diarySections(raw);
  for(const line of lines){const m=line.match(marker);if(m){try{const id=JSON.parse(m[1]).id;if(typeof id==='string')reserved.add(id);}catch{}}}
  let fence='',frontmatter=false,comment=false;
  for(let index=0;index<lines.length;index++){
    const section=sections.find(s=>index>s.start&&index<s.end)?.name;
    const original=lines[index];const candidate=legacy?/^\s*[-*+]\s+/.test(original):section==='Tasks'?/^\s*-\s+\[[ xX/\->]\]\s+\S/.test(original):section==='Ideas'&&/^\s*-\s+(?!\s*\[)\S/.test(original);
    const line:string=details&&/🆔〔/.test(original)&&!fence&&!frontmatter&&!comment&&candidate?details.expand(original):original;
    if(index===0&&line==='---'){frontmatter=true;continue;}
    if(frontmatter){if(line==='---'||line==='...')frontmatter=false;continue;}
    const f=line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';continue;}
    if(fence)continue;
    if(comment){if(line.includes('-->'))comment=false;continue;}
    if(line.trimStart().startsWith('<!--')){comment=!line.includes('-->');continue;}
    const task=legacy||section==='Tasks'?line.match(/^(\s*-\s+)\[([ xX/\->])\]\s+(.+)$/):null;
    const idea=legacy?line.match(/^(\s*[-*+]\s+)#(?:闪念|idea)\s+(.+)$/):section==='Ideas'?line.match(/^(\s*-\s+)(?!\s*\[)(?:#idea\s+)?(\S.*)$/):null;
    if(!task&&!idea)continue;
    const visible=task?task[3]:idea![2],suffix=visible.match(marker);let meta:Record<string,unknown>={};
    if(suffix){try{meta=JSON.parse(suffix[1]);if(!meta||typeof meta!=='object'||Array.isArray(meta))throw Error();}catch{throw Error(`Invalid metadata at diary line ${index+1}; original preserved`);}}
    const title=visible.replace(marker,'').trim();if(!title)continue;
    const kind=task?'task':'idea',key=textHash(`${path}\n${kind==='task'?'':kind+'\n'}${title}`);let count=seen.get(key)??0;
    if(typeof meta.id!=='string')while(reserved.has(`diary_${key}_${count}`))count++;seen.set(key,count+1);
    const indent=line.match(/^\s*/)![0],continuation=indent+'  >';let end=index+1;const bodyLines:string[]=[];
    while(end<lines.length&&(lines[end]===continuation||lines[end].startsWith(continuation+' '))){bodyLines.push(lines[end].slice(continuation.length).replace(/^ /,''));end++;}
    const body=bodyLines.length?(task?bodyLines.join('\n'):[title,...bodyLines].join('\n')):typeof meta.body==='string'?meta.body:task?'':title;
    const data:Entity={...meta,tc:kind,id:typeof meta.id==='string'?meta.id:`diary_${key}_${count}`,title,created:typeof meta.created==='string'?meta.created:`${day}T00:00:00`,updated:typeof meta.updated==='string'?meta.updated:`${day}T00:00:00`,status:task?states[task[2]]:typeof meta.status==='string'?meta.status:'inbox',plan:task?(meta.plan===null?undefined:typeof meta.plan==='string'?meta.plan:day):undefined};
    validate(data);out.push({path,data,body,raw:lines.slice(index,end).join('\n'),diary:{day,line:index,endLine:end}});index=end-1;
  }return out;
}
export function diaryEntry(data:Entity,body:string,day:string,prefix='- ',details?:Details){
  validate(data);if(/[\r\n]/.test(data.title)||data.title.includes('<!--'))throw Error('Title must be a single line');
  const meta:Record<string,unknown>={...data};for(const k of ['tc','title','body'])delete meta[k];
  if(data.tc==='task'){delete meta.status;meta.plan=data.plan??null;if(data.plan===day)delete meta.plan;}
  if(meta.status==='inbox')delete meta.status;
  if(Array.isArray(meta.projects)&&!meta.projects.length)delete meta.projects;
  const indent=prefix.match(/^\s*/)![0];const text=data.tc==='idea'?(body.trim()||data.title):body;
  const pieces=text.split(/\r?\n/);const title=data.tc==='idea'?pieces.shift()!:data.title;
  const extra=(data.tc==='idea'?pieces:text?pieces:[]).map(line=>`${indent}  > ${line}`);
  const line=`${prefix}${data.tc==='task'?`[${checks[data.status??'todo']}] `:''}${title} <!-- task-calendar:${hiddenMeta(meta)} -->`;
  return [details?details.compact(line):line,...extra].join('\n');
}
export function patchDiary(raw:string,baseline:RecordFile,changes:Partial<Entity>,body?:string,details?:Details):string{
  const current=diaryTasks(baseline.path,raw,baseline.diary!.day,details).filter(r=>r.data.id===baseline.data.id);
  if(current.length!==1||current[0].raw!==baseline.raw)throw Error('This diary entry changed. Reopen it before saving; nothing was overwritten.');
  const rec=current[0],data={...rec.data,...changes,updated:new Date().toISOString()};validate(data);
  const prefix=rec.raw.match(/^(\s*[-*+]\s+)/)![1],lines=raw.split(/(?<=\n)/),end=rec.diary!.endLine??rec.diary!.line+1;
  const old=lines[end-1],ending=old.endsWith('\r\n')?'\r\n':old.endsWith('\n')?'\n':'',eol=raw.includes('\r\n')?'\r\n':'\n';
  lines.splice(rec.diary!.line,end-rec.diary!.line,diaryEntry(data,body??rec.body,rec.diary!.day,prefix,details).replace(/\n/g,eol)+ending);return lines.join('');
}
export function diaryRecordAtLine(path:string,raw:string,day:string,line:number,details?:Details){return diaryTasks(path,raw,day,details).find(r=>r.diary!.line<=line&&line<(r.diary!.endLine??r.diary!.line+1));}

import type {Details} from './details';
import { Entity, RecordFile, stamp, validate } from './model';
import { hiddenMeta, textHash } from './diary';
const projectMark=/\s*<!-- task-calendar-project:(.*?) -->\s*$/;
const memoMark=/\s*<!-- task-calendar-memo:(.*?) -->\s*$/;
export function projectPath(title:string){
  const name=title.trim();if(!name||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name==='.'||name==='..')throw Error('Project name contains invalid folder characters.');
  return `Projects/${name}/${name}-Memo.md`;
}
function meta(line:string,pattern:RegExp):Partial<Entity>{const m=line.match(pattern);if(!m)return {};const data=JSON.parse(m[1]);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid project metadata. Original text preserved.');return data;}
export function projectRecords(path:string,raw:string,details?:Details):RecordFile[]{
  if(!/^Projects\/[^/]+\/[^/]+-Memo\.md$/.test(path))return [];
  const folder=path.split('/')[1];if(path.split('/')[2]!==`${folder}-Memo.md`)return [];
  const lines=raw.split(/(?<=\n)/);let offset=0,fence='';const sections:{start:number;body:number;header:string}[]=[];
  let headerStart=-1,headerEnd=0,header='';
  for(const line of lines){const plain=line.replace(/\r?\n$/,'');const f=plain.match(/^\s{0,3}(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';}
    if(!fence&&!f){if(headerStart<0&&/^# /.test(plain)){headerStart=offset;headerEnd=offset+line.length;header=plain;}
      if(/^## \d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?:\s|$)/.test(plain))sections.push({start:offset,body:offset+line.length,header:plain});}
    offset+=line.length;
  }
  const pheader=details?details.expand(header,'project'):header;
  const pmeta=meta(pheader,projectMark),title=(pheader.replace(/^# /,'').replace(projectMark,'').trim()||folder);
  const p:Entity={...pmeta,tc:'project',id:pmeta.id??`project_${textHash(path)}`,title,created:pmeta.created??'1970-01-01T00:00:00Z',updated:pmeta.updated??'1970-01-01T00:00:00Z'};validate(p);
  const introEnd=sections[0]?.start??raw.length,intro=raw.slice(headerEnd,introEnd).trim();
  const result:RecordFile[]=[{path,data:p,body:intro,raw:raw.slice(0,introEnd),bundle:{start:0,end:introEnd,headerStart:Math.max(0,headerStart)}}];
  for(let i=0;i<sections.length;i++){
    const sec=sections[i],end=sections[i+1]?.start??raw.length,m=meta(details?details.expand(sec.header,'memo'):sec.header,memoMark),when=sec.header.match(/^## (\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/)![1].replace(' ','T');
    const body=raw.slice(sec.body,end).trim(),data:Entity={...m,tc:'memo',id:m.id??`${p.id}_memo_${textHash(sec.header)}_${i}`,project:p.id,title:body.split('\n')[0].slice(0,80)||'Memo',created:m.created??when,updated:m.updated??when};validate(data);
    result.push({path,data,body,raw:raw.slice(sec.start,end),bundle:{start:sec.start,end}});
  }
  // An existing plain memo without dated sections is already a valid first memo.
  if(!sections.length&&intro)result.push({path,data:{tc:'memo',id:`${p.id}_initial`,project:p.id,title:intro.split('\n')[0].slice(0,80),created:p.created,updated:p.updated},body:intro,raw:raw.slice(headerEnd),bundle:{start:headerEnd,end:raw.length}});
  return result;
}
export function projectText(data:Entity,body:string,details?:Details){const fields={...data};delete (fields as Partial<Entity>).tc;delete (fields as Partial<Entity>).title;const line=`# ${data.title} <!-- task-calendar-project:${hiddenMeta(fields)} -->`;return `${details?details.compact(line):line}\n\n${body.trim()}\n\n`;}
export function memoText(data:Entity,body:string,details?:Details){validate(data);const meta={...data};for(const k of ['tc','title','project'])delete meta[k];const line=`## ${data.created.replace('T',' ').replace(/\.\d+Z$/,'Z')} <!-- task-calendar-memo:${hiddenMeta(meta)} -->`;return `${details?details.compact(line):line}\n\n${body.trim()}\n\n`;}
export function patchProject(raw:string,baseline:RecordFile,changes:Partial<Entity>,body?:string,details?:Details){
  const found=projectRecords(baseline.path,raw,details).filter(r=>r.data.id===baseline.data.id);if(found.length!==1||found[0].raw!==baseline.raw)throw Error('Project memo changed. Reopen it before saving.');
  const rec=found[0],data={...rec.data,...changes,updated:stamp()};validate(data);
  const text=data.tc==='project'?raw.slice(0,rec.bundle!.headerStart??0)+projectText(data,body??rec.body,details):memoText(data,body??rec.body,details);
  return raw.slice(0,rec.bundle!.start)+text+raw.slice(rec.bundle!.end);
}

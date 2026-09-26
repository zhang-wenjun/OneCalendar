import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
const prefix=process.argv[2];
if(!/^qa_[a-z0-9]+$/.test(prefix??''))throw new Error('An explicit QA run prefix is required');
const root='AITestBed/TaskCalendar';let count=0;
for(const dir of await readdir(root,{withFileTypes:true})){
  if(!dir.isDirectory())continue;
  for(const name of await readdir(join(root,dir.name))){
    if(!name.endsWith('.md'))continue;
    const path=join(root,dir.name,name),raw=await readFile(path,'utf8');
    const match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);if(!match)continue;
    const doc=parseDocument(match[1]);if(doc.errors.length)throw doc.errors[0];
    const d=doc.toJS();if(!(d.id?.startsWith(prefix+'_')||d.id?.startsWith('from_'+prefix+'_')))continue;
    if(d.tc==='project'||d.tc==='event')doc.set('archived',true);
    else if(d.tc==='idea')doc.set('status','archived');
    else if(d.tc==='series'){doc.set('ended',true);doc.set('paused',true);}
    else if(d.tc==='task'&&!['done','skipped','cancelled'].includes(d.status))doc.set('status','cancelled');
    else continue;
    doc.set('updated',new Date().toISOString());doc.set('revision',Number(d.revision??0)+1);
    await writeFile(path,`---\n${doc.toString()}---\n${raw.slice(match[0].length)}`,'utf8');count++;
  }
}
console.log(`Archived ${count} records from ${prefix}; no files deleted.`);

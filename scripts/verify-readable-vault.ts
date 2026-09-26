import {readFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store,Files} from '../src/store';
import {Details} from '../src/details';
import {diaryTasks} from '../src/diary';
import {projectRecords} from '../src/projects';
const base=path.resolve('AITestBed');
async function walk(dir:string):Promise<string[]>{const out:string[]=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(path.relative(base,p).replace(/\\/g,'/'));}return out;}
const paths=await walk(base),files:Files={list:()=>paths.filter(p=>p.endsWith('.md')),read:p=>readFile(path.join(base,p),'utf8'),exists:p=>existsSync(path.join(base,p)),create:async()=>{throw Error('read only');},process:async()=>{throw Error('read only');},mkdir:async()=>{throw Error('read only');}};
const store=new Store(files);store.details=new Details(files,'TaskCalendar/Details.md');store.diaryDate=p=>/^diary\/\d{4}-\d{2}-\d{2}\.md$/.test(p)?p.slice(6,-3):undefined;await store.init();assert.deepEqual(store.problems(),[]);
const sectionPrefix='TaskCalendar/SectionBackups/',metadataPrefix='TaskCalendar/MetadataBackups/';const backups=paths.filter(p=>p.endsWith('.bak')&&(p.startsWith(sectionPrefix)||p.startsWith(metadataPrefix+'Projects/')));let compared=0;
for(const backup of backups){const isDiary=backup.startsWith(sectionPrefix),p=backup.slice((isDiary?sectionPrefix:metadataPrefix).length,-4),raw=await files.read(backup);const records=isDiary?diaryTasks(p,raw,store.diaryDate(p)!,store.details,true):projectRecords(p,raw);for(const r of records){if(isDiary&&!/🆔〔|<!--\s*task-calendar:/.test(r.raw))continue;const now=store.find(r.data.id);assert.ok(now,r.data.id);for(const k of ['tc','id','title','status','projects','project','series','occurrence','plan','due','created'])assert.deepEqual(now.data[k],r.data[k],r.data.id+':'+k);assert.equal(now.body,r.body);compared++;}}
assert.ok(compared>=23,'Expected all original demo records');console.log(JSON.stringify({comparedRecords:compared,backupFiles:backups.length,counts:Object.fromEntries(['task','idea','project','memo','event','series'].map(k=>[k,store.all().filter(r=>r.data.tc===k).length])),issues:store.problems()},null,2));

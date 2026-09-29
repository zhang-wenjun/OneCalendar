// Integration test against a temporary real Radicale server on loopback only.
import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
await mkdir('artifacts/caldav',{recursive:true});
await build({entryPoints:['src/caldav.ts'],outfile:'artifacts/caldav/provider.mjs',bundle:true,platform:'node',format:'esm'});
const {CalDav,basicAuth}=await import(pathToFileURL(resolve('artifacts/caldav/provider.mjs')).href);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const directory=await mkdtemp(resolve('artifacts/caldav/run-'));
const server=spawn(process.env.PYTHON||'python',['-m','radicale','--server-hosts',`127.0.0.1:${port}`,'--auth-type','none','--rights-type','authenticated','--storage-filesystem-folder',directory,'--logging-level','warning'],{windowsHide:true,env:{...process.env,PYTHONPATH:resolve('artifacts/caldav-server')},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const base=`http://127.0.0.1:${port}`,url=base+'/tester/test/';
const headers={Authorization:basicAuth('tester','test-only')};
const request=async(method,url,h={},body)=>{const r=await fetch(url,{method,headers:{...headers,...h},body,redirect:'error'});return {status:r.status,text:await r.text(),headers:Object.fromEntries(r.headers)};};
try{
 let ready=false;for(let n=0;n<100;n++){try{await request('PROPFIND',base+'/');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,'Server did not start: '+logs);
 const create=await request('MKCALENDAR',url,{'Content-Type':'application/xml'},'<c:mkcalendar xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:"><d:set><d:prop><d:displayname>OneCalendar Test</d:displayname></d:prop></d:set></c:mkcalendar>');assert.equal(create.status,201,create.text);
 const discovered=await new CalDav(base+'/tester/',request).discover();assert.ok(discovered.some(c=>c.url===url));
 const dav=new CalDav(url,request);assert.equal(await dav.testConnection(),'OneCalendar Test');
 const id=await dav.put(url,'taskcalendar-integration-0','Reminder 测试','2026-09-24T09:00:00Z');
 assert.equal(await dav.put(url,'taskcalendar-integration-0','Updated reminder','2026-09-24T10:00:00Z'),id);
 let list=await dav.list(url,new Date('2026-09-01Z'),new Date('2026-10-01Z'));assert.equal(list.length,1);assert.equal(list[0].title,'[Task reminder] Updated reminder');assert.equal(list[0].start,'2026-09-24T10:00:00.000Z');
 const repeat=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Integration//EN','BEGIN:VEVENT','UID:repeat-test','DTSTAMP:20260901T000000Z','DTSTART:20260924T090000Z','DTEND:20260924T100000Z','RRULE:FREQ=DAILY;COUNT=3','EXDATE:20260926T090000Z','SUMMARY:Repeat','END:VEVENT','BEGIN:VEVENT','UID:repeat-test','DTSTAMP:20260901T000000Z','RECURRENCE-ID:20260925T090000Z','DTSTART:20260925T120000Z','DTEND:20260925T130000Z','SUMMARY:Moved repeat','END:VEVENT','END:VCALENDAR',''].join('\r\n');
 assert.equal((await request('PUT',url+'repeat.ics',{'Content-Type':'text/calendar'},repeat)).status,201);
 list=await dav.list(url,new Date('2026-09-01Z'),new Date('2026-10-01Z'));assert.equal(list.length,3);assert.ok(list.some(e=>e.title==='Moved repeat'&&e.start==='2026-09-25T12:00:00.000Z'));
 await assert.rejects(dav.remove(url,url+'repeat.ics'),/not a OneCalendar/);
 await dav.remove(url,id);await dav.remove(url,id);list=await dav.list(url,new Date('2026-09-01Z'),new Date('2026-10-01Z'));assert.equal(list.length,2);
 const result={server:'Radicale',status:'passed',checks:['principal/home calendar discovery','PROPFIND connection','PUT alarm creation','retry without duplication','conditional update','REPORT read','recurrence expansion with exception and exclusion','foreign resource protection','DELETE and missing-resource retry']};await writeFile('artifacts/caldav/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){console.error(logs);throw e;}
finally{server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}

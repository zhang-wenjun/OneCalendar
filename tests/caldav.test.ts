import {test} from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import {CalDav,calendarUrl,basicAuth,readCalendar,reminderCalendar,DavTransport} from '../src/caldav';
import {Reminders} from '../src/calendar';
import {Store,Files} from '../src/store';
import {make} from '../src/model';
import OneCalendar from '../src/main';
const url='https://calendar.example/users/me/test/';
const start=new Date('2026-09-01T00:00:00Z'),end=new Date('2026-10-01T00:00:00Z');
const wrap=(body:string)=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const event=(body:string)=>`BEGIN:VEVENT\r\nUID:test\r\n${body}\r\nEND:VEVENT`;
const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const report=(ics:string,href='/users/me/test/a.ics')=>`<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>${xml(href)}</D:href><D:propstat><D:prop><C:calendar-data>${xml(ics)}</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;
test('CalDAV validates collection URLs and UTF-8 Basic credentials',()=>{
 assert.equal(calendarUrl('caldav.feishu.cn'),'https://caldav.feishu.cn/');assert.throws(()=>calendarUrl(''),/Enter a CalDAV/);
 assert.equal(calendarUrl(url.slice(0,-1)),url);assert.equal(calendarUrl('http://127.0.0.1:5232/test/'),'http://127.0.0.1:5232/test/');
 for(const value of ['http://example.com/cal/','https://user:secret@example.com/cal/','https://example.com/cal/?password=x','file:///tmp/'])assert.throws(()=>calendarUrl(value));
 assert.equal(Buffer.from(basicAuth('用户','密码').slice(6),'base64').toString(),'用户:密码');assert.throws(()=>basicAuth('a:b','x'));
});
test('Discovery follows principal and home links and returns named event calendars with permissions',async()=>{
 const multi=(href:string,props:string)=>`<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;
 const calls:string[]=[];const dav=new CalDav('https://calendar.example',async(method,path,headers)=>{calls.push(path);assert.equal(method,'PROPFIND');let text='';if(path==='https://calendar.example/')text=multi('/','<D:current-user-principal><D:href>/principals/me/</D:href></D:current-user-principal>');else if(path.endsWith('/principals/me/'))text=multi('/principals/me/','<C:calendar-home-set><D:href>/users/me/</D:href></C:calendar-home-set>');else{assert.equal(headers.Depth,'1');text=multi('/users/me/test/','<D:displayname>My calendar</D:displayname><D:resourcetype><C:calendar/></D:resourcetype><D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>');}return {status:207,text,headers:{}};});
 const found=await dav.discover();assert.deepEqual(found,[{name:'My calendar',url,readOnly:true}]);assert.equal(calls.length,3);
});
test('Discovery accepts direct collections, excludes task-only collections and blocks foreign origins',async()=>{
 const wrap=(props:string)=>`<multistatus><response><href>${url}</href><propstat><prop>${props}</prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
 const direct=new CalDav(url,async()=>({status:207,text:wrap('<resourcetype><calendar/></resourcetype><displayname>Direct</displayname>'),headers:{}}));assert.equal((await direct.discover())[0].name,'Direct');
 const foreign=new CalDav(url,async()=>({status:207,text:wrap('<current-user-principal><href>https://other.example/private/</href></current-user-principal>'),headers:{}}));await assert.rejects(foreign.discover(),/different server/);
 const tasks=new CalDav(url,async()=>({status:207,text:wrap('<resourcetype><calendar/></resourcetype><supported-calendar-component-set><comp name="VTODO"/></supported-calendar-component-set>'),headers:{}}));await assert.rejects(tasks.discover(),/no event calendars/);
});
test('CalDAV REPORT asks for recurrence expansion and parses escaped folded titles',async()=>{
 const ics=wrap(event('DTSTART:20260924T090000Z\r\nDTEND:20260924T100000Z\r\nSUMMARY:Research\\, notes &\r\n more'));
 const dav=new CalDav(url,async(method,path,headers,body)=>{assert.equal(method,'REPORT');assert.equal(headers.Depth,'1');assert.match(body!,/<c:expand/);return {status:207,text:report(ics),headers:{} as Record<string,string>};});
 const list=await dav.list(url,start,end);assert.equal(list[0].title,'Research, notes &more');assert.equal(list[0].start,'2026-09-24T09:00:00.000Z');assert.equal(list[0].provider,'caldav');
});
test('An empty multistatus is a successful empty calendar, not an XML error',async()=>{
 const dav=new CalDav(url,async()=>({status:207,text:'<D:multistatus xmlns:D="DAV:"/>',headers:{}}));assert.deepEqual(await dav.list(url,start,end),[]);
});
test('CalDAV reads calendar-data with content-type/version attributes and CDATA',async()=>{
 const ics=wrap(event('DTSTART:20260924T090000Z\r\nDTEND:20260924T100000Z\r\nSUMMARY:Attributed event'));
 for(const content of [xml(ics),xml(ics).replace(/\r/g,'&#13;').replace(/\n/g,'&#10;'),xml(ics).replace(/\r/g,'&#xD;').replace(/\n/g,'&#xA;'),`<![CDATA[${ics}]]>`]){
  const text=report(ics).replace(`<C:calendar-data>${xml(ics)}</C:calendar-data>`,`<C:calendar-data content-type="text/calendar" version="2.0">${content}</C:calendar-data>`);
  const dav=new CalDav(url,async()=>({status:207,text,headers:{}}));
  const list=await dav.list(url,start,end);assert.equal(list.length,1);assert.equal(list[0].title,'Attributed event');assert.equal(list[0].start,'2026-09-24T09:00:00.000Z');
 }
});
test('CalDAV falls back from collection-only query to enumeration and calendar-multiget',async()=>{
 const collection='<multistatus><response><href>'+url+'</href><propstat><prop><calendar-data/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response></multistatus>';
 const listing=`<multistatus><response><href>${url}</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>${url}a.ics</href><propstat><prop><getetag>one</getetag></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
 const ics=wrap(event('DTSTART;TZID=Asia/Shanghai:20260924T140000\r\nDTEND;TZID=Asia/Shanghai:20260924T150000\r\nSUMMARY:Compatibility test'));
 const calls:string[]=[];
 const dav=new CalDav(url,async(method,path,headers,body)=>{
  calls.push(method);assert.equal(path,url);
  if(method==='PROPFIND')return {status:207,text:listing,headers:{}};
  assert.equal(method,'REPORT');
  if(body!.includes('calendar-multiget')){assert.match(body!,/<d:href>\/users\/me\/test\/a.ics<\/d:href>/);return {status:207,text:report(ics).replace(/\r/g,'&#13;').replace(/\n/g,'&#10;'),headers:{}};}
  if(calls.length===2)assert.ok(!body!.includes('expand'));
  return {status:207,text:collection,headers:{}};
 });
 const result=await dav.list(url,start,end);assert.equal(result[0].start,'2026-09-24T06:00:00.000Z');assert.deepEqual(calls,['REPORT','REPORT','PROPFIND','REPORT']);
});
test('CalDAV multiget rejects missing or substituted resources and never accepts a partial refresh',async()=>{
 const unavailable=`<multistatus><response><href>${url}a.ics</href><propstat><prop><calendar-data/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response></multistatus>`;
 for(const reply of ['<multistatus/>',report(wrap(event('DTSTART:20260924T090000Z')),'/users/me/test/other.ics')]){
  const dav=new CalDav(url,async(method,path,headers,body)=>({status:207,text:body!.includes('calendar-multiget')?reply:unavailable,headers:{}}));
  await assert.rejects(dav.list(url,start,end),/incomplete|unexpected/);
 }
});
test('IANA zones without VTIMEZONE use date-specific offsets and preserve explicit UTC ends',()=>{
 for(const [stamp,expected]of [['20260124T090000','2026-01-24T14:00:00.000Z'],['20260924T090000','2026-09-24T13:00:00.000Z']]){
  const data=wrap(event(`DTSTART;TZID=America/New_York:${stamp}\r\nDURATION:PT1H`));
  const result=readCalendar(data,url,url+'a.ics',new Date('2026-01-01'),new Date('2027-01-01'));assert.equal(result[0].start,expected);
 }
 const mixed=readCalendar(wrap(event('DTSTART;TZID=Asia/Shanghai:20260924T140000\r\nDTEND:20260924T070000Z')),url,url+'a.ics',start,end);assert.equal(mixed[0].end,'2026-09-24T07:00:00.000Z');
 assert.throws(()=>readCalendar(wrap(event('DTSTART;TZID=America/New_York:20260308T023000')),url,url+'a.ics',new Date('2026-01-01'),end),/nonexistent/);
});
test('CalDAV handles all-day dates, cancelled instances and server-expanded exceptions',()=>{
 const text=wrap(event('DTSTART;VALUE=DATE:20260924\r\nDTEND;VALUE=DATE:20260925\r\nSUMMARY:Day')+'\r\n'+event('RECURRENCE-ID:20260925T090000Z\r\nDTSTART:20260925T110000Z\r\nDURATION:PT1H\r\nSUMMARY:Moved')+'\r\n'+event('DTSTART:20260926T090000Z\r\nSTATUS:CANCELLED'));
 const list=readCalendar(text,url,url+'a.ics',start,end);assert.equal(list.length,2);assert.equal(list[0].allDay,true);assert.equal(list[0].end,'2026-09-25T00:00:00');assert.equal(list[1].end,'2026-09-25T12:00:00.000Z');
 assert.throws(()=>readCalendar(wrap(event('DTSTART:20260924T090000Z\r\nRRULE:FREQ=DAILY')),url,'a',start,end),/did not expand/);
 assert.throws(()=>readCalendar(wrap(event('DTSTART;TZID=Unknown:20260924T090000')),url,'a',start,end),/unresolved timezone/);
});
test('CalDAV rejects malformed XML, failed properties, credentials errors and off-origin resources',async()=>{
 for(const [status,text,pattern]of [[401,'',/authentication/],[500,'',/HTTP 500/],[207,'<!DOCTYPE x><x/>',/Invalid/],[207,'<html/>',/multistatus/],[207,report(wrap(event('DTSTART:20260924T090000Z')),'https://evil.example/a.ics'),/outside/],[207,'<multistatus><response><propstat><status>HTTP/1.1 403 Forbidden</status></propstat></response></multistatus>',/event data/]] as const){const dav=new CalDav(url,async()=>({status,text,headers:{} as Record<string,string>}));await assert.rejects(dav.list(url,start,end),pattern);}
});
test('CalDAV connection test distinguishes a calendar from a server homepage',async()=>{
 const dav=new CalDav(url,async(method)=>{assert.equal(method,'PROPFIND');return {status:207,headers:{} as Record<string,string>,text:'<multistatus><response><propstat><status>HTTP/1.1 200 OK</status><prop><displayname>Test</displayname><resourcetype><collection/><calendar/></resourcetype></prop></propstat></response></multistatus>'};});assert.equal(await dav.testConnection(),'Test');
});
test('CalDAV reminder writes are idempotent, alarm-bearing and use conditional updates/deletes',async()=>{
 let stored:string|undefined;let revision=0;let puts=0;const calls:string[]=[];
 const transport:DavTransport=async(method,path,headers,body)=>{calls.push(method);assert.ok(path.startsWith(url));if(method==='GET')return {status:stored?200:404,text:stored??'',headers:{ETag:`"${revision}"`}};if(method==='PUT'){assert.equal(headers[stored?'If-Match':'If-None-Match'],stored?`"${revision}"`:'*');stored=body;revision++;puts++;return {status:201,text:'',headers:{} as Record<string,string>};}assert.equal(method,'DELETE');assert.equal(headers['If-Match'],`"${revision}"`);stored=undefined;return {status:204,text:'',headers:{} as Record<string,string>};};
 const dav=new CalDav(url,transport),id=await dav.put(url,'taskcalendar-id-0','测试, line\nnext','2026-09-24T10:00Z');
 const c=new ICAL.Component(ICAL.parse(stored!)).getFirstSubcomponent('vevent')!;assert.equal(c.getFirstSubcomponent('valarm')!.getFirstPropertyValue('action'),'DISPLAY');assert.equal(c.getFirstPropertyValue('summary'),'[Task reminder] 测试, line\nnext');
 assert.equal(await dav.put(url,'taskcalendar-id-0','Updated','2026-09-24T11:00Z'),id);assert.equal(puts,2);
 await dav.remove(url,id);await dav.remove(url,id);assert.equal(calls.filter(x=>x==='DELETE').length,1);
 await assert.rejects(dav.put('https://other.example/cal/','x','x','2026-09-24'),/another CalDAV/);
});
test('CalDAV protects foreign resources and rejects concurrent-write conflicts',async()=>{
 const foreign=wrap(event('DTSTART:20260924T090000Z'));let writes=0;
 const dav=new CalDav(url,async(method)=>{if(method!=='GET')writes++;return {status:200,text:foreign,headers:{etag:'"1"'}};});
 await assert.rejects(dav.put(url,'taskcalendar-x','x','2026-09-24',url+'foreign.ics'),/stable ID/);await assert.rejects(dav.remove(url,url+'foreign.ics'),/not a OneCalendar/);assert.equal(writes,0);
 const conflict=new CalDav(url,async method=>method==='GET'?{status:200,text:reminderCalendar('taskcalendar-x','x','2026-09-24'),headers:{etag:'"1"'}}:{status:412,text:'',headers:{} as Record<string,string>});await assert.rejects(conflict.put(url,'taskcalendar-x','new','2026-09-25'),/changed elsewhere/);
});
test('Reminder queue pins providers and never routes legacy Feishu mappings to CalDAV',async()=>{
 const map=new Map<string,string>();const f:Files={list:()=>[...map.keys()],exists:p=>map.has(p),read:async p=>map.get(p)!,create:async(p,c)=>{map.set(p,c);},process:async(p,fn)=>{map.set(p,fn(map.get(p)!));},mkdir:async()=>{}};const store=new Store(f);
 const time='2099-09-24T09:00Z';await store.create(make('task','Old',{id:'old',remind:time}));await store.create(make('reminder','Old',{id:'rem_old',task:'old',calendarId:'feishu-id',externalId:'event-id',status:'Pending sync',desired:JSON.stringify({title:'Old',time})}));await store.create(make('task','New',{id:'new',remind:time}));
 let writes=0;const provider={list:async()=>[],put:async()=>{writes++;return url+'new.ics';},remove:async()=>{throw Error('Wrong provider');}};
 await new Reminders(store).sync(provider,url,true,'caldav');assert.equal(writes,1);assert.equal(store.find('rem_new')!.data.provider,'caldav');assert.equal(store.find('rem_old')!.data.externalId,'event-id');
});
test('CalDAV reads a supplied timezone instead of interpreting it as local time',()=>{
 const zone=['BEGIN:VTIMEZONE','TZID:Test/PlusEight','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0800','TZOFFSETTO:+0800','END:STANDARD','END:VTIMEZONE'].join('\r\n');
 const text=wrap(zone+'\r\n'+event('DTSTART;TZID=Test/PlusEight:20260924T090000\r\nDTEND;TZID=Test/PlusEight:20260924T100000'));
 const list=readCalendar(text,url,url+'zone.ics',start,end);assert.equal(list[0].start,'2026-09-24T01:00:00.000Z');
});
test('CalDAV credentials are not persisted with settings and are detached on connection changes',async()=>{
 const p=new OneCalendar({} as any,{} as any);let saved:any;const secrets=new Map([['task-calendar-caldav-password','old-secret']]);
 Object.assign(p,{app:{secretStorage:{getSecret:(key:string)=>secrets.get(key)}},saveData:async(data:any)=>{saved=data;},store:{changed:()=>{}}});p.settings={...p.settings,calendarProvider:'caldav',caldavUrl:url,caldavUsername:'user'};p.sessionCalDavPassword='session-secret';await p.saveSettings();assert.ok(!JSON.stringify(saved).includes('secret\"'));assert.ok(!JSON.stringify(saved).includes('session-secret'));
 await p.changeCalDavConnection('caldavUrl','https://other.example/cal/');assert.equal(p.calDavPassword(),'');assert.equal(p.sessionCalDavPassword,'');assert.deepEqual(p.externalEvents,[]);
});
test('Calendar refresh preserves cache on failure and discards results after switching connections',async()=>{
 const p=new OneCalendar({} as any,{} as any);const cached={id:'cached',title:'Keep',start:'2026-09-24T09:00Z',end:'2026-09-24T10:00Z',allDay:false,calendarId:url};p.settings={...p.settings,calendarProvider:'caldav',caldavUrl:url,caldavCalendarUrl:url,readEnabled:true};p.externalEvents=[cached];p.store={all:()=>[],changed:()=>{}} as any;p.saveSettings=async()=>{};
 p.provider=()=>({list:async()=>{throw Error('Offline');}} as any);await assert.rejects(p.syncCalendar(),/Offline/);assert.deepEqual(p.externalEvents,[cached]);
 p.provider=()=>({list:async()=>{p.settings={...p.settings,calendarProvider:'feishu'};return [];} } as any);await p.syncCalendar();assert.deepEqual(p.externalEvents,[cached]);
});

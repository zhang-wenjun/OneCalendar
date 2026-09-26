import {test} from 'node:test';
import assert from 'node:assert/strict';
import TaskCalendar from '../src/main';
import {CalendarSource,refreshMinutes} from '../src/calendar-sources';
const sources:CalendarSource[]=[{id:'one',name:'Work',url:'https://one.example/cal/',server:'https://one.example/',username:'user1',secretName:'secret1',color:'#2563eb',enabled:true},{id:'two',name:'Study',url:'https://two.example/cal/',server:'https://two.example/',username:'user2',secretName:'secret2',color:'#16a34a',enabled:true}];
function plugin(){const p=new TaskCalendar({} as any,{} as any);Object.assign(p,{app:{secretStorage:{getSecret:(name:string)=>name+'-password'}},store:{all:()=>[],changed(){}},saveData:async()=>{}});p.settings={...p.settings,calendarProvider:'caldav',caldavSources:sources.map(s=>({...s})),readEnabled:true};return p;}
const event=(url:string)=>({id:url+'item',title:'Meeting',start:'2026-09-24T09:00Z',end:'2026-09-24T10:00Z',allDay:false,calendarId:url,provider:'caldav'});
test('Multiple calendars route credentials separately and retain failed source cache',async()=>{
 const p=plugin(),calls:string[][]=[];let fail=false;p.calDav=((url:string,user:string,password:string)=>({list:async()=>{calls.push([url,user,password]);if(fail&&url===sources[1].url)throw Error('Offline');return [event(url)];}})) as any;
 await p.syncCalendar(true);assert.equal(p.externalEvents.length,2);assert.deepEqual(calls.map(c=>c.slice(1)),[['user1','secret1-password'],['user2','secret2-password']]);assert.deepEqual(p.externalEvents.map(e=>e.sourceId),['one','two']);
 fail=true;await p.syncCalendar(true);assert.equal(p.externalEvents.length,2);assert.match(p.calendarStatus,/1\/2 calendars/);assert.match(p.calendarStatus,/kept their cache/);
 await p.updateCalendarSource('two',{enabled:false});assert.equal(p.externalEvents.length,1);calls.length=0;await p.syncCalendar(true);assert.equal(calls.length,1);
});
test('Source changes during refresh discard stale results; removing a calendar removes only its cache',async()=>{
 const p=plugin();p.externalEvents=[{...event(sources[0].url),sourceId:'one'},{...event(sources[1].url),sourceId:'two'}];
 p.calDav=(()=>({list:async()=>{await p.removeCalendarSource('two');return [];}})) as any;
 await p.syncCalendar(true);assert.equal(p.externalEvents.length,1);assert.equal(p.externalEvents[0].sourceId,'one');
});
test('Adding a calendar deduplicates, preserves customization and never saves session passwords',async()=>{
 const p=plugin();let saved='';p.saveData=async data=>{saved=JSON.stringify(data);};
 Object.assign(p.settings,{caldavCalendarUrl:sources[0].url,caldavUrl:sources[0].server,caldavUsername:'user1',caldavSecretName:'secret1'});p.sessionCalDavPassword='private-session-password';
 await p.addCurrentCalendar();assert.equal(p.settings.caldavSources!.length,2);assert.equal(p.settings.caldavSources!.find(s=>s.id==='one')!.name,'Work');assert.ok(!saved.includes('private-session-password'));
 await p.newCalendarConnection();assert.equal(p.sourcePassword(sources[0]),'private-session-password');assert.equal(p.settings.caldavSources!.length,2);
});
test('Refresh intervals validate boundaries and manual attempts reset the due time',async()=>{
 const p=plugin();assert.equal(refreshMinutes(undefined),5);assert.equal(refreshMinutes(0),5);assert.equal(refreshMinutes(1441),5);assert.equal(refreshMinutes(60),60);
 p.settings.refreshMinutes=60;p.calDav=(()=>({list:async()=>[]})) as any;const before=Date.now();await p.syncCalendar(true);assert.equal(p.refreshDue(before+59*60000),false);assert.equal(p.refreshDue(Date.now()+60*60000),true);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import {eventCalendar,shareEventCalendar} from '../src/phone-calendar';
import {make,RecordFile} from '../src/model';
const record:RecordFile={path:'event.md',raw:'',body:'Notes; one,two\nSecond line',data:make('event','研究😀'.repeat(35),{start:'2026-09-25T23:50:00+08:00',end:'2026-09-26T00:20:00+08:00',remind:'2026-09-25T23:40:00+08:00'})};
test('Phone calendar export preserves Unicode, dates, stable UID and an actual VALARM',()=>{
  const raw=eventCalendar(record),calendar=new ICAL.Component(ICAL.parse(raw)),event=calendar.getFirstSubcomponent('vevent')!;
  assert.equal(event.getFirstPropertyValue('summary'),record.data.title);
  assert.equal(event.getFirstPropertyValue('description'),record.body);
  assert.equal(event.getFirstPropertyValue('uid'),record.data.id+'@taskcalendar');
  assert.equal(String(event.getFirstPropertyValue('dtstart')),'2026-09-25T15:50:00Z');
  assert.equal(String(event.getFirstPropertyValue('dtend')),'2026-09-25T16:20:00Z');
  assert.equal(String(event.getFirstSubcomponent('valarm')!.getFirstPropertyValue('trigger')),'2026-09-25T15:40:00Z');
  for(const line of raw.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('Phone export uses file sharing when available, otherwise writes a reusable calendar file',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let shared:any;const writes=new Map<string,string>();
  const app:any={vault:{getAbstractFileByPath:()=>true,adapter:{write:async(p:string,s:string)=>writes.set(p,s)}}};
  try{
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async(data:any)=>{shared=data;}}});
    await shareEventCalendar(app,record);assert.equal(shared.files[0].type,'text/calendar');assert.equal(writes.size,0);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>false}});
    await shareEventCalendar(app,record);await shareEventCalendar(app,record);assert.equal(writes.size,1);assert.match([...writes.values()][0],/BEGIN:VALARM/);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);}
});

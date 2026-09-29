import {App,Notice} from 'obsidian';
import {RecordFile} from './model';
const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=(s:string)=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function eventCalendar(record:RecordFile){
  const d=record.data;
  if(!d.start||!d.end||!d.remind)throw Error('An event and reminder time are required.');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OneCalendar//EN','BEGIN:VEVENT',`UID:${escape(d.id)}@taskcalendar`,`DTSTAMP:${utc(d.updated)}`,`DTSTART:${utc(d.start)}`,`DTEND:${utc(d.end)}`,`SUMMARY:${escape(d.title)}`,`DESCRIPTION:${escape(record.body)}`,'BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER;VALUE=DATE-TIME:${utc(d.remind)}`,`DESCRIPTION:${escape(d.title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR'];
  // RFC 5545 folds at 75 octets, without splitting a Unicode character.
  return lines.map(line=>{let out='',count=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(count+n>75){out+='\r\n ';count=1;}out+=c;count+=n;}return out;}).join('\r\n')+'\r\n';
}
export async function shareEventCalendar(app:App,record:RecordFile){
  const name=`event-${record.data.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.ics`,contents=eventCalendar(record);
  const file=new File([contents],name,{type:'text/calendar'});
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:record.data.title});return;}catch(e){if((e as Error).name==='AbortError')return;}
  }
  const dir='TaskCalendar/CalendarExports';
  for(const path of ['TaskCalendar',dir])if(!app.vault.getAbstractFileByPath(path))await app.vault.createFolder(path);
  const path=`${dir}/${name}`;
  await app.vault.adapter.write(path,contents);
  new Notice(`Saved ${path}. Open this file in your calendar app and import it to enable the reminder.`,12000);
}

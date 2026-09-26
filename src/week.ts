import { addDays, dateKey, parseDate } from './model';
export const weekStart=(day:string)=>addDays(day,-((parseDate(day).getDay()+6)%7));
export function atMinute(day:string,minute:number){const d=new Date(`${day}T00:00`);d.setMinutes(minute);return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export function minuteOf(iso:string,day:string){const d=new Date(iso);if(dateKey(d)<day)return 0;if(dateKey(d)>day)return 1440;return d.getHours()*60+d.getMinutes();}
export function timeRange(day:string,a:number,b:number){const start=Math.min(a,b),end=Math.max(a,b)+30;return {start:atMinute(day,start),end:atMinute(day,Math.min(1440,end))};}
export function layoutEvents<T extends {start:string;end:string;allDay?:boolean}>(events:T[],day:string){
  const rows=events.filter(e=>!e.allDay).map(event=>({event,start:minuteOf(event.start,day),end:minuteOf(event.end,day),column:0,columns:1})).filter(e=>e.end>e.start).sort((a,b)=>a.start-b.start||b.end-a.end);
  let group:typeof rows=[],ends:number[]=[],until=0;
  const flush=()=>{for(const r of group)r.columns=ends.length;group=[];ends=[];};
  for(const row of rows){if(row.start>=until){flush();until=0;}let col=ends.findIndex(end=>end<=row.start);if(col<0)col=ends.length;row.column=col;ends[col]=row.end;until=Math.max(until,row.end);group.push(row);}flush();return rows;
}

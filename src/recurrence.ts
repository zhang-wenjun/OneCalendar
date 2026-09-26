import { Entity, addDays, dateKey, parseDate } from './model';
export function nextDate(s: Entity, previous: string, completed?: string): string {
  if(s.rule==='after') return addDays(completed ?? previous, s.interval ?? 1);
  if(s.rule==='daily') return addDays(previous,s.interval ?? 1);
  if(s.rule==='monthly') {
    const d=parseDate(previous); d.setDate(1); d.setMonth(d.getMonth()+(s.interval ?? 1));
    const max = new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(s.monthday ?? 1,max)); return dateKey(d);
  }
  for(let n=1;n<=366*20;n++) {
    const candidate=addDays(previous,n), dow=parseDate(candidate).getDay();
    if(s.rule==='weekdays' && dow>0 && dow<6) return candidate;
    if(s.rule==='weekly' && (s.weekdays ?? []).includes(dow)) {
      const anchor=s.occurrence ?? previous;
      const a=parseDate(anchor); a.setDate(a.getDate()-((a.getDay()+6)%7));
      const b=parseDate(candidate); b.setDate(b.getDate()-((b.getDay()+6)%7));
      const weeks=Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/604800000);
      if(weeks%(s.interval ?? 1)===0) return candidate;
    }
  }
  throw new Error('Cannot calculate the next occurrence');
}
export function firstDate(s: Entity, start: string): string {
  const day = parseDate(start).getDay();
  if(s.rule==='weekdays') return day===0?addDays(start,1):day===6?addDays(start,2):start;
  if(s.rule==='weekly') return s.weekdays?.includes(day)?start:nextDate(s,addDays(start,-1));
  if(s.rule==='monthly') {
    const d=parseDate(start); const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(s.monthday ?? 1,max)); const value=dateKey(d);
    return value>=start?value:nextDate(s,value);
  }
  return start;
}
export const instanceId = (series:string, day:string) => `${series}_${day}`;
export function instance(s: Entity, day: string, sequence?:number): Entity {
  const created=new Date().toISOString();
  return {tc:'task', id:sequence===undefined?instanceId(s.id,day):`${s.id}_cycle_${sequence}`, title:s.title, created, updated:created, format:1, revision:1,
    ...(sequence===undefined?{}:{sequence}),
    status:'todo', projects:s.projects ?? [], series:s.id, occurrence:day, plan:day,
    ...(s.dueOffset!==undefined?{due:addDays(day,s.dueOffset)}:{}),
    ...(s.reminderTime?{remind:`${day}T${s.reminderTime}`}:{})};
}

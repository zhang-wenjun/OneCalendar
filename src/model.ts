export type Kind = 'task' | 'project' | 'memo' | 'idea' | 'event' | 'series' | 'reminder';
export type Status = 'todo' | 'doing' | 'done' | 'cancelled' | 'skipped';
export type Repeat = 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'after';
export interface Entity {
  tc: Kind; id: string; title: string; created: string; updated: string;
  status?: string; projects?: string[]; project?: string; source?: string;
  plan?: string; due?: string; remind?: string; completed?: string;
  start?: string; end?: string; task?: string; archived?: boolean;
  series?: string; occurrence?: string; rule?: Repeat; interval?: number;
  weekdays?: number[]; monthday?: number; next?: string; paused?: boolean;
  ended?: boolean; reminderTime?: string; dueOffset?: number;
  externalId?: string; calendarId?: string; desired?: string; synced?: string;
  error?: string; provider?: string; revision?: number;
  [key: string]: unknown;
}
export interface RecordFile { path: string; data: Entity; body: string; raw: string; diary?:{day:string;line:number;endLine?:number}; bundle?:{start:number;end:number;headerStart?:number} }
export const labels: Record<string,string> = { todo: 'To do', doing: 'In progress', done: 'Done', cancelled: 'Cancelled', skipped: 'Skipped' };
export const folders: Record<Kind,string> = { task:'Tasks', project:'Projects', memo:'Memos', idea:'Ideas', event:'Events', series:'Series', reminder:'Reminders' };
export const active = (e: Entity) => !['done','cancelled','skipped'].includes(e.status ?? 'todo');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const parseDate = (s: string) => new Date(`${s}T12:00:00`);
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setDate(d.getDate()+n); return dateKey(d); };
export const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(parseDate(s)) === s;
export const id = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export function make(tc: Kind, title: string, fields: Partial<Entity> = {}): Entity {
  return { tc, id: id(), title, created: stamp(), updated: stamp(), format:1, revision: 1, ...fields };
}
export function validate(e: Entity) {
  if (!Object.hasOwn(folders,e.tc) || !/^[a-zA-Z0-9_-]+$/.test(e.id || '')) throw new Error('Invalid record type or stable ID.');
  if (typeof e.title !== 'string' || !e.title.trim()) throw new Error('Title is required.');
  if(e.format!==undefined&&e.format!==1)throw new Error('Unsupported data version. Update the plugin first.');
  for(const k of ['created','updated'])if(typeof e[k]!=='string'||!Number.isFinite(Date.parse(e[k])))throw new Error(`${k} must be a valid timestamp`);
  for(const k of ['status','project','source','task','series','reminderTime','externalId','calendarId','desired','synced','error'])if(e[k]!==undefined&&typeof e[k]!=='string')throw new Error(`${k} must be a string`);
  if (e.projects !== undefined && (!Array.isArray(e.projects) || e.projects.some(x=>typeof x!=='string'))) throw new Error('projects must be a list of project IDs');
  for (const k of ['plan','due','next','occurrence'] as const) if (e[k] !== undefined && e[k] !== '' && !validDate(e[k])) throw new Error(`${k} invalid date`);
  for (const k of ['start','end','remind'] as const) if (e[k] !== undefined && e[k] !== '' && (typeof e[k]!=='string'||!Number.isFinite(Date.parse(e[k])))) throw new Error(`${k} invalid time`);
  for(const k of ['archived','paused','ended'])if(e[k]!==undefined&&typeof e[k]!=='boolean')throw new Error(`${k} must be true or false`);
  if (e.tc==='task' && !Object.hasOwn(labels, e.status ?? 'todo')) throw new Error('Invalid task status');
  if (e.tc==='event' && (!e.start || !e.end || Date.parse(e.end)<=Date.parse(e.start))) throw new Error('Event end must be after its start');
  if (e.tc==='series') {
    if(!validDate(e.occurrence))throw new Error('Repeating tasks require a valid occurrence date');
    if(e.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.reminderTime))throw new Error('Repeat reminder time must use HH:mm');
    if (!['daily','weekly','monthly','weekdays','after'].includes(e.rule ?? '')) throw new Error('Invalid repeat rule');
    if (!Number.isInteger(e.interval) || e.interval!<1) throw new Error('Repeat interval must be a positive integer');
    if (e.rule==='weekly' && (!e.weekdays?.length || e.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6))) throw new Error('Select at least one valid weekday');
    if (e.rule==='monthly' && (!Number.isInteger(e.monthday)||e.monthday!<1||e.monthday!>31)) throw new Error('Day of month must be 1–31');
  }
}
export function matchesTask(e: Entity, filter: string, today = dateKey()) {
  if(e.tc!=='task') return false;
  switch(filter) {
    case 'today': return active(e) && (e.plan===today || e.due===today);
    case 'overdue': return active(e) && !!e.due && e.due<today;
    case 'upcoming': return active(e) && [e.plan,e.due].some(d=>d && d>=today && d<=addDays(today,7));
    case 'unplanned': return active(e) && !e.plan;
    case 'inbox': return active(e) && !e.plan && !e.projects?.length;
    case 'done': return e.status==='done';
    case 'active': return active(e);
    default: return true;
  }
}

import { parseDocument, Document } from 'yaml';
import { Entity, RecordFile, validate } from './model';
export function readMarkdown(path: string, raw: string): RecordFile | null {
  const match = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match) return null;
  const doc = parseDocument(match[1], { uniqueKeys:true });
  if(doc.errors.length) throw new Error(doc.errors[0].message);
  const data = doc.toJS() as Entity;
  if(!data?.tc) return null;
  if(data.tc==='reminder'&&data.status){const legacy:Record<string,string>={'待同步':'Pending sync','待取消':'Pending cancellation','已同步':'Synced','已取消':'Cancelled','源任务缺失':'Source missing','已过期':'Expired','同步失败':'Sync failed'};data.status=legacy[data.status]??data.status;}
  validate(data);
  return {path, raw, data, body: raw.slice(match[0].length)};
}
export function writeMarkdown(data: Entity, body: string): string {
  validate(data);
  return `---\n${new Document(data).toString()}---\n${body}`;
}
export function patchMarkdown(raw: string, changes: Partial<Entity>, body?: string): string {
  const match = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match) throw new Error('Metadata missing. Restore the Markdown format first.');
  const doc = parseDocument(match[1], { uniqueKeys:true });
  if(doc.errors.length) throw new Error(doc.errors[0].message);
  for(const [key,value] of Object.entries(changes)) {
    if(value === undefined || value === '') doc.delete(key); else doc.set(key,value);
  }
  validate(doc.toJS());
  return `---\n${doc.toString()}---\n${body ?? raw.slice(match[0].length)}`;
}

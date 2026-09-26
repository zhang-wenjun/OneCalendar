import {diaryRecordAtLine} from './diary';
import type {Details} from './details';
export function diaryShortcut(kind:'task'|'idea',path:string,raw:string,day:string,line:number,details?:Details){
  const record=diaryRecordAtLine(path,raw,day,line,details);
  if(record){if(record.data.tc!==kind)throw Error(`Use the ${record.data.tc} shortcut to edit this entry.`);return {record,day};}
  const text=raw.split(/\r?\n/)[line]??'';
  if(!/^\s*$/.test(text)&&!/^\s*-\s*(?:\[ \]\s*)?$/.test(text))throw Error(`Place the cursor on a ${kind} entry or a blank line to create one.`);
  return {record:undefined,day};
}

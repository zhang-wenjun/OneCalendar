import { active, make, stamp } from './model';
import { Store } from './store';
export interface ExternalEvent { id:string; title:string; start:string; end:string; allDay:boolean; calendarId:string;provider?:string;description?:string;location?:string;sourceId?:string;calendarName?:string;color?:string }
export interface CalendarProvider {
  list(calendar:string,start:Date,end:Date):Promise<ExternalEvent[]>;
  put(calendar:string,key:string,title:string,time:string,externalId?:string):Promise<string>;
  remove(calendar:string,externalId:string):Promise<void>;
}
export interface FeishuTime {timestamp?:string;date?:string}
export interface FeishuEvent {event_id:string;status?:string;summary?:string;start_time?:FeishuTime;end_time?:FeishuTime;description?:string;location?:{name?:string}}
export interface FeishuData {items?:FeishuEvent[];event?:{event_id?:string}}
export type Transport=(method:string,path:string,body?:unknown)=>Promise<FeishuData>;
const enc=encodeURIComponent;
export class Feishu implements CalendarProvider {
  constructor(public request:Transport){}
  async list(calendar:string,start:Date,end:Date){
    const result:ExternalEvent[]=[];
    // Query short, non-overlapping windows; the endpoint expands recurring events.
    for(let cursor=start.getTime();cursor<end.getTime();cursor+=28*86400000){
      const params=new URLSearchParams({start_time:String(Math.floor(cursor/1000)),end_time:String(Math.floor(Math.min(cursor+28*86400000,end.getTime())/1000))});
      const data=await this.request('GET',`/calendar/v4/calendars/${enc(calendar)}/events/instance_view?${params}`);
      for(const e of data.items ?? []){
        if(e.status==='cancelled')continue;
        const time=(v:FeishuTime|undefined)=>v?.timestamp?new Date(Number(v.timestamp)*1000).toISOString():v?.date?`${v.date}T00:00:00`:'';
        const start=time(e.start_time),end=time(e.end_time);
        if(start&&end)result.push({id:e.event_id,title:e.summary||'Untitled event',start,end,allDay:!!e.start_time?.date,calendarId:calendar,description:e.description,location:e.location?.name});
      }
    }
    return [...new Map(result.map(e=>[`${e.calendarId}/${e.id}/${e.start}`,e])).values()];
  }
  async put(calendar:string,key:string,title:string,time:string,externalId?:string){
    const start=Math.floor(Date.parse(time)/1000);
    const body={summary:`[Task reminder] ${title}`,description:'Task reminder created and maintained by OneCalendar.',start_time:{timestamp:String(start)},end_time:{timestamp:String(start+300)},reminders:[{minutes:0}],free_busy_status:'free',visibility:'private'};
    const path=`/calendar/v4/calendars/${enc(calendar)}/events`;
    const data=await this.request(externalId?'PATCH':'POST',externalId?`${path}/${enc(externalId)}`:`${path}?idempotency_key=${enc(key)}`,body);
    const id=data.event?.event_id ?? externalId;if(!id)throw new Error('Feishu returned no event ID. The reminder remains pending for retry.');return id;
  }
  async remove(calendar:string,externalId:string){await this.request('DELETE',`/calendar/v4/calendars/${enc(calendar)}/events/${enc(externalId)}`);}
}
export class Reminders {
  private running=false;
  constructor(public store:Store){}
  async reconcile(){
    for(const task of this.store.all('task')){
      const t=task.data, key=`rem_${t.id}`; const rec=this.store.find(key);
      const desired=active(t)&&t.remind?JSON.stringify({title:t.title,time:t.remind}):'';
      if(!rec&&!desired)continue;
      if(!rec){await this.store.create(make('reminder',t.title,{id:key,task:t.id,desired,status:'Pending sync',generation:0}));continue;}
      if((rec.data.desired??'')!==desired||rec.data.status==='Source missing')await this.store.update(key,{desired,status:desired?'Pending sync':'Pending cancellation',error:undefined,nextRetry:undefined,attempts:0});
    }
    // Explicitly retain orphan mappings; cancellation is a recoverable user action,
    // not inferred from a transient file absence during vault synchronisation.
    for(const r of this.store.all('reminder'))if(!this.store.find(r.data.task!)&&r.data.status!=='Cancelled'&&r.data.status!=='Source missing'&&r.data.status!=='Pending cancellation')await this.store.update(r.data.id,{status:'Source missing',error:'Source task missing. Restore its file or cancel its reminder in settings.'});
  }
  async cancelOrphan(key:string){await this.store.update(key,{desired:undefined,status:'Pending cancellation',error:undefined});}
  async sync(provider:CalendarProvider|undefined,calendar:string,force=false,providerName='feishu'){
    if(this.running)return;this.running=true;
    try{
      await this.reconcile();
      for(const original of this.store.all('reminder')){
        let r=original.data;
        // Legacy mappings belong to Feishu. Never send another provider's IDs to this one.
        if((r.calendarId||r.externalId)&&(r.provider??'feishu')!==providerName)continue;
        if(['Cancelled','Source missing'].includes(r.status!))continue;
        if(r.desired===r.synced&&r.status==='Synced')continue;
        if(!force&&typeof r.nextRetry==='string'&&Date.parse(r.nextRetry)>Date.now())continue;
        if(!provider||(!calendar&&!r.calendarId))continue;
        try{
          if(!r.desired){
            if(r.externalId)await provider.remove(r.calendarId!,r.externalId);
            await this.store.update(r.id,{externalId:undefined,synced:undefined,status:'Cancelled',error:undefined,nextRetry:undefined,attempts:0,generation:Number(r.generation??0)+1});continue;
          }
          const value=JSON.parse(r.desired) as {title:string,time:string};
          if(Date.parse(value.time)<Date.now()&&!r.externalId){
            if(r.status!=='Expired')await this.store.update(r.id,{status:'Expired',error:'Reminder time has passed. Adjust it and retry.'});continue;
          }
          // Freeze calendar choice before the network request, including retry after a crash.
          if(!r.calendarId){const saved=await this.store.update(r.id,{calendarId:calendar,provider:providerName});r=saved.data;}
          const key=`taskcalendar-${r.task}-${Number(r.generation??0)}`;
          const externalId=await provider.put(r.calendarId!,key,value.title,value.time,r.externalId);
          const current=this.store.find(r.id);
          await this.store.update(r.id,{externalId,synced:r.desired,status:current.data.desired===r.desired?'Synced':'Pending sync',error:undefined,lastSuccess:stamp(),nextRetry:undefined,attempts:0});
        }catch(e){const attempts=Number(r.attempts??0)+1;await this.store.update(r.id,{status:'Sync failed',error:(e as Error).message,attempts,nextRetry:new Date(Date.now()+Math.min(900000,60000*2**Math.min(attempts-1,4))).toISOString()});}
      }
    }finally{this.running=false;}
  }
}

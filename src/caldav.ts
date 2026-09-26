import ICAL from 'ical.js';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import type {CalendarProvider,ExternalEvent} from './calendar';

export interface DavResponse {status:number;text:string;headers:Record<string,string>}
export type DavTransport=(method:string,url:string,headers:Record<string,string>,body?:string)=>Promise<DavResponse>;
export interface DavCalendar {url:string;name:string;readOnly?:boolean}
const utc=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const parser=new XMLParser({removeNSPrefix:true,ignoreAttributes:false,parseTagValue:false,trimValues:false,htmlEntities:true});
export function calendarUrl(value:string){
  let raw=value.trim();if(!raw)throw Error('Enter a CalDAV server or calendar URL first.');
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))raw='https://'+raw;
  let u:URL;try{u=new URL(raw);}catch{throw Error('Invalid CalDAV address. Use https://server.example/ or a full calendar URL.');}
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use HTTPS for CalDAV. HTTP is allowed only on localhost for testing.');
  if(u.username||u.password||u.search||u.hash)throw Error('Use a calendar collection URL without credentials, query or fragment.');
  if(!u.pathname.endsWith('/'))u.pathname+='/';return u.href;
}
export function basicAuth(username:string,password:string){
  if(!username||username.includes(':')||!password)throw Error('Enter a CalDAV username and app password.');
  return 'Basic '+btoa(Array.from(new TextEncoder().encode(`${username}:${password}`),b=>String.fromCharCode(b)).join(''));
}
function responses(text:string){
  if(text.length>10_000_000||/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw Error('Invalid or oversized CalDAV XML response.');
  const document=parser.parse(text);if(!Object.hasOwn(document,'multistatus'))throw Error('Expected a CalDAV multistatus response. Check the calendar URL.');
  return array(document.multistatus?.response);
}
function properties(response:any){
  const result:Record<string,any>={};
  if(response.status&&!/\s2\d\d\s/.test(response.status))throw Error('CalDAV resource access failed. Check permissions.');
  for(const p of array(response.propstat))if(/\s200\s/.test(p.status??''))Object.assign(result,p.prop);
  return result;
}
export function readCalendar(text:string,calendar:string,href:string,start:Date,end:Date):ExternalEvent[]{
  let parsed;try{parsed=ICAL.parse(text.trim());}catch{
    throw Error('CalDAV returned invalid iCalendar data; cache preserved.');
  }
  const root=new ICAL.Component(parsed);if(root.name!=='vcalendar')throw Error('Invalid iCalendar response.');
  const result:ExternalEvent[]=[];
  for(const c of root.getAllSubcomponents('vevent')){
    if(c.getFirstPropertyValue('status')==='CANCELLED')continue;
    // Request server-side expansion, which includes recurrence exceptions and timezones.
    if(c.hasProperty('rrule')||c.hasProperty('rdate'))throw Error('This CalDAV server did not expand repeating events. Cached events were preserved.');
    const event=new ICAL.Event(c);if(!c.hasProperty('dtstart'))throw Error('CalDAV event has no start date.');
    const from=event.startDate,to=event.endDate;
    const date=(time:ICAL.Time,name:string)=>{
      const tz=c.getFirstProperty(name)?.getParameter('tzid')??c.getFirstProperty('dtstart')?.getParameter('tzid');
      if(!tz||tz==='UTC'||time.isDate||time.zone===ICAL.Timezone.utcTimezone||root.getTimeZoneByID(String(tz)))return time.toJSDate();
      // Some services supply an IANA TZID without an embedded VTIMEZONE.
      let format:Intl.DateTimeFormat;try{format=new Intl.DateTimeFormat('en-US',{timeZone:String(tz),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw Error('CalDAV returned an unresolved timezone; cache preserved.');}
      const wall=Date.UTC(time.year,time.month-1,time.day,time.hour,time.minute,time.second);let candidate=wall;
      for(let i=0;i<5;i++){
        const parts=Object.fromEntries(format.formatToParts(new Date(candidate)).map(p=>[p.type,Number(p.value)]));
        const shown=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
        if(shown===wall)return new Date(candidate);candidate+=wall-shown;
      }
      throw Error('CalDAV returned a nonexistent local time; cache preserved.');
    };
    const a=date(from,'dtstart'),b=date(to,'dtend');if(!Number.isFinite(+a)||!Number.isFinite(+b))throw Error('Invalid CalDAV event date.');
    if(+a<+end&&(+b>+start||(+a===+b&&+a>=+start)))result.push({id:href,title:event.summary||'Untitled event',start:from.isDate?from.toString()+'T00:00:00':a.toISOString(),end:to.isDate?to.toString()+'T00:00:00':b.toISOString(),allDay:from.isDate,calendarId:calendar,provider:'caldav',description:String(c.getFirstPropertyValue('description')??''),location:String(c.getFirstPropertyValue('location')??'')});
  }
  return result;
}
function owned(text:string,key?:string){
  const root=new ICAL.Component(ICAL.parse(text)),events=root.getAllSubcomponents('vevent');
  const c=events[0],marker=c?.getFirstPropertyValue('x-taskcalendar-id');
  if(root.name!=='vcalendar'||events.length!==1||typeof marker!=='string'||!marker.startsWith('taskcalendar-')||c.getFirstPropertyValue('uid')!==`${marker}@taskcalendar`||(key&&marker!==key))throw Error('This calendar resource is not a TaskCalendar reminder. Nothing was changed.');
  return {root,c,marker};
}
export function reminderCalendar(key:string,title:string,time:string,existing?:string){
  const {root,c}=existing?owned(existing,key):{root:new ICAL.Component('vcalendar'),c:new ICAL.Component('vevent')};
  if(!existing){root.updatePropertyWithValue('version','2.0');root.updatePropertyWithValue('prodid','-//TaskCalendar//CalDAV reminders//EN');root.addSubcomponent(c);c.updatePropertyWithValue('uid',`${key}@taskcalendar`);c.updatePropertyWithValue('x-taskcalendar-id',key);}
  const d=new Date(time);if(!Number.isFinite(+d))throw Error('Invalid reminder time.');
  c.updatePropertyWithValue('summary',`[Task reminder] ${title}`);
  c.updatePropertyWithValue('description','Task reminder created and maintained by TaskCalendar.');
  c.updatePropertyWithValue('dtstamp',ICAL.Time.fromJSDate(new Date(),true));
  c.updatePropertyWithValue('dtstart',ICAL.Time.fromJSDate(d,true));
  c.removeAllProperties('duration');c.updatePropertyWithValue('dtend',ICAL.Time.fromJSDate(new Date(+d+300000),true));
  c.updatePropertyWithValue('sequence',Number(c.getFirstPropertyValue('sequence')??0)+1);
  c.updatePropertyWithValue('transp','TRANSPARENT');c.updatePropertyWithValue('class','PRIVATE');
  c.removeAllSubcomponents('valarm');const alarm=new ICAL.Component('valarm');alarm.updatePropertyWithValue('action','DISPLAY');alarm.updatePropertyWithValue('description',title);alarm.updatePropertyWithValue('trigger',ICAL.Duration.fromString('PT0S'));c.addSubcomponent(alarm);
  return root.toString()+'\r\n';
}
export class CalDav implements CalendarProvider {
  readonly url:string;
  constructor(url:string,private transport:DavTransport){this.url=calendarUrl(url);}
  private collection(calendar:string){if(calendarUrl(calendar)!==this.url)throw Error('Reminder belongs to another CalDAV calendar. Restore its original connection to update or cancel it.');return this.url;}
  private resource(href:string){const u=new URL(href,this.url);if(u.origin!==new URL(this.url).origin||!u.pathname.startsWith(new URL(this.url).pathname)||u.href===this.url||u.search||u.hash||u.username||u.password)throw Error('CalDAV resource points outside the configured calendar.');return u.href;}
  private async request(method:string,url:string,headers:Record<string,string>={},body?:string){
    const r=await this.transport(method,url,headers,body);
    if(r.status===401||r.status===403)throw Error(`CalDAV authentication or permissions failed (${method}, HTTP ${r.status}). Check username, app password and calendar access.`);
    if(r.status>=300&&r.status<400)throw Error('Use the final CalDAV calendar URL; redirects are not supported.');
    return r;
  }
  private ok(r:DavResponse,statuses:number[]){if(!statuses.includes(r.status))throw Error(`CalDAV request failed (HTTP ${r.status}).`);}
  async discover():Promise<DavCalendar[]>{
    const props='<d:displayname/><d:resourcetype/><d:current-user-principal/><c:calendar-home-set/><d:current-user-privilege-set/><c:supported-calendar-component-set/>';
    const resolve=(href:string,base:string)=>{const u=new URL(href,base);if(u.origin!==new URL(this.url).origin||u.username||u.password||u.search||u.hash)throw Error('Discovery returned a different server. Enter that trusted server URL explicitly before connecting.');return u.href;};
    const probe=async(url:string,depth='0')=>{const r=await this.request('PROPFIND',url,{Depth:depth,'Content-Type':'application/xml; charset=utf-8'},`<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`);this.ok(r,[207]);return responses(r.text).map(row=>({href:resolve(String(row.href??url),url),p:properties(row)}));};
    const calendars=new Map<string,DavCalendar>();
    const collect=(rows:Awaited<ReturnType<typeof probe>>)=>{for(const {href,p}of rows){if(!p.resourcetype||!Object.hasOwn(p.resourcetype,'calendar'))continue;const components=array(p['supported-calendar-component-set']?.comp);if(components.length&&!components.some(c=>String(c['@_name']).toUpperCase()==='VEVENT'))continue;
      const privileges=p['current-user-privilege-set'];const write=privileges===undefined?undefined:array(privileges.privilege).some(v=>['all','write','write-content','bind'].some(k=>Object.hasOwn(v,k)));
      const url=calendarUrl(href);calendars.set(url,{url,name:String(p.displayname||url),readOnly:write===undefined?undefined:!write});}};
    let rows:Awaited<ReturnType<typeof probe>>;
    try{rows=await probe(this.url);}catch(e){if(!/HTTP (404|405)/.test((e as Error).message))throw e;rows=await probe(new URL('/.well-known/caldav',this.url).href);}
    collect(rows);if(calendars.size)return [...calendars.values()];
    const homes=new Set<string>(),principals=new Set<string>();
    const links=(items:typeof rows)=>{for(const {href,p}of items){for(const h of array(p['calendar-home-set']?.href))if(typeof h==='string')homes.add(resolve(h,href));for(const h of array(p['current-user-principal']?.href))if(typeof h==='string')principals.add(resolve(h,href));}};
    links(rows);
    if(!homes.size)for(const principal of [...principals].slice(0,8)){const result=await probe(principal);collect(result);links(result);}
    for(const home of [...homes].slice(0,8))collect(await probe(home,'1'));
    if(!homes.size&&!calendars.size)collect(await probe(this.url,'1'));
    if(!calendars.size)throw Error('Connected, but no event calendars were found. Check account access or enter a specific calendar URL.');
    return [...calendars.values()];
  }
  async testConnection(){
    const r=await this.request('PROPFIND',this.url,{Depth:'0','Content-Type':'application/xml; charset=utf-8'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>');this.ok(r,[207]);
    const found=responses(r.text).map(properties).find(p=>p.resourcetype&&Object.hasOwn(p.resourcetype,'calendar'));if(!found)throw Error('Enter the URL of a specific CalDAV calendar, not a server homepage or ICS subscription.');return String(found.displayname||'Calendar');
  }
  async list(calendar:string,start:Date,end:Date){
    const url=this.collection(calendar),a=utc(start),b=utc(end);
    const body=`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand start="${a}" end="${b}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${a}" end="${b}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    let r=await this.request('REPORT',url,{Depth:'1','Content-Type':'application/xml; charset=utf-8'},body);this.ok(r,[207]);
    // Some servers reject calendar-data expansion as an unavailable property.
    // Retry without expansion, retaining strict recurrence validation below.
    if(responses(r.text).some(row=>array(row.propstat).some(p=>/\s404\s/.test(p.status??'')&&Object.hasOwn(p.prop??{},'calendar-data')))){
      r=await this.request('REPORT',url,{Depth:'1','Content-Type':'application/xml; charset=utf-8'},body.replace(/<c:calendar-data>.*?<\/c:calendar-data>/,'<c:calendar-data/>'));this.ok(r,[207]);
    }
    let rows=responses(r.text);
    // Servers with incomplete calendar-query support can return only collection
    // properties. Enumerate member resources and GET their iCalendar bodies.
    if(rows.some(row=>typeof row.href==='string'&&calendarUrl(new URL(row.href,url).href)===url&&!Object.hasOwn(properties(row),'calendar-data'))){
      const listing=await this.request('PROPFIND',url,{Depth:'1','Content-Type':'application/xml; charset=utf-8'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontenttype/></d:prop></d:propfind>');this.ok(listing,[207]);
      rows=responses(listing.text).filter(row=>{
        if(typeof row.href!=='string')throw Error('CalDAV returned a resource without a URL; cache preserved.');
        const p=properties(row);return calendarUrl(new URL(row.href,url).href)!==url&&!Object.hasOwn(p.resourcetype??{},'collection');
      });
    }
    if(rows.length>2000)throw Error('CalDAV returned too many resources; cache preserved. Use a smaller calendar.');
    if(rows.some(row=>!Object.hasOwn(properties(row),'calendar-data'))){
      if(rows.some(row=>typeof row.href!=='string'))throw Error('CalDAV did not return event data or resource URLs; cache preserved.');
      const hrefs=rows.map(row=>this.resource(String(row.href)));
      const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const fetched:typeof rows=[];
      for(let i=0;i<hrefs.length;i+=100){
        const chunk=hrefs.slice(i,i+100);
        const multi=await this.request('REPORT',url,{'Content-Type':'application/xml; charset=utf-8',Depth:'1'},`<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop>${chunk.map(h=>`<d:href>${escape(new URL(h).pathname)}</d:href>`).join('')}</c:calendar-multiget>`);this.ok(multi,[207]);
        const batch=responses(multi.text);
        if(batch.length!==chunk.length)throw Error('CalDAV returned an incomplete event batch; cache preserved.');
        const expected=new Set(chunk);for(const row of batch){const href=this.resource(String(row.href));if(!expected.delete(href))throw Error('CalDAV returned unexpected event data; cache preserved.');}
        fetched.push(...batch);
      }
      rows=fetched;
    }
    const events:ExternalEvent[]=[];for(const response of rows){
      const p=properties(response),data=p['calendar-data'];
      // Attributes such as content-type and version make fast-xml-parser return
      // an object containing #text rather than a plain string.
      let text=typeof data==='string'?data:data?.['#text'];
      if(typeof text!=='string'&&typeof response.href==='string'){
        const resource=await this.request('GET',this.resource(response.href));this.ok(resource,[200]);text=resource.text;
      }
      if(typeof text!=='string'){
        const codes=array(response.propstat).map(s=>String(s.status??'').match(/\b\d{3}\b/)?.[0]).filter(Boolean).join(', ');
        throw Error(`CalDAV did not return event data (property status: ${codes||'unknown'}); cache preserved.`);
      }
      const href=this.resource(String(response.href));events.push(...readCalendar(text,url,href,start,end));
    }
    return events;
  }
  private async current(url:string){const r=await this.request('GET',url);if(r.status===404)return undefined;this.ok(r,[200]);const etag=Object.entries(r.headers).find(([k])=>k.toLowerCase()==='etag')?.[1];if(!etag||etag.startsWith('W/'))throw Error('CalDAV must provide a strong ETag for safe updates.');return {text:r.text,etag};}
  async put(calendar:string,key:string,title:string,time:string,externalId?:string){
    this.collection(calendar);const url=this.resource(externalId||`taskcalendar-${encodeURIComponent(key)}.ics`);
    if(url!==this.resource(`taskcalendar-${encodeURIComponent(key)}.ics`))throw Error('Reminder URL does not match its stable ID. Nothing was changed.');
    const previous=await this.current(url);if(previous)owned(previous.text,key);
    const body=reminderCalendar(key,title,time,previous?.text);
    const r=await this.request('PUT',url,{'Content-Type':'text/calendar; charset=utf-8',...(previous?{'If-Match':previous.etag}:{'If-None-Match':'*'})},body);
    if(r.status===412)throw Error('CalDAV reminder changed elsewhere. Retry to reload it.');this.ok(r,[200,201,204]);return url;
  }
  async remove(calendar:string,externalId:string){
    this.collection(calendar);const url=this.resource(externalId),previous=await this.current(url);if(!previous)return;
    const {marker}=owned(previous.text);if(url!==this.resource(`taskcalendar-${encodeURIComponent(marker)}.ics`))throw Error('Reminder URL does not match its ownership marker.');
    const r=await this.request('DELETE',url,{'If-Match':previous.etag});if(r.status===412)throw Error('CalDAV reminder changed elsewhere. Retry to reload it.');this.ok(r,[200,204,404]);
  }
}

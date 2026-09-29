import OneCalendar from '../src/main';
import {CalDav} from '../src/caldav';
import {renderCalDavSettings} from '../src/caldav-settings';
import {CalendarView} from '../src/view';
const plugin=new OneCalendar({} as any,{} as any);
const state={fail:false,empty:false,calls:0};
Object.assign(plugin,{app:{},store:{changed(){},all(){return [];}},saveData:async()=>{}});
plugin.settings={...plugin.settings,calendarProvider:'caldav',readEnabled:false};
const xml=(href:string,props:string)=>`<D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
plugin.calDav=(url=plugin.calDavTarget())=>new CalDav(url,async(method,path)=>{
 state.calls++;if(state.fail)return {status:401,text:'',headers:{}};
 let text='';if(method==='PROPFIND'){
  if(path==='https://calendar.example/')text=xml('/','<D:current-user-principal><D:href>/principal/</D:href></D:current-user-principal>');
  else if(path.endsWith('/principal/'))text=xml('/principal/','<C:calendar-home-set><D:href>/home/</D:href></C:calendar-home-set>');
  else text=xml('/home/work/','<D:displayname>Work</D:displayname><D:resourcetype><C:calendar/></D:resourcetype>')+xml('/home/readonly/','<D:displayname>Read only</D:displayname><D:resourcetype><C:calendar/></D:resourcetype><D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set>');
 }else if(method==='REPORT'&&!state.empty){const day=new Date().toISOString().slice(0,10).replaceAll('-','');text=xml(new URL(path).pathname+'item.ics',`<C:calendar-data>BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture\r\nDTSTART:${day}T090000Z\r\nDTEND:${day}T100000Z\r\nSUMMARY:Calendar UI test\r\nLOCATION:Room 4\r\nDESCRIPTION:Full event description\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n</C:calendar-data>`);}
 return {status:207,text:`<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${text}</D:multistatus>`,headers:{}};
});
renderCalDavSettings(document.getElementById('app')!,plugin);
Object.assign(window,{caldavQA:{plugin,state,openCalendar(){Object.assign(plugin.store,{problems:()=>[]});const view=new CalendarView({} as any,plugin);view.page='calendar';view.calendarMode='week';view.render();return view;}}});

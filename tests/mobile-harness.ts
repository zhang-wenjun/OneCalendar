import {DailyNotes} from '../src/daily-notes';
import {DiaryCalendar} from '../src/diary-calendar';
import {TFile} from 'obsidian';
import {MemoEditor} from '../src/forms';
import {CalendarView} from '../src/view';
import {Editor} from '../src/forms';
import {Store,Files} from '../src/store';
import {Details} from '../src/details';
import {dateKey,make} from '../src/model';
const map=new Map<string,string>();
const files:Files={list:()=>[...map.keys()],exists:p=>map.has(p),read:async p=>map.get(p)!,mkdir:async()=>{},create:async(p,c)=>{map.set(p,c);},process:async(p,f)=>{map.set(p,f(map.get(p)!));}};
const store=new Store(files);store.details=new Details(files,'TaskCalendar/Details.md');
store.diaryDate=p=>/^diary\/\d{4}-\d{2}-\d{2}\.md$/.test(p)?p.slice(6,-3):undefined;
store.journal={path:d=>`diary/${d}.md`,ensure:async d=>{const p=`diary/${d}.md`;if(!map.has(p))map.set(p,'## Tasks\n\n## Journal\nKeep my journal.\n\n## Ideas\n');}};
const opened:string[]=[];
const plugin:any={store,externalEvents:[],calendarStatus:'Offline: local records available.',openDiary:async(day:string)=>{opened.push(day);},syncCalendar:async()=>{},run:async(fn:any)=>fn(),capture:(kind:any)=>new Editor({} as any,store,kind).open()};
const view=new CalendarView({} as any,plugin);
async function boot(){await store.init();await store.create(make('task','Review paper',{plan:dateKey(),status:'todo'}));await store.create(make('event','Study session',{start:`${dateKey()}T09:00`,end:`${dateKey()}T10:00`}));await view.onOpen();Object.assign(window,{qa:{store,view,map,opened,openMini,openMemo:async()=>{const p=await store.create(make('project','Research project'));new MemoEditor({} as any,store,p.data.id).open();}}});}
void boot().catch(e=>{console.error(JSON.stringify([...map.entries()]),JSON.stringify(store.problems()));throw e;});



async function openMini(){
 await view.onClose();
 const files=new Map<string,any>();let active:any;
 const app:any={vault:{on:()=>({}),getAbstractFileByPath:(p:string)=>files.get(p),createFolder:async(p:string)=>files.set(p,{}),create:async(p:string)=>{const f=Object.assign(new TFile(),{path:p});files.set(p,f);return f;}},workspace:{on:()=>({}),getActiveFile:()=>active,getLeaf:()=>({openFile:async(f:any)=>{active=f;}})}};
 const diary=new DailyNotes(app);const mini=new DiaryCalendar({} as any,{diary,openDiary:(day:string)=>diary.open(day)} as any);mini.app=app;mini.contentEl=document.getElementById('app')!;mini.contentEl.className='';void mini.onOpen();
 Object.assign(window,{miniQA:{files,diary,mini}});
}


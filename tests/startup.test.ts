import {test} from 'node:test';
import assert from 'node:assert/strict';
import OneCalendar from '../src/main';
import {TFile} from 'obsidian';
import {writeMarkdown} from '../src/markdown';
import {make,dateKey} from '../src/model';

test('A failed startup migration prevents background scheduling and reminder writes',async()=>{
 const map=new Map<string,string>([['TaskCalendar/关联信息.md','legacy'],['TaskCalendar/Details.md','conflict'],['TaskCalendar/Series/s.md',writeMarkdown(make('series','Repeat',{id:'s',rule:'daily',interval:1,occurrence:dateKey(),next:dateKey()}),'')]]);
 let loaded=false,writes=0,onReady=()=>{},pending:Promise<unknown>=Promise.resolve();const timers:(()=>void)[]=[],errors:string[]=[];
 const oldWindow=(globalThis as any).window;(globalThis as any).window={setInterval:(fn:()=>void)=>{timers.push(fn);return timers.length;},setTimeout:()=>1,clearTimeout:()=>{}};
 const vault:any={configDir:'.obsidian',adapter:{exists:async()=>false},getName:()=> 'Test',getAbstractFileByPath:(p:string)=>loaded&&map.has(p)?new (TFile as any)(p):null,getMarkdownFiles:()=>loaded?[...map.keys()].map(p=>new (TFile as any)(p)):[],read:async(f:TFile)=>map.get(f.path),create:async()=>{writes++;},process:async()=>{writes++;},createFolder:async()=>{},on:()=>({})};
 const plugin=new OneCalendar({} as any,{} as any);Object.assign(plugin,{app:{vault,workspace:{onLayoutReady:(fn:()=>void)=>{onReady=fn;}},fileManager:{renameFile:async()=>{writes++;}}},loadData:async()=>({}),saveData:async()=>{},registerView:()=>{},addRibbonIcon:()=>{},addCommand:()=>{},addSettingTab:()=>{},registerEvent:()=>{},registerInterval:()=>{}});
 plugin.run=async fn=>{pending=(async()=>{try{return await fn();}catch(e){errors.push((e as Error).message);}})();await pending;};
 try{
  await plugin.onload();assert.equal(writes,0);for(const fn of timers){fn();await pending;}assert.equal(writes,0);
  loaded=true;onReady();await pending;assert.ok(errors.some(e=>e.includes('Both legacy and current Details')));
  for(const fn of timers){fn();await pending;}await plugin.syncReminders();assert.equal(writes,0);assert.equal(map.size,3);
 }finally{plugin.onunload();(globalThis as any).window=oldWindow;}
});

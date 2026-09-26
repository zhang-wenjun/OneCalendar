import {test} from 'node:test';
import assert from 'node:assert/strict';
import TaskCalendar from '../src/main';
test('Resume waits for readiness, coalesces concurrent resumes, and releases after failure',async()=>{
 const p=new TaskCalendar({} as any,{} as any);let ticks=0,reminders=0,changes=0;let release!:()=>void;
 p.store={tick:async()=>{ticks++;await new Promise<void>(r=>release=r);},changed:()=>changes++} as any;
 p.syncReminders=async()=>{reminders++;};p.settings={...p.settings,readEnabled:false};
 await p.resume();assert.equal(ticks,0);(p as any).ready=true;
 const first=p.resume();await p.resume();assert.equal(ticks,1);release();await first;assert.equal(reminders,1);
 p.store.tick=async()=>{throw Error('offline');};await assert.rejects(p.resume(),/offline/);assert.equal(changes,2);
 p.store.tick=async()=>{ticks++;};await p.resume();assert.equal(ticks,2);
 p.onunload();await p.resume();assert.equal(ticks,2);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import OneCalendar from '../src/main';
test('Ideas URI queues during startup, coalesces pending requests and opens only after readiness',()=>{
  const p=new OneCalendar({} as any,{} as any);const opened:string[]=[];
  p.capture=kind=>{opened.push(kind);};
  p.requestIdeaCapture();p.requestIdeaCapture();assert.deepEqual(opened,[]);
  (p as any).ready=true;p.flushIdeaCapture();p.flushIdeaCapture();assert.deepEqual(opened,['idea']);
  p.requestIdeaCapture();assert.deepEqual(opened,['idea','idea']);
  p.onunload();p.requestIdeaCapture();assert.equal(opened.length,2);
});
test('Ideas URI encodes the selected vault, including non-ASCII and reserved characters',()=>{
  const p=new OneCalendar({} as any,{} as any);
  (p as any).app={vault:{getName:()=> '科研 & Ideas/#'}};
  const uri=new URL(p.ideaCaptureLink());assert.equal(uri.protocol,'obsidian:');assert.equal(uri.hostname,'one-calendar-idea');
  assert.equal(uri.searchParams.get('vault'),'科研 & Ideas/#');assert.equal(uri.hash,'');
});

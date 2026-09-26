import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalendarView } from '../src/view';
import { make } from '../src/model';

function viewWith(events:ReturnType<typeof make>[],external:unknown[]=[]){
  const view=Object.create(CalendarView.prototype) as CalendarView;
  (view as any).plugin={store:{all:()=>events.map(data=>({data,path:'test.md',raw:'',body:''}))},externalEvents:external};
  return view;
}
test('Actual agenda query includes a cross-midnight event on both intersecting days',()=>{
  const view=viewWith([make('event','跨天',{start:'2026-09-22T23:00',end:'2026-09-23T01:00'})]);
  assert.equal(view.eventsFor('2026-09-22').length,1);assert.equal(view.eventsFor('2026-09-23').length,1);assert.equal(view.eventsFor('2026-09-24').length,0);
});
test('Actual agenda query treats end midnight as exclusive and omits archived events',()=>{
  const view=viewWith([make('event','到午夜',{start:'2026-09-22T23:00',end:'2026-09-23T00:00'}),make('event','归档',{start:'2026-09-23T01:00',end:'2026-09-23T02:00',archived:true})]);
  assert.equal(view.eventsFor('2026-09-22').length,1);assert.equal(view.eventsFor('2026-09-23').length,0);
});
test('Actual agenda query preserves external all-day read-only source and sorts entries',()=>{
  const view=viewWith([make('event','下午',{start:'2026-09-22T14:00',end:'2026-09-22T15:00'})],[{id:'remote',title:'全天',start:'2026-09-22T00:00',end:'2026-09-23T00:00',allDay:true,calendarId:'cal'}]);
  const events=view.eventsFor('2026-09-22');assert.equal(events[0].title,'全天');assert.equal(events[0].allDay,true);assert.equal(events[0].source,'Feishu · Read only');assert.equal(events[0].record,undefined);
});

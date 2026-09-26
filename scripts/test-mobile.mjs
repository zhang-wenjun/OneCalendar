import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
await mkdir('artifacts/mobile',{recursive:true});
await build({entryPoints:['tests/mobile-harness.ts'],outfile:'artifacts/mobile/harness.js',bundle:true,platform:'browser',alias:{obsidian:'./tests/mobile-host.ts'}});
const css=await readFile('styles.css','utf8');
await writeFile('artifacts/mobile/index.html',`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#fff;--background-secondary:#f6f6f6;--text-normal:#222;--text-muted:#666;--background-modifier-border:#ddd;--interactive-accent:#6354ca}*{box-sizing:border-box}body{margin:0;font:16px Arial}button,input,select,textarea{font:inherit}button{padding:8px;border:1px solid #ccc;border-radius:5px}#app{height:100vh}.modal{position:fixed;inset:12px;background:white;border:1px solid #aaa;padding:14px;z-index:10;overflow:auto}.modal textarea{width:100%}${css}</style><main id="app"></main><script src="harness.js"></script>`);
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const results=[];
try{
 for(const width of [320,390,768]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('console',m=>{if(m.type()==='error')console.error(m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(pathToFileURL(`${process.cwd()}/artifacts/mobile/index.html`).href);await page.waitForFunction(()=>window.qa);
  await page.getByRole('button',{name:'Calendar',exact:true}).tap();
  assert.equal(await page.locator('.tc-week-column').count(),3);
  assert.equal(await page.getByRole('button',{name:'Agenda',exact:true}).count(),0);
  assert.equal(await page.getByRole('navigation').getByRole('button',{name:'Today',exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.querySelector('#app').scrollWidth<=innerWidth));
  const shellTop=await page.locator('.tc-shell').evaluate(e=>e.getBoundingClientRect().top);
  await page.locator('.tc-calendar-viewport').evaluate(e=>e.scrollTop=600);
  assert.equal(await page.locator('.tc-shell').evaluate(e=>e.getBoundingClientRect().top),shellTop);
  const delta=await page.evaluate(()=>document.querySelector('.tc-week-head').getBoundingClientRect().top-document.querySelector('.tc-calendar-viewport').getBoundingClientRect().top);
  assert.ok(Math.abs(delta)<2,`Date header should stick: ${delta}`);
  await page.screenshot({path:`artifacts/mobile/sticky-${width}.png`});
  await page.locator('.tc-calendar-viewport').evaluate(e=>e.scrollTop=0);
  await page.getByRole('button',{name:'＋ Event',exact:true}).tap();await page.getByRole('button',{name:'Save',exact:true}).tap();assert.ok(await page.locator('.tc-error').textContent());
  await page.getByLabel('Start time',{exact:true}).fill('2026-09-25T23:50');await page.getByLabel('Title',{exact:true}).tap();
  assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'2026-09-26T00:20');
  assert.equal(await page.getByLabel('Linked task (optional)').locator('option').count(),1);
  await page.getByLabel('Title',{exact:true}).fill('Reminder event');
  await page.getByLabel('Reminder time',{exact:true}).fill('2026-09-25T23:40');
  await page.getByRole('button',{name:'Save',exact:true}).tap();
  await page.waitForFunction(()=>window.qa.store.all('event').some(r=>r.data.remind==='2026-09-25T23:40'));
  await page.getByRole('button',{name:'＋ Idea',exact:true}).tap();assert.equal(await page.locator('.tc-capture-options').getAttribute('open'),null);await page.locator('textarea').fill('Mobile idea');await page.screenshot({path:'artifacts/mobile/idea-' + width + '.png'});await page.getByRole('button',{name:'Save',exact:true}).tap();await page.waitForFunction(()=>window.qa.store.all('idea').length===1);
  await page.getByRole('button',{name:'＋ Task',exact:true}).tap();await page.getByLabel('Title',{exact:true}).fill('Mobile task');await page.getByRole('button',{name:'Save',exact:true}).tap();await page.waitForFunction(()=>window.qa.store.all('task').length===2);
  await page.evaluate(()=>window.qa.store.init());assert.equal(await page.evaluate(()=>window.qa.store.all('idea')[0].body),'Mobile idea');
  assert.ok(await page.evaluate(()=>[...window.qa.map.values()].some(v=>v.includes('Keep my journal.'))));
  await page.screenshot({path:`artifacts/mobile/agenda-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Week',exact:true}).tap();await page.locator('.tc-week-scroll').evaluate(e=>{e.scrollTop=0;});await page.locator('.tc-time-slot').first().tap();assert.equal(await page.locator('.modal').count(),1);await page.getByRole('button',{name:'Cancel',exact:true}).tap();
  await page.getByRole('button',{name:'3 days',exact:true}).tap();
  assert.equal(await page.locator('.tc-week-column').count(),3);
  assert.equal(await page.locator('.tc-week-scroll').evaluate(e=>e.scrollHeight===e.clientHeight),true);
  assert.equal(await page.locator('.tc-now-label').evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await page.getByLabel('More pages').count(),0);
  const firstDay=await page.locator('.tc-week-body').getAttribute('data-week');
  await page.getByRole('button',{name:'Next 3 days',exact:true}).tap();
  assert.notEqual(await page.locator('.tc-week-body').getAttribute('data-week'),firstDay);
  await page.getByRole('button',{name:'Previous 3 days',exact:true}).tap();
  assert.equal(await page.locator('.tc-week-body').getAttribute('data-week'),firstDay);
  await page.locator('#app').evaluate(e=>e.scrollTop=0);
  assert.ok(await page.locator('.tc-week-head').evaluate(e=>e.getBoundingClientRect().top<400));
  await page.screenshot({path:`artifacts/mobile/three-${width}.png`});
  const slot=page.locator('.tc-time-slot').first();await slot.scrollIntoViewIfNeeded();const box=await slot.boundingBox();
  const cdp=await context.newCDPSession(page);const x=box.x+box.width/2,y=box.y+10;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await new Promise(r=>setTimeout(r,550));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+60}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('.modal').waitFor();assert.equal(await page.locator('.modal').count(),1);
  assert.match(await page.getByLabel('Start time',{exact:true}).inputValue(),/T00:00$/);assert.match(await page.getByLabel('End time',{exact:true}).inputValue(),/T01:30$/);
  await page.getByRole('button',{name:'Cancel',exact:true}).tap();
  await page.getByRole('button',{name:'Month',exact:true}).tap();await page.locator('.tc-day').nth(10).tap();assert.ok(await page.evaluate(()=>window.qa.opened.length===1));
  await page.getByRole('navigation').getByRole('button',{name:'Tasks',exact:true}).tap();assert.equal(await page.locator('.tc-board').count(),1);assert.equal(await page.getByRole('button',{name:'Task board',exact:true}).count(),0);
  await page.evaluate(()=>window.qa.openMemo());
  assert.ok(await page.getByRole('heading',{name:'Update memo · Research project'}).isVisible());
  assert.ok(await page.locator('.tc-memo-input').evaluate(e=>e.compareDocumentPosition(e.nextElementSibling)&Node.DOCUMENT_POSITION_FOLLOWING));
  await page.locator('.tc-memo-input').fill('Memo test');await page.getByRole('button',{name:'Save new memo',exact:true}).tap();
  await page.evaluate(()=>window.qa.openMini());
  const other=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  await page.getByRole('button',{name:`Open diary ${other}`,exact:true}).tap();
  assert.ok(await page.getByRole('heading',{name:`Create diary for ${other}?`}).isVisible());
  await page.getByRole('button',{name:'Cancel',exact:true}).tap();assert.equal(await page.evaluate(()=>window.miniQA.files.size),0);
  await page.getByRole('button',{name:`Open diary ${other}`,exact:true}).tap();await page.getByRole('button',{name:'Create',exact:true}).tap();
  await page.waitForFunction(()=>window.miniQA.files.size===2);
  await page.getByRole('button',{name:`Open diary ${other}`,exact:true}).tap();assert.equal(await page.locator('.modal').count(),0);
  await page.evaluate(()=>window.miniQA.mini.render());await page.screenshot({path:`artifacts/mobile/mini-${width}.png`});
  assert.deepEqual(errors,[]);results.push({width,status:'passed',checks:['sidebar calendar and creation confirmation','memo project title','sticky header and controls','event reminder persistence','end time repair across midnight','in-progress task filter','no page overflow','event validation','idea and task capture','storage reload','journal preserved','one modal per touch','compact navigation','three-day navigation','single vertical scroll','long-press drag range','month opens diary','single Tasks board']});await context.close();
 }
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});
 await desktop.goto(pathToFileURL(`${process.cwd()}/artifacts/mobile/index.html`).href+'?desktop');await desktop.waitForFunction(()=>window.qa);
 await desktop.getByRole('navigation').getByRole('button',{name:'Calendar',exact:true}).click();assert.equal(await desktop.locator('.tc-week-column').count(),7);
 await desktop.getByRole('button',{name:'3 days',exact:true}).click();assert.equal(await desktop.locator('.tc-week-column').count(),3);
 await desktop.locator('.tc-week-scroll').evaluate(e=>e.scrollTop=0);const slot=desktop.locator('.tc-time-slot').first();await slot.scrollIntoViewIfNeeded();const rect=await slot.boundingBox();
 await desktop.mouse.move(rect.x+rect.width/2,rect.y+10);await desktop.mouse.down();await desktop.mouse.move(rect.x+rect.width/2,rect.y+70);await desktop.mouse.up();
 assert.equal(await desktop.locator('.modal').count(),1);await desktop.getByRole('button',{name:'Cancel',exact:true}).click();
 await desktop.screenshot({path:'artifacts/mobile/desktop-compact.png'});results.push({width:1280,status:'passed',checks:['desktop three-day layout','mouse drag range','single modal']});await desktop.close();
}finally{await browser.close();}
await writeFile('artifacts/mobile/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));





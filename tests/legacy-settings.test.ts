import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renamedPluginData} from '../src/legacy-settings';
const data={settings:{root:'TaskCalendar',caldavSecretName:'old-key'},externalEvents:[{id:'event'}]};
function adapter(name='TaskCalendar',author='TaskCalendar'){
 const files=new Map([['.obsidian/plugins/task-calendar/manifest.json',JSON.stringify({id:'task-calendar',name,author})],['.obsidian/plugins/task-calendar/data.json',JSON.stringify(data)]]);
 return {exists:async(p:string)=>files.has(p),read:async(p:string)=>files.get(p)!};
}
test('Rename imports development settings and cached events without changing storage or secret identifiers',async()=>{
 assert.deepEqual(await renamedPluginData(null,adapter(),'.obsidian'),data);
});
test('Rename preserves existing settings and ignores the unrelated community plugin with the old ID',async()=>{
 const existing={settings:{root:'Custom'}};assert.equal(await renamedPluginData(existing,adapter(),'.obsidian'),existing);
 assert.equal(await renamedPluginData(null,adapter('Task Calendar','Someone else'),'.obsidian'),undefined);
});

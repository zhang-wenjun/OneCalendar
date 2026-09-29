import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
if(manifest.id!=='one-calendar'||manifest.name!=='OneCalendar')throw Error('Unexpected build identity');
const base='AITestBed/.obsidian',target=`${base}/plugins/${manifest.id}`,legacy=`${base}/plugins/task-calendar`;
const readJson=async(path)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return undefined;throw e;}};
await mkdir(target,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css'])await copyFile(`dist/${file}`,`${target}/${file}`);
const old=await readJson(`${legacy}/manifest.json`);
if(old?.name==='TaskCalendar'&&old.author==='TaskCalendar'){
  if(await readJson(`${target}/data.json`)===undefined){const data=await readJson(`${legacy}/data.json`);if(data)await writeFile(`${target}/data.json`,JSON.stringify(data,null,2));}
  const enabled=await readJson(`${base}/community-plugins.json`);
  if(Array.isArray(enabled)&&enabled.includes('task-calendar'))await writeFile(`${base}/community-plugins.json`,JSON.stringify([...new Set(enabled.map(id=>id==='task-calendar'?manifest.id:id))],null,2));
  const hotkeys=await readJson(`${base}/hotkeys.json`);
  if(hotkeys){for(const [id,value] of Object.entries(hotkeys))if(id.startsWith('task-calendar:'))hotkeys[id.replace(/^task-calendar:/,'one-calendar:')]??=value;await writeFile(`${base}/hotkeys.json`,JSON.stringify(hotkeys,null,2));}
}
console.log(`Installed into ${target}. Restart Obsidian to unload the old development plugin.`);

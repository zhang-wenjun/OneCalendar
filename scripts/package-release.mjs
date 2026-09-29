import {mkdir,readFile,copyFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const built=JSON.parse(await readFile('dist/manifest.json','utf8'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(manifest.id!=='one-calendar'||manifest.name!=='OneCalendar'||pkg.version!==manifest.version||JSON.stringify(built)!==JSON.stringify(manifest))throw Error('Release identity or version mismatch.');
const assets=`artifacts/github-release-${manifest.version}`,bundle=`release/OneCalendar-${manifest.version}`;
await mkdir(assets,{recursive:true});await mkdir(`${bundle}/docs`,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css','LICENSE','THIRD-PARTY-NOTICES.txt']){
 const source=['main.js','manifest.json','styles.css'].includes(file)?`dist/${file}`:file;
 if(['main.js','manifest.json','styles.css'].includes(file))await copyFile(source,`${assets}/${file}`);await copyFile(source,`${bundle}/${file}`);
}
for(const file of ['README.md','versions.json'])await copyFile(file,`${bundle}/${file}`);
for(const file of ['RELEASING.md','CALDAV.md',`RELEASE_NOTES_${manifest.version}.md`])await copyFile(`docs/${file}`,`${bundle}/docs/${file}`);
console.log(`Upload individual assets from ${assets}. GitHub tag: ${manifest.version}.`);

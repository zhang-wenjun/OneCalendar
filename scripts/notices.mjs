import {readFile,readdir,writeFile} from 'node:fs/promises';
const root=JSON.parse(await readFile('package.json','utf8')),seen=new Set();
let text='Third-party components bundled with TaskCalendar\n\n';
async function visit(name){
 if(seen.has(name))return;seen.add(name);const dir=`node_modules/${name}`,p=JSON.parse(await readFile(`${dir}/package.json`,'utf8'));
 text+=`\n${'='.repeat(72)}\n${p.name} ${p.version}\nLicense: ${p.license}\nSource: https://registry.npmjs.org/${p.name}/-/${p.name.split('/').pop()}-${p.version}.tgz\n`;
 const licenses=(await readdir(dir)).filter(f=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
 if(licenses.length)for(const file of licenses)text+='\n'+await readFile(`${dir}/${file}`,'utf8');
 else{const readme=await readFile(`${dir}/README.md`,'utf8').catch(()=> '');const at=readme.search(/^#+\s*Licen[cs]e/im);text+='\n'+(at>=0?readme.slice(at):`Author: ${typeof p.author==='string'?p.author:JSON.stringify(p.author??'See source package')}\nSee source package for license terms.\n`);}
 for(const dep of Object.keys(p.dependencies??{}))await visit(dep);
}
for(const name of Object.keys(root.dependencies))await visit(name);
text+='\nICAL.js is distributed without source changes under MPL-2.0. Its complete source form and license are available in the versioned source archive linked above.\n';
await writeFile('THIRD-PARTY-NOTICES.txt',text);
export const notices=text;

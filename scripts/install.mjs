import { mkdir, copyFile } from 'node:fs/promises';
const target = 'AITestBed/.obsidian/plugins/task-calendar';
await mkdir(target, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(`dist/${file}`, `${target}/${file}`);
console.log(`Installed into ${target}`);

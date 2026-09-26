import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import {notices} from './notices.mjs';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.js', bundle: true,
  format: 'cjs', target: 'es2020', platform: 'browser', external: ['obsidian','@codemirror/state','@codemirror/view'], sourcemap: true,
  footer:{js:'/*\n'+notices.replaceAll('*/','* /')+'\n*/'} });
for (const file of ['manifest.json', 'styles.css']) await copyFile(file, `dist/${file}`);
console.log('Built dist/main.js, manifest.json, styles.css');

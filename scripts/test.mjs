import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('artifacts/tests',{recursive:true});
const tests=(await readdir('tests')).filter(f=>f.endsWith('.test.ts'));
const output=[];
for(const test of tests){const file=`artifacts/tests/${test.replace('.ts','.cjs')}`;await build({entryPoints:[`tests/${test}`],outfile:file,bundle:true,platform:'node',format:'cjs',target:'node22',alias:{obsidian:'./tests/obsidian-stub.ts'}});output.push(file);}
const result=spawnSync(process.execPath,['--test',...output],{stdio:'inherit'});process.exitCode=result.status??1;

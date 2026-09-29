import {defineConfig} from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
export default defineConfig([
  {ignores:['node_modules/**','dist/**','artifacts/**','release/**','AITestBed/**','tests/**','scripts/**','eslint.config.mjs']},
  ...obsidianmd.configs.recommended,
  {languageOptions:{parserOptions:{projectService:true}},rules:{'obsidianmd/ui/sentence-case':['warn',{brands:['Obsidian','OneCalendar','Feishu','CalDAV','OAuth','AITestBed']}]}}
]);

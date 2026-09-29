import {mkdir,readFile,writeFile,readdir,access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {Store,Files} from '../src/store';
import {make,dateKey,addDays} from '../src/model';
const base=path.resolve('artifacts/fresh-test-vault');
if(existsSync(base))throw Error('Staging directory already exists; inspect it before retrying');
await mkdir(base,{recursive:true});
const files:Files={list:()=>[],read:p=>readFile(path.join(base,p),'utf8'),exists:p=>existsSync(path.join(base,p)),mkdir:p=>mkdir(path.join(base,p),{recursive:true}).then(()=>{}),create:async(p,c)=>{await mkdir(path.dirname(path.join(base,p)),{recursive:true});await writeFile(path.join(base,p),c,{flag:'wx'});},process:async(p,fn)=>{const f=path.join(base,p);await writeFile(f,fn(await readFile(f,'utf8')));}};
const s=new Store(files),today=dateKey(),yesterday=addDays(today,-1),tomorrow=addDays(today,1);
s.diaryDate=p=>/^diary\/\d{4}-\d{2}-\d{2}\.md$/.test(p)?p.slice(6,-3):undefined;
s.journal={path:d=>`diary/${d}.md`,ensure:async d=>{const p=`diary/${d}.md`;if(!files.exists(p))await files.create(p,`# ${d}\n\n## 今日记录\n\n`);}};
const projectTitles=['代码开发','图纸绘制','文档撰写'];const projects=[];
for(let i=0;i<projectTitles.length;i++)projects.push(await s.create(make('project',projectTitles[i],{id:`project_${i+1}`}),['完善数据分析脚本，验证输入输出与异常处理。','整理实验装置布局，检查尺寸与接口。','将研究方法与实验结果整理成可复现的文档。'][i]));
for(let i=0;i<projects.length;i++){
  await s.create(make('memo','初步计划',{id:`memo_${i+1}_history`,project:projects[i].data.id,created:`${yesterday}T10:00:00`}),['已梳理处理流程，确定 CSV 输入格式。','完成布局草图，待检查器件间距。','已列出章节和图表清单。'][i]);
  await s.create(make('memo','最新进展',{id:`memo_${i+1}_latest`,project:projects[i].data.id,created:`${today}T08:30:00`}),['已完成数据读取；今天补齐边界条件测试，下一步接入绘图。','接口位置已确认；下一步检查固定孔尺寸并导出 PDF。','方法章节已有初稿；下一步补充代码运行示例和结果说明。'][i]);
}
const captures=[
 ['检查数据处理脚本的边界条件','doing',today,0,'核对空文件、缺失列和异常值。'],
 ['核对装置图纸尺寸','todo',today,1,'检查固定孔距、单位和接口朝向。'],
 ['补充代码使用说明','todo',today,2,'任务同时属于代码开发和文档撰写项目。'],
 ['整理参考文献','done',today,2,'已统一引用格式。'],
 ['整理待研究的算法资料','todo','',0,'暂不指定计划日期，放入未安排任务。'],
 ['回顾昨天未解决的问题','todo',yesterday,0,'用于展示逾期任务。'],
 ['完成文档图表检查','todo',tomorrow,2,'明天核对图注和编号。']
] as const;
for(let i=0;i<captures.length;i++){const [title,status,plan,p,body]=captures[i];await s.create(make('task',title,{id:`task_${i+1}`,created:`${i===5?yesterday:today}T09:00:00`,status,plan:plan||undefined,due:i===5?yesterday:undefined,projects:i===2?[projects[0].data.id,projects[2].data.id]:[projects[p].data.id]}),body);}
await s.create(make('idea','试试自动生成实验图表',{id:'idea_charts',status:'inbox',projects:[projects[0].data.id]}),'试试自动生成实验图表\n将脚本输出与统一配色模板结合，减少重复排版。');
await s.create(make('idea','把易错步骤整理成检查表',{id:'idea_checklist',status:'inbox'}),'把易错步骤整理成检查表\n先记录想法，下次整理文档时再展开。');
for(const [id,title,day,start,end] of [['event_reading','论文阅读',today,'09:00','10:00'],['event_review','代码与图纸联合检查',today,'14:00','15:30'],['event_writing','撰写实验记录',today,'16:00','17:00'],['event_tomorrow','每周项目回顾',tomorrow,'10:00','11:00']])await s.create(make('event',title,{id,start:`${day}T${start}`,end:`${day}T${end}`}));
await s.createSeries({id:'series_daily_review',title:'整理今日科研记录',rule:'daily',interval:1,occurrence:today,projects:[projects[2].data.id]},'每天结束前整理进展和下一步。');
await files.create('开始体验.md',`# OneCalendar 测试库\n\n这是一组按最新格式创建的示例，可以自由编辑。\n\n- 打开 [[diary/${today}|今天的日记]]：尝试勾选任务或修改闪念。\n- 打开 [[Projects/代码开发/代码开发-Memo|代码开发备忘]]：查看最新进展和历史。\n- 打开 OneCalendar 工作台：查看今日待办、日程、项目和看板。\n\n## 直接记录\n\n在日记中写普通复选框即可创建任务，写带 #闪念 的列表项即可创建闪念。\n\n\x60\x60\x60markdown\n- [ ] 一个新任务\n- #闪念 一个突然想到的点子\n  > 可以在这里补充细节。\n\x60\x60\x60\n\n## 注释说明\n\n任务末尾的插件注释存储身份和关联。实时预览、阅读视图中隐藏；切换到源码模式可查看。不要手工删除其中的 id。\n`);
if(s.problems().length)throw Error(JSON.stringify(s.problems()));
console.log(JSON.stringify({base,today,counts:Object.fromEntries(['task','idea','project','memo','event','series'].map(k=>[k,s.all(k as any).length]))},null,2));

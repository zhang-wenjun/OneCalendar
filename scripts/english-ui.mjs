import ts from 'typescript';
import {readFile,writeFile,readdir} from 'node:fs/promises';
const pairs=`
任务与闪念写入日记；项目备忘位于 Projects/项目名/项目名-Memo.md。请同步日记、Projects 和 TaskCalendar（日程与重复规则）。飞书与安卓外部联动尚未实测。|Tasks and ideas live in daily notes. Project memos live in Projects/<name>/<name>-Memo.md. Sync diary, Projects and TaskCalendar together. Feishu and Android integrations have not been device-tested.
默认沿用每日笔记的目录、日期格式及模板；未配置时使用 diary/YYYY-MM-DD.md。日记中的复选框加入任务，带 #闪念 的列表项加入收集箱；快速记录也直接追加到日记。|Uses the Daily notes folder, date format and template, or diary/YYYY-MM-DD.md by default. Only checkboxes under Tasks and bullets under Ideas are indexed. Journal stays private to your writing.
任务正文保存在日记中；这里保存编号、项目关联和重复规则。请与日记和 Projects 一起同步。插件在文件变化时建立内存索引，查看任务不读取本文件。|Task text lives in daily notes. This file stores IDs, project links and recurrence metadata. Sync it with diary and Projects. The plugin refreshes its memory index when files change; queries do not read this file.
新备忘将成为当前展示；旧备忘保留在历史中。|The new memo becomes the current update. Previous memos remain in history.
每天、每周、每月或完成后间隔，按你的节奏安排。|Repeat daily, weekly, monthly or after completion.
暂无任务。可以快速记录一条，稍后再安排。|No tasks yet. Capture one now and schedule it later.
暂无项目。创建项目后即可关联任务和更新备忘。|No projects yet. Create a project to link tasks and add memos.
这里还没有闪念。先记下来，稍后再整理。|No ideas yet. Capture a thought and organize it later.
随时记下想法，不必现在决定要不要做。|Capture a thought now and decide what to do with it later.
还没有备忘，记录当前进展和下一步。|No memo yet. Record your progress and next steps.
项目不存在、尚未同步，或存在冲突副本。|Project missing, not synced yet, or duplicated by a conflict.
点击空白时间添加日程；电脑端可拖选时间段。点击日期下的「日记」打开当天笔记。|Click an empty time slot to add an event, or drag a range on desktop. Click Journal below a date to open its note.
内容已被其他操作修改。请重新打开后再保存，当前内容未被覆盖。|This record changed elsewhere. Reopen it before saving. Nothing was overwritten.
稳定标识重复：保留了所有副本，请比较内容后解决冲突|Duplicate ID: all copies were preserved. Compare them to resolve the conflict.
这条日记记录已修改，请重新打开后保存；日记未被覆盖|This diary entry changed. Reopen it before saving; nothing was overwritten.
使用管理员批准应用获取的 user_access_token。当前版本不内置应用密钥或 OAuth 服务；凭据过期需更新。|Use a user_access_token from an administrator-approved app. This version has no embedded app secret or OAuth service; renew expired credentials.
已清除本插件凭据；飞书已创建的提醒仍需先取消或在飞书中处理|Credentials cleared. Existing Feishu reminders must be cancelled separately.
仅创建、修改或取消本插件自己的提醒。配置前提醒保留为待同步。|Only manages reminders created by this plugin. Reminders remain pending until configured.
启用后定期获取日程，已有飞书日程不会被编辑。|Periodically fetch events without editing existing Feishu events.
多个日历以逗号分隔；需要公司账号对应读取权限。|Separate calendar IDs with commas. Your account needs read access.
建议使用单独日历；需具备写权限。已有提醒继续绑定原日历。|Use a dedicated calendar with write access. Existing reminders keep their original calendar.
留空沿用每日笔记设置；例如 YYYY/MM/YYYY-MM-DD。|Leave blank to use Daily notes settings, e.g. YYYY/MM/YYYY-MM-DD.
留空沿用每日笔记设置；例如 diary。|Leave blank to use Daily notes settings, e.g. diary.
规则生效日期（未来未开始实例重新安排）|Effective date (reschedules future pending instances)
截止日期距计划日期天数（可空，0 为当天）|Days from plan to deadline (optional; 0 = same day)
间隔 N（天 / 周 / 月；工作日固定为 1）|Interval (days / weeks / months; weekdays use 1)
提醒时间（自动写入已连接日历）|Reminder time (writes to the connected calendar)
每月几号（不足该日取月末）|Day of month (clamped to month end)
说明 / 笔记链接（可选）|Description / note links (optional)
关联项目（可多选）|Linked projects (select any)
关联任务（可选）|Linked task (optional)
计划日期（可空）|Planned date (optional)
截止日期（可空）|Due date (optional)
每次提醒时间（可空）|Reminder time for each occurrence (optional)
当前进展、遇到的问题、下一步……|Progress, blockers, next steps...
粘贴用户访问凭据（不显示已有值）|Paste access token (existing value is never displayed)
保存到 Obsidian 密钥存储|Save to Obsidian secret storage
已保存；请勿将密钥导出到普通笔记|Saved. Do not export credentials to ordinary notes.
超过 7 天未更新备忘 · 建议回顾|No memo update for 7 days; time for a review
飞书未连接；本地功能可离线使用|Feishu is not connected. Local features work offline.
尚未设置飞书用户访问凭据；已有缓存仍可查看|No Feishu access token. Cached events are still available.
飞书授权已失效，请更新用户访问凭据|Feishu authorization expired. Renew your access token.
请先在插件设置中启用飞书读取|Enable Feishu read access in plugin settings first.
请先设置需要读取的飞书日历 ID|Configure the Feishu calendar IDs first.
飞书未返回日程标识，保留待办以便重试|Feishu returned no event ID. The reminder remains pending for retry.
源任务缺失。请恢复文件或在设置中确认取消其提醒。|Source task missing. Restore its file or cancel its reminder in settings.
提醒时间已过去，请调整后重试|Reminder time has passed. Adjust it and retry.
由 TaskCalendar 创建并维护的任务提醒。|Task reminder created and maintained by TaskCalendar.
修改规则的生效日期不能早于今天；过去的记录保留不变|The effective date cannot precede today. Past records are preserved.
同名项目文件已存在，请使用已有项目|A project with this name already exists. Use the existing project.
项目尚未迁移到 Projects 文件夹，请先迁移|Migrate the project into Projects first.
写入后未能找到记录，请检查日记或项目配置|Record not found after saving. Check the diary or project settings.
文件已存在但格式无效，未覆盖原内容|The file already exists with invalid formatting. Nothing was overwritten.
记录不存在或文件格式有误|Record missing or invalid file format.
记录已修改，请重新打开后保存|Record changed. Reopen it before saving.
当前文件接口不支持重命名|The current file adapter does not support renaming.
目标项目文件夹已存在，未覆盖|Destination project folder already exists. Nothing was overwritten.
正文已更新，请重新打开后合并内容|The body changed. Reopen it to merge your edits.
迁移前笔记已变化，请重新扫描|Note changed before migration. Rescan first.
迁移时笔记被修改，原内容未覆盖|Note changed during migration. Nothing was overwritten.
每日笔记模板不存在，请检查每日笔记设置|Daily note template missing. Check Daily notes settings.
日记路径被文件夹占用|A folder occupies the diary path.
项目名包含不能用于文件夹的字符|Project name contains invalid folder characters.
项目属性损坏，原文保留|Invalid project metadata. Original text preserved.
项目备忘已修改，请重新打开后保存|Project memo changed. Reopen it before saving.
找不到数据属性，请先恢复 Markdown 格式|Metadata missing. Restore the Markdown format first.
类型或稳定标识无效|Invalid record type or stable ID.
标题不能为空|Title is required.
此数据格式版本尚不受支持，请先升级插件|Unsupported data version. Update the plugin first.
必须为有效时间字符串|must be a valid timestamp
必须是字符串|must be a string
必须是项目标识列表|must be a list of project IDs
日期无效|invalid date
时间无效|invalid time
必须为 true 或 false|must be true or false
任务状态无效|Invalid task status
日程结束时间必须晚于开始时间|Event end must be after its start
重复任务须有有效开始日期 occurrence|Repeating tasks require a valid occurrence date
重复提醒时间须为 HH:mm|Repeat reminder time must use HH:mm
重复规则无效|Invalid repeat rule
重复间隔须为正整数|Repeat interval must be a positive integer
至少选择一个有效星期|Select at least one valid weekday
每月日期须为 1–31|Day of month must be 1–31
无法计算下一次重复日期|Cannot calculate the next occurrence
标题须为单行|Title must be a single line
关联信息文件格式损坏，未覆盖|Details file is malformed. Nothing was overwritten.
关联信息版本或记录格式无效|Invalid details version or record format.
关联信息中有无效或重复编号|Invalid or duplicate ID in details.
关联信息文件已删除，请先重新加载或恢复|Details file was removed. Reload or restore it first.
这条关联信息已被其他操作修改，请重新加载后保存|Details changed elsewhere. Reload before saving.
同一记录已在另一设备分配编号，请重新加载|Another device assigned this record an ID. Reload first.
笔记保存失败，关联信息同时被修改，请检查冲突|Note save failed and details also changed. Resolve the conflict.
同一条记录出现多个编号|Multiple IDs on one record.
的关联信息尚未同步或已丢失，请恢复关联信息文件|has missing or unsynced details. Restore the details file.
同一条记录有重复日期|Duplicate dates on one record.
应用日记设置并重新扫描|Apply diary settings and rescan
重新扫描并迁移旧版记录到日记与 Projects|Rescan and migrate legacy records
验收日记统一存储（仅 AITestBed）|Test journal storage (AITestBed only)
验收周视图与日记（仅 AITestBed）|Test week view and diary (AITestBed only)
快速记录闪念|Capture an idea
快速记录任务|Capture a task
打开今天的日记|Open today journal
打开工作台|Open dashboard
打开 TaskCalendar|Open TaskCalendar
新建日程|New event
同步日历及提醒|Sync calendars and reminders
飞书日程只读展示|Read-only Feishu events
允许自动写入任务提醒|Write task reminders to calendar
日记目录覆盖|Override diary folder
日记日期格式覆盖|Override diary date format
日记任务已更新|Diary index updated
读取日历 ID|Read calendar IDs
提醒日历 ID|Reminder calendar ID
飞书用户凭据|Feishu user token
仅本次会话使用|Use for this session
已设置会话凭据|Session token set
断开凭据|Disconnect token
刷新日程|Refresh events
同步 / 重试提醒|Sync / retry reminders
确认取消该提醒|Cancel this reminder
任务看板|Task board
闪念收集箱|Idea inbox
个人工作台|Personal workspace
项目详情|Project details
今日日记|Today journal
工作台导航|Dashboard navigation
任务范围|Task filter
按项目筛选|Filter by project
所有项目|All projects
搜索标题或正文…|Search titles or text...
未来七天没有日程|No events in the next seven days
未来七天 · 日程|Next seven days · Events
项目 · 最新备忘|Projects · Latest memos
需要关注|Needs attention
没有逾期任务|No overdue tasks
待整理闪念|Unprocessed ideas
今日日程|Today events
今日待办|Today tasks
合并历史重复任务|Collapse past occurrences
暂无项目，可以稍后关联|No projects yet. Link one later.
来源闪念暂未找到|Source idea not found yet
来源闪念|Source idea
缺失项目|Missing project
来自日记|From diary
原笔记|Open note
隐藏归档|Hide archived
显示归档|Show archived
还没有备忘|No memo yet
更新项目备忘|Update project memo
保存新备忘|Save new memo
更新备忘|Update memo
打开项目备忘|Open project memo
编辑项目|Edit project
恢复项目|Restore project
归档项目|Archive project
最新备忘|Latest memo
历史备忘|Memo history
关联任务|Linked tasks
项目任务状态|Project task status
编辑 / 关联项目|Edit / link projects
查看任务|View task
转为任务|Convert to task
扩写笔记|Expand in note
恢复待整理|Restore to inbox
显示更多|Show more
编辑后续规则|Edit future occurrences
恢复重复|Resume repeat
暂停重复|Pause repeat
结束重复|End repeat
查看实例|View occurrences
周视图|Week view
月视图|Month view
上月|Previous month
下月|Next month
上周|Previous week
下周|Next week
刷新飞书|Refresh Feishu
跳转日期|Jump to date
任务日期标记|Task date markers
添加日程|Add event
这一天没有日程|No events on this day
飞书 · 只读|Feishu · Read only
想到了什么？|What came to mind?
缺失或冲突项目|Missing or conflicting project
保留关联|link preserved
每天 / 每隔 N 天|Every day / every N days
每周指定星期|Selected weekdays
每月指定日期|Selected day of month
周一至周五|Monday to Friday
完成后间隔|After completion
每周重复的星期|Repeat on weekdays
请输入想法|Enter an idea
请输入标题|Enter a title
请选择开始日期|Select a start date
截止日期间隔必须是整数|Deadline offset must be an integer
无标题日程|Untitled event
任务提醒|Task reminder
源任务缺失|Source missing
待同步|Pending sync
待取消|Pending cancellation
已同步|Synced
同步失败|Sync failed
已过期|Expired
已取消|Cancelled
已完成|Done
已跳过|Skipped
进行中|In progress
未完成|Active
未安排|Unscheduled
已归档|Archived
已整理|Processed
待整理|Inbox
已结束|Ended
已暂停|Paused
未来七天|Next seven days
任务|Task
闪念|Idea
项目|Project
日程|Event
重复|Repeat
备忘|Memo
日历|Calendar
总览|Overview
看板|Board
收集箱|Inbox
今天|Today
今日|Today
待办|To do
逾期|Overdue
全部|All
搜索|Search
计划|Plan
截止|Due
提醒|Reminder
状态|Status
开始时间|Start time
结束时间|End time
开始日期|Start date
不关联|None
方式|mode
标题|Title
编辑|Edit 
新建|New 
取消|Cancel
保存|Save
归档|Archive
全天|All day
本地|Local
议程|Agenda
日记 / Diary|Diary
日记|Journal
按天|Daily
按周|Weekly
按月|Monthly
间隔|Interval
缓存更新时间|Cache updated
飞书已刷新|Feishu refreshed
最近 90 天至未来 180 天|Past 90 days through next 180 days
刷新失败，保留缓存。|Refresh failed; cache preserved. 
上次成功|Last success
尚无|Never
未知|Unknown
文件不存在|File missing
原文件不存在|Original file missing
记录格式已变更|Record format changed
身份已改变|identity changed
不能为空|cannot be empty
不存在|not found
完成|Complete
编号|ID
关联信息|Details
zh-CN|en-US
`.trim().split('\n').map(l=>l.split('|')).sort((a,b)=>b[0].length-a[0].length);
for(const name of await readdir('src')){
 if(!name.endsWith('.ts')||name==='qa.ts')continue;
 const path='src/'+name,raw=await readFile(path,'utf8'),sf=ts.createSourceFile(path,raw,ts.ScriptTarget.Latest,true),edits=[];
 function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(n.kind)){
  let text=n.getText(sf);for(const [a,b]of pairs)text=text.split(a).join(b);if(text!==n.getText(sf))edits.push([n.getStart(sf),n.getEnd(),text]);
 }ts.forEachChild(n,visit);}visit(sf);
 let out=raw;for(const [a,b,t]of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+t+out.slice(b);await writeFile(path,out);
}

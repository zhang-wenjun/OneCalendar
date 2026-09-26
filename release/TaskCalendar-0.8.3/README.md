# TaskCalendar 0.8.3

## Quick Ideas entry in 0.8.3

The Obsidian ribbon (the mobile quick-action menu) now includes **New idea** with a lightbulb icon. It opens the existing idea editor and waits for the diary index if the plugin is still starting. The Ideas shortcut URI and **Copy Ideas shortcut link** command remain available.

## Ideas shortcut in 0.8.2

Run **TaskCalendar: Copy Ideas shortcut link** in the target vault. A shortcut launcher can open this URI to launch the Ideas editor directly, including after the plugin finishes starting:

`obsidian://task-calendar-idea?vault=YOUR_URL_ENCODED_VAULT_NAME`

Saving uses the normal Ideas capture: today's daily note, under `## Ideas`. Merely opening the link does not create an idea. No Advanced URI plugin is needed.

For Android-compatible systems, a Tasker task with **Browse URL** can open the copied URI. Assign that task to a Tasker Quick Settings tile and add the tile in the system's quick-switch editor, if the device exposes third-party tiles. HarmonyOS 4.2.0.245 tile availability and cold-start URI delivery are not device-tested. A home-screen shortcut to the same task is a fallback if the control center does not expose Tasker tiles.

Quick actions and calendar navigation use monochrome Obsidian SVG icons, with theme-aware contrast.

## Calendar and diary updates in 0.8.0

Desktop adds a right-sidebar **Diary calendar**. Use **TaskCalendar: Open diary calendar** to reveal it. Date buttons open existing notes; creating a missing note for any date other than today asks for confirmation. This applies to TaskCalendar entry points, including recurring tasks. Cancelling defers that date for the current session; click it again to reconsider. Other plugins and Obsidian core commands control their own note creation.

Overview replaces Today. Calendar has **3 days**, **Week**, and **Month**; phones default to 3 days. Its compact controls and title stay above a single scrolling area, and the timetable date row stays visible during scrolling. Refresh and connection status remain at the bottom.

Event editors offer In progress tasks (and preserve an existing link), automatically move an invalid end time to 30 minutes after a changed start, and save an optional reminder time. Memo editors show the project name and put the history hint below the editor.

**Phone reminders:** set an event reminder and choose **Save & add to phone calendar**. Where file sharing is supported, select a calendar app and confirm import. Otherwise the plugin saves an `.ics` file under `TaskCalendar/CalendarExports`; open it with a calendar app that supports importing reminders. This exports a standard `VALARM`, not a silent native calendar write or ongoing synchronization. Later edits require importing again, and some calendar apps may create a duplicate or ignore the alarm. Actual Android notification delivery and each manufacturer's importer remain device checks; confirm the imported reminder in the calendar app. Desktop offers **Save & export calendar**.

## Calendar improvements in 0.7.0

- Click an external event (including all-day events) to open a large read-only detail window with title, times, timezone, location and description.
- Under CalDAV settings, connect, select a calendar, then **Add / update calendar**. Repeat for other calendars on the account, or **Add another connection** for a different account/server. **My calendars** controls names, colors, visibility, connection editing and removal. Removal never deletes remote events. Existing CalDAV configuration is migrated automatically.
- **Pull events now** refreshes all enabled saved calendars. A failed source keeps its own cache while successful sources update. Save credentials securely on each device for access after restart. The current connection form remains the single reminder-write target.
- **Auto-refresh interval (minutes)** accepts 1–1440 (default 5), with **Read external calendar events** enabled. Obsidian checks every 30 seconds while running and catches up when returning to the foreground. Manual refresh ignores this interval.
- The dashboard, settings and dialogs use a scoped blue accent; calendar colors remain individually configurable.

Validation: 86 automated tests; mobile layout tests; browser tests at 390 and 1000 pixels for multiple calendars, independent colors, read-only details, description/location display, and blue dialog buttons. Automated multi-server tests use fixtures rather than additional personal accounts.

An Obsidian plugin for personal tasks, lightweight projects, quick ideas and calendars. Markdown is the source of truth. The plugin UI, commands and default templates use English. Your existing note text is preserved in its original language.

## Edit from a daily note

Use **Alt+T** for tasks and **Alt+I** for ideas (Option+T / Option+I on macOS). On a matching entry or its description, the shortcut opens Edit. On a blank line or empty list placeholder, it opens New. New entries are saved to Tasks or Ideas in the currently open daily note, even for past or future dates. A new task defaults its planned date to that diary date. Save with **Ctrl+Enter** / **Cmd+Enter**.

Commands: **TaskCalendar: Edit or create task in diary** and **TaskCalendar: Edit or create idea in diary**. Change the binding under Obsidian Settings → Hotkeys. On Android, use this command from the command palette or add it to the mobile toolbar; a hardware keyboard can use the shortcut. These commands are available in editing mode. A shortcut for the other record type shows a hint and does not convert or overwrite the entry. The old Ctrl+Shift+E command has been removed.

## Daily note template

The supplied template is `Templates/Daily.md`. In Obsidian Settings → Daily notes, set Template file location to `Templates/Daily`. AITestBed is already configured. New notes default to:

```markdown
## Tasks

- [ ] 

## Journal


## Ideas

- 
```

The headings must be level-two headings with these exact names. Subheadings are allowed; a new level-one or level-two heading ends the section. Code blocks, comments and YAML are ignored. Duplicate target sections are rejected when adding entries to avoid ambiguous writes.

- **Tasks:** only `- [ ]` checkbox entries here become tasks. Completed `[x]`, in-progress `[/]`, cancelled `[-]`, and skipped `[>]` tasks remain recognized. New captures go into this section. A manually written task defaults to the diary date; a capture can leave its planned date empty.
- **Journal:** free writing. Checkboxes and ideas here are not counted, edited or moved by the plugin during ordinary use.
- **Ideas:** each ordinary `- A thought` bullet is an idea. No tag is required. Add details using indented `  > Text` lines. Checkboxes in this section are ignored.

Moving or deleting an entry in Markdown updates the index. Moving it outside its designated section removes it from the dashboard without deleting its text. Preserve the short ID when moving an existing entry to another appropriate section or note; remove it when copying an entry to create a new record.

Custom Daily notes templates are supported. Missing required sections are appended when creating a new note. Existing notes are not automatically rewritten during normal captures; a missing destination section is added when needed.

## Readable metadata and sync

```markdown
- [ ] Read the paper 📅 2026-09-23 ⏳ 2026-09-25 🆔〔a1b2c3d4〕
```

📅 is the planned date; ⏳ is the deadline. Both can be edited or removed directly. Typing after the short ID is safe. Task text and checkbox state remain authoritative in the diary.

`TaskCalendar/Details.md` stores stable IDs, project links, timestamps and recurrence metadata. Sync it together with `diary`, `Projects` and `TaskCalendar` using Nutstore Sync. Startup builds the memory index; file changes refresh it. Queries never search or reread Markdown files. Changes to Details reread that file and reindex cached note text.

Missing or conflicting metadata is reported instead of inventing relationships. Concurrent multi-device edits may still require resolving sync conflicts. Files can arrive in a different order during sync; wait for sync to complete and rescan if needed.

## Projects, calendars and reminders

Each project has `Projects/<name>/<name>-Memo.md`. New memos become the visible update while history remains in that file. Tasks can belong to multiple projects. Project renames preserve stable links.

The dashboard includes task lists, a board, ideas, projects, repeating tasks, and week/month calendars. Diary tasks and ideas use sections; events, series and reminder mappings retain their separate Markdown files under TaskCalendar.

Feishu event display is read-only. Optional reminder writes affect only plugin-managed reminders in the configured calendar. The Feishu API provider needs an authorized user token and calendar permissions. Feishu CalDAV reading has been verified in Windows Obsidian; the tested calendar reported read-only access. The separate Feishu API provider, Android notifications and two-device Nutstore sync have not been verified on real devices.

## CalDAV (0.6.0)

Third-party calendars now offers Feishu or CalDAV. CalDAV supports read-only external events and task reminder creation, updates and cancellation over HTTPS using a username and app password. Enter a server or calendar URL, connect to discover calendars, select one, then pull events. Hostnames without a scheme default to HTTPS. External calendar edits do not update tasks; ordinary local events are not uploaded. See [CalDAV setup and testing](docs/CALDAV.md).

Network access goes only to the configured CalDAV service or Feishu when the corresponding connection is used. Reminder writes send the task title, reminder time and stable reminder identifier; external calendar reads cache event titles and times in plugin data. CalDAV passwords are session-only or stored in Obsidian secret storage, never ordinary settings.

Tested against a temporary Radicale 3.8.0 server and a live Feishu CalDAV account (read only, 25 events retrieved on 2026-09-24). Android notification delivery remains untested. Third-party license notices and source links are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) and bundled into main.js.

## Upgrade and backups

The former metadata file is renamed to Details.md while retaining its records. Legacy HTML comments are migrated to readable IDs, with originals in `TaskCalendar/MetadataBackups/`.

Old unsectioned diaries containing plugin-tagged entries migrate once into Tasks and Ideas. Original files are retained in `TaskCalendar/SectionBackups/`. Ordinary untagged writing and checklists are left in place. Diaries already containing Tasks or Ideas are treated as intentionally structured and are not relocated automatically. Move any remaining entries into their intended sections manually.

## Build and install

```sh
npm install
npm test
npm run build
npm run install:test
```

Install `main.js`, `manifest.json` and `styles.css` from dist into `.obsidian/plugins/task-calendar/`, then reload the plugin. The test installer targets only this project's AITestBed, not ResearchNotes. Runtime code does not depend on Node.js and the manifest permits mobile use.

## Mobile (0.5.2)

Phones open on Overview; Calendar defaults to 3 days. All page buttons are visible; there is no More menu. Touch controls are enlarged, and task/idea capture collapses optional dates, reminders and projects. Existing records expand these fields when edited.

In Obsidian mobile settings, add TaskCalendar: Capture an idea and Capture a task to the mobile toolbar. The separate Edit or create task in diary and Edit or create idea in diary commands also work from the mobile toolbar in a daily note; they use the cursor position and current diary date. Keyboard shortcuts Alt+T and Alt+I remain for physical keyboards.

Returning to the foreground catches up repeating tasks and pending reminder sync. Timers do not guarantee work while Android suspends or closes Obsidian. Reminders require a configured Feishu or CalDAV calendar, successful synchronization before leaving Obsidian, and calendar-app notification permissions. A Reminder time alone does not schedule a native Android notification.

Sync diary, Projects, TaskCalendar/Details.md and the other TaskCalendar record folders together through Nutstore Sync. Install the plugin on Android as well; do not assume the hidden .obsidian folder or credentials are synchronized. Feishu authorization must be configured on each device.

### Mobile verification

86 automated tests pass. The mobile browser harness runs production views, forms and storage with an Obsidian host adapter at widths 320, 390 and 768, using touch input. It checks agenda navigation, horizontal overflow, event validation, task/idea capture, storage reload, preservation of journal text and single-modal touch behavior. This is browser simulation, not an Android WebView or live Obsidian test.

Run npm run test:mobile with Playwright available (or PLAYWRIGHT_PATH pointing to its package). The default browser is installed Edge; BROWSER_CHANNEL can override it. Reports and screenshots are written to artifacts/mobile.

Real-device checks still required: Android keyboard/Back behavior and date picker; toolbar commands at blank/task/idea lines; Nutstore changes propagating both ways and concurrent edits; Feishu credentials/permissions, reminders reaching the phone while Obsidian is closed, notification permissions, timezone changes and Android battery restrictions.

## CalDAV connection workflow (0.6.1)

Settings now displays the plugin version and a dedicated CalDAV setup panel. Connect & discover calendars accepts your server URL and the entered app password directly. Select a discovered calendar, then Pull events now; automatic reading does not have to be enabled. Results stay visible with event counts, a preview, empty-calendar guidance or an error. Existing passwords may be retained by leaving the password field blank. Read-only calendars are labeled and reminder writes are blocked for them.

Discovery follows same-origin current-user-principal and calendar-home-set links; direct calendar URLs remain supported. Cross-origin discovery requires explicitly entering the trusted target server. A successful discovery does not prove write access. No real Feishu account or Android notification delivery was used in automated tests.


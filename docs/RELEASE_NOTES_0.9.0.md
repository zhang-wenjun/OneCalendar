# OneCalendar 0.9.0

OneCalendar combines Markdown-based tasks and ideas, lightweight project memos, a task board, and calendar views for Obsidian desktop and Android.

- Tasks and ideas live in daily notes under their own sections.
- Projects show the latest memo and keep previous updates in history.
- Calendar modes include 3 days, Week and Month, with compact mobile controls and a desktop diary sidebar.
- Multiple CalDAV calendars support individual colors and configurable refresh intervals. External events open in a read-only detail window.
- A New idea shortcut and Ideas URI open quick capture directly.
- Released under the MIT License. Third-party dependencies retain their own licenses.

## Installation

Download `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/one-calendar/`, then enable OneCalendar. The ZIP is an optional manual-install bundle; copy the three plugin files from it.

## Upgrading from TaskCalendar

The plugin ID is now `one-calendar`. Disable the old development TaskCalendar plugin before enabling OneCalendar and restart Obsidian. Keep the old plugin folder for the first launch to import its settings. The existing `TaskCalendar` data folder, diary notes, project memos, calendar IDs and original Ideas URI remain compatible. Reassign custom command shortcuts to OneCalendar if needed.

## Calendar limitations

CalDAV reads remote events and can write task reminders to a writable calendar. This is not full two-way event synchronization. Local events can be exported with reminders for import into a phone calendar; actual Android notification delivery depends on the calendar app and has not been device-tested. Read-only Feishu CalDAV cannot accept reminder writes.

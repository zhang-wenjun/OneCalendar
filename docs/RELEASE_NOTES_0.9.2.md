# OneCalendar 0.9.2

- Daily notes settings now control diary creation through obsidian-daily-notes-interface.
- Generates one-cal-template.md inside the configured daily note folder with empty Tasks, Journal and Ideas sections, without overwriting custom content.
- Removes OneCalendar-specific folder and date format overrides. Transfer any old override values to Daily notes settings before use.
- Preserves custom templates exactly and retains non-today confirmation and current-tab navigation.
- Keeps consecutive task and idea captures compact without accumulating blank lines.
- Stops creation when daily notes are disabled or the selected template is unavailable.

Enable Daily notes, choose your existing diary folder and date format, then select one-cal-template.md in that folder as its template. If Periodic Notes manages daily notes, configure its daily settings instead.

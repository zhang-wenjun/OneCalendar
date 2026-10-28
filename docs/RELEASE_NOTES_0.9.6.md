# OneCalendar 0.9.6

- Added confirmed deletion for tasks, ideas and local events.
- Deleting a diary entry preserves neighbouring entries and journal content.
- Recovery copies are saved under TaskCalendar/Deleted as text files. Standalone record files are cleared rather than removing their paths.
- Changed records are protected against stale deletion. Repeating tasks and tasks with calendar reminder records cannot be deleted directly; projects retain archive support.

Validation: 98 automated tests passed, including deletion, recovery copies and stale-edit protection.

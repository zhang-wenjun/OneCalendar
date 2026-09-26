# CalDAV setup and testing

TaskCalendar 0.6.0 supports one active connection: Feishu or CalDAV. CalDAV reads external events and creates, updates and cancels task reminder events. External events remain read-only. Ordinary local events are not uploaded, and remote edits are not imported into task fields. This is not full two-way synchronization.

## Connection

1. Create a dedicated calendar in your CalDAV service and copy that calendar's collection URL. Use the URL supplied by the service for the specific calendar, not its website, server root, account discovery URL or an ICS subscription link.
2. In Obsidian Settings > TaskCalendar > Third-party calendars, choose **CalDAV**.
3. Fill **CalDAV calendar URL** and **CalDAV username** first. Changing either detaches the previous password and clears cached events.
4. Enter the service's app password and click **Use password for this session**, or **Save CalDAV password securely** if Obsidian secret storage is available. Session passwords are cleared when the plugin unloads. Passwords are not saved in Markdown or ordinary plugin settings. Configure credentials separately on each device.
5. Click **Test CalDAV connection**. This verifies that the address is a calendar collection. It does not create events or prove write permission.
6. Enable **Read external calendar events** and click **Refresh events** to test reading. Enable **Write task reminders to calendar** only when ready to test reminder writes.

Authentication uses Basic over HTTPS. OAuth, Digest, automatic account discovery and multiple simultaneous connections are not implemented. HTTP is allowed only for localhost protocol tests. Use a valid trusted HTTPS certificate for a server reached by your phone.

## Verify reading and reminders

| Test | Steps | Expected result |
| --- | --- | --- |
| Read | Create an event in the remote calendar, then Refresh events | It appears as CalDAV / Read only in TaskCalendar. |
| Create | Create a task with Reminder time at least 15 minutes in the future; Sync / retry reminders | The task reminder becomes Synced; the server calendar contains one `[Task reminder]` event with an alarm at its start. |
| Retry | Sync again | No duplicate reminder is created. |
| Update | Change the task title or reminder time in TaskCalendar; sync | The same reminder event is updated. |
| Cancel | Complete or cancel the task, or clear Reminder time; sync | Its remote reminder is deleted. |
| Offline | Disconnect the network and refresh | Previous cached events remain; failed reminder writes can retry. |

TaskCalendar filters its own remote reminder events out of its external event display to avoid duplicates. Check the remote calendar or phone calendar to verify the writes. A Synced status confirms the server accepted the reminder, not that a phone notification was delivered.

The task is authoritative for plugin-created reminders. A later local edit can overwrite changes made to that reminder in another calendar client. Remote-only edits and deletions are not polled back into tasks. Do not use this as two-way task editing.

## Android notifications

The full path is:

TaskCalendar -> CalDAV server -> Android CalDAV sync adapter -> phone calendar -> notification.

Use an Android CalDAV sync adapter such as DAVx5 and select the same calendar, then enable that calendar and its notifications in your calendar app. DAVx5 integrates calendars into Android's calendar storage; it is not the reminder UI itself. See [DAVx5 introduction](https://manual.davx5.com/introduction.html) and [synchronization settings](https://manual.davx5.com/settings.html).

For the first test, manually synchronize the Android adapter and verify that the event and its reminder are visible on the phone before locking the screen. Background synchronization intervals, permissions and battery restrictions affect delivery. The plugin cannot notify you directly while Obsidian is closed.

## Switching services and calendars

Existing reminders retain their original provider and calendar URL. Switching to CalDAV does not migrate, duplicate or cancel existing Feishu reminders. Switch back to the original connection to update or cancel them. Changing a CalDAV URL also does not move existing reminders; they will report that they belong to another calendar until the original connection is restored.

## Compatibility and tests

- Real protocol integration tested against Radicale 3.8.0 on loopback: PROPFIND, REPORT, recurrence expansion with an overridden occurrence and EXDATE, conditional PUT, idempotent retry, protected DELETE.
- Unit tests cover XML errors, credentials, all-day events, embedded timezones, cache preservation, ownership checks, ETags and provider routing.
- The server must support calendar-query with calendar-data expansion and strong ETags. If expansion is not supported, refresh fails explicitly and preserves the previous cache rather than silently displaying only one occurrence.
- No live personal service account or Android notification delivery has been tested. The local integration test uses fetch; it does not exercise Obsidian's native requestUrl transport or a production HTTPS service.

Developer reproduction:

```sh
npm test
npm run build
python -m pip install --target artifacts/caldav-server radicale==3.8.0
npm run test:caldav
```

The integration script creates an isolated temporary calendar under artifacts/caldav, listens only on 127.0.0.1, and stops the test server afterward. It does not touch personal calendars or AITestBed notes.

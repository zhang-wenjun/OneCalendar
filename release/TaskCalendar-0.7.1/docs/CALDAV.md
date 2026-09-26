# CalDAV setup and testing

TaskCalendar 0.7.0 supports multiple saved CalDAV calendars across accounts and servers when CalDAV is selected. CalDAV reads external events and, on a writable current connection, creates, updates and cancels task reminder events. External events open in a read-only detail window. Ordinary local events are not uploaded, and remote edits are not imported into task fields. This is not full two-way synchronization.

## Connection

1. In Obsidian Settings > TaskCalendar > Third-party calendars, choose **CalDAV**.
2. Fill **CalDAV server or calendar URL** and **CalDAV username**. A hostname such as caldav.feishu.cn is normalized to HTTPS. A specific collection URL also works.
3. Enter the service-generated CalDAV app password, then click **Connect & discover calendars**. This uses the entered password directly for the current session. Leave the password blank to retain existing credentials for the same connection.
4. Choose a discovered **Calendar**. A single result is selected automatically; multiple results require a choice. Read-only calendars are labeled.
5. Click **Add / update calendar** to save the selected calendar in **My calendars**. Select another discovered calendar and add it, or use **Add another connection** for another account/server. Set each name, color and enabled checkbox in the list. **Connection** loads its configuration for updating credentials. **Remove** removes the local subscription/cache only.
6. Click **Pull events now** to refresh all enabled calendars. This works even when automatic reading is off. A persistent result shows the number of events and a preview, an empty-result explanation, or an actionable error. Failed calendars keep their cached events while successful calendars update.
6. To persist credentials, use **Save password securely** if Obsidian secret storage is available. Configure credentials separately on each device.
7. Enable **Read external calendar events** for automatic refresh. To write reminders, enable **Write task reminders to calendar**, create a task with a future reminder time, and click **Sync task reminders now**. This writes actual task reminders; discovery and pulling never create remote events.

Authentication uses Basic over HTTPS. OAuth, Digest and multiple simultaneous connections are not implemented. Discovery follows same-origin principal and calendar-home-set links. If a server returns another origin, explicitly configure that trusted server address. HTTP is allowed only for localhost protocol tests. Use a valid trusted HTTPS certificate for a server reached by your phone.

## Verify reading and reminders

| Test | Steps | Expected result |
| --- | --- | --- |
| Read | Create an event in the remote calendar, then Pull events now | It appears as CalDAV / Read only in TaskCalendar. |
| Create | Create a task with Reminder time at least 15 minutes in the future; Sync task reminders now | The task reminder becomes Synced; the server calendar contains one `[Task reminder]` event with an alarm at its start. |
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
- Live Feishu CalDAV discovery and reading were verified in Windows Obsidian on 2026-09-24 using native requestUrl: 25 events were retrieved. The tested account reported read-only access; no remote events were created or changed. Android notification delivery and the separate Feishu API provider remain unverified.
- Compatibility reading retries plain calendar-data, enumerates members when calendar-query returns collection properties, then uses calendar-multiget in batches of 100 (up to 2000 resources). XML numeric character references and attributed calendar-data are decoded. IANA timezones without VTIMEZONE use the system timezone database; unknown or nonexistent local times fail without replacing the cache. Raw unexpanded recurring events still fail explicitly.

Developer reproduction:

```sh
npm test
npm run build
python -m pip install --target artifacts/caldav-server radicale==3.8.0
npm run test:caldav
```

The integration script creates an isolated temporary calendar under artifacts/caldav, listens only on 127.0.0.1, and stops the test server afterward. It does not touch personal calendars or AITestBed notes.

The browser settings tests exercise the production setup panel, plugin methods and CalDAV parser with a fixture transport at 390 and 1000 pixels: validation, discovery, selection, manual pull with automatic reading disabled, persistent errors, cache retention, empty results and read-only write rejection. Run npm run test:caldav-ui with Playwright available.

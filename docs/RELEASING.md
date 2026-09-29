# Release OneCalendar 0.9.0

Repository: https://github.com/zhang-wenjun/OneCalendar

1. Build, test and package with `npm ci`, `npm test`, `npm run package:release`. Upload-ready files are written to `artifacts/github-release-0.9.0/`.
2. Confirm `manifest.json` and `dist/manifest.json` both have `id: one-calendar`, `name: OneCalendar`, `version: 0.9.0`.
3. Commit and push the current source changes to the repository's default branch.
4. Create a GitHub release with tag **0.9.0** (no `v` prefix), based on that updated commit.
5. Attach **main.js**, **manifest.json**, and **styles.css** from `artifacts/github-release-0.9.0/` as three individual release assets. Also attach `LICENSE` and `THIRD-PARTY-NOTICES.txt`. Uploading only the ZIP or renaming an old release does not replace its manifest.
6. Submit the repository URL in the Obsidian community directory. Do not use the old task-calendar ID. If the site still reports task-calendar, inspect the manifest in both the default branch and the release attachment.

Previous TaskCalendar release directories are historical artifacts, not the current build. The local release ZIP is a convenience for manual installation. This preparation does not publish a release, push Git commits, or guarantee approval or availability of the new ID.

The project LICENSE is MIT, copyright 2026 zhang-wenjun. THIRD-PARTY-NOTICES.txt preserves dependency licenses, including ICAL.js under MPL-2.0. The built main.js also embeds both the project license and dependency notices.

Use `docs/RELEASE_NOTES_0.9.0.md` for the release description. The optional `OneCalendar-0.9.0.zip` is for manual installation; it does not replace the three individual plugin assets.

For existing development users: disable TaskCalendar before enabling OneCalendar. Keep the old directory for the first launch so its verified development settings can be imported; diary, Projects and the TaskCalendar data directory remain in place. Reassign any manually configured command shortcuts to OneCalendar. Restart Obsidian after using the test installer.

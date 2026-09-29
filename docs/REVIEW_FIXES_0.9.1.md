# Review fixes for 0.9.1

The saved Obsidian review reported 29 risks, 1,024 warnings and 10 other findings. Many CSS warnings were repeated in historical release folders committed to the repository.

## Changes

- Declare Obsidian 1.11.4, the earliest supported version for SecretStorage.
- Replace all four regular-expression lookbehinds while preserving LF/CRLF content.
- Use native Setting headings and move initial selection height to CSS.
- Remove CSS !important overrides and :has selectors; keep the data folder hidden.
- Remove historical release bundles from Git tracking; the files remain on disk.
- Replace unsafe parser types, redundant assertions, empty catches and global timers.
- Retain the browser-compatible XMLValidator entry point; the proposed replacement loads a Buffer-dependent transitive dependency and fails in the mobile browser harness.
- Document network requests, vault indexing and clipboard usage.
- Normalize generated text line endings and build the release from its exact Git tag.
- Upload only main.js, manifest.json and styles.css. The JavaScript embeds license notices.
- Add GitHub Actions build attestations. These exist only after that workflow runs successfully.

## Local checks

Official eslint-plugin-obsidianmd recommended rules: zero errors; three warnings retained:

1. Default Alt+T and Alt+I hotkeys are retained at the user's explicit request. They can be reassigned in Obsidian.
2. The settings tab uses the classic interface for Obsidian 1.11.4 compatibility; its controls are not indexed by the 1.13 settings search.

3. The XMLValidator deprecation remains until its replacement can load without Node.js Buffer on mobile.

The sentence-case rule recognizes product names such as OneCalendar, Obsidian, Feishu, CalDAV and OAuth. No rules are disabled.

94 functional tests, mobile layouts at 320/390/768 pixels, desktop at 1280 pixels, and CalDAV settings at 390/1000 pixels are tested locally. UI tests use a simulated Obsidian host, not an Android device. Repeated builds are compared by SHA-256.

## Resubmission

Push the current source and lockfile to the default branch, then push tag 0.9.1 on that exact commit. The release workflow creates a draft. Publish it without Pre-release checked and request another Obsidian review. Local passing checks cannot substitute for the remote build comparison, attestations or final community review. No remote release was published by this repair.

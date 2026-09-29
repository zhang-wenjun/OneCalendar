# Contributing

Use Node.js 24.18.0 and `npm ci`. Run `npm run lint`, `npm test`, and `npm run build` before submitting changes. UI harnesses use Playwright with Edge; set PLAYWRIGHT_PATH if Playwright is installed outside this project. Run `npm run test:mobile` and `npm run test:caldav-ui` for UI changes.

Keep diary, project and calendar formats backward compatible. Never include vault contents or credentials in a pull request. Report bugs with the plugin version, Obsidian version, platform and minimal reproduction. Strip private event details from logs.

Release steps are in docs/RELEASING.md. Generated bundles and downloaded review reports stay outside Git.

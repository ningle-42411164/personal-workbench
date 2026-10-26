# Personal Workbench

A lightweight personal workspace for everyday items and projects, with a Chinese-language interface, browser-local storage, and an optional owner-only cloud test view.

[Try it online](https://ningle-42411164.github.io/personal-workbench/)

## Features

- **Quick capture:** save a note by default, check "Needs handling" to create a to-do, or explicitly choose a supported item type. Priority items stay in their selected category.
- **Categories:** one-off to-dos, notes, waiting items, entertainment/creative items, shopping, and projects. Lists support expandable previews.
- **Everyday reminders and important dates:** compact name-only reminders and date cards with days remaining or elapsed, calculated from the local calendar date.
- **Item actions:** complete and restore to-dos, notes, waiting items, entertainment/creative items, and shopping without changing their original category. Expand an item to see its creation time, edit its name, or delete it with confirmation.
- **Note conversion:** turn a note into a formal item while keeping the original note marked as recorded; the same note cannot be converted repeatedly.
- **Projects:** quick or full creation, centered modal details, field-by-field editing, status, optional user tags, start and due dates, current situation, and next step. Switching fields or closing saves valid changes first; failure keeps the editor open with its input. Cancel discards only the current unsaved field. Creation adds one history entry; subsequent changes to the current situation append timestamped updates. Completed projects retain their details and history. See the [implementation and manual acceptance record](docs/project-dialog-2026-10-26.md).
- **User tags:** projects can have no tags, one tag, or multiple tags. Twelve default choices are available independently of existing items and are combined with tags already saved in the data. User tags are separate from system priority indicators.
- **JSON backups:** export the complete versioned data, or import a validated backup after confirming replacement of all current records. Import does not merge records.
- **Cloud test connection (1A/1B):** expand “云端连接” at the bottom to select the isolated cloud view. Local use needs no login. First authorization is read-only; a separate explicit authorization enables creating to-dos and editing supported project fields. Encrypted rotating refresh credentials in a separate IndexedDB restore the connection after reopening. Failed saves retain drafts, uncertain retries reuse the exact request, and version conflicts require manual comparison. Cloud failures preserve the current snapshot. Local items are never automatically uploaded; full offline synchronization is not implemented.
- **PWA support:** local resource caching, update notifications, app icons, and a skippable launch screen shown once per browser session, with reduced-motion support.

## Stack

Vue 3, JavaScript, Vite, and `vite-plugin-pwa`. Records are stored in `localStorage` under `personal-workbench.data.v2`, using `schemaVersion: 2` and one `items` collection. The launch screen uses `sessionStorage` for its session flag.

The separate [Cloudflare Worker service](services/workbench-api/README.md) is shared with ChatGPT MCP. There is no user registration, multi-user account system, automatic migration, or full offline synchronization. See [1A authentication](docs/mobile-cloud-1a-2026-10-26.md) and the [1B implementation, acceptance, and learning index](docs/mobile-cloud-1b-2026-10-26.md).

## Local development

Use Node.js 24 and npm. From the project directory:

```sh
npm ci
npm run dev
```

Open the address printed by Vite, including the `/personal-workbench/` path (normally `http://localhost:5173/personal-workbench/`).

Build and preview the production version:

```sh
npm run build
npm run preview
```

The preview address is normally `http://localhost:4173/personal-workbench/`. Production output is written to `dist/`. Use the production preview, rather than the development server, to check PWA caching.

Run the data tests:

```sh
node --test tests/workbenchData.test.js
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Data and offline limits

Records belong to the current browser on the current device and site address. Other browsers, devices, and local preview addresses do not automatically share or synchronize them. Clearing browser/site data or browser-managed storage cleanup can remove records. Export backups regularly, especially before importing a replacement backup.

The first visit and initial resource caching require an internet connection. Offline use is available only after caching is ready; the page displays a readiness message when this occurs. Cached resources and local records are not guaranteed to remain available forever. Installation and offline behavior should be checked on the actual device and browser; support is not guaranteed for every phone or tablet.

## Deployment

GitHub Pages hosts the app at [https://ningle-42411164.github.io/personal-workbench/](https://ningle-42411164.github.io/personal-workbench/). The existing workflow in `.github/workflows/deploy-pages.yml` builds and deploys the site on pushes to `main`. The Vite base and PWA scope use `/personal-workbench/`.

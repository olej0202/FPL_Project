# FPL Analytics frontend

React 19 + Vite. Player projections, statistical scenarios, team optimization and
Premier League analysis, with a shared responsive interface for mobile and PC.

## Start

From this directory:

```powershell
npm.cmd install
npm.cmd run dev
```

Use the existing `node_modules` without reinstalling when dependencies are already
available. Development uses the API configured by `VITE_API_BASE_URL`; copy
`.env.example` to `.env.local` when overriding it. The default remains the existing
production API. Routing uses hashes, so saved links keep working on static hosting.

## Project structure

```text
src/
  app/                 Providers, lazy routes, navigation and page tracking
  components/
    layout/            Header, account menu, drawer and section tabs
    ui/                Reusable UI primitives and page states
    filters/           Shared searchable projection filters
  features/            Feature pages, components, helpers and hooks
  Contexts/            Persistent application state
  hooks/               Shared hooks
  lib/                 JSON API transport
  utils/               Projection, transfer and gameweek calculations
  styles/              Shared theme and responsive styles
```

See [architecture](docs/architecture.md) and the
[old-to-new source mapping](docs/source-map.md). Existing page URLs, data formats,
scenario storage keys and provider APIs are retained. The current green profile is
kept, with consistent navigation, focus states, spacing and mobile layouts.

## Checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:tree
```

`npm run check` runs lint, unit tests and the production build. Existing hook/ref
warnings remain visible; lint errors are fixed. Builds go to `dist/`.

The local browser checks use Edge, the project's Python environment and local
CSV samples. They do not call the production API:

```powershell
..\..\venv\Scripts\python.exe scripts/browser/prepare_data.py
npm.cmd run test:browser:build
..\..\venv\Scripts\python.exe scripts/browser/check_frontend.py
```

Additional checks for tree caching, branch chips and touch gestures:

```powershell
npm.cmd run test:tree:build
..\..\venv\Scripts\python.exe tree-behavior-browser-check.py
npm.cmd run test:mobile:build
..\..\venv\Scripts\python.exe mobile-browser-check.py
```

Build first so browser fixtures can use the generated stylesheet. Tests use an
isolated browser profile. Browser results and screenshots are written to
`../../diagnostics/frontend-rebuild/`; tree results are in
`../../diagnostics/tree-behavior-check/`. Production Google sign-in/API availability
are outside the offline test coverage.

## Roll back

A complete source checkpoint, including pre-existing local changes, is available in
`../frontend-backups/20261031-094944/`. Preview with:

```powershell
.\Rollback-Frontend.ps1
```

Restore with `.\Rollback-Frontend.ps1 -Apply`, then run `npm.cmd run build`.
The restore script archives the current state before restoring the checkpoint and
keeps dependencies. See [rollback instructions](docs/rollback.md).

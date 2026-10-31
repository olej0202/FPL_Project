# Frontend architecture

The application keeps React 19, Vite, HashRouter and the existing API contracts.
Feature calculations were moved into focused modules rather than replaced.

## Ownership

| Location | Responsibility |
| --- | --- |
| `src/app/` | Provider composition, route registry, page tracking and navigation configuration |
| `src/components/layout/` | Application header, account menu, mobile drawer and section navigation |
| `src/components/ui/` | Buttons, panels, page headers, loading/error/empty states and scrolling tables |
| `src/components/filters/` | Shared AI/statistical filter controls and searchable multi-select |
| `src/features/` | Feature pages, presentation components, helpers and feature-specific hooks |
| `src/Contexts/` | Shared application state and existing provider APIs |
| `src/lib/` | Shared JSON transport |
| `src/utils/` | Existing projection, transfer and gameweek calculations |
| `src/styles/` | Shared design tokens and responsive component styles |

Features cover optimization, chip teams, AI models, statistical models, player/team
analytics, fixtures, season analysis, reviews, prices and news. Earlier unrouted
screens remain in `legacy/` folders; they have not been substituted for active pages.
The original-to-new filename mapping is in [source-map.md](source-map.md).

## State and navigation

`AppProviders` stays above the route outlet. Its order preserves the existing
provider dependencies. Navigating between pages does not recreate the team,
statistical scenarios or optimization cache.

Tree results remain keyed by root ID in `MyTeamContext`. A rerun invalidates only
that tree's cache; deleting/resetting a tree clears its results. Existing run tokens
prevent late or superseded responses from restoring invalid results. Chips remain
independent per node. The frontend refactor does not change the backend solver.

`routeDefinitions.js` is the central route registry. Existing URLs and legacy
redirects are retained. Each page keeps its availability flag. Pages are loaded on
demand; a page error leaves navigation available and shows a recovery action.

## UI conventions

- Use `SectionLayout`/`SectionTabs` for section navigation. Docked tabs sit at the
  bottom on mobile and above the content on desktop.
- Use `Button`, `Panel`, `PageHeader`, `LoadingState`, `EmptyState` and `TableScroll`
  for new shared UI. Give icon-only buttons an accessible name.
- Use `FilterControls` for shared projection filters. Popovers render into the
  document body so ancestor panels cannot clip them. They track viewport position,
  support outside dismissal and Escape, and return focus to their trigger.
- Put shared colors, spacing and component behavior in `styles/components.css`.
  Keep feature CSS scoped to the feature's root class. Avoid global pitch/chart
  overrides and preserve reduced-motion support.
- Keep wide tables in a scrolling region. Use `min-w-0`/`minmax(0, …)` on grid and
  flex children so mobile pages do not expand beyond the viewport.

## API configuration

All production API URLs resolve through `config/apiBase.js` and
`VITE_API_BASE_URL`. `fetchJson` provides the shared JSON transport used by the
general-data and chip-team providers; it preserves supplied headers and signals
and rejects HTTP errors. Optimization keeps its existing streaming implementation.

## Validation

`npm run lint`, `npm test` and `npm run build` are the standard checks. Hook/ref
dependency warnings inherited from the existing data model remain visible; they
have not been suppressed globally. Lint errors were removed.

The offline browser harness uses the actual application, routes and providers,
with local samples from the project's CSVs. All external browser traffic receives
local placeholders. It checks 22 active pages at 320, 390, 768, 1024 and 1440 pixels,
as well as menu focus, Escape, price filtering, shared filters, scenario creation,
legacy redirects and unknown URLs. Separate tree checks cover streaming, stale
responses, navigation, deletion, reruns and branch-specific chips.

These checks do not authenticate against Google or exercise production API
availability. Those integrations need a real-account smoke check before deployment.

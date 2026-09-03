# Plugin Center Redesign

## Problem

The management workspace currently treats plugins, credentials, skills, and
Agent roles as four unrelated CRUD pages. That makes a growing plugin catalog
hard to scan, exposes credentials as raw identifiers, leaves the skills center
without a useful starting surface, and makes Agent role creation feel like a
form instead of an intent-driven workflow.

## Direction

Use a dense, white-canvas control plane consistent with `DESIGN.md`:

- a compact management rail with a clear active section;
- plugin inventory split into local and cloud-managed sources;
- connection-oriented credential rows with secret values never projected;
- a searchable skills library shell that works before the server catalog exists;
- a prompt-first Agent role studio with an ephemeral multi-brief review queue;
- detail panes and drawers for secondary inspection, leaving repeated rows
  unframed and scannable.

The visual point of view is an editorial operations console: monochrome
structure, black primary actions, restrained blue for cloud/sync state, and
hairlines instead of decorative shadows or gradients.

## Contracts And Ownership

`ElectronCenterAuthService` remains the only owner of authenticated Center
requests. `ElectronCenterPluginService` validates the safe, non-secret Center
plugin response and maps it to the renderer's `PluginRecord` shape. The
renderer store owns loading, local/cloud merge, filtering, and optimistic UI
projection. Components only emit intent and render state.

Remote plugin metadata is read-only in this phase. Local plugins remain the
only plugins that can be enabled or disabled from the existing local catalog
commands. Remote credential state is a boolean metadata projection from
Center; credential values are never returned to the renderer.

## Interaction States

- Plugins: search, source filter, explicit cloud sync, selected detail, local
  enable/disable, missing remote credential status, and partial failure where
  local data remains usable if cloud sync fails.
- Credentials: select an existing connection, start a new connection, save a
  secret once, clear a selected connection, and show only configured metadata.
- Skills: search and source filtering work against future catalog data; the
  empty state exposes source slots without pretending that server support
  exists.
- Roles: a natural-language brief can be queued multiple times, removed, and
  reviewed as a batch. No generation or persistence is implied by the UI-only
  queue. Existing saved roles remain editable through the advanced drawer.

## Failure And Recovery

Cloud plugin parsing is fail-closed. Invalid or oversized server responses are
reported as a remote catalog error and do not replace an already loaded local
catalog. The UI keeps the last usable local data visible and allows retry.
Secret save/clear continues to use the existing encrypted main-process store.
All loading, error, empty, unavailable, disabled, focus, reduced-motion, and
390px English/Chinese layouts are treated as first-class states.

## Verification

Run the focused feature and service tests, then the repository checks:

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

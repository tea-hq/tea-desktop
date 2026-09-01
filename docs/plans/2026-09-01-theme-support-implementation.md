# Theme Support Implementation Plan

**Goal:** Add a persisted `system | light | dark` appearance preference with live system-theme tracking and complete light/dark semantic tokens across the Electron renderer.

**Architecture:** `AppSettings.theme` is the durable user preference owned by the settings store and validated by the Electron settings service. A renderer-only theme controller derives the effective theme from the preference and `matchMedia`, then projects it to `document.documentElement.dataset.theme` and `color-scheme`; Vue components continue to consume semantic Tailwind tokens and never branch on theme names. Existing settings IPC remains the typed boundary, and no native Electron theme state is added in this phase.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Tailwind CSS v4, Electron context-isolated IPC, Vitest, Playwright.

## Implementation Status

Completed on 2026-09-01:

- [x] Theme contract and renderer controller with system listener lifecycle
- [x] Settings persistence, schema-v1 normalization, validation, and rollback tests
- [x] Light/dark semantic token matrix and first-frame system fallback
- [x] Shared primitive, overlay, auth, profile, directory, channel, and Markdown consumers
- [x] Composition-root lifecycle wiring and workspace re-entry cleanup
- [x] Localized English/Chinese appearance controls
- [x] Deterministic Vitest coverage and Playwright dark-palette coverage
- [x] ADR and repository verification review

Verification notes:

- `npm run type-check`, `npm run test:run` (548 tests), `npm run lint`,
  `node scripts/check-ui-boundaries.mjs`, and `npm run build:web` pass.
- Playwright accessibility checks pass when run against the Vite E2E fixture
  server; the repository does not currently provide a Playwright base URL or
  web-server config, so that server must be started explicitly.
- `npm run format:check` reports the pre-existing YAML quote style in
  `DESIGN.md` and an untracked `graphify-out/cache/stat-index.json`; the
  theme-related source files are formatted and `git diff --check` is clean.

---

### Task 1: Define the theme contract and controller boundary

**Files:**

- Create: `src/shared/ui/theme/themeController.ts`
- Create: `src/shared/ui/theme/themeController.test.ts`
- Modify: `src/features/settings/contracts.ts`
- Modify: `src/shared/ui/index.ts`

**Steps:**

1. Add `ThemePreference = 'system' | 'light' | 'dark'` and `EffectiveTheme = 'light' | 'dark'` in the shared theme module.
2. Add `theme: ThemePreference` to `AppSettings` and set `DEFAULT_SETTINGS.theme` to `system`.
3. Define `createThemeController()` with `apply(preference)`, `effectiveTheme()`, and `dispose()` methods. It must be safe when `document` or `matchMedia` is unavailable.
4. Make `system` resolve from `matchMedia('(prefers-color-scheme: dark)')`, subscribe to change events, and update the root `data-theme` and inline `color-scheme` values.
5. Remove the system listener when switching to an explicit preference and on `dispose()`.
6. Write unit tests for explicit light/dark, system light/dark, media-query changes, missing browser APIs, listener cleanup, and repeated `apply()` calls.
7. Run `npx vitest run src/shared/ui/theme/themeController.test.ts` and expect all new tests to pass.

### Task 2: Extend settings persistence and store behavior

**Files:**

- Modify: `src/features/settings/store.ts`
- Modify: `electron/services/settings.ts`
- Modify: `src/features/settings/store.test.ts`
- Modify: `electron/services/settings.test.ts`

**Steps:**

1. Update `cloneSettings()` to copy `theme` and add a `setThemePreference()` action to the settings store.
2. Decide the pre-1.0 settings policy explicitly: preserve schema 1 and normalize a missing theme to `system`, or bump to schema 2 with an explicit migration. Use one policy consistently and document it in the implementation/ADR note.
3. Validate persisted and IPC-provided theme values against the three-value allowlist in `normalizeAppSettings()`.
4. Preserve the existing corrupt-file recovery and optimistic-write rollback semantics when a theme update fails.
5. Add tests for loading/persisting each preference, preserving unrelated settings, invalid theme values, missing theme normalization, and failed writes.
6. Run the settings unit suites and verify no existing settings fields change during a theme update.

### Task 3: Add the semantic light/dark token matrix

**Files:**

- Modify: `src/assets/main.css`
- Modify: `src/shared/ui/theme/teaTokens.ts`
- Modify: `src/shared/ui/theme/teaTokens.test.ts`
- Modify: `DESIGN.md`

**Steps:**

1. Keep the current light values as the light theme and add a complete dark value set under `:root[data-theme='dark']`.
2. Add root mappings for `scrim`, `code-surface`, `code-fg`, `on-accent`, `on-danger`, and `on-inverse`; keep status background/text pairs and scrollbar variables theme-specific.
3. Add an early CSS fallback using `@media (prefers-color-scheme: dark)` only when no explicit light theme attribute exists, so the first frame follows the OS before settings load.
4. Replace the overloaded `inverse` usage in overlay and Markdown code paths with the new semantic tokens while retaining `inverse` only for high-contrast surfaces.
5. Update the TypeScript token export and tests so its semantic contract matches the runtime CSS variables. Do not create a second runtime palette in TypeScript.
6. Update `DESIGN.md` to define light/dark semantic values, contrast expectations, and the theme preference behavior.
7. Run `npm run build:web` to verify Tailwind generates all new semantic classes.

### Task 4: Update shared primitives and inverse consumers

**Files:**

- Modify: `src/shared/ui/TeaButton.vue`
- Modify: `src/shared/ui/TeaIconButton.vue`
- Modify: `src/shared/ui/TeaDialog.vue`
- Modify: `src/shared/ui/TeaDrawer.vue`
- Modify: `src/features/directory/components/DirectoryPage.vue`
- Modify: `src/features/auth/components/EnterpriseLogin.vue`
- Modify: `src/features/auth/components/OfflineProfileNotice.vue`
- Modify: `src/features/channels/components/ChannelSidebar.vue`
- Modify: `src/features/profile/components/ProfilePage.vue`
- Modify: `src/shared/ui/MarkdownContent.vue`

**Steps:**

1. Replace `text-canvas` used on accent/danger/inverse backgrounds with the appropriate `text-on-*` semantic classes.
2. Replace modal/drawer/directory backdrop `bg-inverse/30` with `bg-scrim/30`.
3. Update Markdown default/inverse code blocks and inverse prose to use `code-surface`, `code-fg`, and `on-inverse` without changing content behavior.
4. Check disabled, hover, pressed, focus, loading, status, and scrollbar states in both themes.
5. Run shared UI tests and inspect all remaining `bg-inverse`, `text-canvas`, and raw color usages for intentional semantics.

### Task 5: Wire theme lifecycle in the composition root

**Files:**

- Modify: `src/app/useTeaDesktopApp.ts`
- Modify: `src/app/useWorkspaceRuntime.ts`
- Create or modify: `src/app/useThemeRuntime.ts` (only if a separate lifecycle wrapper keeps the composition root clearer)

**Steps:**

1. Configure the `ElectronSettingsClient` at composition-root startup and begin settings initialization before authentication/workspace entry, while retaining the existing settings initialization guard.
2. Instantiate the theme controller in the app composition root and watch the persisted preference with an immediate effect.
3. Apply the default `system` mode synchronously, then apply the loaded preference when settings arrive; avoid duplicate theme state in components.
4. Dispose the controller on app unmount and ensure a workspace re-entry does not register duplicate media listeners.
5. Add lifecycle tests for startup ordering, preference changes, system updates, and cleanup.

### Task 6: Add localized appearance controls

**Files:**

- Modify: `src/features/settings/components/SettingsPage.vue`
- Modify: `src/app/components/WorkspaceContent.vue` (only for new props/events)
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/features/settings/components/SettingsPage.test.ts` (create if absent)

**Steps:**

1. Add an Appearance section using the existing segmented/pill control pattern with `system`, `light`, and `dark` options.
2. Pass the preference from the app view model and emit a typed `updateTheme` intent; the component must not call IPC or inspect `matchMedia`.
3. Add matching English and Chinese labels/descriptions and keep all user-facing copy in locale files.
4. Test selected state, emitted values, saving/disabled state, and English/Chinese rendering without overflow.

### Task 7: Add deterministic visual and boundary coverage

**Files:**

- Modify: `tests/e2e/fixtures/app.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Add or modify: focused component/theme tests under `src/**` and `electron/**`

**Steps:**

1. Extend the fixture helper to call `page.emulateMedia({ colorScheme })` for light and dark cases.
2. Add desktop and 390px checks for login, workspace, settings, drawer, dialog, menus, native select, Markdown/code, and error/success/warning states.
3. Assert no horizontal overflow, visible focus, correct `data-theme`, correct `color-scheme`, and live system-mode updates.
4. Keep fixtures synthetic and deterministic; do not use sleeps or real OS theme changes.
5. Run the focused Vitest and Playwright suites, then capture light/dark screenshots for review.

### Task 8: Review, document, and run repository checks

**Files:**

- Create: `docs/adr/0031-renderer-theme-preference.md`

**Steps:**

1. Record owner, source of truth, schema policy, system observation, failure recovery, and why native Electron theme APIs are out of scope for phase one.
2. Review the diff for component-level theme branching, arbitrary CSS injection, and duplicate settings state.
3. Run the required checks: `npm run type-check`, `npm run test:run`, `npm run format:check`, `npm run lint`, `node scripts/check-ui-boundaries.mjs`, and `npm run build:web`.
4. Report any pre-existing failures separately; do not commit or push unless explicitly requested.

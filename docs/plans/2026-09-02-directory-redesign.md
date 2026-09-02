# Member Directory Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the member card grid with an organization-aware directory that supports fast scanning, persistent desktop details, and a narrow-screen detail drawer.

**Architecture:** The directory store remains the source of truth for loading, filtering, and member data. `DirectoryPage` owns only ephemeral selection and drawer state, while focused child components render the organization scope, member list, and member detail. Existing directory contracts and message orchestration stay unchanged.

**Tech Stack:** Vue 3 Composition API, TypeScript, Tailwind CSS 4, vue-i18n, Vue Test Utils, Vitest, Playwright.

---

### Task 1: Define the component behavior with tests

**Files:**

- Create: `src/features/directory/components/DirectoryPage.test.ts`

**Step 1: Write the failing ready-state test**

Mount the page with multiple synthetic users and assert that it renders the tenant scope, tabular member rows, localized account status, and the first member in the persistent detail pane.

**Step 2: Write the failing interaction test**

Select a different row, assert the detail projection changes, and trigger the primary message action. Verify the existing typed `message` event returns the selected `DirectoryUser`.

**Step 3: Write the failing boundary-state test**

Cover loading placeholders, filtered-empty results, retry intent, disabled messaging for an unavailable account, and localized Chinese copy.

**Step 4: Run the focused test**

Run: `npx vitest run src/features/directory/components/DirectoryPage.test.ts`

Expected: FAIL before implementation because the organization scope, table semantics, and persistent detail panel do not exist.

### Task 2: Build the organization-aware directory components

**Files:**

- Create: `src/features/directory/components/DirectoryScopeNavigation.vue`
- Create: `src/features/directory/components/DirectoryMemberList.vue`
- Create: `src/features/directory/components/DirectoryMemberDetail.vue`
- Modify: `src/features/directory/components/DirectoryPage.vue`
- Modify: `src/app/components/WorkspaceContent.vue`

**Step 1: Add the organization scope boundary**

Render the current tenant as the real organization root and an active all-members item with the total count. Keep the structure ready for future department nodes without exposing unavailable controls.

**Step 2: Add the member table**

Render one keyboard-accessible row per member with stable avatar, identity, email, and messaging-status columns. Use hairlines and semantic tokens rather than repeated cards.

**Step 3: Add the member detail panel**

Render the selected identity, email, messaging account, provider, and one primary message action. Preserve disabled behavior when the messaging account is unavailable.

**Step 4: Compose responsive behavior in the page**

Use a fixed organization column from the medium breakpoint and a fixed detail column at wide desktop sizes. Open the shared `TeaDrawer` below the desktop detail breakpoint so focus trapping, Escape handling, and focus restoration remain centralized.

**Step 5: Pass unfiltered directory metadata**

Pass the tenant name and total member count separately from `filteredUsers`, so searches cannot erase organization context or change the durable member total.

### Task 3: Localize the new information architecture

**Files:**

- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh-CN.ts`

**Step 1: Add matching locale keys**

Add organization scope, column headings, member detail, status, provider, result count, and narrow-screen labels to both locale files.

**Step 2: Verify locale parity**

Run: `npx vitest run src/locales/locales.test.ts`

Expected: PASS with identical locale key shapes.

### Task 4: Add a deterministic visual fixture

**Files:**

- Modify: `src/app/E2eFixtureApp.vue`
- Create: `tests/e2e/directory.spec.ts`

**Step 1: Add synthetic directory data**

Expose a `directory` fixture with ready, unavailable-account, missing-email, and long-identity examples. Keep all values synthetic.

**Step 2: Render the directory fixture**

Allow the fixture shell to select directory mode without initializing a network or Electron service.

**Step 3: Test desktop and narrow layouts**

Verify the desktop organization/list/detail regions, mobile drawer interaction, Chinese copy, and absence of horizontal document overflow.

### Task 5: Verify the implementation

**Files:**

- Verify all changed files

**Step 1: Run focused tests**

Run: `npx vitest run src/features/directory/components/DirectoryPage.test.ts src/locales/locales.test.ts`

Expected: PASS.

**Step 2: Run repository checks**

Run: `npm run type-check`, `npm run test:run`, `npm run format:check`, `npm run lint`, `node scripts/check-ui-boundaries.mjs`, and `npm run build:web`.

Expected: All checks pass.

**Step 3: Run visual tests**

Start the fixture server, run the directory Playwright spec, and capture desktop plus 390px screenshots. Inspect both images for overflow, overlap, readable hierarchy, and stable controls.

**Step 4: Preserve commit ownership**

Do not commit or push. Leave the completed change on `codex/directory-redesign` for user review.

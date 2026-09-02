# Electron Window Chrome Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Electron main window visually titlebar-less while keeping native window controls usable and matching the renderer's light/dark canvas.

**Architecture:** Electron main owns platform-specific titlebar options and applies a validated effective theme to the native overlay. The preload exposes one typed, allowlisted theme-sync method. The Vue root renders a same-color 36px drag region and keeps feature components responsible only for their existing workspace content.

**Tech Stack:** Electron 44, Vue 3, TypeScript, Vue Test Utils/Vitest, Tailwind CSS semantic theme tokens.

---

### Task 1: Define platform window chrome

**Files:**

- Create: `electron/windowChrome.ts`
- Test: `electron/windowChrome.test.ts`

1. Add the shared 36px chrome height, light/dark native colors, macOS hidden-titlebar options, and Windows/Linux titlebar-overlay options.
2. Add a small adapter that updates `setTitleBarOverlay` only on platforms that support it.
3. Cover both themes, all supported platforms, and the macOS no-op update behavior.

### Task 2: Wire main-process ownership

**Files:**

- Modify: `electron/main.ts`
- Modify: `src/types/theme.ts`

1. Create the initial window with the system effective theme so the first native frame matches the renderer media-query fallback.
2. Validate the renderer payload at the main-process IPC boundary and reject messages from any other window.
3. Apply native overlay updates without adding durable state or runtime-specific branches.

### Task 3: Wire the typed renderer bridge

**Files:**

- Modify: `src/types/electronBridge.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`
- Modify: `src/shared/ui/theme/themeController.ts`
- Modify: `src/shared/ui/theme/themeController.test.ts`
- Modify: `src/app/useTeaDesktopApp.ts`

1. Add an allowlisted `setWindowTheme` bridge method with runtime validation.
2. Notify the native window whenever the effective renderer theme changes, without making theme application depend on Electron being present in browser tests.
3. Test the bridge payload and theme-controller callback behavior.

### Task 4: Add the integrated drag region

**Files:**

- Create: `src/app/components/WindowChrome.vue`
- Modify: `src/app/components/TeaDesktopRoot.vue`
- Modify: `src/app/components/WorkspaceShell.vue`
- Modify: `src/features/auth/components/EnterpriseLogin.vue`

1. Render a same-color, borderless 36px drag region at the root of both signed-out and signed-in flows.
2. Switch child full-screen layouts to fill the available height below that region.
3. Preserve the existing offline notice spacing and feature ownership.

### Task 5: Verify

Run the focused Electron/preload/theme tests, then `npm run type-check`, `npm run test:run`, `npm run format:check`, `npm run lint`, `node scripts/check-ui-boundaries.mjs`, and `npm run build:web`. Do not run Electron packaging.

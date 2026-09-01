# ADR 0031: Renderer Theme Preference

- Status: accepted
- Date: 2026-09-01
- Scope: Electron renderer, settings persistence, shared UI tokens

## Context

Tea Desktop currently ships one light palette. The renderer already consumes
semantic `--tea-*` variables, while the persisted settings file is owned by
Electron main and exposed through typed settings IPC. Theme support must not
introduce component-level branching, a second durable state machine, or
arbitrary CSS input.

## Decision

Phase one supports exactly three persisted preferences: `system`, `light`, and
`dark`. The settings store owns the preference as durable user intent. A
renderer-only theme controller derives the effective light/dark mode, observes
`matchMedia('(prefers-color-scheme: dark)')` only for `system`, and projects the
result to the document root's `data-theme` and `color-scheme`.

The CSS token matrix is the runtime source of truth. Vue components continue to
use semantic Tailwind classes. High-contrast surfaces, scrims, code blocks, and
foreground-on-color roles have separate tokens; `inverse` is not reused for
both an overlay and a code surface.

The current application is pre-1.0, so settings schema version 1 remains in
place and a missing `theme` field normalizes to `system`. Invalid theme values
are rejected by the main-process allowlist and follow the existing settings
recovery/error semantics. If settings becomes a public stable format before
additional fields are added, the service must move to an explicit schema
version and migration instead of adding compatibility aliases.

Native Electron `nativeTheme` is out of scope for this phase. It is only needed
later if native titlebars, menus, tray UI, or window backgrounds must share the
renderer theme. The renderer applies the system fallback before settings load
through CSS media rules, then replaces it with the persisted preference when
available.

## Consequences

- Theme changes are immediately visible and survive application restarts.
- System appearance changes update open windows without reload in `system` mode.
- Every theme must define contrast-safe values for controls, status messages,
  Markdown, code, focus, disabled states, scrollbars, and scrims.
- Built-in themes can be added later as an allowlisted registry of the same
  semantic token contract. User-authored CSS and arbitrary color values remain
  out of scope.

## Recovery and testing

Theme persistence uses the existing atomic settings write and optimistic
rollback behavior. Tests cover controller listener cleanup and media changes,
settings normalization/validation, UI selection and localization, and
Playwright light/dark media emulation with mobile overflow and focus checks.

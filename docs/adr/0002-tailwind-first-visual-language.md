# ADR 0002: Tailwind-first visual language

## Status

Accepted

## Context

Tea needs one visual language that remains stable as feature work grows. The
previous implementation used PrimeVue as both an interaction library and an
implicit visual source, while feature and shared components also carried local
Tailwind values. That made visual decisions difficult to audit and allowed
feature code to drift.

Tea is an Electron desktop application. It does not need a second component
library or a Web/PWA-specific responsive system. Its product UI should remain a
quiet, dense Agent workspace with clear state, keyboard access, and localized
copy.

## Decision

- Use Tailwind CSS utilities and a small set of Tea semantic tokens as the
  visual source of truth.
- Keep Vue 3 and the existing `Tea*` component interfaces.
- Remove PrimeVue and `@primeuix/themes` completely.
- Implement simple controls with semantic HTML. Keep reusable interaction
  behavior in `src/shared/ui/`.
- Use the following visual layers: canvas, surface, panel, raised, muted,
  hover, pressed, foreground, dim, subtle, disabled, line, accent, and status
  colors. Hover and pressed are translucent washes so the same interaction
  reads consistently across surfaces.
- Use a finite radius scale for structural (8px), control (12px), and overlay
  (16px) surfaces, and reserve elevation for overlays. Sections and repeated
  rows stay borderless; borders are reserved for real dividers and controls.
- Feature code may use Tailwind layout and typography utilities, but raw color
  palettes, arbitrary visual values, and non-semantic shadows/radii are blocked
  by `scripts/check-ui-boundaries.mjs`.
- User-facing copy remains in the English and Chinese locale files. Shared
  primitives accept localized labels for icon-only and dismissal actions.

## Consequences

The feature layer is insulated from the implementation of buttons, fields,
menus, tabs, dialogs, and drawers. Replacing a primitive implementation does not
require changing stores or runtime contracts. The project owns a small amount
of keyboard and focus behavior for overlays and menus, so those behaviors must
have owning-layer tests and remain deterministic.

PrimeVue-specific theme tests and installation code are removed. Visual changes
should update the primitive stories and the relevant Playwright screenshot
baselines.

## Alternatives considered

- Keep PrimeVue and override its theme: rejected because the library would
  remain an implicit visual and DOM dependency.
- Adopt another headless component library: deferred because it adds a second
  abstraction layer before Tea has proven it needs one.

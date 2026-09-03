# Sidebar Topbar Design

## Context

The channel sidebar title only repeated the active workspace mode and pushed
the search control down. The Agent sidebar had the same problem: a `Sessions`
heading occupied one row while its scope tabs sat below it, leaving the tabs
visually detached from the actions they control. The reference layout also
shows that search is a better window-level affordance than a mode-specific
sidebar field.

## Decision

Use a compact controls-first topbar for both sidebars and a single global
search field in the window Chrome. The field is centered in window coordinates,
uses a 40rem desktop maximum with reserved native-window control space, and
expands to the responsive toolbar width rather than its intrinsic input width.
The production shell and visual fixture share the same search-field component
so screenshot geometry cannot diverge from the shipped layout. The channel
sidebar no longer renders its
own search field in the real workspace; the global query filters channels and
keeps the connection state available as a labelled status dot in the same
search affordance. The Agent sidebar removes the repeated title and places
the scope segmented control in the same row as the new-session and
alternate-Agent actions. The global query filters Agent conversations by
title, preview, or working directory. The segmented control remains a
tablist, keeps all existing labels and selection events, and uses flexible
item widths so English and Chinese labels fit within the fixed desktop
sidebar.

## Alternatives Considered

- Keep the title and move the controls below it: preserves the existing
  hierarchy but retains the unused vertical row and the detached-tab issue.
- Replace the title with a text-only filter row: saves space but loses the
  system's established pill control treatment and makes the scope less
  scannable.
- Use a window-level search plus controls-first sidebars: removes redundant
  copy, gives search room to grow into console-wide discovery, keeps actions
  close to their scope, and matches the documentation aesthetic of dense,
  unframed workspace surfaces. This is the selected option.

## Invariants

- Existing filter, new-session, Agent selection, search, and connection-state
  behavior is unchanged.
- Sidebars retain accessible names even when visible headings are removed.
- No new colors, shadows, dependencies, or runtime/state logic are added.

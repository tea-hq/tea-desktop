# Channel Surface Alignment

## Problem

The channel workspace currently gives its title and search areas a `panel`
surface while the content below uses the `canvas` surface. In light mode this
creates a gray band above a white list; in dark mode it creates a lighter band
above a near-black timeline. The contrast is not carrying product meaning and
makes the title feel detached from the content it labels.

## Design

Use the `canvas` token as the continuous surface for the channel sidebar,
sidebar header, timeline header, timeline, and composer bar. Keep a single
`line-soft` boundary below the sidebar header and between the timeline regions.
Inputs, message bubbles, selected rows, and pressed controls retain their
semantic surfaces so hierarchy remains available without framing repeated
content. Header padding follows the existing desktop rhythm and is slightly
more generous on the wider breakpoint.

## Invariants

- Theme changes must preserve the same structural hierarchy in light and dark
  modes.
- Channel selection, message loading, scrolling, and composition behavior are
  unchanged.
- No raw palette, gradient, shadow, or new component dependency is introduced.

## Verification

Run the channel component tests, the full type-check/test/format/lint suite,
the UI boundary check, and the web build. Inspect the E2E fixture at desktop
and narrow widths in both effective themes to confirm the title and content
surfaces read as one continuous canvas.

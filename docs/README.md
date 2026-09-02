# Documentation Map

The documents in this directory were migrated from the predecessor Tea Desktop
repository on 2026-08-28. Product invariants remain applicable, but the desktop
host is now Electron.

## Authority

- `AGENTS.md` defines current engineering and ownership rules.
- `DESIGN.md` is the sole visual source of truth.
- `docs/adr/0022-official-acp-electron-runtime.md` defines the external Agent
  protocol direction.
- `docs/adr/0024-authenticated-local-acp-mcp-attachment.md` defines how an ACP
  Agent attaches command-based MCP stdio to Electron main's tool broker.
- `docs/adr/0027-disposable-acp-subjects-and-catalog-owned-channel-context.md`
  defines disposable subject sessions and durable Channel driving-turn facts.
- `docs/adr/0023-use-domain-command-handler-registry.md` records the current
  Electron IPC routing decision.
- `docs/design/center-managed-enterprise-plugins.md` explains how Center-managed
  enterprise APIs become automatic Agent tools, with Mermaid flow and sequence
  diagrams.
- `docs/design/center-managed-enterprise-plugins-implementation.md` maps that
  architecture to the three repositories, APIs, deployment settings, and
  failure semantics.
- `docs/adr/0030-center-managed-declarative-http-plugins.md` records why Tea
  uses declarative HTTP plugins instead of a generic proxy or required MCP
  deployment.
- `docs/adr/0045-provider-neutral-channel-media-workflows.md` defines received
  media viewing and host-owned saving without exposing provider or filesystem
  behavior to Vue.
- `docs/plans/2026-08-28-acp-foundation.md` records the ACP foundation and
  runtime checkpoints.
- `docs/plans/2026-08-28-acp-mcp-attachment.md` is the active ACP MCP
  implementation slice.
- `docs/plans/2026-08-28-acp-subject-collaboration.md` records the subject and
  Channel context implementation slice.
- `docs/testing/acp-runtime-compatibility.md` records the active deterministic
  ACP compatibility matrix and known product boundaries.
- `docs/testing/electron-acp-processes.md` defines the target-specific packaged
  Agent process release checks.

## Migrated Material

ADRs 0001 through 0020, the collaboration and management designs, the local
Plugin V1 contract, and their acceptance matrices preserve product behavior
that is independent of the desktop framework. References to Tauri, Rust,
`src-tauri`, Cargo, or `pnpm` inside migrated plans describe the predecessor
implementation and are historical requirements evidence, not executable
instructions for this repository. Apply the owner and validation commands in
`AGENTS.md` when implementing those requirements in Electron.

ADR 0002 is superseded by ADR 0022. It remains only as evidence for persistent
Codex thread, approval, cancellation, and recovery behavior that ACP must
preserve.

## Deliberate Exclusions

The PrimeVue/Aura ADR, design, plan, and acceptance matrix were not migrated
because they conflict with `DESIGN.md` and the current Tailwind/shared-primitive
UI system. The DeepSeek harness plan was not migrated because vendor-specific
external runtime protocols are superseded by ACP.

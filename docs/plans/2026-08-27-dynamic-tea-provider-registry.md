# Dynamic Tea Provider Registry Implementation Plan

> **For Codex:** Implement this plan task-by-task without committing; the user
> explicitly requested in-place implementation across the current dirty
> Desktop and tea-rs checkouts.

**Goal:** Add and remove Tea model providers without rebuilding the Tea Agent,
while preserving explicit session model selection and active-run snapshots.

**Architecture:** `tea-rs` publishes immutable `ModelRegistry` generations from
one long-lived `AgentRuntime`. A run captures one generation, while sessions
persist only `ModelRef`. Desktop constructs providers with final `local.*` or
`center.*` identities, dynamically replaces only the Center-owned provider set,
and keeps the existing Tea runtime, sessions, tools, and event bridge.

**Tech Stack:** Rust, Tokio, Tauri 2, Vue 3, TypeScript, Pinia, Vitest

---

### Task 1: Add Immutable Registry Generation Operations

**Files:**

- Modify: `../tea-rs/crates/tea-model/src/router.rs`
- Test: `../tea-rs/crates/tea-model/tests/router.rs`
- Remove prior identity adapter changes from `../tea-rs/crates/tea-model/src/provider.rs`, `src/spec.rs`, `src/lib.rs`, and `tests/provider.rs`

1. Add failing tests for an empty registry, atomic batch registration,
   duplicate rejection, atomic removal, and old-generation retention.
2. Implement copy-on-write registration/removal over immutable provider maps.
3. Run `cargo test -p tea-model`.

### Task 2: Publish Dynamic Generations From AgentRuntime

**Files:**

- Modify: `../tea-rs/crates/tea/src/runtime.rs`
- Modify: `../tea-rs/crates/tea/src/builder.rs`
- Modify: `../tea-rs/crates/tea/src/command.rs`
- Modify: `../tea-rs/crates/tea/src/session_host.rs`
- Test: `../tea-rs/crates/tea/tests/builder.rs`
- Test: `../tea-rs/crates/tea/tests/runtime.rs`

1. Add failing tests proving runtime construction with zero providers, atomic
   dynamic registration/removal, no implicit model switch, prompt-time missing
   provider errors, and active-run snapshot retention.
2. Store `Arc<ModelRegistry>` behind a short-lived registry lock and expose
   batch register/remove/update methods.
3. Capture one registry generation before run validation and pass it to the
   kernel for the complete run.
4. Permit session creation/restoration with temporarily unavailable models;
   retain prompt and `SetModel` validation.
5. Run `cargo test -p tea`.

### Task 3: Expose The Lifecycle Through tea-coding

**Files:**

- Modify: `../tea-rs/crates/tea-coding/src/builder.rs`
- Modify: `../tea-rs/crates/tea-coding/src/service.rs`
- Modify: `../tea-rs/crates/tea-coding/src/config/process.rs`
- Test: `../tea-rs/crates/tea-coding/tests/service.rs`

1. Add a providerless builder path and facade methods for registry snapshots,
   atomic provider updates, and existing session-level `SetModel`.
2. Let process configuration map source IDs to final runtime IDs before
   provider construction; update returned selected settings consistently.
3. Add tests for mapped multi-provider construction, zero-provider service,
   dynamic registration, explicit selection, and secret-free diagnostics.
4. Run `cargo test -p tea-coding` and the full affected tea-rs workspace tests.

### Task 4: Keep One Tea Runtime In Desktop

**Files:**

- Modify: `src-tauri/src/conversation/tea.rs`
- Modify: `src-tauri/src/conversation/registry.rs`
- Modify: `src-tauri/src/conversation/mod.rs`
- Modify: `src-tauri/src/managed_runtime/service.rs`
- Test the corresponding Rust modules.

1. Construct local providers with final `local.*` IDs and Center providers with
   final `center.*` IDs before building adapters.
2. Keep one concrete `BuiltInTeaRuntime` in the conversation registry.
3. Replace only the Center-owned provider batch during managed activation and
   remove it during logout/offline/failure; never replace the Tea runtime.
4. Keep existing conversations and sessions attached to that runtime.
5. Run focused Desktop Rust tests.

### Task 5: Preserve Explicit UI Selection

**Files:**

- Modify: `src/features/conversation/store.ts`
- Modify: `src/features/collaboration/store.ts`
- Modify: `src/App.vue`
- Modify and add focused Vitest tests.

1. Keep the configured/default Tea model option when managed providers appear.
2. Do not rewrite `selectedModel` when providers are registered or removed.
3. Continue sending an explicit non-default selection through
   `ConversationCommand.model`; a removed selection must fail rather than fall
   back silently.
4. Run focused Vitest tests and `pnpm type-check`.

### Task 6: Verify End To End

1. Run `cargo test -p tea-model -p tea -p tea-coding` and relevant tea-rs checks.
2. Run Desktop Rust tests and `cargo check --manifest-path src-tauri/Cargo.toml`.
3. Run `pnpm test:run`, `pnpm type-check`, and `pnpm build`.
4. Start only with `pnpm tauri dev`, resolve its exact executable, and verify
   local startup, Center registration, explicit model selection, provider
   removal behavior, and prompt-time errors.

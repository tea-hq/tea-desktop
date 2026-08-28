# Agent Role Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authenticated users create, edit, sync, and select tenant-scoped Agent roles with prompt configuration and extensible capability references, while only runtime/model/prompt are executable in phase one.

**Architecture:** Tea Center owns role records, visibility authorization, and immutable revisions. Tea Desktop receives a full authenticated projection after login, stores it as a tenant/user-scoped cache, and sends a fixed `roleId + revision` reference when creating a conversation. Skills, MCPs, and tools are typed references with explicit unavailable status until their runtimes/catalogs exist.

**Tech Stack:** Go/HTTP/Postgres in `tea-center`; Rust/Tauri 2/Serde; Vue 3/TypeScript/Pinia/Vitest; Tailwind and existing locale system.

---

## Scope and invariants

- No secrets, executable paths, copied manifests, or runtime session state in a role.
- `tenant`, `restricted`, and `private` visibility are server-authorized; `audienceRefs` is reserved for future organization/user selectors.
- A saved revision is immutable for conversations; later edits create a new revision.
- Phase one executes only runtime/model/system prompt/user prompt. Unknown or unsupported capability refs make a role unavailable, never silently ignored.
- Full sync is the only synchronization algorithm in phase one; response metadata leaves room for cursor/ETag later.

## Tasks

### Task 1: Center role contract, persistence, and user API

Add tenant-scoped role tables/models, visibility authorization, revision endpoints, DTO validation, optimistic update checks, and audit events. Add tests for tenant isolation, private/restricted access, revision immutability, and invalid capability refs.

### Task 2: Desktop runtime contract and authenticated full sync

Replace the process-local role repository with a host-owned role service backed by a tenant/user-scoped cache. Add typed Center client, Tauri commands, login-success synchronization, logout/tenant-switch clearing, stale-cache state, and stable errors. Preserve `roleId + revision` identity and add reducer/store tests.

### Task 3: Frontend role center and reusable editor primitives

Build Agent Role list/editor in the Management workspace. Add reusable segmented choice, editor drawer, capability reference list, version badge, and dependency status components. Support metadata, prompts, visibility choices, draft/publish state, save/cancel, validation, unavailable capability states, loading/error/offline states, and locale parity. Do not expose native OS controls or invent capability pickers before catalogs exist.

### Task 4: Conversation selection and fixed revision resolution

Update `RoleSelector`, conversation store/client DTOs, and runtime creation flow to send a typed role reference. Resolve and validate the role before runtime creation; return typed unavailable/unsupported dependency failures. Add tests for fixed revision, missing dependency, and role edits not changing existing conversations.

### Task 5: Documentation and verification

Add an ADR for Center-managed roles and a testing/acceptance matrix. Run focused Go, Rust, and Vitest tests, then type-check/build and relevant full suites. Review the diff against concurrent worktree changes before proposing a merge/cherry-pick sequence.

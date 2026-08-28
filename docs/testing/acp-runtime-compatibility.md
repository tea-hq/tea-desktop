# ACP Runtime Compatibility Matrix

## Scope

This matrix records the active Electron ACP boundary. Deterministic tests use
synthetic protocol connections and temporary SQLite catalogs. They validate Tea
ownership and protocol mapping without network access or captured transcripts.
Real Claude/Codex execution and packaged application startup are separate,
opt-in release checks.

## Automated Coverage

| Boundary      | Covered behavior                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Registry      | Both pinned Agent artifacts verify before either ready descriptor is published; one failure prevents a partial registry  |
| Process       | Explicit entry point/arguments, `shell: false`, bounded diagnostics, environment allowlist, close and forced termination |
| Protocol      | V2 preference, fresh V1 fallback, exact wire binding, official SDK request/notification methods, bounded NDJSON          |
| Session       | New session, multiple turns, duplicate create rejection, cancellation, terminal states, connection failure, shutdown     |
| Recovery      | Exact binding validation, V1 load replay, V1/V2 resume, no downgrade, no replacement session, replay bounds              |
| Projection    | Text, thought, tool lifecycle/progress, passive updates, ordering, duplicate/out-of-order rejection, terminal failure    |
| Approval      | Request/session/tool correlation, exact offered option ids, allow/deny/cancel, connection exit, cleanup                  |
| Configuration | V1 modes/config options, V2 config options, Claude/Codex permission mappings, advertised-model validation before prompt  |
| HostTools     | Main-owned name/version resolution, immutable selection, explicit empty scope, authenticated local MCP attachment        |
| Subject       | Disposable no-tool ACP session, bounded title, concurrency coalescing, cleanup, no catalog binding                       |
| Catalog       | Atomic local create, idempotency, exact restore, Channel context, draft/delivery durability, stable failure facts        |
| IPC           | One runtime command service, typed failures/events, HostTool references only, schema-bearing input rejection             |

## Product Mapping

| Product value            | Claude ACP Agent     | Codex ACP Agent               |
| ------------------------ | -------------------- | ----------------------------- |
| `readOnly`               | `plan`               | `read-only`                   |
| `default`                | `default`            | `agent`                       |
| `fullAccess`             | `bypassPermissions`  | `agent-full-access`           |
| configured-default model | advertised `default` | keep advertised current model |

Model ids are session/account-specific. Runtime descriptors intentionally do
not infer static model lists from `external.claude` or `external.codex`; the
renderer currently exposes only configured-default until a protocol-neutral
post-create configuration contract exists.

`session/resume` is valid exact-session recovery and does not require load.
Resume without replay may accept future prompts but must reject complete
Snapshot/History reads. Only a validated load replay marks the historical
projection complete.

## Known Product Boundaries

- The Electron registry currently exposes only `external.claude` and
  `external.codex`; no built-in Tea Electron runtime exists.
- Artifact startup validates pinned package identity and package-owned entry
  points. Lockfile integrity is enforced during installation; runtime does not
  re-hash the complete dependency tree.
- Live account-dependent models and real Agent behavior require opt-in tests.
- Packaged process execution, platform optional packages, executable mode, and
  signing/notarization are not proven by unit tests.

## Verification

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

Packaging is covered separately by `electron-acp-processes.md` and is run only
when explicitly requested.

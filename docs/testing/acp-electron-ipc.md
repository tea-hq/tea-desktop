# ACP Electron IPC Testing

## Scope

This matrix covers ADR 0028. It verifies the typed Electron command boundary,
runtime adapter projection, event publication, immutable HostTool selection,
and SQLite draft/delivery ownership. Production now selects the runtime command
service atomically. Tests inject services and do not launch real Agents, access
a network, or package Electron.

## Automated Coverage

| Boundary        | Scenario                     | Expected result                                                 |
| --------------- | ---------------------------- | --------------------------------------------------------------- |
| Catalog         | Draft create/update/restart  | Current version and content persist against a real turn         |
| Catalog         | Delivery retry/restart       | One delivery per draft version; state and sent ref persist      |
| Catalog         | Invalid delivery transition  | Pending-to-sent and sent-to-failed are rejected                 |
| Service         | Runtime event relay          | Ordered event is cloned and relayed once                        |
| Service         | Delete active conversation   | Runtime closes, subscription disposes, then catalog row deletes |
| Adapter         | Runtime create result        | Main workspace is supplied; durable binding is omitted          |
| IPC handler     | Missing versus empty sources | Missing remains missing; explicit `[]` remains explicit         |
| IPC handler     | Malformed array              | Stable invalid-request rejection before delegation              |
| IPC handler     | HostTool schema/extra fields | Rejected; only exact name/version references cross preload      |
| IPC result      | Typed service failure        | `code` and `retryable` survive the invoke boundary              |
| IPC result      | Unknown failure              | Renderer receives `internal` without raw diagnostic text        |
| Events          | Missing/destroyed window     | Event is dropped without changing service state                 |
| Preload         | Allowlist and disposal       | Only known events register; exact listener is removed           |
| Renderer client | Conversation filtering       | Other conversation events are ignored                           |
| Collaboration   | First Channel create         | Channel history HostTool is fixed in creation options           |

## Verification

```sh
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

The compatibility cutover and model/mode mapping are implemented. Pinned real
Agent execution and packaged-process verification remain explicit release
checks documented in `acp-runtime-compatibility.md` and
`electron-acp-processes.md`.

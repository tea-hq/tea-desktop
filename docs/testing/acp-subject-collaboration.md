# ACP Subject And Collaboration Context Testing

## Scope

This matrix covers ADR 0027. Tests use synthetic ACP connections, deterministic
schedulers, and temporary SQLite databases. They do not launch a real Agent or
connect to a Channel provider. The production composition now exposes the same
service through typed renderer IPC.

## Automated Coverage

| Boundary     | Scenario                                    | Expected result                                             |
| ------------ | ------------------------------------------- | ----------------------------------------------------------- |
| Subject text | Oversized source                            | ACP prompt contains at most 4,000 source characters         |
| Subject text | Quotes, Markdown, punctuation, control text | One normalized title of at most 50 characters               |
| Subject text | Empty or source-equivalent output           | Typed failure; no title is stored                           |
| ACP session  | V1 and V2 success                           | `session/new`, prompt, terminal success, and exact close    |
| ACP session  | HostTools                                   | Disposable `session/new` has an empty `mcpServers` array    |
| ACP session  | Tool or permission activity                 | Subject result is rejected                                  |
| ACP session  | Timeout or runtime shutdown                 | Turn is cancelled and session/process close once            |
| ACP session  | Concurrent duplicate source                 | One disposable connection and one generated result          |
| Catalog      | Explicit empty source selection             | A context row with an empty source list is durable          |
| Catalog      | Duplicate selected/tool source              | One source row per turn/message identity                    |
| Catalog      | Wrong Channel or oversized evidence         | Stable invalid-request rejection before Agent dispatch      |
| Catalog      | Restart                                     | Contexts and insertion order are recovered from SQLite      |
| Service      | Channel driving turn                        | Context commits before JSON-wrapped runtime prompt          |
| Service      | Runtime dispatch rejection                  | Only the newly allocated context is removed                 |
| Service      | Cold `session/resume` continuation          | Next turn index comes from catalog; no snapshot is required |
| Service      | History projection                          | Catalog visible text replaces the internal wrapped prompt   |
| Service      | Late generated subject                      | Set-if-missing preserves a manual title                     |

## Security Inspection

The subject session has no MCP attachment and is absent from the runtime
session map, catalog binding, snapshots, and history. `channel_sources` stores
only bounded message identity, sender presentation, timestamps, state, and
sanitized text. It does not store credentials, provider extensions, receipts,
attachments, ACP messages, HostTool schemas, or delivery payloads.

The runtime prompt contains one JSON envelope produced with `JSON.stringify`.
Selected Channel text is marked untrusted and cannot escape into an executable
HostTool definition or ACP extension field.

## Release Boundaries

- Draft and delivery persistence is owned by the main SQLite catalog.
- ACP descriptors become ready only after both pinned Agent artifacts verify;
  model/mode values are accepted only from active-session advertisements.
- Live Channel history continues through the existing scoped HostTool executor
  and standard MCP broker; these tests cover its catalog append boundary, not a
  provider network.

## Verification

```sh
npm run test:run -- electron/conversation/subject.test.ts electron/conversation/collaboration.test.ts electron/conversation/catalog.test.ts electron/conversation/service.test.ts electron/conversation/acp/runtime.test.ts
npm run type-check
npm run test:run
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

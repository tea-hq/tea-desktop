# Conversation Catalog Acceptance Matrix

The Electron ACP migration now has a separate main-owned runtime catalog
matrix in `docs/testing/electron-conversation-catalog.md`. The legacy matrix
below remains historical coverage for behavior that has not yet crossed the
final runtime activation gate.

## Automated Coverage

| Area    | Scenario                                  | Expected result                                        |
| ------- | ----------------------------------------- | ------------------------------------------------------ |
| Catalog | Empty, bounded, and multi-page list       | Stable descending keyset order                         |
| Catalog | Equal timestamps                          | `conversation_id DESC` breaks ties                     |
| Catalog | New row inserted between page requests    | Next page has no duplicate loaded ids                  |
| Catalog | Invalid cursor or limit                   | Typed `invalidRequest` failure                         |
| Catalog | Workspace and archive filtering           | Only requested records are returned                    |
| Catalog | Rename, summary update, archive           | Record changes are durable and bounded                 |
| IPC     | Delete before runtime deletion support    | Stable rejection; catalog and history remain intact    |
| Tea     | Rebuild runtime against the same database | Existing native session attaches                       |
| Tea     | Load snapshot after rebuild               | User and assistant history is projected                |
| Tea     | Send after restore                        | A second canonical turn is appended                    |
| Codex   | Resume and read a native thread           | Structured app-server history is projected             |
| Codex   | Malformed required turn structure         | Snapshot load fails instead of dropping history        |
| Claude  | Create first native session               | CLI receives the cataloged UUID through `--session-id` |
| Claude  | Rebuild runtime and continue              | Snapshot reloads and CLI receives `--resume`           |
| Claude  | Snapshot size or identity is invalid      | Restore fails with a typed runtime error               |
| Store   | Initial page and load more                | Single merged, sorted projection                       |
| Store   | Slower previous selection response        | Latest selected id remains active                      |
| Store   | `conversation:updated`                    | Existing summary is merged and re-sorted               |
| Locale  | English/Chinese parity                    | Every new state has both translations                  |

## Manual Flow

1. Start Tea Desktop and create a Tea conversation.
2. Send a message and wait for the terminal response.
3. Close the application completely and reopen it.
4. Confirm the conversation appears in the left sidebar with its title,
   preview, runtime name, and updated time.
5. Select it and confirm the snapshot renders before any new event is applied.
6. Send a follow-up and confirm the same native session continues.
7. Confirm the updated conversation moves to the top of the sidebar.
8. Create a Codex conversation, send a message, and record its sidebar title.
9. Restart the application, select the Codex conversation, and confirm its
   native thread history is restored and can accept a follow-up message.
10. Repeat the create, restart, restore, and follow-up flow with Claude Code.
11. Confirm the Claude conversation appears immediately after creation and
    retains both turns after restart.
12. Create more than 30 catalog records and scroll to load the next page.
13. Confirm no record is duplicated and loading stops when `hasMore` is false.

## Fault Injection

| Fault                                           | Expected behavior                                     |
| ----------------------------------------------- | ----------------------------------------------------- |
| Malformed cursor                                | List retains prior data and offers retry              |
| Missing Tea native session                      | Typed restore failure; no fresh session created       |
| Missing or malformed Codex native thread        | Typed restore failure; no replacement thread created  |
| Missing or malformed Claude snapshot            | Typed restore failure; no replacement session created |
| Runtime unavailable                             | History error is separate from list state             |
| Catalog database cannot open                    | Host startup fails; no temp fallback                  |
| Catalog update event arrives during paging      | Merge by id and stable re-sort                        |
| Event arrives while snapshot request is pending | Buffer, initialize snapshot, then replay              |
| Two selections resolve out of order             | Stale response is ignored                             |

## Verification Commands

```bash
npm run test:run
npm run type-check
npm run format:check
npm run lint
node scripts/check-ui-boundaries.mjs
npm run build:web
```

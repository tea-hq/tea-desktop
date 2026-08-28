# ADR 0006: Versioned Desktop Settings

- Status: Accepted
- Date: 2026-08-21

## Context

Tea Desktop needs durable user preferences for locale, conversation defaults,
and panel layout. These preferences have a different lifecycle from canonical
runtime sessions and the conversation catalog. Persisting Pinia state or adding
settings columns to the conversation catalog would mix UI preferences with
conversation facts and make future settings evolution difficult to recover.

The settings boundary must also distinguish a damaged current-format file from
a file written by a newer application version. Silently replacing an unknown
schema could destroy preferences during downgrade.

## Decision

Desktop owns a settings repository at `$appDataDir/settings.json`. The disk
document is a versioned envelope:

```json
{
  "schemaVersion": 1,
  "settings": {
    "locale": "system",
    "conversationDefaults": { "runtimeId": "builtin.tea" },
    "layout": {
      "leftSidebarOpen": true,
      "agentDrawerOpen": false
    }
  }
}
```

`schemaVersion` is a storage concern and is not exposed over IPC. The stable IPC
commands are:

- `get_settings() -> AppSettings`
- `update_settings({ settings: AppSettings }) -> AppSettings`

Tauri's camelCase argument mapping supplies the `settings` parameter directly.
Both commands return typed camelCase errors with stable codes. An unknown disk
schema returns `unsupportedSchema`, is not retryable, and leaves the file
untouched.

Missing settings return defaults without creating a file. Invalid JSON or an
invalid schema-v1 payload is renamed beside the original as
`settings.json.<timestamp>.<process>.<counter>.corrupt.json`; the application
then recovers with defaults. Failure to preserve the corrupt file is reported
as `storageFailure` rather than silently discarding it.

Updates validate the complete settings value, serialize to a unique temporary
file in the same directory, flush the file, atomically replace `settings.json`,
and sync the containing directory on Unix. Windows uses `MoveFileExW` with
replace-existing and write-through flags.

## Alternatives

- Persist the Pinia store in local storage. Rejected because frontend state is
  a projection and local storage does not provide a versioned host-owned
  recovery boundary.
- Store preferences in `conversation-catalog.sqlite3`. Rejected because user
  preferences and conversation facts have different ownership and recovery
  semantics.
- Silently reset unknown schema versions. Rejected because downgrade could
  destroy settings written by a newer release.

## Consequences

- Future settings are added to `AppSettings` and require an explicit disk schema
  migration when they cannot be represented compatibly.
- Whole-document updates are serialized by the repository, but concurrent
  frontend writers still need to avoid stale read-modify-write operations.
- The frontend can project settings into feature stores without becoming their
  durable source.

## Migration, Rollback, and Recovery

Version 1 starts from the documented defaults and has no legacy Desktop file to
migrate. A future schema change must add an explicit migration before changing
`SETTINGS_SCHEMA_VERSION`.

Rolling back to a binary that does not understand the stored version fails with
`unsupportedSchema` and preserves the file. Operators can restore a quarantined
corrupt file by repairing it and renaming it to `settings.json`, or remove it to
return to defaults.

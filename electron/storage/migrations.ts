import type { DatabaseSync } from 'node:sqlite'

import { MainDatabaseError } from './database'

export const CONVERSATION_CATALOG_SCHEMA_VERSION = 2

export function migrateConversationCatalog(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get()
  const version = readUserVersion(row)
  if (version === CONVERSATION_CATALOG_SCHEMA_VERSION) return
  if (version === 1) {
    if (!hasUserTables(database)) throw unsupportedSchema(version)
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE runtime_conversations ADD COLUMN working_directory TEXT;
      PRAGMA user_version = 2;
      COMMIT;
    `)
    return
  }
  if (version !== 0 || hasUserTables(database)) {
    throw unsupportedSchema(version)
  }

  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE runtime_conversations (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      runtime_id TEXT NOT NULL,
      native_session_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      working_directory TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      binding_json TEXT NOT NULL,
      title TEXT,
      last_message_preview TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER,
      channel_transport_id TEXT,
      channel_account_ref TEXT,
      channel_ref TEXT,
      last_restore_failure_code TEXT,
      last_restore_failed_at INTEGER,
      CHECK (
        (channel_transport_id IS NULL AND channel_account_ref IS NULL AND channel_ref IS NULL) OR
        (channel_transport_id IS NOT NULL AND channel_account_ref IS NOT NULL AND channel_ref IS NOT NULL)
      ),
      CHECK (
        (last_restore_failure_code IS NULL AND last_restore_failed_at IS NULL) OR
        (last_restore_failure_code IS NOT NULL AND last_restore_failed_at IS NOT NULL)
      )
    ) STRICT;
    CREATE INDEX runtime_conversations_updated_idx
      ON runtime_conversations(updated_at DESC, conversation_id DESC);
    CREATE INDEX runtime_conversations_channel_idx
      ON runtime_conversations(channel_transport_id, channel_account_ref, channel_ref, updated_at DESC);
    CREATE TABLE conversation_turn_contexts (
      conversation_id TEXT NOT NULL
        REFERENCES runtime_conversations(conversation_id) ON DELETE CASCADE,
      turn_index INTEGER NOT NULL CHECK (turn_index >= 0 AND turn_index <= 4294967295),
      visible_text TEXT NOT NULL,
      created_at INTEGER NOT NULL CHECK (created_at >= 0),
      PRIMARY KEY (conversation_id, turn_index)
    ) STRICT;
    CREATE TABLE channel_sources (
      source_id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('userForwarded', 'agentTool')),
      message_key TEXT NOT NULL,
      message_client_id TEXT NOT NULL,
      message_server_id TEXT,
      sender_name TEXT NOT NULL,
      sent_at INTEGER NOT NULL CHECK (sent_at >= 0),
      sent_by_current_user INTEGER NOT NULL CHECK (sent_by_current_user IN (0, 1)),
      snapshot_text TEXT NOT NULL,
      captured_at INTEGER NOT NULL CHECK (captured_at >= 0),
      state TEXT NOT NULL CHECK (state IN ('active', 'modified', 'revoked', 'deleted')),
      latest_text TEXT,
      last_observed_at INTEGER CHECK (last_observed_at IS NULL OR last_observed_at >= 0),
      FOREIGN KEY (conversation_id, turn_index)
        REFERENCES conversation_turn_contexts(conversation_id, turn_index) ON DELETE CASCADE,
      UNIQUE (conversation_id, turn_index, message_key)
    ) STRICT;
    CREATE INDEX channel_sources_conversation_turn_idx
      ON channel_sources(conversation_id, turn_index, captured_at, source_id);
    CREATE TABLE channel_drafts (
      draft_id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL
        REFERENCES runtime_conversations(conversation_id) ON DELETE CASCADE,
      source_turn_index INTEGER NOT NULL CHECK (source_turn_index >= 0 AND source_turn_index <= 4294967295),
      source_block_id TEXT NOT NULL,
      current_version INTEGER NOT NULL CHECK (current_version >= 1 AND current_version <= 4294967295),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL CHECK (created_at >= 0),
      updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
      FOREIGN KEY (conversation_id, source_turn_index)
        REFERENCES conversation_turn_contexts(conversation_id, turn_index) ON DELETE CASCADE
    ) STRICT;
    CREATE INDEX channel_drafts_conversation_idx
      ON channel_drafts(conversation_id, updated_at DESC, draft_id DESC);
    CREATE TABLE channel_deliveries (
      delivery_id TEXT PRIMARY KEY NOT NULL,
      draft_id TEXT NOT NULL REFERENCES channel_drafts(draft_id) ON DELETE CASCADE,
      draft_version INTEGER NOT NULL CHECK (draft_version >= 1 AND draft_version <= 4294967295),
      channel_transport_id TEXT NOT NULL,
      channel_account_ref TEXT NOT NULL,
      channel_ref TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
      sent_message_client_id TEXT,
      sent_message_server_id TEXT,
      failure_code TEXT,
      created_at INTEGER NOT NULL CHECK (created_at >= 0),
      updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
      UNIQUE (draft_id, draft_version),
      CHECK (
        (status = 'sent' AND sent_message_client_id IS NOT NULL AND failure_code IS NULL) OR
        (status = 'failed' AND sent_message_client_id IS NULL AND sent_message_server_id IS NULL AND failure_code IS NOT NULL) OR
        (status IN ('pending', 'sending') AND sent_message_client_id IS NULL AND sent_message_server_id IS NULL AND failure_code IS NULL)
      )
    ) STRICT;
    CREATE INDEX channel_deliveries_draft_idx
      ON channel_deliveries(draft_id, updated_at DESC, delivery_id DESC);
    PRAGMA user_version = 2;
    COMMIT;
  `)
}

function unsupportedSchema(version: number): MainDatabaseError {
  return new MainDatabaseError(
    'unsupportedSchema',
    `conversation catalog schema version is unsupported: ${version}`,
    false,
  )
}

function readUserVersion(value: unknown): number {
  if (!isRecord(value) || !Number.isInteger(value.user_version)) {
    throw new MainDatabaseError(
      'unsupportedSchema',
      'conversation catalog schema version is invalid',
      false,
    )
  }
  return value.user_version as number
}

function hasUserTables(database: DatabaseSync): boolean {
  return Boolean(
    database
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      )
      .get(),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

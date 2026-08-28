import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type MainDatabaseErrorCode = 'shutDown' | 'storageFailure' | 'unsupportedSchema'

export class MainDatabaseError extends Error {
  constructor(
    readonly code: MainDatabaseErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'MainDatabaseError'
  }
}

export class MainProcessDatabase {
  private connection: DatabaseSync | null = null
  private initializationPromise: Promise<void> | null = null
  private closed = false

  constructor(private readonly filePath: string) {}

  initialize(migrate: (database: DatabaseSync) => void): Promise<void> {
    if (this.closed) throw databaseClosed()
    if (this.connection) return Promise.resolve()
    this.initializationPromise ??= this.initializeOnce(migrate)
    return this.initializationPromise
  }

  private async initializeOnce(migrate: (database: DatabaseSync) => void): Promise<void> {
    try {
      if (this.filePath !== ':memory:') {
        // The composition root supplies an Electron app-data path, never renderer input.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.mkdir(path.dirname(this.filePath), { recursive: true })
      }
      if (this.closed) throw databaseClosed()
      const database = new DatabaseSync(this.filePath, {
        allowExtension: false,
        enableForeignKeyConstraints: true,
        timeout: 5_000,
      })
      try {
        migrate(database)
        database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
      } catch (cause) {
        database.close()
        throw cause
      }
      this.connection = database
    } catch (cause) {
      if (cause instanceof MainDatabaseError) throw cause
      throw new MainDatabaseError('storageFailure', 'opening main-process database failed', true, {
        cause,
      })
    }
  }

  read<T>(operation: (database: DatabaseSync) => T): T {
    try {
      return operation(this.requireConnection())
    } catch (cause) {
      if (cause instanceof MainDatabaseError) throw cause
      throw new MainDatabaseError('storageFailure', 'reading main-process database failed', true, {
        cause,
      })
    }
  }

  write<T>(operation: (database: DatabaseSync) => T): T {
    const database = this.requireConnection()
    try {
      database.exec('BEGIN IMMEDIATE')
      const result = operation(database)
      database.exec('COMMIT')
      return result
    } catch (cause) {
      if (database.isTransaction) {
        try {
          database.exec('ROLLBACK')
        } catch {
          // Preserve the original operation failure.
        }
      }
      if (cause instanceof MainDatabaseError) throw cause
      throw new MainDatabaseError('storageFailure', 'writing main-process database failed', true, {
        cause,
      })
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    const database = this.connection
    this.connection = null
    if (!database) return
    try {
      database.close()
    } catch (cause) {
      throw new MainDatabaseError('storageFailure', 'closing main-process database failed', true, {
        cause,
      })
    }
  }

  private requireConnection(): DatabaseSync {
    if (this.closed) throw databaseClosed()
    if (!this.connection) {
      throw new MainDatabaseError(
        'storageFailure',
        'main-process database is not initialized',
        true,
      )
    }
    return this.connection
  }
}

function databaseClosed(): MainDatabaseError {
  return new MainDatabaseError('shutDown', 'main-process database has shut down', false)
}

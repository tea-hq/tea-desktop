import { promises as fs } from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";

import type {
  CredentialMutation,
  CredentialRecord,
} from "../../src/features/credentials/contracts";

interface CredentialFile {
  schemaVersion: 1;
  entries: Array<{
    pluginId: string;
    connectionId: string;
    encrypted: string;
    updatedAt: number;
  }>;
}

export class ElectronCredentialService {
  constructor(private readonly filePath: string) {}

  async list(): Promise<CredentialRecord[]> {
    const file = await this.read();
    return file.entries.map((value) => ({
      pluginId: value.pluginId,
      connectionId: value.connectionId,
      configured: true,
      updatedAt: value.updatedAt,
    }));
  }

  async save(mutation: CredentialMutation): Promise<CredentialRecord> {
    validateKey(mutation.pluginId, mutation.connectionId);
    if (!safeStorage.isEncryptionAvailable())
      throw serviceError("secureStorageUnavailable", true);
    const file = await this.read();
    const entry = {
      pluginId: mutation.pluginId,
      connectionId: mutation.connectionId,
      encrypted: safeStorage
        .encryptString(JSON.stringify(mutation.value))
        .toString("base64"),
      updatedAt: mutation.updatedAt,
    };
    const index = file.entries.findIndex(
      (value) =>
        value.pluginId === entry.pluginId &&
        value.connectionId === entry.connectionId,
    );
    if (index === -1) file.entries.push(entry);
    else file.entries[index] = entry;
    await this.write(file);
    return {
      pluginId: entry.pluginId,
      connectionId: entry.connectionId,
      configured: true,
      updatedAt: entry.updatedAt,
    };
  }

  async clear(pluginId: string, connectionId: string): Promise<void> {
    validateKey(pluginId, connectionId);
    const file = await this.read();
    file.entries = file.entries.filter(
      (value) =>
        value.pluginId !== pluginId || value.connectionId !== connectionId,
    );
    await this.write(file);
  }

  async readValue(
    pluginId: string,
    connectionId: string,
  ): Promise<Record<string, unknown> | null> {
    const file = await this.read();
    const entry = file.entries.find(
      (value) =>
        value.pluginId === pluginId && value.connectionId === connectionId,
    );
    if (!entry) return null;
    if (!safeStorage.isEncryptionAvailable())
      throw serviceError("secureStorageUnavailable", true);
    const value: unknown = JSON.parse(
      safeStorage.decryptString(Buffer.from(entry.encrypted, "base64")),
    );
    if (!isRecord(value))
      throw serviceError(
        "storageFailure",
        true,
        "credential payload is invalid",
      );
    return value;
  }

  private async read(): Promise<CredentialFile> {
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      );
      if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        !Array.isArray(value.entries)
      )
        throw new Error("invalid credential file");
      return value as unknown as CredentialFile;
    } catch (error) {
      if (isMissingFile(error)) return { schemaVersion: 1, entries: [] };
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && error.message === "invalid credential file")
      )
        throw serviceError(
          "storageFailure",
          true,
          "credential state is invalid",
        );
      throw serviceError(
        "storageFailure",
        true,
        "credential state could not be read",
      );
    }
  }

  private async write(value: CredentialFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temporary, this.filePath);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw serviceError(
        "storageFailure",
        true,
        "credential state could not be written",
      );
    }
  }
}

function validateKey(pluginId: string, connectionId: string): void {
  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(pluginId) ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(connectionId)
  )
    throw serviceError("invalidRequest", false, "credential key is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMissingFile(value: unknown): boolean {
  return isRecord(value) && value.code === "ENOENT";
}
function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) };
}

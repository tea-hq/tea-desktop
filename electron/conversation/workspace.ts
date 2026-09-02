import { constants, promises as fs } from 'node:fs'

import { ConversationRuntimeError } from './runtime'

export interface ConversationWorkspaceFileSystem {
  access(workspacePath: string, mode: number): Promise<void>
  realpath(workspacePath: string): Promise<string>
  stat(workspacePath: string): Promise<{ isDirectory(): boolean }>
}

const NODE_WORKSPACE_FILE_SYSTEM: ConversationWorkspaceFileSystem = {
  access: (workspacePath, mode) => fs.access(workspacePath, mode),
  // Paths are validated by the main-process conversation boundary before use.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  realpath: (workspacePath) => fs.realpath(workspacePath),
  // Paths are validated by the main-process conversation boundary before use.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  stat: (workspacePath) => fs.stat(workspacePath),
}

export async function requireAvailableWorkspaceDirectory(
  workspacePath: string,
  options: {
    canonicalize?: boolean
    fileSystem?: ConversationWorkspaceFileSystem
  } = {},
): Promise<string> {
  const fileSystem = options.fileSystem ?? NODE_WORKSPACE_FILE_SYSTEM
  try {
    let resolved = workspacePath
    if (options.canonicalize) {
      resolved = await fileSystem.realpath(workspacePath)
    }
    const status = await fileSystem.stat(resolved)
    if (!status.isDirectory()) throw new Error('workspace path is not a directory')
    await fileSystem.access(resolved, constants.R_OK | constants.X_OK)
    return resolved
  } catch (cause) {
    if (cause instanceof ConversationRuntimeError) throw cause
    throw new ConversationRuntimeError(
      'workspaceUnavailable',
      'conversation workspace directory is unavailable',
      false,
      { cause },
    )
  }
}

import { DESKTOP_COMMANDS, type DesktopCommand } from '../../src/types/electronBridge'
import { readRecord } from './commandValidation'

export type DesktopCommandHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

export type DesktopCommandHandlers = {
  readonly [Command in DesktopCommand]: DesktopCommandHandler
}

export interface DesktopCommandHandlerGroup {
  readonly name: string
  readonly handlers: Partial<DesktopCommandHandlers>
}

export type DesktopCommandRouter = (command: unknown, args: unknown) => Promise<unknown>

const desktopCommandNames = new Set<string>(DESKTOP_COMMANDS)

export function defineCommandHandlers<Handlers extends Partial<DesktopCommandHandlers>>(
  name: string,
  handlers: Handlers,
): DesktopCommandHandlerGroup {
  return { name, handlers }
}

export function createCommandRouter(
  groups: readonly DesktopCommandHandlerGroup[],
): DesktopCommandRouter {
  const handlers = new Map<DesktopCommand, DesktopCommandHandler>()

  for (const group of groups) {
    for (const [name, handler] of Object.entries(group.handlers)) {
      if (!isDesktopCommand(name)) throw new Error(`unknown desktop command handler: ${name}`)
      if (handlers.has(name)) throw new Error(`duplicate desktop command handler: ${name}`)
      if (handler) handlers.set(name, handler)
    }
  }

  const missing = DESKTOP_COMMANDS.filter((command) => !handlers.has(command))
  if (missing.length > 0) {
    throw new Error(`missing desktop command handlers: ${missing.join(', ')}`)
  }

  return async (command, rawArgs) => {
    if (!isDesktopCommand(command)) throw { code: 'unsupportedCommand', retryable: false }
    const args = rawArgs === undefined ? {} : readRecord(rawArgs)
    return handlers.get(command)!(args)
  }
}

export function isDesktopCommand(value: unknown): value is DesktopCommand {
  return typeof value === 'string' && desktopCommandNames.has(value)
}

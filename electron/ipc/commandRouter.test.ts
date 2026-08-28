import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_COMMANDS } from '../../src/types/electronBridge'
import {
  createCommandRouter,
  defineCommandHandlers,
  type DesktopCommandHandler,
  type DesktopCommandHandlers,
} from './commandRouter'

function completeHandlers(handler: DesktopCommandHandler): DesktopCommandHandlers {
  return Object.fromEntries(
    DESKTOP_COMMANDS.map((command) => [command, handler]),
  ) as unknown as DesktopCommandHandlers
}

describe('createCommandRouter', () => {
  it('normalizes omitted arguments and invokes the registered handler', async () => {
    const handler = vi.fn(() => 'ok')
    const route = createCommandRouter([defineCommandHandlers('all', completeHandlers(handler))])

    await expect(route('get_settings', undefined)).resolves.toBe('ok')
    expect(handler).toHaveBeenCalledWith({})
  })

  it('rejects unsupported commands with a stable error', async () => {
    const route = createCommandRouter([
      defineCommandHandlers(
        'all',
        completeHandlers(() => undefined),
      ),
    ])

    await expect(route('unknown_command', {})).rejects.toEqual({
      code: 'unsupportedCommand',
      retryable: false,
    })
  })

  it('rejects non-record argument envelopes', async () => {
    const route = createCommandRouter([
      defineCommandHandlers(
        'all',
        completeHandlers(() => undefined),
      ),
    ])

    await expect(route('get_settings', 'invalid')).rejects.toEqual({
      code: 'invalidRequest',
      retryable: false,
    })
  })

  it('rejects missing handlers during router construction', () => {
    expect(() =>
      createCommandRouter([
        defineCommandHandlers('settings', {
          get_settings: () => undefined,
        }),
      ]),
    ).toThrow(/missing desktop command handlers/)
  })

  it('rejects duplicate handlers during router construction', () => {
    expect(() =>
      createCommandRouter([
        defineCommandHandlers(
          'all',
          completeHandlers(() => undefined),
        ),
        defineCommandHandlers('duplicate', {
          get_settings: () => undefined,
        }),
      ]),
    ).toThrow(/duplicate desktop command handler: get_settings/)
  })
})

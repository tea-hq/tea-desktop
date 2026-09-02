import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TeaDesktopBridge } from '../src/types/electronBridge'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    send: electron.send,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}))

await import('./preload')

const bridge = electron.exposeInMainWorld.mock.calls[0]?.[1] as TeaDesktopBridge

describe('Electron preload bridge', () => {
  beforeEach(() => {
    electron.invoke.mockReset()
    electron.send.mockReset()
    electron.on.mockReset()
    electron.removeListener.mockReset()
  })

  it('unwraps command results and preserves stable failures', async () => {
    electron.invoke
      .mockResolvedValueOnce({ ok: true, value: ['external.codex'] })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'runtimeUnavailable', retryable: true },
      })

    await expect(bridge.invoke('list_conversation_runtimes')).resolves.toEqual(['external.codex'])
    await expect(bridge.invoke('list_conversation_runtimes')).rejects.toMatchObject({
      code: 'runtimeUnavailable',
      retryable: true,
    })
    expect(electron.invoke).toHaveBeenCalledWith(
      'tea:command',
      'list_conversation_runtimes',
      undefined,
    )
  })

  it('projects only valid effective themes to the main process', () => {
    bridge.setWindowTheme('dark')

    expect(electron.send).toHaveBeenCalledWith('tea:window-theme-changed', 'dark')
    expect(() => bridge.setWindowTheme('system' as never)).toThrow(/Unsupported window theme/)
  })

  it('registers and disposes one allowlisted event listener exactly', () => {
    const listener = vi.fn()
    const dispose = bridge.on('conversation:event', listener)
    const [channel, wrapped] = electron.on.mock.calls[0]!
    const event = {
      conversationId: 'conversation-1',
      sequence: 1,
      event: { type: 'runStarted' as const },
    }

    wrapped({}, event)
    dispose()

    expect(channel).toBe('tea:event:conversation:event')
    expect(listener).toHaveBeenCalledWith(event)
    expect(electron.removeListener).toHaveBeenCalledWith(channel, wrapped)
  })

  it('allows the provider-neutral presence command without exposing a new IPC channel', async () => {
    electron.invoke.mockResolvedValueOnce({ ok: true, value: undefined })

    await expect(
      bridge.invoke('set_channel_presence_subscriptions', { accountIds: ['lin'] }),
    ).resolves.toBeUndefined()

    expect(electron.invoke).toHaveBeenCalledWith(
      'tea:command',
      'set_channel_presence_subscriptions',
      { accountIds: ['lin'] },
    )
  })

  it('allows voice transcription without exposing provider attachment fields', async () => {
    electron.invoke.mockResolvedValueOnce({ ok: true, value: 'Review the release plan.' })
    const messageRef = { channelRef: 'channel', messageClientId: 'voice-client' }

    await expect(bridge.invoke('transcribe_channel_voice', { messageRef })).resolves.toBe(
      'Review the release plan.',
    )

    expect(electron.invoke).toHaveBeenCalledWith('tea:command', 'transcribe_channel_voice', {
      messageRef,
    })
    expect(JSON.stringify(electron.invoke.mock.calls)).not.toMatch(/voiceUrl|sceneName|sampleRate/)
  })

  it('rejects commands and events outside the static allowlist', async () => {
    await expect(
      bridge.invoke('unknown' as Parameters<TeaDesktopBridge['invoke']>[0]),
    ).rejects.toThrow(/Unsupported desktop command/)
    expect(() =>
      bridge.on('unknown' as Parameters<TeaDesktopBridge['on']>[0], () => undefined),
    ).toThrow(/Unsupported desktop event/)
  })
})

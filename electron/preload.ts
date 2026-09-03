import { contextBridge, ipcRenderer } from 'electron'
import type { ChannelEvent } from '../src/features/channels/contracts'
import {
  DESKTOP_COMMANDS,
  DESKTOP_EVENTS,
  type DesktopCommand,
  type DesktopEvent,
  type DesktopEventPayloadMap,
  type TeaDesktopBridge,
  unwrapDesktopCommandResult,
} from '../src/types/electronBridge'
import { isEffectiveTheme } from '../src/types/theme'

const commandSet = new Set<string>(DESKTOP_COMMANDS)
const eventSet = new Set<string>(DESKTOP_EVENTS)

const bridge: TeaDesktopBridge = {
  setWindowTheme(theme): void {
    if (!isEffectiveTheme(theme)) throw new Error(`Unsupported window theme: ${String(theme)}`)
    ipcRenderer.send('tea:window-theme-changed', theme)
  },

  async invoke<T>(command: DesktopCommand, args?: unknown): Promise<T> {
    if (!commandSet.has(command)) throw new Error(`Unsupported desktop command: ${command}`)
    if (command === 'quick_comment_channel_message')
      console.info('[Tea][quick-comment] preload.invoke quick_comment_channel_message')
    const result: unknown = await ipcRenderer.invoke('tea:command', command, args)
    return unwrapDesktopCommandResult<T>(result)
  },

  on<Event extends DesktopEvent>(
    event: Event,
    listener: (payload: DesktopEventPayloadMap[Event]) => void,
  ): () => void {
    if (!eventSet.has(event)) throw new Error(`Unsupported desktop event: ${event}`)
    const channel = `tea:event:${event}`
    const wrapped = (
      _ipcEvent: Electron.IpcRendererEvent,
      payload: DesktopEventPayloadMap[Event],
    ) => {
      const reactionEvent = isReactionChangedEvent(payload) ? payload : null
      if (event === 'channel-event' && reactionEvent)
        console.info(
          `[Tea][quick-comment] preload.event channel-event ${JSON.stringify({
            sequence: reactionEvent.sequence,
            ref: reactionEvent.ref,
            reactions: reactionEvent.reactions,
          })}`,
        )
      listener(payload)
    }
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

function isReactionChangedEvent(
  value: unknown,
): value is Extract<ChannelEvent, { type: 'message.reactionsChanged' }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'message.reactionsChanged'
  )
}

contextBridge.exposeInMainWorld('teaDesktop', bridge)

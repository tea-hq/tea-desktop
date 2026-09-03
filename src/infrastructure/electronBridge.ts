import type {
  DesktopCommand,
  DesktopEvent,
  DesktopEventPayloadMap,
  TeaDesktopBridge,
} from '@/types/electronBridge'
import type { EffectiveTheme } from '@/types/theme'
import { debugQuickComment } from '@/features/channels/quickCommentDebug'

export type UnlistenFn = () => void

export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaDesktop)
}

export function setWindowTheme(theme: EffectiveTheme): void {
  getBridge().setWindowTheme(theme)
}

export function invoke<T>(command: DesktopCommand, args?: unknown): Promise<T> {
  const bridge = getBridge(command)
  if (command === 'quick_comment_channel_message')
    debugQuickComment('electron-bridge.invoke-start', {
      command,
      hasBridge: Boolean(bridge),
      invokeType: typeof bridge.invoke,
      args,
    })
  return Promise.resolve()
    .then(() => bridge.invoke<T>(command, args))
    .then((value) => {
      if (command === 'quick_comment_channel_message')
        debugQuickComment('electron-bridge.invoke-success', { command, value })
      return value
    })
    .catch((error: unknown) => {
      if (command === 'quick_comment_channel_message')
        debugQuickComment('electron-bridge.invoke-failure', {
          command,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode:
            error && typeof error === 'object' && 'code' in error
              ? (error as { code?: unknown }).code
              : undefined,
        })
      throw error
    })
}

export function listen<Event extends DesktopEvent>(
  event: Event,
  listener: (payload: { payload: DesktopEventPayloadMap[Event] }) => void,
): Promise<UnlistenFn> {
  return Promise.resolve(getBridge().on(event, (payload) => listener({ payload })))
}

function getBridge(command?: DesktopCommand): TeaDesktopBridge {
  const bridge = typeof window !== 'undefined' ? window.teaDesktop : undefined
  if (!bridge) {
    if (command === 'quick_comment_channel_message')
      debugQuickComment('electron-bridge.unavailable', {
        command,
        hasWindow: typeof window !== 'undefined',
      })
    throw new Error('Electron bridge is unavailable')
  }
  return bridge
}

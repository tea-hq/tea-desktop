import type {
  DesktopCommand,
  DesktopEvent,
  DesktopEventPayloadMap,
  TeaDesktopBridge,
} from '@/types/electronBridge'

export type UnlistenFn = () => void

export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaDesktop)
}

export function invoke<T>(command: DesktopCommand, args?: unknown): Promise<T> {
  return getBridge().invoke<T>(command, args)
}

export function listen<Event extends DesktopEvent>(
  event: Event,
  listener: (payload: { payload: DesktopEventPayloadMap[Event] }) => void,
): Promise<UnlistenFn> {
  return Promise.resolve(getBridge().on(event, (payload) => listener({ payload })))
}

function getBridge(): TeaDesktopBridge {
  if (!window.teaDesktop) throw new Error('Electron bridge is unavailable')
  return window.teaDesktop
}

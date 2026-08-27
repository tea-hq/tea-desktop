import { contextBridge, ipcRenderer } from 'electron'
import {
  DESKTOP_COMMANDS,
  DESKTOP_EVENTS,
  type DesktopCommand,
  type DesktopEvent,
  type TeaDesktopBridge,
} from '../src/types/electronBridge'

const commandSet = new Set<string>(DESKTOP_COMMANDS)
const eventSet = new Set<string>(DESKTOP_EVENTS)

const bridge: TeaDesktopBridge = {
  invoke<T>(command: DesktopCommand, args?: unknown): Promise<T> {
    if (!commandSet.has(command)) throw new Error(`Unsupported desktop command: ${command}`)
    return ipcRenderer.invoke('tea:command', command, args) as Promise<T>
  },

  on<T>(event: DesktopEvent, listener: (payload: T) => void): () => void {
    if (!eventSet.has(event)) throw new Error(`Unsupported desktop event: ${event}`)
    const channel = `tea:event:${event}`
    const wrapped = (_ipcEvent: Electron.IpcRendererEvent, payload: T) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('teaDesktop', bridge)

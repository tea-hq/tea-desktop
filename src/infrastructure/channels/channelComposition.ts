import type { ChannelTransport } from '@/features/channels/contracts'
import { MockChannelTransport } from './MockChannelTransport'
import { ElectronChannelTransport } from './ElectronChannelTransport'
import { hasElectronBridge } from '../electronBridge'

export interface ChannelEnvironment {
  transport: ChannelTransport
  preview: boolean
}

export function createChannelEnvironment(): ChannelEnvironment {
  if (!hasElectronBridge()) {
    return { transport: new MockChannelTransport(), preview: true }
  }
  return {
    transport: new ElectronChannelTransport(),
    preview: false,
  }
}

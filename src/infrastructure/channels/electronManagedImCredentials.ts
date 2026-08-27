import { invoke } from '../electronBridge'

export interface ManagedImCredentials {
  appKey: string
  account: string
  token: string
}

export interface ManagedImCredentialClient {
  load(): Promise<ManagedImCredentials>
}

export class ElectronManagedImCredentialClient implements ManagedImCredentialClient {
  async load(): Promise<ManagedImCredentials> {
    return invoke<ManagedImCredentials>('get_managed_im_credentials')
  }
}

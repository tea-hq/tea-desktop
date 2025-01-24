import { v2 as nim } from 'node-nim'

class NIMSDKManager {
  private static instance: NIMSDKManager
  private initialized: boolean = false

  private constructor() {}

  static getInstance() {
    if (!NIMSDKManager.instance) {
      NIMSDKManager.instance = new NIMSDKManager()
    }
    return NIMSDKManager.instance
  }

  async initialize() {
    if (this.initialized) return
    localStorage.setItem('isAuthenticated', 'false')

    try {
      await nim.init({
        appkey: '45c6af3c98409b18a84451215d0bdd6e',
        basicOption: {
          sdkLogLevel: 6
        }
      })
      this.initialized = true
      console.log('NIM SDK initialized')
    } catch (error) {
      console.error('NIM SDK initialization failed:', error)
      throw error
    }
  }

  async cleanup() {
    if (!this.initialized) return
    console.log('NIM SDK cleaning up')
    try {
      await nim.uninit()
      this.initialized = false
      console.log('NIM SDK cleaned up')
    } catch (error) {
      console.error('NIM SDK cleanup failed:', error)
      throw error
    }
  }
}

export const yunxin = NIMSDKManager.getInstance()
import WebSocket from 'ws'

import type {
  YunxinSdk,
  YunxinSdkFactory,
} from '../../src/infrastructure/channels/YunxinWebChannelTransport'

import {
  NodeYunxinUploadAdapter,
  type NodeYunxinUploadFileOptions,
  type NodeYunxinUploadPort,
} from './yunxinUpload'

export function createNodeYunxinSdkFactory(
  uploadAdapter: NodeYunxinUploadPort = new NodeYunxinUploadAdapter(),
): YunxinSdkFactory {
  return {
    create: async (appKey) => {
      const runtime = await loadRuntime()
      configureAdapters(runtime, uploadAdapter)
      registerServices(runtime)
      const sdk = runtime.NIM.getInstance(
        {
          appkey: appKey,
          apiVersion: 'v2',
          debugLevel: 'off',
          enableV2CloudConversation: true,
        },
        {
          V2NIMLoginServiceConfig: {
            lbsUrls: ['https://lbs.netease.im/lbs/webconf.jsp'],
            linkUrl: 'weblink.netease.im',
          },
        },
      )
      return sdk as unknown as YunxinSdk
    },
  }
}

type YunxinRuntime = typeof import('nim-web-sdk-ng/dist/esm/nim.js')

async function loadRuntime(): Promise<YunxinRuntime> {
  // The ESM bundle contains a small UMD dependency that reads self at import time.
  // It is only an import compatibility alias; the actual SDK uses the adapters below.
  if (!('self' in globalThis)) {
    Object.defineProperty(globalThis, 'self', {
      configurable: true,
      value: globalThis,
    })
  }
  return import('nim-web-sdk-ng/dist/esm/nim.js')
}

function configureAdapters(runtime: YunxinRuntime, uploadAdapter: NodeYunxinUploadPort): void {
  const storage = new Map<string, string>()
  runtime.setAdapters(() => ({
    setLogger: () => undefined,
    platform: 'NODEJS',
    WebSocket: WebSocket as never,
    localStorage: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    request: requestWithFetch,
    uploadFile: (options: NodeYunxinUploadFileOptions) => uploadAdapter.upload(options),
    getFileUploadInformation: () => null,
    getSystemInfo: () => ({
      libEnv: 'NodeJs' as const,
      userAgent: 'Tea/Electron',
      os: process.platform,
      osVer: '',
      browser: 'Electron',
      browserVer: process.versions.electron ?? '',
      hostEnv: 'Electron' as const,
      hostEnvEnum: 5,
      hostEnvVer: process.versions.electron ?? '',
      model: '',
      manufactor: 'Electron',
    }),
    envPayload: {},
    net: {
      getNetworkStatus: async () => ({ net_type: 0, net_connect: true }),
      onNetworkStatusChange: () => undefined,
      offNetworkStatusChange: () => undefined,
    },
    powerMonitor: {
      on: () => undefined,
      off: () => undefined,
      isActive: () => true,
      getStatus: () => 0,
      setStatus: () => undefined,
      destroy: () => undefined,
    },
    logStorage: class {
      open(): Promise<void> {
        return Promise.resolve()
      }
      close(): void {}
      addLogs(): Promise<void> {
        return Promise.resolve()
      }
      extractLogs(): Promise<void> {
        return Promise.resolve()
      }
      afterUpload(): Promise<void> {
        return Promise.resolve()
      }
    },
  }))
}

function registerServices(runtime: YunxinRuntime): void {
  runtime.NIM.registerService(runtime.V2NIMConversationService, 'V2NIMConversationService')
  runtime.NIM.registerService(runtime.V2NIMMessageService, 'V2NIMMessageService')
  // The ESM bundle keeps message log and extension APIs as separately
  // registered services. V2NIMMessageService delegates quick comments,
  // pins, and history queries to these utilities at runtime.
  runtime.NIM.registerService(runtime.V2NIMMessageLogUtil, 'V2NIMMessageLogUtil')
  runtime.NIM.registerService(runtime.V2NIMMessageExtendUtil, 'V2NIMMessageExtendUtil')
  runtime.NIM.registerService(runtime.V2NIMUserService, 'V2NIMUserService')
  runtime.NIM.registerService(runtime.V2NIMTeamService, 'V2NIMTeamService')
  runtime.NIM.registerService(runtime.V2NIMNotificationService, 'V2NIMNotificationService')
  runtime.NIM.registerService(runtime.V2NIMStorageService, 'V2NIMStorageService')
  runtime.NIM.registerService(runtime.V2NIMFriendService, 'V2NIMFriendService')
  runtime.NIM.registerService(runtime.V2NIMSettingService, 'V2NIMSettingService')
  runtime.NIM.registerService(
    runtime.V2NIMLocalConversationService,
    'V2NIMLocalConversationService',
  )
  runtime.NIM.registerService(
    runtime.V2NIMConversationGroupService,
    'V2NIMConversationGroupService',
  )
  runtime.NIM.registerService(runtime.V2NIMAIService, 'V2NIMAIService')
  runtime.NIM.registerService(runtime.V2NIMSignallingService, 'V2NIMSignallingService')
  runtime.NIM.registerService(runtime.V2NIMSubscriptionService, 'V2NIMSubscriptionService')
  runtime.NIM.registerService(runtime.V2NIMPassthroughService, 'V2NIMPassthroughService')
}

async function requestWithFetch(
  url: string,
  options: {
    method: string
    headers?: Record<string, string>
    data?: Record<string, unknown>
    params?: Record<string, string | number | unknown>
    timeout?: number
    dataType?: string
  } = { method: 'GET' },
): Promise<{ data: unknown; headers: Record<string, string>; status: number }> {
  const target = new URL(url)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value))
    }
  }
  const controller = new AbortController()
  const timeout =
    options.timeout && options.timeout > 0
      ? setTimeout(() => controller.abort(), options.timeout)
      : undefined
  try {
    const response = await fetch(target, {
      method: options.method,
      headers: options.headers,
      body:
        options.method === 'GET' || options.method === 'HEAD'
          ? undefined
          : JSON.stringify(options.data ?? {}),
      signal: controller.signal,
    })
    const text = await response.text()
    let data: unknown = text
    if (options.dataType !== 'text') {
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = text
      }
    }
    return {
      data,
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

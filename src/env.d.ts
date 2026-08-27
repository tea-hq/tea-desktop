/// <reference types="vite/client" />

import type { TeaDesktopBridge } from './types/electronBridge'

declare global {
  interface Window {
    teaDesktop?: TeaDesktopBridge
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

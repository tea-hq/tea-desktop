import { inject, provide, type InjectionKey } from 'vue'
import type { useTeaDesktopApp } from './useTeaDesktopApp'

export type TeaDesktopAppContext = ReturnType<typeof useTeaDesktopApp>

const teaDesktopAppKey: InjectionKey<TeaDesktopAppContext> = Symbol('tea-desktop-app')

export function provideTeaDesktopApp(context: TeaDesktopAppContext): void {
  provide(teaDesktopAppKey, context)
}

export function useTeaDesktopAppContext(): TeaDesktopAppContext {
  const context = inject(teaDesktopAppKey)
  if (!context) throw new Error('Tea Desktop app context is unavailable')
  return context
}

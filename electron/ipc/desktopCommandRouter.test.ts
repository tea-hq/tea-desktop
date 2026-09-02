import { describe, expect, it, vi } from 'vitest'
import { createDesktopCommandRouter, type DesktopCommandServices } from './desktopCommandRouter'

function emptyServices(): DesktopCommandServices {
  return {
    settings: {} as never,
    conversation: {} as never,
    centerAuth: {} as never,
    managedWorkspace: {} as never,
    catalog: {} as never,
    credentials: {} as never,
    pluginProcesses: {} as never,
    channel: {} as never,
    channelDrafts: {} as never,
    selectDirectory: vi.fn(async () => null),
  }
}

describe('createDesktopCommandRouter', () => {
  it('registers every desktop command exactly once', () => {
    expect(() => createDesktopCommandRouter(emptyServices())).not.toThrow()
  })

  it('returns auth state when managed workspace refresh recovery fails', async () => {
    const state = { phase: 'signedOut' }
    const services = emptyServices()
    services.centerAuth = {
      stateValue: vi.fn(() => state),
    } as never
    services.managedWorkspace = {
      refresh: vi.fn(() => Promise.reject(new Error('offline'))),
    } as never
    const route = createDesktopCommandRouter(services, {
      defaultEnterpriseDomain: ' Example.COM ',
    })

    await expect(route('get_center_auth_state', undefined)).resolves.toEqual({
      state,
      defaultEnterpriseDomain: 'example.com',
    })
    expect(services.managedWorkspace.refresh).toHaveBeenCalledOnce()
  })

  it('stops a plugin process before persisting the disabled state', async () => {
    const order: string[] = []
    const services = emptyServices()
    services.pluginProcesses = {
      disable: vi.fn(async () => {
        order.push('process')
      }),
    } as never
    services.catalog = {
      setPluginEnabled: vi.fn(async () => {
        order.push('catalog')
      }),
    } as never
    const route = createDesktopCommandRouter(services)

    await route('disable_plugin', { pluginId: 'calendar' })

    expect(order).toEqual(['process', 'catalog'])
    expect(services.catalog.setPluginEnabled).toHaveBeenCalledWith('calendar', false)
  })

  it('returns the selected directory from the native picker command', async () => {
    const services = emptyServices()
    services.selectDirectory = vi.fn(async () => '/work/tea')
    const route = createDesktopCommandRouter(services)

    await expect(route('select_directory', undefined)).resolves.toBe('/work/tea')
    expect(services.selectDirectory).toHaveBeenCalledOnce()
  })
})

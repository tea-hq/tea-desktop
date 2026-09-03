import { expect, test as base } from '@playwright/test'

const appBaseUrl = process.env.TEA_E2E_BASE_URL ?? 'http://127.0.0.1:4179'

function appUrl(search = ''): string {
  const url = new URL('/', appBaseUrl)
  url.search = search
  return url.toString()
}

interface AppFixtures {
  openApp: () => Promise<void>
  openFixture: (
    name: string,
    options?: { lang?: 'en' | 'zh-CN'; colorScheme?: 'light' | 'dark' | 'no-preference' },
  ) => Promise<void>
}

export const test = base.extend<AppFixtures>({
  openApp: async ({ page }, use) => {
    await use(async () => {
      await page.goto(appUrl())
      await expect(page.locator('#app')).toBeAttached()
    })
  },
  openFixture: async ({ page }, use, testInfo) => {
    await use(async (name, options = {}) => {
      await page.emulateMedia({
        reducedMotion: testInfo.project.name.includes('reduced') ? 'reduce' : 'no-preference',
        colorScheme: options.colorScheme ?? 'light',
      })
      const search = new URLSearchParams({ fixture: name, lang: options.lang ?? 'en' })
      await page.goto(appUrl(search.toString()))
      await expect(page.getByTestId('e2e-app')).toBeVisible()
    })
  },
})

export { expect }

import { describe, expect, it } from 'vitest'

import { authCallbackMessages } from '../../src/locales/authCallback'
import { CENTER_AUTH_CALLBACK_HEADERS, centerAuthCallbackPage } from './centerAuthCallbackPage'

describe('centerAuthCallbackPage', () => {
  it.each([
    { acceptLanguage: undefined, locale: 'en', copy: authCallbackMessages.en },
    { acceptLanguage: 'en-US,en;q=0.9', locale: 'en', copy: authCallbackMessages.en },
    {
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      locale: 'zh-CN',
      copy: authCallbackMessages['zh-CN'],
    },
  ])('renders the $locale callback receipt', ({ acceptLanguage, locale, copy }) => {
    const html = centerAuthCallbackPage(acceptLanguage)

    expect(html).toContain(`<html lang="${locale}">`)
    expect(html).toContain(`<h1>${copy.title}</h1>`)
    expect(html).toContain(copy.returnDescription)
    expect(html).toContain('Tea Desktop · 127.0.0.1')
  })

  it('is self-contained and does not attempt to close the browser tab', () => {
    const html = centerAuthCallbackPage('en')

    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('@media (prefers-color-scheme: dark)')
  })

  it('uses restrictive callback response headers', () => {
    expect(CENTER_AUTH_CALLBACK_HEADERS).toMatchObject({
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    })
    expect(CENTER_AUTH_CALLBACK_HEADERS['content-security-policy']).toContain("default-src 'none'")
  })
})

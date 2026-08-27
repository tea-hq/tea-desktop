import { describe, expect, it } from 'vitest'

import { normalizeLocale } from '@/i18n'
import en from './en'
import zhCN from './zh-CN'

function flattenKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'object' && child !== null ? flattenKeys(child, path) : [path]
  })
}

describe('locales', () => {
  it('keeps English and Chinese message keys in sync', () => {
    expect(flattenKeys(zhCN).sort()).toEqual(flattenKeys(en).sort())
  })

  it('normalizes Chinese browser locales', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeLocale('zh-TW')).toBe('zh-CN')
    expect(normalizeLocale('en-US')).toBe('en')
  })
})

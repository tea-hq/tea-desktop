import { describe, expect, it } from 'vitest'

import { buildSubjectPrompt, normalizeGeneratedSubject, normalizeSubject } from './subject'

describe('conversation subject rules', () => {
  it('builds the migrated prompt with a bounded trimmed source', () => {
    const prompt = buildSubjectPrompt(`  ${'x'.repeat(5_000)}  `)

    expect(prompt).toContain('Use at most 20 Chinese characters or 8 words.')
    expect(prompt.match(/x/g)).toHaveLength(4_000)
    expect(prompt).toMatch(/User message:\nx+$/)
  })

  it('normalizes the first non-empty line into one bounded subject', () => {
    expect(normalizeSubject('\n **Login redirect loop.**\nignored')).toBe('Login redirect loop')
    expect(normalizeSubject('`移动端登录故障。`')).toBe('移动端登录故障')
    expect(normalizeSubject(`A\u0000B\u0007C${'😀'.repeat(60)}`)).toBe(`ABC${'😀'.repeat(47)}`)
  })

  it('rejects empty and source-equivalent generated output', () => {
    expect(normalizeSubject(' \n\t ')).toBeNull()
    expect(normalizeGeneratedSubject('你是谁啊？', '你是谁啊。')).toBeNull()
    expect(normalizeGeneratedSubject('请修复登录重定向', '登录重定向故障')).toBe('登录重定向故障')
  })
})

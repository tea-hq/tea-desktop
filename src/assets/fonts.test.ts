import { describe, expect, it } from 'vitest'
import index from '../../index.html?raw'

const fileSystem = process.getBuiltinModule('node:fs')
const mainCss = fileSystem.readFileSync(new URL('./main.css', import.meta.url), 'utf8')

describe('font loading', () => {
  it('uses bundled fonts without external Google requests', () => {
    expect(index).not.toContain('fonts.googleapis.com')
    expect(index).not.toContain('fonts.gstatic.com')
  })

  it('uses a 16px root and the desktop CJK font stack', () => {
    expect(mainCss).toContain("'Segoe UI Variable'")
    expect(mainCss).toContain("'PingFang SC'")
    expect(mainCss).toMatch(/html\s*\{[^}]*font-size:\s*16px/s)
    expect(mainCss).toMatch(/body\s*\{[^}]*font-size:\s*1rem/s)
    expect(mainCss).toContain("'JetBrains Mono Variable'")
  })
})

import { describe, expect, it } from 'vitest'

import { markdownToPlainText, renderMarkdownToHtml } from './renderer'

describe('renderMarkdownToHtml', () => {
  it('renders common agent response structures', () => {
    const html = renderMarkdownToHtml(
      [
        '# Result',
        '',
        '- first',
        '- second',
        '',
        '| File | State |',
        '| --- | --- |',
        '| app.ts | changed |',
        '',
        '```ts',
        'const ready = true',
        '```',
      ].join('\n')
    )

    expect(html).toContain('<h1>Result</h1>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<table>')
    expect(html).toContain('<code class="language-ts">')
  })

  it('keeps raw HTML inert and rejects dangerous link protocols', () => {
    const html = renderMarkdownToHtml(
      ['<img src=x onerror="alert(1)">', '', '[unsafe](javascript:alert(1))'].join('\n')
    )

    expect(html).not.toContain('<img')
    expect(html).not.toContain('href=')
    expect(html).toContain('&lt;img')
    expect(html).toContain('onerror=&quot;alert(1)&quot;')
  })

  it('renders incomplete fenced code while a response is streaming', () => {
    const html = renderMarkdownToHtml('```rust\nfn main() {')

    expect(html).toContain('<pre><code class="language-rust">')
    expect(html).toContain('fn main() {')
  })

  it('hardens generated links and remote images', () => {
    const html = renderMarkdownToHtml(
      ['[Tea](https://github.com/tea-hq/tea-rs)', '', '![diagram](https://example.com/diagram.png)'].join('\n')
    )

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('referrerpolicy="no-referrer"')
  })

  it('creates a bounded plain-text preview from structured Markdown', () => {
    const preview = markdownToPlainText(
      ['## Release result', '', '- Keep **manual review**', '- [Open task](https://example.com)'].join('\n'),
      80,
    )

    expect(preview).toBe('Release result Keep manual review Open task')
    expect(markdownToPlainText('12345', 4)).toBe('1234')
  })
})

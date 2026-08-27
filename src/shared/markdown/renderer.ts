import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
})

const defaultLinkOpen = markdown.renderer.rules.link_open

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options)
}

const defaultImage = markdown.renderer.rules.image

markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index]
  token.attrSet('loading', 'lazy')
  token.attrSet('decoding', 'async')
  token.attrSet('referrerpolicy', 'no-referrer')
  return defaultImage
    ? defaultImage(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options)
}

export function renderMarkdownToHtml(source: string): string {
  return markdown.render(source)
}

type MarkdownToken = ReturnType<typeof markdown.parse>[number]

export function markdownToPlainText(source: string, maximum = 160): string {
  const text = markdown.parse(source, {})
    .map(tokenText)
    .filter(Boolean)
    .join(' ')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ')
  return Array.from(text).slice(0, maximum).join('')
}

function tokenText(token: MarkdownToken): string {
  if (token.children?.length) return token.children.map(tokenText).join(' ')
  if (token.type === 'text'
    || token.type === 'code_inline'
    || token.type === 'code_block'
    || token.type === 'fence'
    || token.type === 'image') {
    return token.content
  }
  if (token.type === 'softbreak' || token.type === 'hardbreak') return ' '
  return ''
}

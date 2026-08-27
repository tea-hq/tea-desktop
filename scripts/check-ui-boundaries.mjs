import { readdirSync, readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { parseForESLint } from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'

const projectRoot = path.resolve(import.meta.dirname, '..')
const productRoots = ['src/app', 'src/features', 'src/App.vue']
const visualClass = /^(?:bg|border|decoration|divide|font|from|outline|ring|rounded|shadow|text|to|tracking|via)-(?!clip$|ellipsis$|left$|right$|center$|justify$|wrap$|nowrap$)/

export function inspectUiSource(filename, source) {
  const relativeName = filename.split(path.sep).join('/')
  const sharedUi = relativeName.startsWith('src/shared/ui/')
  const parsed = parseForESLint(source, {
    filePath: filename,
    parser: tsParser,
    sourceType: 'module',
  })
  const violations = []

  if (!sharedUi) {
    for (const statement of parsed.ast.body ?? []) {
      if (statement.type !== 'ImportDeclaration') continue
      const value = statement.source.value
      if (typeof value === 'string'
        && (value.startsWith('primevue/')
          || value === '@primeuix/themes'
          || value.startsWith('@primeuix/themes/'))) {
        violations.push(violation('library-import', value, statement.loc?.start.line))
      }
    }
  }

  if (!sharedUi && parsed.services?.getDocumentFragment) {
    const fragment = parsed.services.getDocumentFragment()
    walkTemplate(fragment, node => {
      if (node.type === 'VElement') inspectElement(node, violations)
    })
  }

  return violations
}

function inspectElement(element, violations) {
  const tag = element.rawName
  if (tag === 'button' || tag === 'select' || tag === 'textarea') {
    violations.push(violation('native-control', tag, element.loc?.start.line))
  } else if (tag === 'input' && inputType(element) !== 'file') {
    violations.push(violation('native-control', tag, element.loc?.start.line))
  }

  for (const attribute of element.startTag.attributes) {
    if (attribute.type === 'VAttribute' && !attribute.directive && attribute.key.name === 'class') {
      inspectClassValue(attribute.value?.value ?? '', attribute.loc?.start.line, violations)
    }
    if (attribute.type === 'VAttribute'
      && attribute.directive
      && attribute.key.name.name === 'bind'
      && attribute.key.argument?.type === 'VIdentifier'
      && attribute.key.argument.name === 'class') {
      for (const value of expressionStrings(attribute.value?.expression)) {
        inspectClassValue(value, attribute.loc?.start.line, violations)
      }
    }
  }
}

function inputType(element) {
  const attribute = element.startTag.attributes.find(value => value.type === 'VAttribute'
    && !value.directive
    && value.key.name === 'type')
  return attribute?.value?.value ?? 'text'
}

function inspectClassValue(value, line, violations) {
  for (const token of value.split(/\s+/).filter(Boolean)) {
    const normalized = token.replace(/^(?:[a-z-]+:)+/, '')
    if (visualClass.test(normalized)) {
      violations.push(violation('visual-class', token, line))
    }
  }
}

function expressionStrings(node) {
  if (!node || typeof node !== 'object') return []
  if ((node.type === 'Literal' || node.type === 'StringLiteral') && typeof node.value === 'string') {
    return [node.value]
  }
  const values = []
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (Array.isArray(child)) child.forEach(value => values.push(...expressionStrings(value)))
    else if (child && typeof child === 'object') values.push(...expressionStrings(child))
  }
  return values
}

function walkTemplate(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'tokens' || key === 'comments') continue
    if (Array.isArray(child)) child.forEach(value => walkTemplate(value, visit))
    else if (child && typeof child === 'object') walkTemplate(child, visit)
  }
}

function violation(kind, value, line = 1) {
  return { kind, value, line }
}

function sourceFiles(target) {
  const absolute = path.resolve(projectRoot, target)
  if (statSync(absolute).isFile()) return [absolute]
  const files = []
  for (const entry of readdirSync(absolute)) {
    const child = path.join(absolute, entry)
    if (statSync(child).isDirectory()) files.push(...sourceFiles(path.relative(projectRoot, child)))
    else if (/\.(?:ts|vue)$/.test(entry) && !/\.(?:test|story)\.vue?$/.test(entry)) files.push(child)
  }
  return files
}

function run() {
  const enforce = process.argv.includes('--enforce')
  const results = []
  for (const filename of productRoots.flatMap(sourceFiles)) {
    const relativeName = path.relative(projectRoot, filename)
    for (const item of inspectUiSource(relativeName, readFileSync(filename, 'utf8'))) {
      results.push({ filename: relativeName, ...item })
    }
  }

  if (results.length) {
    const counts = Object.groupBy(results, item => item.kind)
    console.log(`UI migration inventory: ${results.length} violations`)
    for (const [kind, items] of Object.entries(counts)) console.log(`  ${kind}: ${items.length}`)
    if (enforce) {
      results.forEach(item => console.error(`${item.filename}:${item.line} ${item.kind} ${item.value}`))
      process.exitCode = 1
    }
  } else {
    console.log('UI boundaries satisfied')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run()

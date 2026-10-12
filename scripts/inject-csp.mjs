#!/usr/bin/env node
// §9：构建期向 dist/renderer 双入口 html 注入 CSP meta 头（票面 §9 值，
// 业务源码不动，scripts/ 边界内完成）。幂等：已注入则跳过。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TARGETS = [
  resolve(here, '../dist/renderer/control/index.html'),
  resolve(here, '../dist/renderer/projection/index.html'),
]

// technical-plan v2 §9：default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
export const CSP_DIRECTIVE =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"

export function injectCsp(html, directive = CSP_DIRECTIVE) {
  if (html.includes('http-equiv="Content-Security-Policy"')) return { html, injected: false }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${directive}">`
  const injected = html.replace(
    /(<meta\s+charset=["'][^"']+["'][^>]*>)/i,
    `$1\n    ${meta}`,
  )
  if (injected === html) {
    throw new Error('charset meta not found; cannot anchor CSP injection')
  }
  return { html: injected, injected: true }
}

for (const file of TARGETS) {
  const html = readFileSync(file, 'utf-8')
  const { html: out, injected } = injectCsp(html)
  if (injected) writeFileSync(file, out)
  console.log(`csp: ${file} ${injected ? 'injected' : 'already-present'} directive=${CSP_DIRECTIVE}`)
}

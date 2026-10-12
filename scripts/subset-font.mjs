#!/usr/bin/env node
// T4-font：从 generated/bible.json 全量经文提取字符集（确定性、可审计），
// 用 fontTools 对本地 Noto Serif CJK SC（TTC font-number=2）做子集 → woff2 ≤5MB（§2.4）。
// 产物：assets/fonts/{charset.txt, bible-serif-sc.woff2, manifest.json}
// 用法：node scripts/subset-font.mjs [源TTC路径=/usr/share/fonts/google-noto-cjk/NotoSerifCJK-Regular.ttc]

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')

// 投影/控制窗固定 UI 字符（§7.1 标题行、占位、meta 行）；显式列出保持可审计
const UI_CHARS = '圣言投屏主题字号黑场开关锁定显示器主屏第章节卷·-：0123456789'

export function extractCharset(bible) {
  const chars = new Set()
  for (const chapters of Object.values(bible.verses)) {
    for (const verses of Object.values(chapters)) {
      for (const text of verses) {
        for (const ch of text) chars.add(ch)
      }
    }
  }
  for (const book of bible.books) {
    for (const ch of book.name + book.short) chars.add(ch)
  }
  for (const ch of UI_CHARS) chars.add(ch)
  return new Set([...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)))
}

const FONT_NUMBER = 2 // NotoSerifCJK-Regular.ttc 内 SC 的索引（fontTools 枚举核实）

function main() {
  const [, , sourceArg] = process.argv
  const source = sourceArg ?? '/usr/share/fonts/google-noto-cjk/NotoSerifCJK-Regular.ttc'
  const bible = JSON.parse(readFileSync(resolve(ROOT, 'generated/bible.json'), 'utf-8'))

  const charset = extractCharset(bible)
  const charsetText = [...charset].join('')
  const outDir = resolve(ROOT, 'assets/fonts')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'charset.txt'), charsetText)

  const woff2 = resolve(outDir, 'bible-serif-sc.woff2')
  execFileSync(
    'pyftsubset',
    [
      source,
      `--font-number=${FONT_NUMBER}`,
      `--text-file=${resolve(outDir, 'charset.txt')}`,
      '--flavor=woff2',
      `--output-file=${woff2}`,
      "--layout-features='*'",
      '--no-hinting',
      '--desubroutinize',
    ],
    { stdio: 'inherit' },
  )

  const bytes = statSync(woff2).size
  const sha256 = createHash('sha256').update(readFileSync(woff2)).digest('hex')
  const manifest = {
    font: 'bible-serif-sc.woff2',
    source,
    sourceFontNumber: FONT_NUMBER,
    sourceFamily: 'Noto Serif CJK SC',
    codepoints: [...charset].map((c) => c.codePointAt(0).toString(16)),
    chars: charset.size,
    bytes,
    sha256,
  }
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(
    `subset: chars=${charset.size} bytes=${bytes} (${(bytes / 1024 / 1024).toFixed(3)}MB) ` +
      `sha256=${sha256.slice(0, 12)}… source=${source}`,
  )
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) main()

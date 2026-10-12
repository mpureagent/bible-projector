// @vitest-environment happy-dom
import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractCharset } from '../scripts/subset-font.mjs'
import { FONT_FALLBACK_STACK, SUBSET_FONT_FAMILY } from '../src/shared/fonts'
import { injectSubsetFontFace } from '../src/shared/font-dom'

// T4-font：字符集提取（确定性、可审计）+ 子集产物覆盖率 100% + 实测字节数（§2.4 ≤5MB）

const here = resolve(import.meta.dirname, '..')
const bible = JSON.parse(readFileSync(resolve(here, 'generated/bible.json'), 'utf-8'))
const manifestPath = resolve(here, 'assets/fonts/manifest.json')
const woff2Path = resolve(here, 'assets/fonts/bible-serif-sc.woff2')

describe('T4-font 字符集提取（generated/bible.json 全量经文）', () => {
  it('覆盖全部经文与书卷名/简称的每一个字符', () => {
    const charset = extractCharset(bible)
    const missing = []
    let checked = 0
    for (const chapters of Object.values(bible.verses)) {
      for (const verses of Object.values(chapters)) {
        for (const text of verses) {
          for (const ch of text) {
            if (!charset.has(ch)) missing.push(`U+${(ch.codePointAt(0) ?? 0).toString(16)}`)
            checked++
          }
        }
      }
    }
    for (const book of bible.books) {
      for (const ch of book.name + book.short) {
        if (!charset.has(ch)) missing.push(`U+${(ch.codePointAt(0) ?? 0).toString(16)}`)
        checked++
      }
    }
    expect(missing).toEqual([])
    expect(checked).toBeGreaterThan(1000000)
  })

  it('含投影 UI 固定字符（第/章/节/圣言投屏/数字/标点）', () => {
    const charset = extractCharset(bible)
    for (const ch of '圣言投屏主题字号黑场开关锁定显示器主屏第章节卷·-0123456789：') {
      expect(charset.has(ch), `缺失 UI 字符 ${ch}`).toBe(true)
    }
  })

  it('确定性：两次提取全等，且码点升序无重复', () => {
    const a = [...extractCharset(bible)].join('')
    const b = [...extractCharset(bible)].join('')
    expect(a).toBe(b)
    const cps = [...extractCharset(bible)].map((c) => c.codePointAt(0) ?? 0)
    expect([...cps]).toEqual([...cps].sort((x, y) => x - y))
    expect(new Set(cps).size).toBe(cps.length)
  })
})

describe('T4-font 子集产物对账（manifest + woff2）', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  it('源为本地 Noto Serif CJK SC（TTC font-number 声明），未联网下载', () => {
    expect(manifest.source).toContain('NotoSerifCJK')
    expect(manifest.sourceFamily).toBe('Noto Serif CJK SC')
  })

  it('覆盖率 100%：提取集逐字符都在子集码点表中', () => {
    const subsetCps = new Set(manifest.codepoints.map((hex) => Number.parseInt(hex, 16)))
    const charset = extractCharset(bible)
    let covered = 0
    for (const ch of charset) {
      if (subsetCps.has(ch.codePointAt(0) ?? 0)) covered++
    }
    console.log(
      `[T4-font] charset=${charset.size} subsetCodepoints=${manifest.codepoints.length} coverage=${(covered / charset.size).toFixed(4)}`,
    )
    expect(covered).toBe(charset.size)
  })

  it('实测字节数：与 manifest 一致且 ≤5MB（§2.4），数字进日志', () => {
    expect(existsSync(woff2Path)).toBe(true)
    const bytes = statSync(woff2Path).size
    console.log(`[T4-font] woff2 bytes=${bytes} (${(bytes / 1024 / 1024).toFixed(3)}MB)`)
    expect(bytes).toBe(manifest.bytes)
    expect(bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('T4-font 回退链声明（§7.3）', () => {
  it('栈序：子集宋体 → Noto Serif CJK SC → Source Han Serif SC → serif', () => {
    const stack = FONT_FALLBACK_STACK.split(',').map((s) => s.trim())
    expect(stack).toHaveLength(4)
    expect(stack[0]).toBe(`"${SUBSET_FONT_FAMILY}"`)
    expect(stack[1]).toBe('"Noto Serif CJK SC"')
    expect(stack[2]).toBe('"Source Han Serif SC"')
    expect(stack[3]).toBe('serif')
  })

  it('injectSubsetFontFace 注入 @font-face（woff2、font-display swap）', () => {
    const doc = document.implementation.createHTMLDocument()
    injectSubsetFontFace(doc, 'file:///app/fonts/bible-serif-sc.woff2')
    const style = doc.querySelector('style')
    expect(style?.textContent).toContain(`font-family: "${SUBSET_FONT_FAMILY}"`)
    expect(style?.textContent).toContain("src: url('file:///app/fonts/bible-serif-sc.woff2') format('woff2')")
    expect(style?.textContent).toContain('font-display: swap')
  })
})

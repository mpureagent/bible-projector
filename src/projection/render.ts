import { bookBySn, chapterVerses } from '../shared/bible'
import { FONT_STACKS, TEXTURES } from '../shared/style'
import { PROJECTION_THEMES } from '../shared/themes'
import type { AppState, ProjectionStyle, Selection } from '../shared/types'
import { computePages, pageForVerse } from './paginate'

// T3-cascade/T4-layout/T4-style：投影窗渲染（§7.1 主题 token、§2.2 两模式+溢出分页、§2.3 样式全项）。
// 纯 DOM 函数，token 全部来自 themes.ts/style.ts；happy-dom 组件测试直接驱动。

export interface Viewport {
  width: number
  height: number
}

const DEFAULT_VIEWPORT: Viewport = { width: 1920, height: 1080 }
const FONT_SIZE_MAX = 200 // §11 风险行：字号上限
const SAFE_MARGIN_PERCENT = 8 // §11：边距 ≥8% 安全区
const BUILTIN_PREFIX = 'builtin:'

export function renderProjection(root: HTMLElement, state: AppState, viewport: Viewport = DEFAULT_VIEWPORT): void {
  const theme = PROJECTION_THEMES[state.style.theme] ?? PROJECTION_THEMES.ink!
  const style = state.style
  root.style.backgroundColor = style.background ?? theme.background
  root.style.color = style.color ?? theme.color
  root.style.backgroundImage = ''
  if (style.backgroundImage) {
    const tex = TEXTURES.find((t) => `${BUILTIN_PREFIX}${t.id}` === style.backgroundImage)
    if (tex) {
      root.style.backgroundImage = `url("../textures/${tex.file}")`
    } else if (style.backgroundImage.startsWith('/')) {
      // 校验后的本地绝对路径（网络 URL 已在 store 层清洗）
      root.style.backgroundImage = `url("file://${style.backgroundImage}")`
    }
    root.style.backgroundSize = 'cover'
    root.style.backgroundPosition = 'center'
  }

  root.replaceChildren()

  if (!state.selection) {
    const placeholder = document.createElement('div')
    placeholder.className = 'placeholder'
    placeholder.textContent = '圣言投屏'
    root.appendChild(placeholder)
    return
  }

  const sel = state.selection
  const book = bookBySn(sel.sn)
  const fontSize = Math.min(FONT_SIZE_MAX, style.fontSize)
  const margin = Math.max(SAFE_MARGIN_PERCENT, style.margin ?? SAFE_MARGIN_PERCENT)
  const verses = chapterVerses(sel.sn, sel.chapter)
  const container = document.createElement('div')
  container.className = style.mode === 'single' ? 'passage single' : 'passage'
  container.style.fontSize = `${fontSize}px`
  container.style.padding = `${margin}%`
  container.style.fontFamily = FONT_STACKS[style.fontFamily] ?? FONT_STACKS['embedded-serif']
  container.style.lineHeight = String(style.lineHeight ?? 1.7)
  container.style.letterSpacing = `${style.letterSpacing ?? 0}em`
  container.style.textAlign = style.align

  if (!style.hideTitle) {
    container.appendChild(buildTitle(book?.name ?? `卷 ${sel.sn}`, sel.chapter, sel, style.mode))
  }

  const build = (verse: number, current: boolean): HTMLElement =>
    buildVerse(verse, verses[verse - 1] ?? '', current, theme, style)

  if (style.mode === 'single') {
    const current = verses[sel.verses.from - 1]
    if (current !== undefined) {
      container.appendChild(build(sel.verses.from, true))
    }
  } else {
    const pages = computePages(verses, {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      fontSize,
      lineHeight: style.lineHeight,
      marginPercent: margin,
      showTitle: !style.hideTitle,
    })
    const page = pages[pageForVerse(pages, sel.verses.from)] ?? []
    for (const verse of page) {
      const text = verses[verse - 1]
      if (text === undefined) continue
      container.appendChild(build(verse, verse === sel.verses.from))
    }
  }
  root.appendChild(container)
}

function buildTitle(bookName: string, chapter: number, sel: Selection, mode: string): HTMLElement {
  const title = document.createElement('div')
  title.className = 'passage-title'
  const rangeText =
    sel.verses.from === sel.verses.to ? `${sel.verses.from}` : `${sel.verses.from}-${sel.verses.to}`
  title.textContent =
    mode === 'single'
      ? `${bookName} · 第 ${chapter} 章 · 第 ${sel.verses.from} 节`
      : `${bookName} · 第 ${chapter} 章 · ${rangeText} 节`
  return title
}

function buildVerse(
  verse: number,
  text: string,
  current: boolean,
  theme: { verseNumber: string; currentColor: string },
  style: ProjectionStyle,
): HTMLElement {
  const line = document.createElement('p')
  line.className = current ? 'verse current' : 'verse'
  if (!style.hideVerseNumbers) {
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(verse)
    num.style.color = style.verseNumberColor ?? theme.verseNumber
    line.appendChild(num)
  }
  const body = document.createElement('span')
  body.className = 'vtext'
  body.textContent = text
  if (current) body.style.color = style.currentColor ?? theme.currentColor
  line.appendChild(body)
  return line
}

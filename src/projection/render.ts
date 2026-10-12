import { bookBySn, chapterVerses } from '../shared/bible'
import { PROJECTION_THEMES } from '../shared/themes'
import type { AppState, Selection } from '../shared/types'
import { computePages, pageForVerse } from './paginate'

// T3-cascade/T4-layout：投影窗渲染（§7.1 主题 token、§2.2 段落/单节两模式 + 溢出分页）。
// 纯 DOM 函数，主样式 token 全部来自 themes.ts；happy-dom 组件测试直接驱动。

export interface Viewport {
  width: number
  height: number
}

const DEFAULT_VIEWPORT: Viewport = { width: 1920, height: 1080 }
const FONT_SIZE_MAX = 200 // §11 风险行：字号上限
const SAFE_MARGIN_PERCENT = 8 // §11：边距 ≥8% 安全区

export function renderProjection(root: HTMLElement, state: AppState, viewport: Viewport = DEFAULT_VIEWPORT): void {
  const theme = PROJECTION_THEMES[state.style.theme] ?? PROJECTION_THEMES.ink!
  root.style.backgroundColor = theme.background
  root.style.color = theme.color
  root.classList.toggle('blanked', state.blank)

  const overlay = document.createElement('div')
  overlay.className = 'blank-overlay'
  overlay.style.display = state.blank ? 'block' : 'none'

  root.replaceChildren(overlay)

  if (!state.selection) {
    const placeholder = document.createElement('div')
    placeholder.className = 'placeholder'
    placeholder.textContent = '圣言投屏'
    root.appendChild(placeholder)
    return
  }

  const sel = state.selection
  const book = bookBySn(sel.sn)
  const fontSize = Math.min(FONT_SIZE_MAX, state.style.fontSize)
  const verses = chapterVerses(sel.sn, sel.chapter)
  const container = document.createElement('div')
  container.className = state.style.mode === 'single' ? 'passage single' : 'passage'
  container.style.fontSize = `${fontSize}px`
  container.style.padding = `${SAFE_MARGIN_PERCENT}%`

  if (!state.style.hideTitle) {
    container.appendChild(buildTitle(book?.name ?? `卷 ${sel.sn}`, sel.chapter, sel, state.style.mode))
  }

  if (state.style.mode === 'single') {
    const current = verses[sel.verses.from - 1]
    if (current !== undefined) {
      container.appendChild(buildVerse(sel.verses.from, current, true, theme, state.style))
    }
  } else {
    const pages = computePages(verses, {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      fontSize,
      showTitle: !state.style.hideTitle,
    })
    const page = pages[pageForVerse(pages, sel.verses.from)] ?? []
    for (const verse of page) {
      const text = verses[verse - 1]
      if (text === undefined) continue
      container.appendChild(buildVerse(verse, text, verse === sel.verses.from, theme, state.style))
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
  theme: { verseNumber: string },
  style: { hideVerseNumbers: boolean },
): HTMLElement {
  const line = document.createElement('p')
  line.className = current ? 'verse current' : 'verse'
  if (!style.hideVerseNumbers) {
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(verse)
    num.style.color = theme.verseNumber
    line.appendChild(num)
  }
  const body = document.createElement('span')
  body.className = 'vtext'
  body.textContent = text
  line.appendChild(body)
  return line
}

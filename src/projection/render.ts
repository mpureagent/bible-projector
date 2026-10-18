import { bookBySn, chapterVerses } from '../shared/bible'
import { applyStageStyle, buildPassage, resolveFontSize, resolveMargin, type PassageVerse } from '../shared/passage'
import type { AppState } from '../shared/types'
import { computePages, pageForVerse } from './paginate'

// T3-cascade/T4-layout/T7-layout：投影窗渲染。排版核已抽到 shared/passage.ts 与预览同源。
// 本文件只负责：舞台样式 + 当前页/单节经文选取（分页引擎 T7-flow 退役）。

export interface Viewport {
  width: number
  height: number
}

const DEFAULT_VIEWPORT: Viewport = { width: 1920, height: 1080 }

export function renderProjection(root: HTMLElement, state: AppState, viewport: Viewport = DEFAULT_VIEWPORT): void {
  applyStageStyle(root, state.style)
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
  const style = state.style
  const fontSize = resolveFontSize(style)
  const margin = resolveMargin(style)
  const verses = chapterVerses(sel.sn, sel.chapter)

  let list: PassageVerse[]
  if (style.mode === 'single') {
    const text = verses[sel.verses.from - 1]
    list = text === undefined ? [] : [{ number: sel.verses.from, text }]
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
    list = page
      .map((n) => ({ number: n, text: verses[n - 1] ?? '' }))
      .filter((v) => v.text !== '')
  }

  root.appendChild(
    buildPassage(
      { bookName: book?.name ?? `卷 ${sel.sn}`, chapter: sel.chapter, from: sel.verses.from, to: sel.verses.to },
      list,
      style,
      { fontSize, currentVerse: sel.verses.from, mode: style.mode },
    ),
  )
}
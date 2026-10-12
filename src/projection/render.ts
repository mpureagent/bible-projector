import { bookBySn, chapterVerses } from '../shared/bible'
import { PROJECTION_THEMES } from '../shared/themes'
import type { AppState } from '../shared/types'

// T3-cascade：投影窗渲染（§7.1 墨金主题、行距 1.7、节号上标小字、当前节高亮）。
// 纯 DOM 函数，主样式 token 全部来自 themes.ts；happy-dom 组件测试直接驱动。

export function renderProjection(root: HTMLElement, state: AppState): void {
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
  const container = document.createElement('div')
  container.className = 'passage'
  container.style.fontSize = `${state.style.fontSize}px`

  const title = document.createElement('div')
  title.className = 'passage-title'
  const rangeText =
    sel.verses.from === sel.verses.to
      ? `${sel.verses.from}`
      : `${sel.verses.from}-${sel.verses.to}`
  title.textContent = `${book?.name ?? `卷 ${sel.sn}`} · 第 ${sel.chapter} 章 · ${rangeText} 节`
  container.appendChild(title)

  const verses = chapterVerses(sel.sn, sel.chapter)
  for (let v = sel.verses.from; v <= sel.verses.to; v++) {
    const text = verses[v - 1]
    if (text === undefined) continue
    const line = document.createElement('p')
    line.className = 'verse current'
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(v)
    num.style.color = theme.verseNumber
    const body = document.createElement('span')
    body.className = 'vtext'
    body.textContent = text
    line.append(num, body)
    container.appendChild(line)
  }
  root.appendChild(container)
}

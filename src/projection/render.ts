import { bookBySn, chapterVerses } from '../shared/bible'
import { applyStageStyle, buildPassage, resolveFontSize, type PassageVerse } from '../shared/passage'
import type { AppState } from '../shared/types'

// T3-cascade/T4-layout/T7-layout/T7-flow：投影窗渲染。
// R2/R4：废除分页引擎——整个所选范围按**自然段落连续流**一次排版，纵向滚动阅读；
// 排版核 shared/passage.ts 与预览同源。

// 分页引擎已退役（R4）：排版不再依赖视口，整段一次渲染为纵向瀑布流
export function renderProjection(root: HTMLElement, state: AppState): void {
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
  const verses = chapterVerses(sel.sn, sel.chapter)
  const list: PassageVerse[] = []
  for (let v = sel.verses.from; v <= sel.verses.to; v++) {
    const text = verses[v - 1]
    if (text !== undefined) list.push({ number: v, text })
  }

  root.appendChild(
    buildPassage(
      { bookName: book?.name ?? `卷 ${sel.sn}`, chapter: sel.chapter, from: sel.verses.from, to: sel.verses.to },
      list,
      state.style,
      { fontSize: resolveFontSize(state.style), currentVerse: sel.verses.from },
    ),
  )
}
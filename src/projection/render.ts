import {
  applyStageStyle,
  applyVerseHighlight,
  buildStatePassage,
  resolveCurrentVerse,
  resolveFontSize,
} from '../shared/passage'
import type { AppState, Selection } from '../shared/types'

// T3-cascade/T4-layout/T7-layout/T7-flow：投影窗渲染。
// R2/R4：废除分页引擎——整个所选范围按**自然段落连续流**一次排版，纵向滚动阅读；
// 排版核 shared/passage.ts 与预览同源。
// W3：currentVerse 变化只走增量高亮；只有 selection/style 真正变化才整段重建。

interface Snapshot {
  selectionKey: string
  styleKey: string
}

const snapshots = new WeakMap<HTMLElement, Snapshot>()

function selectionKey(selection: Selection | null): string {
  return selection
    ? `${selection.sn}/${selection.chapter}/${selection.verses.from}/${selection.verses.to}`
    : 'null'
}

function snapshotOf(state: AppState): Snapshot {
  return { selectionKey: selectionKey(state.selection), styleKey: JSON.stringify(state.style) }
}

// 返回本次是否整段重建（调用方可据此决定是否做滚动跟随）
export function renderProjection(root: HTMLElement, state: AppState): boolean {
  const next = snapshotOf(state)
  const previous = snapshots.get(root)
  const rebuild = !previous || previous.selectionKey !== next.selectionKey || previous.styleKey !== next.styleKey

  if (rebuild) {
    applyStageStyle(root, state.style)
    root.replaceChildren()
    const passage = buildStatePassage(state, resolveFontSize(state.style))
    if (passage) {
      root.appendChild(passage)
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'placeholder'
      placeholder.textContent = '圣言投屏'
      root.appendChild(placeholder)
    }
    snapshots.set(root, next)
  }

  applyVerseHighlight(root, resolveCurrentVerse(state), state.style)
  return rebuild
}
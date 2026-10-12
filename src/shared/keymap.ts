// §6.3 快捷键映射（纯函数）：键 → 意图。锁屏下除 L 外全部禁用（防误触语义）。
// 窗口级意图（全屏/抽屉/退出全屏）由控制窗接线落地，其余为 Action 直发。
import { bookBySn, chapterVerses } from './bible'
import type { Action, AppState, Selection } from './types'

export type KeyIntent =
  | { kind: 'action'; action: Action }
  | { kind: 'toggle-fullscreen' }
  | { kind: 'toggle-drawer' }
  | { kind: 'exit-fullscreen' }

const FONT_STEP = 12

export function mapKey(key: string, state: AppState): KeyIntent | null {
  if (key === 'l' || key === 'L') {
    return { kind: 'action', action: { type: 'lock', value: !state.lock } }
  }
  if (state.lock) return null

  const sel = state.selection
  const verseSelect = (selection: Selection): KeyIntent => ({ kind: 'action', action: { type: 'select', selection } })

  switch (key) {
    case 'b':
    case 'B':
      return { kind: 'action', action: { type: 'blank', value: !state.blank } }
    case 'f':
    case 'F':
      return { kind: 'toggle-fullscreen' }
    case 's':
    case 'S':
      return { kind: 'toggle-drawer' }
    case 'Escape':
      // Esc：黑场开 → 一键恢复；否则退出全屏
      return state.blank
        ? { kind: 'action', action: { type: 'blank', value: false } }
        : { kind: 'exit-fullscreen' }
    case '+':
    case '=':
      return { kind: 'action', action: { type: 'style', patch: { fontSize: state.style.fontSize + FONT_STEP } } }
    case '-':
    case '_':
      return { kind: 'action', action: { type: 'style', patch: { fontSize: state.style.fontSize - FONT_STEP } } }
    case 'ArrowUp': {
      if (!sel) return null
      const verse = sel.verses.from - 1
      return verse >= 1 ? verseSelect({ ...sel, verses: { from: verse, to: verse } }) : null
    }
    case 'ArrowDown': {
      if (!sel) return null
      const verse = sel.verses.from + 1
      return verse <= chapterVerses(sel.sn, sel.chapter).length
        ? verseSelect({ ...sel, verses: { from: verse, to: verse } })
        : null
    }
    case 'PageUp': {
      if (!sel) return null
      const chapter = sel.chapter - 1
      return chapter >= 1 ? verseSelect({ ...sel, chapter, verses: { from: 1, to: 1 } }) : null
    }
    case 'PageDown': {
      if (!sel) return null
      const book = bookBySn(sel.sn)
      const chapter = sel.chapter + 1
      return book && chapter <= book.chapters ? verseSelect({ ...sel, chapter, verses: { from: 1, to: 1 } }) : null
    }
    default:
      return null
  }
}

// §6.3 快捷键映射（纯函数）：键 → 意图。
// T7-projection（R1 定稿）：B/L 相关功能整体删除；
// F / Esc = 退出投屏；P = 投屏/取消投屏；±字号；↑↓ 移动当前节高亮。
// T7-flow（R4 修订）：PgUp/PgDn 由「翻章」改为「纵向滚动一屏」（scroll 意图，非状态动作）。
// Esc 的抽屉语义链（抽屉开 → 关抽屉）由控制窗 keyboard.ts 持有抽屉状态判定。
import { chapterVerses } from './bible'
import type { Action, AppState, ScrollDirection, Selection } from './types'

export type KeyIntent =
  | { kind: 'action'; action: Action }
  | { kind: 'toggle-drawer' }
  | { kind: 'scroll'; direction: ScrollDirection }

const FONT_STEP = 12

export function mapKey(key: string, state: AppState): KeyIntent | null {
  const sel = state.selection
  const verseSelect = (selection: Selection): KeyIntent => ({ kind: 'action', action: { type: 'select', selection } })

  switch (key) {
    case 'p':
    case 'P':
      // 投屏/取消投屏（与控制窗大按钮同义）
      return { kind: 'action', action: { type: 'projecting', value: !state.projecting } }
    case 'f':
    case 'F':
      // R1：F 或 Esc = 退出投屏（投屏中才产生意图）
      return state.projecting
        ? { kind: 'action', action: { type: 'projecting', value: false } }
        : null
    case 's':
    case 'S':
      return { kind: 'toggle-drawer' }
    case 'Escape':
      return state.projecting
        ? { kind: 'action', action: { type: 'projecting', value: false } }
        : null
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
    case 'PageUp':
      return sel ? { kind: 'scroll', direction: 'up' } : null
    case 'PageDown':
      return sel ? { kind: 'scroll', direction: 'down' } : null
    default:
      return null
  }
}

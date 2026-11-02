// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from '../../src/control/keyboard'
import { mapKey, moveHighlight } from '../../src/shared/keymap'
import type { AppState, ProjectionStyle, Selection } from '../../src/shared/types'

// W3：控制窗 ↑↓ 同样只移动高亮——新状态（含 currentVerse）不再产生 select。

const baseStyle: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  backgroundMode: 'theme',
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

const range: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 21 } }

const state = (currentVerse: number): AppState => ({
  selection: range,
  style: { ...baseStyle },
  display: null,
  projecting: true,
  currentVerse,
})

describe('W3 控制窗键位：↑↓ 只移动 currentVerse', () => {
  it('moveHighlight 在选区范围内 ±1，边界返回 null', () => {
    expect(moveHighlight(state(16), 1)).toBe(17)
    expect(moveHighlight(state(18), -1)).toBe(17)
    expect(moveHighlight(state(21), 1)).toBeNull()
    expect(moveHighlight(state(16), -1)).toBeNull()
  })

  it('mapKey 产生 highlight 动作，不再返回 select/压缩选区', () => {
    expect(mapKey('ArrowDown', state(16))).toEqual({ kind: 'action', action: { type: 'highlight', verse: 17 } })
    expect(mapKey('ArrowUp', state(18))).toEqual({ kind: 'action', action: { type: 'highlight', verse: 17 } })
    expect(mapKey('ArrowDown', state(21))).toBeNull()
  })

  it('键盘控制器把 highlight 交给独立通道，不派发 select', () => {
    const dispatch = vi.fn()
    const highlight = vi.fn()
    const controller = createKeyboardController({
      getState: () => state(16),
      dispatch,
      highlight,
      isDrawerOpen: () => false,
      closeDrawer: () => {},
      toggleDrawer: () => {},
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(highlight).toHaveBeenCalledWith(17)
    expect(dispatch).not.toHaveBeenCalled()
    controller.dispose()
  })
})
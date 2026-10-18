// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from '../../src/control/keyboard'
import type { Action, AppState, ProjectionStyle } from '../../src/shared/types'

// T4-keys：控制窗键盘控制器接线（§6.3）——意图分发、输入控件聚焦不劫持、锁屏静默

const baseStyle: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  mode: 'paragraph',
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

const state = (patch: Partial<AppState> = {}): AppState => ({
  selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } },
  style: { ...baseStyle },
  blank: false,
  lock: false,
  display: null,
  projecting: false,
  ...patch,
})

function setup(current: AppState = state()) {
  const dispatch = vi.fn()
  const toggleDrawer = vi.fn()
  const setFullscreen = vi.fn()
  const controller = createKeyboardController({
    getState: () => current,
    dispatch: (action: Action) => {
      dispatch(action)
      current = reduce(current, action)
    },
    toggleDrawer,
    setFullscreen,
  })
  const press = (key: string, target?: Element) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: target ?? document.body })
    document.dispatchEvent(event)
    return event
  }
  return { controller, press, dispatch, toggleDrawer, setFullscreen }
}

function reduce(s: AppState, action: Action): AppState {
  switch (action.type) {
    case 'blank':
      return { ...s, blank: action.value }
    case 'lock':
      return { ...s, lock: action.value }
    case 'style':
      return { ...s, style: { ...s.style, ...action.patch } }
    case 'select':
      return { ...s, selection: action.selection }
    case 'display':
      return { ...s, display: action.id }
    case 'projecting':
      return { ...s, projecting: action.value }
  }
}

describe('T4-keys 键盘控制器', () => {
  it('B → blank true，再按 B → false（一键恢复）', () => {
    const { press, dispatch } = setup()
    press('b')
    expect(dispatch).toHaveBeenCalledWith({ type: 'blank', value: true })
    press('b')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'blank', value: false })
  })

  it('Esc：黑场开 → 派发关黑场；黑场关 → 请求退出全屏', () => {
    const { press, dispatch, setFullscreen } = setup()
    press('Escape')
    expect(setFullscreen).toHaveBeenCalledWith(false)
    expect(dispatch).not.toHaveBeenCalled()

    const blanked = setup(state({ blank: true }))
    blanked.press('Escape')
    expect(blanked.dispatch).toHaveBeenCalledWith({ type: 'blank', value: false })
    expect(blanked.setFullscreen).not.toHaveBeenCalled()
  })

  it('F → 全屏切换（不传值即 toggle）', () => {
    const { press, setFullscreen } = setup()
    press('f')
    expect(setFullscreen).toHaveBeenCalledWith(undefined)
  })

  it('T6-project：P → 投屏 true，再按 P → 取消投屏 false（与顶栏按钮同义）', () => {
    const { press, dispatch } = setup()
    press('p')
    expect(dispatch).toHaveBeenCalledWith({ type: 'projecting', value: true })
    press('P')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'projecting', value: false })
  })

  it('S → 抽屉开合；↑ → 翻节 dispatch select', () => {
    const { press, toggleDrawer, dispatch } = setup()
    press('s')
    expect(toggleDrawer).toHaveBeenCalledTimes(1)
    press('ArrowDown')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'select',
      selection: { sn: 1, chapter: 1, verses: { from: 2, to: 2 } },
    })
  })

  it('锁屏下按键静默（含 B/F/↑），L 解锁后恢复响应', () => {
    const { press, dispatch, toggleDrawer, setFullscreen } = setup(state({ lock: true }))
    for (const key of ['b', 'f', 's', 'ArrowDown', 'Escape', '+']) press(key)
    expect(dispatch).not.toHaveBeenCalled()
    expect(toggleDrawer).not.toHaveBeenCalled()
    expect(setFullscreen).not.toHaveBeenCalled()

    press('l')
    expect(dispatch).toHaveBeenCalledWith({ type: 'lock', value: false })
    press('b')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'blank', value: true })
  })

  it('输入控件聚焦时按键不劫持（抽屉自定义路径输入不触发快捷键）', () => {
    const { press, dispatch } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('b', input)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('事件默认行为被拦截（preventDefault）', () => {
    const { press } = setup()
    const event = press('ArrowDown')
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('T4-keys 顶栏大按钮触区（§6.2 ≥40px）', () => {
  it('控制窗样式：button 规则含 min-height 40px，黑场/锁屏/样式大按钮齐备', () => {
    // 源文件核对 CSS 规约（happy-dom 不计算样式表）
    const source = readFileSync('src/control/index.html', 'utf-8')
    expect(source).toMatch(/button\s*{[^}]*min-height:\s*40px/)
    expect(source).toMatch(/id="btn-blank"/)
    expect(source).toMatch(/id="btn-lock"/)
    expect(source).toMatch(/id="btn-style"/)
  })
})

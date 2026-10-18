// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from '../../src/control/keyboard'
import type { Action, AppState, ProjectionStyle } from '../../src/shared/types'

// T7-projection：控制窗键盘控制器——F/Esc=退投屏、P=投屏开合、Esc 抽屉语义链、
// 黑场/锁屏键不存在（B/L 无派发）

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
  display: null,
  projecting: false,
  ...patch,
})

function setup(current: AppState = state()) {
  const dispatch = vi.fn()
  const toggleDrawer = vi.fn()
  const closeDrawer = vi.fn()
  let drawerOpen = false
  const isDrawerOpen = vi.fn(() => drawerOpen)
  const setOpen = (open: boolean): void => {
    drawerOpen = open
  }
  const controller = createKeyboardController({
    getState: () => current,
    dispatch: (action: Action) => {
      dispatch(action)
      current = reduce(current, action)
    },
    isDrawerOpen,
    closeDrawer: () => {
      drawerOpen = false
      closeDrawer()
    },
    toggleDrawer: () => {
      drawerOpen = !drawerOpen
      toggleDrawer()
    },
  })
  const press = (key: string, target?: Element) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: target ?? document.body })
    document.dispatchEvent(event)
    return event
  }
  return { controller, press, dispatch, toggleDrawer, closeDrawer, isDrawerOpen, setOpen }
}

function reduce(s: AppState, action: Action): AppState {
  switch (action.type) {
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

describe('T7-projection 键盘控制器（R1 键位语义）', () => {
  it('P → 投屏 true，再按 P → 取消投屏 false（与顶栏按钮同义）', () => {
    const { press, dispatch } = setup()
    press('p')
    expect(dispatch).toHaveBeenCalledWith({ type: 'projecting', value: true })
    press('P')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'projecting', value: false })
  })

  it('F / Esc：投屏中 → 退出投屏；未投屏 → 无派发（其余无动作）', () => {
    const off = setup()
    off.press('f')
    off.press('Escape')
    expect(off.dispatch).not.toHaveBeenCalled()

    const on = setup(state({ projecting: true }))
    on.press('F')
    expect(on.dispatch).toHaveBeenCalledWith({ type: 'projecting', value: false })
    on.press('Escape')
    expect(on.dispatch).toHaveBeenLastCalledWith({ type: 'projecting', value: false })
  })

  it('Esc 语义链：抽屉开着 → 先关抽屉（不派发投屏动作）', () => {
    const { press, dispatch, closeDrawer, setOpen } = setup(state({ projecting: true }))
    setOpen(true)
    press('Escape')
    expect(closeDrawer).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()

    // 抽屉关后再按 Esc → 退投屏
    press('Escape')
    expect(dispatch).toHaveBeenCalledWith({ type: 'projecting', value: false })
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

  it('B / L 键不存在：无任何派发（黑场/锁屏链路已删除）', () => {
    const { press, dispatch, toggleDrawer, closeDrawer } = setup(state({ projecting: true }))
    for (const key of ['b', 'B', 'l', 'L']) press(key)
    expect(dispatch).not.toHaveBeenCalled()
    expect(toggleDrawer).not.toHaveBeenCalled()
    expect(closeDrawer).not.toHaveBeenCalled()
  })

  it('输入控件聚焦时按键不劫持（抽屉自定义路径输入不触发快捷键）', () => {
    const { press, dispatch } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('p', input)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('事件默认行为被拦截（preventDefault）', () => {
    const { press } = setup()
    const event = press('ArrowDown')
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('顶栏大按钮触区（§6.2 ≥40px）+ 黑场/锁屏/显示器控件不存在', () => {
  it('控制窗样式：button 规则含 min-height 40px，样式大按钮齐备', () => {
    // 源文件核对 CSS 规约（happy-dom 不计算样式表）
    const source = readFileSync('src/control/index.html', 'utf-8')
    expect(source).toMatch(/button\s*{[^}]*min-height:\s*40px/)
    expect(source).toMatch(/id="btn-style"/)
    expect(source).toMatch(/id="btn-project"/)
  })

  it('R1 删除令：黑场/锁屏/显示器下拉 DOM 不存在', () => {
    const source = readFileSync('src/control/index.html', 'utf-8')
    expect(source).not.toMatch(/id="btn-blank"/)
    expect(source).not.toMatch(/id="btn-lock"/)
    expect(source).not.toMatch(/id="display-panel"/)
    expect(source).not.toMatch(/id="st-blank"/)
    expect(source).not.toMatch(/id="st-lock"/)
  })
})

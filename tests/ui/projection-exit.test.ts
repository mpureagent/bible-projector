// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AppState } from '../../src/shared/types'

// T6-project：投影窗内 Esc = 取消投屏（dispatch projecting=false）——
// 与单屏预览窗关闭按钮、控制窗 P 键并列为三条退出路径

const state: AppState = {
  selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } },
  style: {
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
  },
  blank: false,
  lock: false,
  display: null,
  projecting: true,
}

describe('T6-project 投影窗 Esc 退出投屏', () => {
  beforeEach(() => {
    const dispatch = vi.fn()
    const onState = vi.fn(() => () => {})
    ;(window as unknown as { bridge: unknown }).bridge = {
      dispatch,
      onState,
      getState: () => Promise.resolve(state),
      getHistory: () => Promise.resolve([]),
      getDisplays: () => Promise.resolve([]),
      setProjectionFullscreen: () => Promise.resolve(),
      onBanner: () => () => {},
    }
    vi.resetModules()
  })

  it('keydown Escape → dispatch({ type: "projecting", value: false }) 且默认行为被拦', async () => {
    await import('../../src/projection/main')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    const bridge = (window as unknown as { bridge: { dispatch: ReturnType<typeof vi.fn> } }).bridge
    expect(bridge.dispatch).toHaveBeenCalledWith({ type: 'projecting', value: false })
    expect(event.defaultPrevented).toBe(true)
  })

  it('非 Esc 键不触发投屏取消', async () => {
    await import('../../src/projection/main')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
    const bridge = (window as unknown as { bridge: { dispatch: ReturnType<typeof vi.fn> } }).bridge
    expect(bridge.dispatch).not.toHaveBeenCalled()
  })
})

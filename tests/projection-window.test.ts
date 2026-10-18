import { beforeEach, describe, expect, it, vi } from 'vitest'

// T6-project：单屏保护（P0）——mock electron，唯一 display 时投影窗禁止 fullscreen

interface MockBounds {
  x: number
  y: number
  width: number
  height: number
}

interface MockWin {
  options: Record<string, unknown>
  fullScreen: boolean
  visible: boolean
  showCalls: number
  showInactiveCalls: number
  destroyed: boolean
  bounds: MockBounds
  loadFile(): Promise<void>
  once(event: string, fn: () => void): void
  on(event: string, fn: (event: { preventDefault(): void }) => void): void
  setBounds(b: Partial<MockBounds>): void
  center(): void
  show(): void
  showInactive(): void
  hide(): void
  setFullScreen(value: boolean): void
  isFullScreen(): boolean
  isDestroyed(): boolean
  destroy(): void
}

const hoisted = vi.hoisted(() => {
  const state: { displays: Array<Record<string, unknown>> } = { displays: [] }
  return { state }
})

vi.mock('electron', () => {
  class MockBrowserWindow {
    options: Record<string, unknown>
    fullScreen: boolean
    visible = false
    showCalls = 0
    showInactiveCalls = 0
    destroyed = false
    bounds: MockBounds
    private readonly onceHandlers = new Map<string, Array<() => void>>()
    webContents = {
      once: () => {},
      send: () => {},
    }
    constructor(options: Record<string, unknown>) {
      this.options = options
      this.fullScreen = Boolean(options.fullscreen)
      this.bounds = { x: 0, y: 0, width: Number(options.width), height: Number(options.height) }
    }
    loadFile(): Promise<void> {
      for (const fn of this.onceHandlers.get('ready-to-show') ?? []) fn()
      return Promise.resolve()
    }
    once(event: string, fn: () => void): void {
      this.onceHandlers.set(event, [...(this.onceHandlers.get(event) ?? []), fn])
    }
    on(): void {}
    setBounds(b: Partial<MockBounds>): void {
      Object.assign(this.bounds, b)
    }
    center(): void {
      this.bounds.x = 320
      this.bounds.y = 180
    }
    show(): void {
      this.visible = true
      this.showCalls += 1
    }
    showInactive(): void {
      this.visible = true
      this.showInactiveCalls += 1
    }
    hide(): void {
      this.visible = false
    }
    setFullScreen(value: boolean): void {
      this.fullScreen = value
    }
    isFullScreen(): boolean {
      return this.fullScreen
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    destroy(): void {
      this.destroyed = true
      this.visible = false
    }
  }
  return {
    BrowserWindow: MockBrowserWindow,
    screen: { getAllDisplays: () => hoisted.state.displays },
  }
})

import {
  createProjectionWindow,
  destroyProjectionWindow,
  gateProjectionMessage,
  isSingleDisplay,
  moveProjectionTo,
  showProjectionWindow,
} from '../src/main/windows'
import { IPC_CHANNELS } from '../src/shared/types'
import type { Display } from 'electron'

const display = (id: number, x: number): Display =>
  ({ id, bounds: { x, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } }) as Display

const setDisplays = (displays: Display[]): void => {
  hoisted.state.displays = displays as unknown as Array<Record<string, unknown>>
}

const create = (target = display(1, 0), smoke = false): MockWin =>
  createProjectionWindow(target, smoke) as unknown as MockWin

describe('T6-project 单屏保护（P0）：唯一 display 禁止 fullscreen', () => {
  beforeEach(() => {
    setDisplays([display(1, 0)])
  })

  it('单屏：投影窗为普通窗口 1280×720、带边框、标题「投影预览」、不进全屏', () => {
    const w = create()
    expect(w.options.fullscreen).toBe(false)
    expect(w.options.frame).toBe(true)
    expect(w.options.title).toBe('投影预览')
    expect(w.options.width).toBe(1280)
    expect(w.options.height).toBe(720)
  })

  it('单屏：投影窗默认隐藏（loadFile 完成后仍不可见）', async () => {
    const w = create()
    await w.loadFile()
    expect(w.visible).toBe(false)
  })

  it('双屏：投影窗全屏铺满目标显示器（无边框）', () => {
    setDisplays([display(1, 0), display(2, 1920)])
    const w = create(display(2, 1920))
    expect(w.options.fullscreen).toBe(true)
    expect(w.options.frame).toBe(false)
    expect(w.options.title).toBe('圣言投屏 · 投影窗')
    expect(w.bounds.x).toBe(1920)
    expect(w.bounds.width).toBe(1920)
    expect(w.fullScreen).toBe(true)
  })

  it('smoke 烟测路径保持既有形态：1000×520 定位展示、不进全屏', async () => {
    const w = create(display(1, 0), true)
    await w.loadFile()
    expect(w.options.fullscreen).toBe(false)
    expect(w.bounds.x).toBe(400)
    expect(w.bounds.width).toBe(1000)
    expect(w.fullScreen).toBe(false)
    expect(w.visible).toBe(true)
  })
})

describe('T6-project 投屏可见性驱动（show/hide）', () => {
  beforeEach(() => {
    setDisplays([display(1, 0)])
  })

  it('单屏 show：退出全屏（若误入）、1280×720、可见', () => {
    const w = create()
    w.fullScreen = true
    showProjectionWindow(w as never, display(1, 0))
    expect(w.fullScreen).toBe(false)
    expect(w.visible).toBe(true)
    expect(w.bounds.width).toBe(1280)
    expect(w.bounds.height).toBe(720)
  })

  it('T7 R1：show 走 showInactive 不抢焦点（主屏自由）', () => {
    const w = create()
    showProjectionWindow(w as never, display(1, 0))
    expect(w.showInactiveCalls).toBe(1)
    expect(w.showCalls).toBe(0)
    setDisplays([display(1, 0), display(2, 1920)])
    const dual = create(display(2, 1920))
    showProjectionWindow(dual as never, display(2, 1920))
    expect(dual.showInactiveCalls).toBe(1)
    expect(dual.showCalls).toBe(0)
  })

  it('T7 R1：destroyProjectionWindow 取消投屏 = 销毁；已销毁窗口不重复 destroy', () => {
    const w = create()
    expect(w.isDestroyed()).toBe(false)
    destroyProjectionWindow(w as never)
    expect(w.isDestroyed()).toBe(true)
    expect(w.visible).toBe(false)
    // 幂等：对已销毁窗口再调不抛错
    expect(() => destroyProjectionWindow(w as never)).not.toThrow()
  })

  it('双屏 show：bounds 对齐目标显示器并全屏', () => {
    setDisplays([display(1, 0), display(2, 1920)])
    const w = create()
    showProjectionWindow(w as never, display(2, 1920))
    expect(w.fullScreen).toBe(true)
    expect(w.bounds.x).toBe(1920)
    expect(w.visible).toBe(true)
  })

  it('T7 R1：hideProjectionWindow 已退役（取消投屏=销毁，不再隐藏复用）', async () => {
    const windows = await import('../src/main/windows')
    expect('hideProjectionWindow' in windows).toBe(false)
  })

  it('moveProjectionTo 单屏不进全屏（热插拔回落主屏也不吞屏）；双屏照旧全屏', () => {
    const single = create()
    single.fullScreen = true
    moveProjectionTo(single as never, display(1, 0))
    expect(single.fullScreen).toBe(false)

    setDisplays([display(1, 0), display(2, 1920)])
    const dual = create()
    moveProjectionTo(dual as never, display(2, 1920))
    expect(dual.fullScreen).toBe(true)
    expect(dual.bounds.x).toBe(1920)
  })

  it('isSingleDisplay：单屏 true，双屏 false', () => {
    expect(isSingleDisplay()).toBe(true)
    setDisplays([display(1, 0), display(2, 1920)])
    expect(isSingleDisplay()).toBe(false)
  })
})

describe('T6-project 广播门控：未投屏时选经不广播投影窗', () => {
  it('state 通道：projecting=false 拦截，true 放行', () => {
    expect(gateProjectionMessage(IPC_CHANNELS.state, { projecting: false })).toBe(false)
    expect(gateProjectionMessage(IPC_CHANNELS.state, { projecting: true })).toBe(true)
  })

  it('非 state 通道（如 banner）不受门控影响', () => {
    expect(gateProjectionMessage(IPC_CHANNELS.banner, { projecting: false })).toBe(true)
    expect(gateProjectionMessage('app:other', null)).toBe(true)
  })
})

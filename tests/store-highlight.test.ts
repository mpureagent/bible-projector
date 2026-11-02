import { describe, expect, it, vi } from 'vitest'
import type { ProjectionStyle, Selection } from '../src/shared/types'
import { isAction } from '../src/shared/types'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'

// W3：currentVerse 与 selection 解耦——highlight 只点亮、不碰渲染范围。

const range: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 21 } }

function fakePersistence() {
  const config: { style?: ProjectionStyle; display?: number | null } = {}
  let history: Array<{ selection: Selection; at: number }> = []
  const saveConfig = vi.fn((c) => Object.assign(config, c))
  const persistence: Persistence = {
    loadConfig: () => config,
    saveConfig,
    loadHistory: () => history,
    saveHistory: vi.fn((h) => {
      history = h
    }),
  }
  return { persistence, saveConfig, readHistory: () => history }
}

function setup(): {
  store: AppStateStore
  saveConfig: ReturnType<typeof vi.fn>
  readHistory: () => Array<{ selection: Selection; at: number }>
} {
  const { persistence, saveConfig, readHistory } = fakePersistence()
  return { store: new AppStateStore(persistence), saveConfig, readHistory }
}

describe('W3 highlight：只改 currentVerse，不碰 selection', () => {
  it('select 后 currentVerse 重置为选区第一节', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    expect(store.getState().selection).toEqual(range)
    expect(store.getState().currentVerse).toBe(16)
  })

  it('highlight 只改 currentVerse；selection 引用保持不变', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    const before = store.getState()
    store.dispatch({ type: 'highlight', verse: 18 })
    const after = store.getState()
    expect(after.currentVerse).toBe(18)
    expect(after.selection).toBe(before.selection)
    expect(before.currentVerse).toBe(16) // 不可变
  })

  it('连续 highlight 不会把选区压成单节（P0 数据破坏回归）', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    for (const verse of [17, 18, 19, 20, 21]) store.dispatch({ type: 'highlight', verse })
    expect(store.getState().selection).toEqual(range)
    expect(store.getState().currentVerse).toBe(21)
  })

  it('越界值忽略：不报错、不夹取（小于 from / 大于 to）', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    store.dispatch({ type: 'highlight', verse: 18 })
    const before = store.getState()
    store.dispatch({ type: 'highlight', verse: 15 })
    expect(store.getState()).toBe(before)
    store.dispatch({ type: 'highlight', verse: 22 })
    expect(store.getState()).toBe(before)
    expect(store.getState().currentVerse).toBe(18)
  })

  it('无选区时 highlight(number) 被忽略；highlight(null) 置空', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    store.dispatch({ type: 'highlight', verse: 20 })
    store.dispatch({ type: 'select', selection: null })
    expect(store.getState().selection).toBeNull()
    expect(store.getState().currentVerse).toBeNull()
    store.dispatch({ type: 'highlight', verse: 3 })
    expect(store.getState().currentVerse).toBeNull()
  })

  it('highlight(null) 清除点亮但不改 selection', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    store.dispatch({ type: 'highlight', verse: null })
    expect(store.getState().currentVerse).toBeNull()
    expect(store.getState().selection).toEqual(range)
  })

  it('换经文：currentVerse 重置为新选区第一节', () => {
    const { store } = setup()
    store.dispatch({ type: 'select', selection: range })
    store.dispatch({ type: 'highlight', verse: 20 })
    const next: Selection = { sn: 1, chapter: 1, verses: { from: 5, to: 9 } }
    store.dispatch({ type: 'select', selection: next })
    expect(store.getState().currentVerse).toBe(5)
  })

  it('highlight 不写历史、不持久化 config', () => {
    const { store, readHistory, saveConfig } = setup()
    store.dispatch({ type: 'select', selection: range })
    const historyBefore = readHistory().length
    saveConfig.mockClear()
    store.dispatch({ type: 'highlight', verse: 19 })
    expect(readHistory()).toHaveLength(historyBefore)
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it('isAction 接受 highlight（IPC/Web 入口放行）', () => {
    expect(isAction({ type: 'highlight', verse: 18 })).toBe(true)
    expect(isAction({ type: 'highlight', verse: null })).toBe(true)
    expect(isAction({ type: 'hack' })).toBe(false)
  })

  it('hideCurrent 默认按 false 处理；显式 true 可写入样式状态并持久化', () => {
    const { persistence } = fakePersistence()
    const store = new AppStateStore(persistence)
    expect(store.getState().style.hideCurrent ?? false).toBe(false)
    store.dispatch({ type: 'style', patch: { hideCurrent: true } })
    expect(store.getState().style.hideCurrent).toBe(true)
    expect(new AppStateStore(persistence).getState().style.hideCurrent).toBe(true)
  })
})
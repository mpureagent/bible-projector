import { describe, expect, it, vi } from 'vitest'
import type { Action, ProjectionStyle, Selection } from '../src/shared/types'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'

const selection: Selection = { sn: 43, chapter: 3, verses: { from: 16, to: 16 } }

function fakePersistence() {
  const config: { style?: ProjectionStyle; display?: number | null } = {}
  let history: Array<{ selection: Selection; at: number }> = []
  const persistence: Persistence = {
    loadConfig: () => config,
    saveConfig: vi.fn((c) => Object.assign(config, c)),
    loadHistory: () => history,
    saveHistory: vi.fn((h) => {
      history = h
    }),
  }
  return { persistence, config, readHistory: () => history }
}

describe('AppState 状态中枢（§3.2 单向数据流）', () => {
  it('初始状态：selection=null、display=null、projecting=false（无 blank/lock 字段）', () => {
    const store = new AppStateStore(fakePersistence().persistence)
    expect(store.getState()).toEqual({
      selection: null,
      style: {
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
        lineHeight: 1.7,
        letterSpacing: 0,
        align: 'center',
        margin: 8,
      },
      display: null,
      projecting: false,
    })
    expect('blank' in store.getState()).toBe(false)
    expect('lock' in store.getState()).toBe(false)
  })

  it('select 动作更新 selection 并写入历史（最近 50 条）', () => {
    const { persistence, readHistory } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'select', selection })
    expect(store.getState().selection).toEqual(selection)
    expect(readHistory()).toHaveLength(1)
    for (let i = 0; i < 60; i++) {
      store.dispatch({ type: 'select', selection: { sn: 1, chapter: i + 1, verses: { from: 1, to: 1 } } })
    }
    expect(readHistory()).toHaveLength(50)
  })

  it('重复同一选择不新增历史条目', () => {
    const { persistence, readHistory } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'select', selection })
    store.dispatch({ type: 'select', selection })
    expect(readHistory()).toHaveLength(1)
  })

  it('style 动作合并补丁并持久化 config.json', () => {
    const { persistence, config } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'style', patch: { fontSize: 96 } })
    expect(store.getState().style.fontSize).toBe(96)
    expect(store.getState().style.theme).toBe('ink')
    expect(config.style).toEqual({
      theme: 'ink',
      fontSize: 96,
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
    })
  })

  it('display 指派持久化（存 display.id，不存 index）', () => {
    const { persistence, config } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'display', id: 101 })
    expect(store.getState().display).toBe(101)
    expect(config.display).toBe(101)
  })

  it('启动时从 userData 恢复样式与显示器指派', () => {
    const { persistence } = fakePersistence()
    persistence.loadConfig = () => ({ style: { theme: 'ivory', fontSize: 60 }, display: 7 })
    const store = new AppStateStore(persistence)
    expect(store.getState().style).toEqual({
      theme: 'ivory',
      fontSize: 60,
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
    })
    expect(store.getState().display).toBe(7)
  })

  it('订阅者收到每次状态变更（T7：projecting 取代 blank）', () => {
    const store = new AppStateStore(fakePersistence().persistence)
    const listener = vi.fn()
    store.subscribe(listener)
    const action: Action = { type: 'projecting', value: true }
    store.dispatch(action)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().projecting).toBe(true)
  })
})

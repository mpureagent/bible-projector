import { describe, expect, it, vi } from 'vitest'
import type { Selection } from '../src/shared/types'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'

// T3-history 状态层测试：连续同选择合并为最新（刷新 at）、重启后历史保留（store 重载模拟）

const gen11: Selection = { sn: 1, chapter: 1, verses: { from: 1, to: 1 } }
const gen12: Selection = { sn: 1, chapter: 1, verses: { from: 2, to: 2 } }

function fakePersistence() {
  let history: Array<{ selection: Selection; at: number }> = []
  const persistence: Persistence = {
    loadConfig: () => ({}),
    saveConfig: () => {},
    loadHistory: () => history,
    saveHistory: (h) => {
      history = [...h]
    },
  }
  return { persistence, readHistory: () => history }
}

describe('T3-history 历史去重与容量', () => {
  it('连续同书同范围选择合并为最新：不新增条目且 at 刷新为最新时间', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T08:00:00'))
    const { persistence, readHistory } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'select', selection: gen11 })
    vi.setSystemTime(new Date('2026-10-12T09:30:00'))
    store.dispatch({ type: 'select', selection: gen11 })
    expect(readHistory()).toHaveLength(1)
    expect(readHistory()[0]!.at).toBe(new Date('2026-10-12T09:30:00').getTime())
    vi.useRealTimers()
  })

  it('交替不同选择均保留（只有连续相同才合并）', () => {
    const { persistence, readHistory } = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'select', selection: gen11 })
    store.dispatch({ type: 'select', selection: gen12 })
    store.dispatch({ type: 'select', selection: gen11 })
    expect(readHistory()).toHaveLength(3)
  })
})

describe('T3-history 重启后历史保留（store 重载模拟）', () => {
  it('同一 persistence 上重建 AppStateStore，历史完整恢复', () => {
    const { persistence } = fakePersistence()
    const first = new AppStateStore(persistence)
    first.dispatch({ type: 'select', selection: gen11 })
    first.dispatch({ type: 'select', selection: gen12 })
    first.dispatch({ type: 'select', selection: { sn: 43, chapter: 3, verses: { from: 16, to: 16 } } })

    const reloaded = new AppStateStore(persistence)
    const history = reloaded.getHistory()
    expect(history).toHaveLength(3)
    expect(history[0]!.selection).toEqual({ sn: 43, chapter: 3, verses: { from: 16, to: 16 } })
    expect(reloaded.getHistory()[2]!.selection).toEqual(gen11)
  })

  it('容量 50 在重载后同样成立', () => {
    const { persistence } = fakePersistence()
    const first = new AppStateStore(persistence)
    for (let i = 0; i < 60; i++) {
      first.dispatch({ type: 'select', selection: { sn: 1, chapter: i + 1, verses: { from: 1, to: 1 } } })
    }
    const reloaded = new AppStateStore(persistence)
    expect(reloaded.getHistory()).toHaveLength(50)
  })
})

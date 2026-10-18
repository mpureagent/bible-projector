import { describe, expect, it } from 'vitest'
import { AppStateStore } from '../src/main/store'
import type { Persistence } from '../src/main/store'
import type { ProjectionStyle, Selection } from '../src/shared/types'

// T6-project：projecting 状态迁移——默认 false（本地阅读模式），按钮/P 键动作切换，
// 选经不影响投屏状态；projecting 为会话态不落盘

const fakePersistence = (): Persistence & { savedConfig: unknown; savedHistory: unknown[] } => {
  const self = {
    savedConfig: undefined as unknown,
    savedHistory: [] as unknown[],
    loadConfig: () => ({}) as { style?: Partial<ProjectionStyle>; display?: number | null },
    saveConfig: (config: unknown) => {
      self.savedConfig = config
    },
    loadHistory: () => [],
    saveHistory: (history: unknown[]) => {
      self.savedHistory = [...history]
    },
  }
  return self as unknown as Persistence & { savedConfig: unknown; savedHistory: unknown[] }
}

const sel = (from: number, to: number): Selection => ({ sn: 1, chapter: 1, verses: { from, to } })

describe('T6-project projecting 状态迁移', () => {
  it('初始 projecting=false（投影窗默认不接收选经广播）', () => {
    const store = new AppStateStore(fakePersistence())
    expect(store.getState().projecting).toBe(false)
  })

  it('projecting 动作切换 true/false，通知订阅者', () => {
    const store = new AppStateStore(fakePersistence())
    const seen: boolean[] = []
    store.subscribe((state) => seen.push(state.projecting))
    store.dispatch({ type: 'projecting', value: true })
    store.dispatch({ type: 'projecting', value: false })
    expect(store.getState().projecting).toBe(false)
    expect(seen).toEqual([true, false])
  })

  it('本地阅读模式选经不改变 projecting；历史照常入栈', () => {
    const persistence = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'select', selection: sel(1, 1) })
    expect(store.getState().projecting).toBe(false)
    expect(store.getHistory()).toHaveLength(1)
    expect(persistence.savedHistory).toHaveLength(1)
  })

  it('projecting 为会话态：不写配置盘（重启即回 false）', () => {
    const persistence = fakePersistence()
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'projecting', value: true })
    expect(persistence.savedConfig).toBeUndefined()
    const fresh = new AppStateStore(persistence)
    expect(fresh.getState().projecting).toBe(false)
  })
})

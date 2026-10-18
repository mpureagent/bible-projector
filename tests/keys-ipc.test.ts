import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createHotplugRules } from '../src/main/hotplug'
import { AppStateStore } from '../src/main/store'
import { IPC_CHANNELS, registerIpc } from '../src/main/ipc'
import type { IpcMainLike } from '../src/main/ipc'
import type { Persistence } from '../src/main/store'

// T7-projection（R1）：getDisplays（显示器下拉）与 projectionFullscreen（全屏手动切换）
// 通道整体删除；display 持久化保留（断开兜底参考）；热插拔规则键改选 ≤100ms 实测

const noopPersistence: Persistence = {
  loadConfig: () => ({}),
  saveConfig: () => {},
  loadHistory: () => [],
  saveHistory: () => {},
}

interface CapturedHandler {
  channel: string
  invoke: (payload: unknown) => unknown
}

function fakeIpcMain(): IpcMainLike & { handlers: CapturedHandler[] } {
  const handlers: CapturedHandler[] = []
  return {
    handlers,
    handle(channel, fn) {
      handlers.push({ channel, invoke: (payload) => fn({} as never, payload) })
    },
  }
}

describe('T7-projection IPC 通道裁撤（R1）', () => {
  it('getDisplays / projectionFullscreen 通道不再注册（显示器下拉与手动全屏不存在）', () => {
    const store = new AppStateStore(noopPersistence)
    const ipcMain = fakeIpcMain()
    registerIpc({ ipcMain, store, broadcast: () => {} })
    const channels = ipcMain.handlers.map((h) => h.channel)
    expect(channels.sort()).toEqual([
      IPC_CHANNELS.action,
      IPC_CHANNELS.getHistory,
      IPC_CHANNELS.getState,
    ])
  })

  it('IPC_CHANNELS 契约常量不含 getDisplays / projectionFullscreen 键', () => {
    expect('getDisplays' in IPC_CHANNELS).toBe(false)
    expect('projectionFullscreen' in IPC_CHANNELS).toBe(false)
    expect(Object.keys(IPC_CHANNELS).sort()).toEqual(['action', 'banner', 'getHistory', 'getState', 'scroll', 'state'])
  })

  it('display 指派持久化：dispatch display → config.json 落 id', () => {
    const saved: { display?: number | null } = {}
    const persistence: Persistence = {
      loadConfig: () => ({}),
      saveConfig: (c) => {
        saved.display = c.display
      },
      loadHistory: () => [],
      saveHistory: () => {},
    }
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'display', id: 202 })
    expect(store.getState().display).toBe(202)
    expect(saved.display).toBe(202)
  })
})

describe('T7-projection 热插拔规则响应 ≤100ms（×100 取中位数）', () => {
  it('display-removed/added 判定 + store dispatch 全链中位数 ≤100ms，实测数字进日志', () => {
    const store = new AppStateStore(noopPersistence)
    const rules = createHotplugRules(() => store.getState().display)
    store.dispatch({ type: 'display', id: 101 })
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now()
      const removed = rules.handle({ kind: 'display-removed', id: 101 })
      const added = rules.handle({ kind: 'display-added', id: 101 })
      store.dispatch({ type: 'display', id: 101 })
      samples.push(performance.now() - t0)
      expect(removed.map((e) => e.type)).toContain('fallback-to-primary')
      expect(added.map((e) => e.type)).toContain('move-to-display')
    }
    samples.sort((a, b) => a - b)
    const median = samples[49]!
    console.log(
      `[T7-projection] hotplug-rules median=${median.toFixed(4)}ms p95=${samples[94]!.toFixed(4)}ms (n=100, rules.handle ×2 + store.dispatch)`,
    )
    expect(median).toBeLessThanOrEqual(100)
    expect(store.getState().display).toBe(101)
  })
})

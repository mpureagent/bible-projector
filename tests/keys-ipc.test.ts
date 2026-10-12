import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createHotplugMachine } from '../src/main/hotplug'
import { AppStateStore } from '../src/main/store'
import { IPC_CHANNELS, registerIpc } from '../src/main/ipc'
import type { IpcMainLike } from '../src/main/ipc'
import type { Persistence } from '../src/main/store'
import type { DisplayInfo } from '../src/shared/types'

// T4-keys：新 IPC 通道（get-displays / projection-fullscreen）+ 状态机一键改选 ≤100ms 实测

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

describe('T4-keys IPC 新通道', () => {
  it('get-displays 返回显示器清单（id/label/primary）', () => {
    const store = new AppStateStore(noopPersistence)
    const ipcMain = fakeIpcMain()
    const displays: DisplayInfo[] = [{ id: 7, label: '1280×720', primary: true }]
    registerIpc({ ipcMain, store, broadcast: () => {}, getDisplays: () => displays, setProjectionFullscreen: () => {} })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.getDisplays)
    expect(handler).toBeTruthy()
    expect(handler!.invoke(undefined)).toEqual(displays)
  })

  it('projection-fullscreen 透传 fullscreen 目标值（undefined=切换）', () => {
    const store = new AppStateStore(noopPersistence)
    const ipcMain = fakeIpcMain()
    const calls: Array<boolean | undefined> = []
    registerIpc({
      ipcMain,
      store,
      broadcast: () => {},
      getDisplays: () => [],
      setProjectionFullscreen: (value) => {
        calls.push(value)
      },
    })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.projectionFullscreen)
    expect(handler).toBeTruthy()
    void handler!.invoke(undefined)
    void handler!.invoke({ value: true })
    void handler!.invoke({ value: false })
    expect(calls).toEqual([undefined, true, false])
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

describe('T4-keys 状态机一键改选 ≤100ms（×100 取中位数）', () => {
  it('assign 迁移 + store dispatch 全链中位数 ≤100ms，实测数字进日志', () => {
    const store = new AppStateStore(noopPersistence)
    const machine = createHotplugMachine(101, 'FALLBACK')
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now()
      const effects = machine.handle({ kind: 'assign', id: 101 })
      store.dispatch({ type: 'display', id: 101 })
      samples.push(performance.now() - t0)
      expect(effects.map((e) => e.type)).toContain('move-to-display')
    }
    samples.sort((a, b) => a - b)
    const median = samples[49]!
    console.log(
      `[T4-keys] display-assign median=${median.toFixed(4)}ms p95=${samples[94]!.toFixed(4)}ms (n=100, machine.handle + store.dispatch)`,
    )
    expect(median).toBeLessThanOrEqual(100)
    expect(machine.status).toBe('ASSIGNED')
    expect(store.getState().display).toBe(101)
  })
})

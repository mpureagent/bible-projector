import { describe, expect, it, vi } from 'vitest'
import type { Action, AppState } from '../src/shared/types'
import { AppStateStore } from '../src/main/store'
import { IPC_CHANNELS, registerIpc } from '../src/main/ipc'
import type { IpcMainLike } from '../src/main/ipc'
import type { Persistence } from '../src/main/store'
import { chapterVerses } from '../src/shared/bible'

// T3-cascade 链路断言：控制窗 action 序列 → AppState → 广播 payload（§6.1 主流程）
// 与 tests/ui 的组件测试互补：这里验证主进程侧真实 store/ipc 装配。

const noopPersistence: Persistence = {
  loadConfig: () => ({}),
  saveConfig: () => {},
  loadHistory: () => [],
  saveHistory: () => {},
}

function fakeIpcMain(): IpcMainLike & {
  handlers: Array<{ channel: string; invoke: (payload: unknown) => unknown }>
} {
  const handlers: Array<{ channel: string; invoke: (payload: unknown) => unknown }> = []
  return {
    handlers,
    handle(channel, fn) {
      handlers.push({ channel, invoke: (payload) => fn({} as never, payload) })
    },
  }
}

describe('T3-cascade 三次点击上屏链路（action → AppState → 广播 payload）', () => {
  it('点节（第三击）产生的 select action 经 IPC 后广播 payload 携带正确 Selection', () => {
    const store = new AppStateStore(noopPersistence)
    const broadcast = vi.fn()
    const ipcMain = fakeIpcMain()
    registerIpc({ ipcMain, store, broadcast, getDisplays: () => [], setProjectionFullscreen: () => {} })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.action)
    if (!handler) throw new Error('action handler 未注册')

    // 前两击（书/章）不产生 action；第三击点击创 1:1
    const action: Action = { type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } } }
    const result = handler.invoke(action) as AppState
    expect(broadcast).toHaveBeenCalledTimes(1)
    const [channel, payload] = broadcast.mock.calls[0]!
    expect(channel).toBe(IPC_CHANNELS.state)
    expect((payload as AppState).selection).toEqual(action.selection)
    expect(result.selection).toEqual(action.selection)
    expect(store.getState().selection).toEqual(action.selection)
  })

  it('连选扩展再上屏：第二个 select 动作广播新范围，且两轮广播 payload 依次演进', () => {
    const store = new AppStateStore(noopPersistence)
    const broadcast = vi.fn()
    const ipcMain = fakeIpcMain()
    registerIpc({ ipcMain, store, broadcast, getDisplays: () => [], setProjectionFullscreen: () => {} })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.action)!

    void handler.invoke({ type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 2, to: 2 } } })
    void handler.invoke({ type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 2, to: 5 } } })

    expect(broadcast).toHaveBeenCalledTimes(2)
    const payloads = broadcast.mock.calls.map((c) => (c[1] as AppState).selection)
    expect(payloads).toEqual([
      { sn: 1, chapter: 1, verses: { from: 2, to: 2 } },
      { sn: 1, chapter: 1, verses: { from: 2, to: 5 } },
    ])
    expect(store.getState().selection?.verses).toEqual({ from: 2, to: 5 })
  })

  it('广播 payload 中的经文可由数据层还原：创 1:1 文本无 U+3000', () => {
    const store = new AppStateStore(noopPersistence)
    const broadcast = vi.fn()
    const ipcMain = fakeIpcMain()
    registerIpc({ ipcMain, store, broadcast, getDisplays: () => [], setProjectionFullscreen: () => {} })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.action)!

    void handler.invoke({ type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } } })
    const payload = broadcast.mock.calls[0]![1] as AppState
    const sel = payload.selection!
    const text = chapterVerses(sel.sn, sel.chapter)[sel.verses.from - 1]
    expect(text).toBe('起初，神创造天地。')
    expect(text).not.toContain('　')
  })
})

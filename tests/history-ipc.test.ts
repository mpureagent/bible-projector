import { describe, expect, it } from 'vitest'
import { AppStateStore } from '../src/main/store'
import { IPC_CHANNELS, registerIpc } from '../src/main/ipc'
import type { IpcMainLike } from '../src/main/ipc'
import type { Persistence } from '../src/main/store'

// T3-history IPC：app:get-history 通道契约（控制窗历史 Tab 拉取数据）

const noopPersistence: Persistence = {
  loadConfig: () => ({}),
  saveConfig: () => {},
  loadHistory: () => [],
  saveHistory: () => {},
}

function fakeIpcMain(): IpcMainLike & {
  handlers: Array<{ channel: string; invoke: (payload?: unknown) => unknown }>
} {
  const handlers: Array<{ channel: string; invoke: (payload?: unknown) => unknown }> = []
  return {
    handlers,
    handle(channel, fn) {
      handlers.push({ channel, invoke: (payload) => fn({} as never, payload) })
    },
  }
}

describe('IPC app:get-history 通道', () => {
  it('通道注册于契约常量', () => {
    expect(IPC_CHANNELS.getHistory).toBe('app:get-history')
  })

  it('返回 store 历史（含 select 推入的条目），无选择时为空数组', () => {
    const store = new AppStateStore(noopPersistence)
    const ipcMain = fakeIpcMain()
    registerIpc({ ipcMain, store, broadcast: () => {}, getDisplays: () => [], setProjectionFullscreen: () => {} })
    const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.getHistory)
    if (!handler) throw new Error('get-history handler 未注册')

    expect(handler.invoke()).toEqual([])
    store.dispatch({ type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } } })
    const history = handler.invoke() as Array<{ selection: { sn: number } }>
    expect(history).toHaveLength(1)
    expect(history[0]!.selection.sn).toBe(1)
  })
})

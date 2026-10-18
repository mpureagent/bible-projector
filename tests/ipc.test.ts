import { describe, expect, it, vi } from 'vitest'
import type { Action, AppState } from '../src/shared/types'
import { AppStateStore } from '../src/main/store'
import { IPC_CHANNELS, registerIpc } from '../src/main/ipc'
import type { IpcMainLike } from '../src/main/ipc'
import type { Persistence } from '../src/main/store'

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

function setup() {
  const store = new AppStateStore(noopPersistence)
  const broadcast = vi.fn()
  const ipcMain = fakeIpcMain()
  registerIpc({ ipcMain, store, broadcast })
  const handler = ipcMain.handlers.find((h) => h.channel === IPC_CHANNELS.action)
  if (!handler) throw new Error('action handler 未注册')
  const invoke = (action: unknown) => handler.invoke(action)
  const states = () => broadcast.mock.calls.map((c) => c[1] as AppState)
  const channels = () => broadcast.mock.calls.map((c) => c[0] as string)
  return { store, broadcast, invoke, states, channels }
}

describe('IPC 通道契约（action → 状态 → 广播，mock 渲染端）', () => {
  it('action 通道注册于契约常量', () => {
    const { invoke } = setup()
    void invoke({ type: 'projecting', value: true })
  })

  it('select 动作：状态更新、广播携带新状态、返回值即状态', () => {
    const { invoke, broadcast, store, states, channels } = setup()
    const action: Action = {
      type: 'select',
      selection: { sn: 19, chapter: 23, verses: { from: 1, to: 1 } },
    }
    const result = invoke(action) as AppState
    expect(result.selection).toEqual(action.selection)
    expect(store.getState().selection).toEqual(action.selection)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(channels()).toEqual([IPC_CHANNELS.state])
    expect(states()).toEqual([result])
  })

  it('style/display/projecting 动作同样触发状态→广播', () => {
    const { invoke, broadcast, states } = setup()
    invoke({ type: 'style', patch: { fontSize: 100 } })
    invoke({ type: 'display', id: 42 })
    invoke({ type: 'projecting', value: true })
    expect(broadcast).toHaveBeenCalledTimes(3)
    const all = states()
    expect(all.at(-1)?.style.fontSize).toBe(100)
    expect(all.at(-1)?.display).toBe(42)
    expect(all.at(-1)?.projecting).toBe(true)
  })

  it('T7 R1：blank/lock 动作已被契约拒绝（功能不存在）', () => {
    const { invoke, broadcast } = setup()
    expect(() => invoke({ type: 'blank', value: true })).toThrow()
    expect(() => invoke({ type: 'lock', value: true })).toThrow()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('style 动作 §2.3 全字段补丁：广播 payload 字段级断言（T4-style）', () => {
    const { invoke, broadcast, states } = setup()
    const patch = {
      theme: 'ocean',
      fontSize: 108,
      mode: 'single',
      hideVerseNumbers: true,
      hideTitle: true,
      fontFamily: 'kai',
      color: '#A0A0A0',
      verseNumberColor: '#B0B0B0',
      currentColor: '#C0C0C0',
      background: '#101010',
      backgroundImage: 'builtin:rice-paper',
      lineHeight: 2.1,
      letterSpacing: 0.08,
      align: 'left',
      margin: 14,
    } as const
    invoke({ type: 'style', patch })
    expect(broadcast).toHaveBeenCalledTimes(1)
    const payload = states().at(-1)?.style
    expect(payload).toEqual(patch)
  })

  it('非法动作（未知 type）被通道契约拒绝', () => {
    const { invoke, broadcast } = setup()
    expect(() => invoke({ type: 'hack' })).toThrow()
    expect(() => invoke(null)).toThrow()
    expect(broadcast).not.toHaveBeenCalled()
  })
})

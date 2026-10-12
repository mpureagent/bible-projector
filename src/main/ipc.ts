import type { Action, AppState, DisplayInfo, HistoryEntry } from '../shared/types'
import { IPC_CHANNELS, isAction } from '../shared/types'

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, payload: unknown) => unknown): void
}

export interface StoreLike {
  dispatch(action: Action): Readonly<AppState>
  getState(): Readonly<AppState>
  getHistory(): readonly HistoryEntry[]
}

export interface IpcDeps {
  ipcMain: IpcMainLike
  store: StoreLike
  broadcast: (channel: string, payload: AppState) => void
  getDisplays(): DisplayInfo[]
  setProjectionFullscreen(value?: boolean): void
}

export function registerIpc(deps: IpcDeps): void {
  deps.ipcMain.handle(IPC_CHANNELS.action, (_event, payload) => {
    if (!isAction(payload)) {
      throw new Error(`非法 action：${JSON.stringify(payload)}`)
    }
    const next = deps.store.dispatch(payload)
    deps.broadcast(IPC_CHANNELS.state, next)
    return next
  })

  deps.ipcMain.handle(IPC_CHANNELS.getState, () => deps.store.getState())
  deps.ipcMain.handle(IPC_CHANNELS.getHistory, () => deps.store.getHistory())
  deps.ipcMain.handle(IPC_CHANNELS.getDisplays, () => deps.getDisplays())
  deps.ipcMain.handle(IPC_CHANNELS.projectionFullscreen, (_event, payload) => {
    const value = (payload as { value?: boolean } | undefined)?.value
    deps.setProjectionFullscreen(value)
  })
}

export { IPC_CHANNELS }

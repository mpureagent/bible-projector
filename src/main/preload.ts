import { contextBridge, ipcRenderer } from 'electron'
import type { Action, AppState } from '../shared/types'

// 沙箱化 preload 只允许 require('electron')，其余依赖一律内联（通道常量见 src/shared/types.ts）
const CH = {
  action: 'app:action',
  getState: 'app:get-state',
  getHistory: 'app:get-history',
  getDisplays: 'app:get-displays',
  projectionFullscreen: 'app:projection-fullscreen',
  state: 'app:state',
  banner: 'app:banner',
} as const

contextBridge.exposeInMainWorld('bridge', {
  dispatch: (action: Action) => ipcRenderer.invoke(CH.action, action),
  getState: () => ipcRenderer.invoke(CH.getState),
  getHistory: () => ipcRenderer.invoke(CH.getHistory),
  getDisplays: () => ipcRenderer.invoke(CH.getDisplays),
  setProjectionFullscreen: (value?: boolean) => ipcRenderer.invoke(CH.projectionFullscreen, { value }),
  onState: (callback: (state: AppState) => void) => {
    const listener = (_event: unknown, state: AppState) => callback(state)
    ipcRenderer.on(CH.state, listener)
    return () => {
      ipcRenderer.removeListener(CH.state, listener)
    }
  },
  onBanner: (callback: (banner: { text: string | null }) => void) => {
    const listener = (_event: unknown, banner: { text: string | null }) => callback(banner)
    ipcRenderer.on(CH.banner, listener)
    return () => {
      ipcRenderer.removeListener(CH.banner, listener)
    }
  },
})

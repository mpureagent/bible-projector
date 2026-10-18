import { contextBridge, ipcRenderer } from 'electron'
import type { Action, AppState, ScrollDirection } from '../shared/types'

// 沙箱化 preload 只允许 require('electron')，其余依赖一律内联（通道常量见 src/shared/types.ts）
const CH = {
  action: 'app:action',
  getState: 'app:get-state',
  getHistory: 'app:get-history',
  state: 'app:state',
  banner: 'app:banner',
  scroll: 'app:scroll',
} as const

contextBridge.exposeInMainWorld('bridge', {
  dispatch: (action: Action) => ipcRenderer.invoke(CH.action, action),
  getState: () => ipcRenderer.invoke(CH.getState),
  getHistory: () => ipcRenderer.invoke(CH.getHistory),
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
  // T7-flow（R4）：滚动副通道（瞬态，不入状态）
  sendScroll: (direction: ScrollDirection) => ipcRenderer.send(CH.scroll, direction),
  onScroll: (callback: (direction: ScrollDirection) => void) => {
    const listener = (_event: unknown, direction: ScrollDirection) => callback(direction)
    ipcRenderer.on(CH.scroll, listener)
    return () => {
      ipcRenderer.removeListener(CH.scroll, listener)
    }
  },
})

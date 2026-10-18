import { join } from 'node:path'
import { BrowserWindow, screen, type Display } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { HotplugEffect, HotplugMachine } from './hotplug'

// §3.2/§3.3：窗口创建、显示器枚举与指派、热插拔副作用落地（薄集成层，逻辑在 hotplug.ts）

const RENDERER_ROOT = join(__dirname, '..', 'renderer')
const PRELOAD = join(__dirname, 'preload.js')

export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    title: '圣言投屏 · 控制窗',
    backgroundColor: '#F7F4EE',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void win.loadFile(join(RENDERER_ROOT, 'control', 'index.html'))
  return win
}

export function createProjectionWindow(target: Display, smoke = false): BrowserWindow {
  // T6-project：废除无条件 fullscreen。单屏保护——系统唯一 display 时投影窗为普通
  // 窗口（1280×720、带边框标题「投影预览」、可关闭），禁止 fullscreen 吞屏
  const single = !smoke && isSingleDisplay()
  const win = new BrowserWindow({
    width: smoke ? 1000 : single ? 1280 : target.bounds.width,
    height: smoke ? 520 : single ? 720 : target.bounds.height,
    title: single ? '投影预览' : '圣言投屏 · 投影窗',
    backgroundColor: '#101418',
    fullscreen: !smoke && !single,
    frame: single,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (smoke) {
    win.setBounds({ x: 400, y: 150, width: 1000, height: 520 })
  } else if (single) {
    win.center()
  } else {
    win.setBounds(target.bounds)
  }
  void win.loadFile(join(RENDERER_ROOT, 'projection', 'index.html'))
  // 默认隐藏：可见性由 projecting 状态驱动（smoke 烟测路径仍直接展示供取证）
  if (smoke) win.once('ready-to-show', () => win.show())
  return win
}

export function isSingleDisplay(): boolean {
  return screen.getAllDisplays().length <= 1
}

// 投屏中才把 state 广播发给投影窗：本地阅读模式（projecting=false）选经不打扰投影
export function gateProjectionMessage(channel: string, payload: unknown): boolean {
  if (channel !== IPC_CHANNELS.state) return true
  return Boolean((payload as { projecting?: boolean } | undefined)?.projecting)
}

export function showProjectionWindow(win: BrowserWindow, target: Display): void {
  if (win.isDestroyed()) return
  if (isSingleDisplay()) {
    if (win.isFullScreen()) win.setFullScreen(false)
    win.setBounds({ width: 1280, height: 720 })
    win.center()
  } else {
    win.setBounds(target.bounds)
    if (!win.isFullScreen()) win.setFullScreen(true)
  }
  win.show()
}

export function hideProjectionWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.hide()
}

export function displayById(id: number | null): Display | undefined {
  if (id === null) return undefined
  return screen.getAllDisplays().find((d) => d.id === id)
}

export function moveProjectionTo(win: BrowserWindow, target: Display): void {
  if (win.isDestroyed()) return
  if (isSingleDisplay()) {
    // 单屏保护：热插拔/显示器切换回落主屏时也不进入 fullscreen
    if (win.isFullScreen()) win.setFullScreen(false)
    return
  }
  win.setBounds(target.bounds)
  win.setFullScreen(true)
}

export interface HotplugWiring {
  machine: HotplugMachine
  projection: BrowserWindow
  control: BrowserWindow
  persistDisplay(id: number): void
}

export function wireHotplug(wiring: HotplugWiring): void {
  const apply = (effects: HotplugEffect[]) => {
    for (const effect of effects) {
      if (effect.type === 'fallback-to-primary') {
        const primary = screen.getPrimaryDisplay()
        moveProjectionTo(wiring.projection, primary)
      } else if (effect.type === 'move-to-display') {
        const target = displayById(effect.id)
        if (target) {
          moveProjectionTo(wiring.projection, target)
          wiring.persistDisplay(effect.id)
        }
      } else if (effect.type === 'set-banner') {
        if (!wiring.control.isDestroyed()) {
          wiring.control.webContents.send(IPC_CHANNELS.banner, { text: effect.text })
        }
      }
    }
  }

  screen.on('display-removed', (_event, oldDisplay) => {
    apply(wiring.machine.handle({ kind: 'display-removed', id: oldDisplay.id }))
  })
  screen.on('display-added', (_event, newDisplay) => {
    apply(wiring.machine.handle({ kind: 'display-added', id: newDisplay.id }))
  })
}

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
  const win = new BrowserWindow({
    x: smoke ? 400 : target.bounds.x,
    y: smoke ? 150 : target.bounds.y,
    width: smoke ? 1000 : target.bounds.width,
    height: smoke ? 520 : target.bounds.height,
    title: '圣言投屏 · 投影窗',
    backgroundColor: '#101418',
    fullscreen: !smoke,
    frame: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void win.loadFile(join(RENDERER_ROOT, 'projection', 'index.html'))
  win.once('ready-to-show', () => win.show())
  return win
}

export function displayById(id: number | null): Display | undefined {
  if (id === null) return undefined
  return screen.getAllDisplays().find((d) => d.id === id)
}

export function moveProjectionTo(win: BrowserWindow, target: Display): void {
  if (win.isDestroyed()) return
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

import { join } from 'node:path'
import { BrowserWindow, screen, type Display } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { createHotplugRules, type HotplugEffect } from './hotplug'

// §3.2/§3.3：窗口创建、显示器枚举、热插拔副作用落地（薄集成层，逻辑在 hotplug.ts）。
// T7-projection（R1）：投影窗默认不创建——由 index.ts 在 projecting=true 时按需创建、
// false 时销毁；主屏永不劫持（工作窗可最小化，投影窗独立存活，show 不抢焦点）。

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

// T7-release：烟测投影窗尺寸可由 SMOKE_PROJ_RES=1920x1080 覆盖（主题效果图集需 1080p 实测渲染）
function smokeResolution(): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(process.env.SMOKE_PROJ_RES ?? '')
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1280, height: 720 }
}

export function createProjectionWindow(target: Display, smoke = false): BrowserWindow {
  // 单屏保护——系统唯一 display 时投影窗为普通窗口（1280×720、带边框标题「投影预览」、
  // 可关闭），禁止 fullscreen 吞屏；多屏全屏到目标显示器
  const single = !smoke && isSingleDisplay()
  const smokeRes = smokeResolution()
  const win = new BrowserWindow({
    width: smoke ? smokeRes.width : single ? 1280 : target.bounds.width,
    height: smoke ? smokeRes.height : single ? 720 : target.bounds.height,
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
    win.setBounds({ x: 0, y: 0, width: smokeRes.width, height: smokeRes.height })
  } else if (single) {
    win.center()
  } else {
    win.setBounds(target.bounds)
  }
  void win.loadFile(join(RENDERER_ROOT, 'projection', 'index.html'))
  // 烟测取证路径直接展示；正常路径 showInactive（不抢主屏焦点，R1）
  if (smoke) win.once('ready-to-show', () => win.show())
  return win
}

export function isSingleDisplay(): boolean {
  return screen.getAllDisplays().length <= 1
}

// 投屏中才把 state 广播发给投影窗：本地阅读模式（projecting=false）选经不打扰投影窗
export function gateProjectionMessage(channel: string, payload: unknown): boolean {
  if (channel !== IPC_CHANNELS.state) return true
  return Boolean((payload as { projecting?: boolean } | undefined)?.projecting)
}

export function showProjectionWindow(win: BrowserWindow, target: Display, smoke = false): void {
  if (win.isDestroyed()) return
  if (smoke) {
    // 烟测路径：保留 createProjectionWindow 设定的尺寸（SMOKE_PROJ_RES），不强制单屏尺寸
    win.showInactive()
    return
  }
  if (isSingleDisplay()) {
    if (win.isFullScreen()) win.setFullScreen(false)
    win.setBounds({ width: 1280, height: 720 })
    win.center()
  } else {
    win.setBounds(target.bounds)
    if (!win.isFullScreen()) win.setFullScreen(true)
  }
  // R1：主屏永不劫持——投影窗上屏不抢焦点
  win.showInactive()
}

// R1：取消投屏 = 投影窗销毁（不是隐藏）
export function destroyProjectionWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.destroy()
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
  getTargetId(): number | null
  getProjection(): BrowserWindow | null
  control: BrowserWindow
  persistDisplay(id: number): void
}

export function wireHotplug(wiring: HotplugWiring): void {
  const rules = createHotplugRules(wiring.getTargetId)
  const apply = (effects: HotplugEffect[]) => {
    for (const effect of effects) {
      const projection = wiring.getProjection()
      if (effect.type === 'fallback-to-primary') {
        if (projection && !projection.isDestroyed()) {
          moveProjectionTo(projection, screen.getPrimaryDisplay())
        }
      } else if (effect.type === 'move-to-display') {
        const target = displayById(effect.id)
        if (target && projection && !projection.isDestroyed()) {
          moveProjectionTo(projection, target)
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
    apply(rules.handle({ kind: 'display-removed', id: oldDisplay.id }))
  })
  screen.on('display-added', (_event, newDisplay) => {
    apply(rules.handle({ kind: 'display-added', id: newDisplay.id }))
  })
}

import { app, ipcMain, screen, type BrowserWindow } from 'electron'
import type { AppState } from '../shared/types'
import { registerIpc } from './ipc'
import { fsPersistence } from './persist-fs'
import { createHotplugMachine } from './hotplug'
import { AppStateStore } from './store'
import {
  createControlWindow,
  createProjectionWindow,
  displayById,
  moveProjectionTo,
  wireHotplug,
} from './windows'

// M1 入口：生命周期、单实例锁（§11 风险表）、状态中枢与双窗装配

const SMOKE_CAPTURE = process.env.SMOKE_CAPTURE === '1'

let control: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (control && !control.isDestroyed()) {
      if (control.isMinimized()) control.restore()
      control.focus()
    }
  })

  void app.whenReady().then(() => void start())

  app.on('window-all-closed', () => {
    app.quit()
  })
}

async function start(): Promise<void> {
  const store = new AppStateStore(fsPersistence(app.getPath('userData')))
  control = createControlWindow()

  const target = displayById(store.getState().display) ?? screen.getPrimaryDisplay()
  const machine = createHotplugMachine(target.id, 'ASSIGNED')
  const projection = createProjectionWindow(target, SMOKE_CAPTURE)

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of [control, projection]) {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  registerIpc({
    ipcMain,
    store,
    broadcast: (channel, payload) => broadcast(channel, payload),
  })

  wireHotplug({
    machine,
    projection,
    control,
    persistDisplay: (id) => {
      if (store.getState().display !== id) {
        store.dispatch({ type: 'display', id })
      }
    },
  })

  // 用户在顶栏改选显示器（IPC display 动作）→ 状态机 assign
  let lastDisplay = store.getState().display
  store.subscribe((state: AppState) => {
    if (state.display !== lastDisplay && state.display !== null) {
      lastDisplay = state.display
      for (const effect of machine.handle({ kind: 'assign', id: state.display })) {
        if (effect.type === 'move-to-display') {
          const target = displayById(effect.id)
          if (target) moveProjectionTo(projection, target)
        }
      }
    }
  })

  if (SMOKE_CAPTURE) {
    await captureSmokeEvidence(control, projection)
  }
}

async function captureSmokeEvidence(
  control: BrowserWindow,
  projection: BrowserWindow,
): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const outDir = join(__dirname, '..', '..', '.artifacts')
  const delayMs = Number(process.env.SMOKE_CAPTURE_DELAY ?? 1200)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  mkdirSync(outDir, { recursive: true })
  // E2E（§6.1 三次点击上屏）：SMOKE_SELECT=gen-1-1 时在控制窗 UI 上真实点击 创世记→1 章→1 节，
  // 经 IPC action → store → 广播 → 投影窗渲染，随后截图留证
  if (process.env.SMOKE_SELECT === 'gen-1-1') {
    await control.webContents.executeJavaScript(
      `(() => {
        const book = [...document.querySelectorAll('.book-btn')].find((b) => b.title === '创世记')
        book && book.click()
        const chapter = document.querySelector('.chapter-btn')
        chapter && chapter.click()
        const verse = [...document.querySelectorAll('.verse-btn')].find((b) => b.dataset.verse === '1')
        verse && verse.click()
        return true
      })()`,
    )
    const stageText: string = await projection.webContents.executeJavaScript(
      `document.getElementById('stage')?.innerText ?? ''`,
    )
    console.log(`[smoke] projection-stage=${JSON.stringify(stageText)}`)
    console.log(`[smoke] projection-has-U+3000=${stageText.includes('　')}`)
  }
  console.log(
    `[smoke] control=${control.webContents.getURL()} projection=${projection.webContents.getURL()}`,
  )
  for (const [name, win] of [
    ['xvfb-control', control],
    ['xvfb-projection', projection],
  ] as const) {
    const image = await win.webContents.capturePage()
    writeFileSync(join(outDir, `${name}.png`), image.toPNG())
  }
  // 保留窗口一段时间，供外部 X 级截图（ffmpeg x11grab）抓取根窗口双窗同框证据
  const holdMs = Number(process.env.SMOKE_HOLD_MS ?? 0)
  if (holdMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, holdMs))
  }
  app.quit()
}

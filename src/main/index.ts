import { app, ipcMain, screen, type BrowserWindow } from 'electron'
import type { AppState } from '../shared/types'
import { IPC_CHANNELS } from '../shared/types'
import { registerIpc } from './ipc'
import { fsPersistence } from './persist-fs'
import { createHotplugMachine } from './hotplug'
import { AppStateStore } from './store'
import {
  createControlWindow,
  createProjectionWindow,
  displayById,
  gateProjectionMessage,
  hideProjectionWindow,
  moveProjectionTo,
  showProjectionWindow,
  wireHotplug,
} from './windows'

// M1 入口：生命周期、单实例锁（§11 风险表）、状态中枢与双窗装配

const SMOKE_CAPTURE = process.env.SMOKE_CAPTURE === '1'

let control: BrowserWindow | null = null
let quitting = false

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

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

async function start(): Promise<void> {
  const store = new AppStateStore(fsPersistence(app.getPath('userData')))
  // 烟测路径视为始终投屏中：保持 E2E 点选→投影窗上屏的取证链路不变
  if (SMOKE_CAPTURE) store.dispatch({ type: 'projecting', value: true })
  control = createControlWindow()

  const target = displayById(store.getState().display) ?? screen.getPrimaryDisplay()
  const machine = createHotplugMachine(target.id, 'ASSIGNED')
  const projection = createProjectionWindow(target, SMOKE_CAPTURE)

  const listDisplays = () => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: `${d.size.width}×${d.size.height} @(${d.bounds.x},${d.bounds.y})`,
      primary: d.id === primary.id,
    }))
  }

  const setProjectionFullscreen = (value?: boolean): void => {
    if (projection.isDestroyed()) return
    projection.setFullScreen(value ?? !projection.isFullScreen())
  }

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of [control, projection]) {
      if (!win || win.isDestroyed()) continue
      if (win === projection && !gateProjectionMessage(channel, payload)) continue
      win.webContents.send(channel, payload)
    }
  }

  // 单屏预览窗点关闭 = 取消投屏（窗口隐藏而非销毁，P 键可再次唤起；退出期放行真关闭）
  projection.on('close', (event) => {
    if (quitting || projection.isDestroyed()) return
    event.preventDefault()
    if (store.getState().projecting) {
      const next = store.dispatch({ type: 'projecting', value: false })
      broadcast(IPC_CHANNELS.state, next)
    }
    projection.hide()
  })

  registerIpc({
    ipcMain,
    store,
    broadcast: (channel, payload) => broadcast(channel, payload),
    getDisplays: listDisplays,
    setProjectionFullscreen,
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

  // projecting 迁移：true→按当前显示器上屏（单屏为预览窗）并把当前选区推上投影窗；
  // false→隐藏投影窗。未投屏时选经广播已在 gateProjectionMessage 处被拦截
  const applyProjecting = (state: AppState): void => {
    if (projection.isDestroyed()) return
    if (state.projecting) {
      const target = displayById(state.display) ?? screen.getPrimaryDisplay()
      showProjectionWindow(projection, target)
    } else {
      hideProjectionWindow(projection)
    }
  }
  projection.webContents.once('did-finish-load', () => {
    const state = store.getState()
    if (state.projecting && !projection.isDestroyed()) {
      projection.webContents.send(IPC_CHANNELS.state, state)
    }
  })

  // 用户在顶栏改选显示器（IPC display 动作）→ 状态机 assign
  let lastDisplay = store.getState().display
  let lastProjecting = store.getState().projecting
  store.subscribe((state: AppState) => {
    if (state.projecting !== lastProjecting) {
      lastProjecting = state.projecting
      applyProjecting(state)
    }
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
    await captureSmokeEvidence(control, projection, setProjectionFullscreen)
  }
}

async function logStage(projection: BrowserWindow): Promise<void> {
  const stageText: string = await projection.webContents.executeJavaScript(
    `document.getElementById('stage')?.innerText ?? ''`,
  )
  console.log(`[smoke] projection-stage=${JSON.stringify(stageText)}`)
  console.log(`[smoke] projection-has-U+3000=${stageText.includes('　')}`)
  const bg: string = await projection.webContents.executeJavaScript(
    `getComputedStyle(document.getElementById('stage')).backgroundColor`,
  )
  console.log(`[smoke] projection-background=${bg}`)
}

async function captureSmokeEvidence(
  control: BrowserWindow,
  projection: BrowserWindow,
  setProjectionFullscreen: (value?: boolean) => void,
): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const outDir = join(__dirname, '..', '..', '.artifacts')
  const delayMs = Number(process.env.SMOKE_CAPTURE_DELAY ?? 1200)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  mkdirSync(outDir, { recursive: true })
  // E2E（§6.1 三次点击上屏）：SMOKE_SELECT=<key> 在控制窗 UI 上真实点击 书→章→节，
  // 经 IPC action → store → 广播 → 投影窗渲染，随后截图留证
  const SMOKE_SELECTS: Record<string, { book: string; chapter: number; verse: number }> = {
    'gen-1-1': { book: '创世记', chapter: 1, verse: 1 },
    'ps-119-1': { book: '诗篇', chapter: 119, verse: 1 },
  }
  const selectKey = process.env.SMOKE_SELECT
  if (selectKey && SMOKE_SELECTS[selectKey]) {
    const sel = SMOKE_SELECTS[selectKey]!
    await control.webContents.executeJavaScript(
      `(() => {
        const book = [...document.querySelectorAll('.book-btn')].find((b) => b.title === ${JSON.stringify(sel.book)})
        book && book.click()
        const chapter = [...document.querySelectorAll('.chapter-btn')].find((b) => b.textContent === ${JSON.stringify(String(sel.chapter))})
        chapter && chapter.click()
        const verse = [...document.querySelectorAll('.verse-btn')].find((b) => b.dataset.verse === ${JSON.stringify(String(sel.verse))})
        verse && verse.click()
        return true
      })()`,
    )
    await logStage(projection)
  }
  // T4 E2E：SMOKE_STYLE=key:value,key:value 经控制窗 bridge 真实 dispatch 样式补丁
  if (process.env.SMOKE_STYLE) {
    const patch: Record<string, unknown> = {}
    for (const pair of process.env.SMOKE_STYLE.split(',')) {
      const [key, value] = pair.split(':')
      if (!key || value === undefined) continue
      patch[key] = value === 'true' ? true : value === 'false' ? false : Number.isNaN(Number(value)) ? value : Number(value)
    }
    await control.webContents.executeJavaScript(
      `window.bridge.dispatch({ type: 'style', patch: ${JSON.stringify(patch)} }).then(() => true)`,
    )
    await new Promise((resolve) => setTimeout(resolve, 400))
    await logStage(projection)
  }
  // T3-history E2E：切历史 Tab → 渲染列表 → 点击首条回跳上屏
  if (process.env.SMOKE_HISTORY === '1') {
    const historyText: string = await control.webContents.executeJavaScript(
      `(() => {
        const tabs = [...document.querySelectorAll('.tab-btn')]
        tabs.find((t) => t.textContent === '历史') && tabs.find((t) => t.textContent === '历史').click()
        const list = document.querySelector('.history-list')
        const first = list && list.querySelector('.history-item')
        first && first.click()
        return (list && list.innerText) || ''
      })()`,
    )
    console.log(`[smoke] history-list=${JSON.stringify(historyText)}`)
  }
  // T4-font E2E：投影窗 @font-face 注入后子集宋体真实可用（document.fonts.check 实测）
  const fontLoaded: boolean = await projection.webContents.executeJavaScript(
    `document.fonts.ready.then(() => document.fonts.check('16px "Bible Serif SC"'))`,
  )
  console.log(`[smoke] subset-font-loaded=${fontLoaded}`)
  // T4-keys E2E：控制窗真实派发 keydown（B/B/+/↓/L/B/L——锁屏下 B 应被拦截），
  // 终态断据：blank=false（第 3 次 B 被锁屏拦截）、fontSize +12、selection 翻到下一节
  if (process.env.SMOKE_KEYS === '1') {
    const before: AppState = await control.webContents.executeJavaScript('window.bridge.getState()')
    const after: AppState = await control.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        // 逐键等待广播回流，模拟真实节奏（同步连发会读到陈旧本地状态）
        const press = async (key) => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
          await wait(150)
        }
        await press('b'); await press('b'); await press('+'); await press('ArrowDown')
        await press('l'); await press('b'); await press('l')
        await wait(300)
        return window.bridge.getState()
      })()`,
    )
    console.log(`[smoke] keys-before=${JSON.stringify({ blank: before.blank, lock: before.lock, fontSize: before.style.fontSize, sel: before.selection })}`)
    console.log(`[smoke] keys-after=${JSON.stringify({ blank: after.blank, lock: after.lock, fontSize: after.style.fontSize, sel: after.selection })}`)
    // 投影全屏切换（F/Esc 窗口级接线）：真实 setFullScreen + 回落
    setProjectionFullscreen(true)
    const fsOn: boolean = projection.isFullScreen()
    setProjectionFullscreen(false)
    console.log(`[smoke] projection-fullscreen-toggle=${fsOn}->${projection.isFullScreen()}`)
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

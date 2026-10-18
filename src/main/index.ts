import { app, ipcMain, screen, type BrowserWindow } from 'electron'
import type { AppState } from '../shared/types'
import { IPC_CHANNELS } from '../shared/types'
import { registerIpc } from './ipc'
import { fsPersistence } from './persist-fs'
import { AppStateStore } from './store'
import { migrateLegacyUserData, userDataDir } from './userdata'
import {
  createControlWindow,
  createProjectionWindow,
  destroyProjectionWindow,
  displayById,
  gateProjectionMessage,
  isSingleDisplay,
  showProjectionWindow,
  wireHotplug,
} from './windows'

// M1 入口：生命周期、单实例锁（§11 风险表）、状态中枢与双窗装配。
// T7-projection（R1）：投影窗默认不创建；「投屏」→ 创建并上屏，「取消投屏」→ 销毁。
// 主屏永不劫持：工作窗可最小化，投影窗独立存活，show 不抢焦点。

const SMOKE_CAPTURE = process.env.SMOKE_CAPTURE === '1'
// T7-release E2E：SMOKE_NO_PROJECT=1 → 不强制投屏（取证「投屏前单屏无劫持」）；
// SMOKE_CASCADE=1 → 打开四列级联弹窗取证
const SMOKE_NO_PROJECT = process.env.SMOKE_NO_PROJECT === '1'

// T7-package（R7b）：userData 钉到 %APPDATA%\圣言投屏；须在任何 userData 访问前设置。
// 迁移须在 Chromium 初始化 profile 目录之前执行（否则新目录已非空 → 迁移跳过的窗口期），
// 故放在模块加载期、ready 之前；失败不崩（migrateLegacyUserData 内部兜底+告警）。
const APP_DATA_DIR = app.getPath('appData')
app.setPath('userData', userDataDir(APP_DATA_DIR))
migrateLegacyUserData(APP_DATA_DIR)

let control: BrowserWindow | null = null
let projection: BrowserWindow | null = null
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
  // 烟测路径视为始终投屏中：保持 E2E 点选→投影窗上屏的取证链路不变（SMOKE_NO_PROJECT 除外）
  if (SMOKE_CAPTURE && !SMOKE_NO_PROJECT) store.dispatch({ type: 'projecting', value: true })
  control = createControlWindow()

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of [control, projection]) {
      if (!win || win.isDestroyed()) continue
      if (win === projection && !gateProjectionMessage(channel, payload)) continue
      win.webContents.send(channel, payload)
    }
  }

  registerIpc({
    ipcMain,
    store,
    broadcast: (channel, payload) => broadcast(channel, payload),
  })

  // T7-flow（R4）：控制窗 PgUp/PgDn 副通道 → 投影窗纵向滚动一屏（瞬态，不入状态）
  ipcMain.on(IPC_CHANNELS.scroll, (_event, direction) => {
    if ((direction === 'up' || direction === 'down') && projection && !projection.isDestroyed()) {
      projection.webContents.send(IPC_CHANNELS.scroll, direction)
    }
  })

  wireHotplug({
    getTargetId: () => store.getState().display,
    getProjection: () => projection,
    control,
    persistDisplay: (id) => {
      if (store.getState().display !== id) {
        store.dispatch({ type: 'display', id })
      }
    },
  })

  // 投屏生命周期：true → 按需创建投影窗并上屏（多屏自动全屏第二屏/单屏本机浮动窗），
  // 首帧加载完成后推送当前状态；false → 销毁投影窗。取消投屏 = 窗口销毁（R1）
  const applyProjecting = (state: AppState): void => {
    if (state.projecting) {
      if (projection && !projection.isDestroyed()) {
        const target = displayById(state.display) ?? screen.getPrimaryDisplay()
        showProjectionWindow(projection, target, SMOKE_CAPTURE)
        return
      }
      const target = displayById(state.display) ?? screen.getPrimaryDisplay()
      // 烟测取证路径以 smoke=true 建窗（尺寸可控 SMOKE_PROJ_RES，便于 1080p 效果图集）
      const win = createProjectionWindow(target, SMOKE_CAPTURE)
      projection = win
      win.on('closed', () => {
        if (projection === win) projection = null
      })
      // 用户点单屏浮动窗的 ✕：等价取消投屏
      win.on('close', (event) => {
        if (quitting || win.isDestroyed()) return
        event.preventDefault()
        if (store.getState().projecting) {
          const next = store.dispatch({ type: 'projecting', value: false })
          broadcast(IPC_CHANNELS.state, next)
        } else {
          destroyProjectionWindow(win)
        }
      })
      // 单屏本机浮动窗：顶栏一行提示（电视请用 Win+P 扩展模式）；效果图集取证可经 SMOKE_NO_HINT 抑制
      if (isSingleDisplay() && process.env.SMOKE_NO_HINT !== '1') {
        void win.webContents.once('did-finish-load', () => {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.banner, { text: '电视请用 Win+P 扩展模式' })
          }
        })
      }
      win.webContents.once('did-finish-load', () => {
        const current = store.getState()
        if (current.projecting && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.state, current)
        }
      })
      showProjectionWindow(win, target, SMOKE_CAPTURE)
    } else {
      if (projection && !projection.isDestroyed()) {
        destroyProjectionWindow(projection)
      }
      projection = null
    }
  }

  let lastProjecting = store.getState().projecting
  store.subscribe((state: AppState) => {
    if (state.projecting !== lastProjecting) {
      lastProjecting = state.projecting
      applyProjecting(state)
    }
  })

  // 烟测路径需要投影窗在场：直接进入投屏生命周期（SMOKE_NO_PROJECT 则不创建投影窗）
  if (SMOKE_CAPTURE) {
    if (!SMOKE_NO_PROJECT) applyProjecting(store.getState())
    await captureSmokeEvidence(control, projection)
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
  projection: BrowserWindow | null,
): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const outDir = join(__dirname, '..', '..', '.artifacts')
  const delayMs = Number(process.env.SMOKE_CAPTURE_DELAY ?? 1200)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  mkdirSync(outDir, { recursive: true })
  // E2E：SMOKE_SELECT=<key> 在控制窗 UI 上真实走 T7 级联选经（书 → 章 → 起始节 → 结束节），
  // 经 IPC action → store → 广播 → 投影窗渲染，随后截图留证
  const SMOKE_SELECTS: Record<string, { book: string; chapter: number; from: number; to: number }> = {
    'gen-1-1': { book: '创世记', chapter: 1, from: 1, to: 1 },
    'ps-119-1': { book: '诗篇', chapter: 119, from: 1, to: 1 },
    'jn-3-16': { book: '约翰福音', chapter: 3, from: 16, to: 17 },
    'ps-23-1': { book: '诗篇', chapter: 23, from: 1, to: 3 },
  }
  const selectKey = process.env.SMOKE_SELECT
  if (selectKey && SMOKE_SELECTS[selectKey]) {
    const sel = SMOKE_SELECTS[selectKey]!
    await control.webContents.executeJavaScript(
      `(() => {
        // 用搜索框定位书卷（旧/新约 Tab 只渲染当前约，直接点 .book-btn 可能不在 DOM）
        const input = document.querySelector('.search-input')
        input.value = ${JSON.stringify(sel.book)}
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const item = [...document.querySelectorAll('.search-item')].find((b) => b.dataset.name === ${JSON.stringify(sel.book)})
        item && item.click()
        const dlg = document.querySelector('.cascade-dialog')
        const chapter = dlg && [...dlg.querySelectorAll('.cascade-chapter')].find((b) => b.textContent === ${JSON.stringify(String(sel.chapter))})
        chapter && chapter.click()
        const from = dlg && [...dlg.querySelectorAll('.cascade-verse[data-kind="from"]')].find((b) => b.textContent === ${JSON.stringify(String(sel.from))})
        from && from.click()
        const to = dlg && [...dlg.querySelectorAll('.cascade-verse[data-kind="to"]')].find((b) => b.textContent === ${JSON.stringify(String(sel.to))})
        to && to.click()
        return Boolean(to)
      })()`,
    )
    if (projection) await logStage(projection)
    const ctrlState: AppState = await control.webContents.executeJavaScript('window.bridge.getState()')
    const ctrlLabel: string = await control.webContents.executeJavaScript(
      `document.getElementById('btn-selection')?.textContent ?? ''`,
    )
    console.log(`[smoke] control-after-select label=${JSON.stringify(ctrlLabel)} sel=${JSON.stringify(ctrlState.selection)}`)
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
    if (projection) await logStage(projection)
  }
  // T7-release E2E：SMOKE_CASCADE=1 → 打开四列级联弹窗取证
  if (process.env.SMOKE_CASCADE === '1') {
    await control.webContents.executeJavaScript(
      `(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); document.querySelector('.book-btn')?.click(); await w(400); return true })()`,
    )
  }
  // T7-style E2E：打开样式抽屉（⚙）供截图取证
  if (process.env.SMOKE_DRAWER === '1') {
    await control.webContents.executeJavaScript(
      `(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('btn-style')?.click(); await w(300); return true })()`,
    )
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
  if (projection) {
    const fontLoaded: boolean = await projection.webContents.executeJavaScript(
      `document.fonts.ready.then(() => document.fonts.check('16px "Bible Serif SC"'))`,
    )
    console.log(`[smoke] subset-font-loaded=${fontLoaded}`)
  }
  // T7 E2E：控制窗真实派发 keydown（P/+ /↓）——投屏开合与字号/翻节，终态断据
  if (process.env.SMOKE_KEYS === '1') {
    const before: AppState = await control.webContents.executeJavaScript('window.bridge.getState()')
    const after: AppState = await control.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        const press = async (key) => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
          await wait(150)
        }
        await press('+'); await press('ArrowDown')
        await wait(300)
        return window.bridge.getState()
      })()`,
    )
    console.log(`[smoke] keys-before=${JSON.stringify({ projecting: before.projecting, fontSize: before.style.fontSize, sel: before.selection })}`)
    console.log(`[smoke] keys-after=${JSON.stringify({ projecting: after.projecting, fontSize: after.style.fontSize, sel: after.selection })}`)
  }
  console.log(
    `[smoke] control=${control.webContents.getURL()} projection=${projection?.webContents.getURL() ?? '（未投屏）'}`,
  )
  const shots: Array<[string, BrowserWindow]> = [['xvfb-control', control]]
  if (projection) shots.push(['xvfb-projection', projection])
  for (const [name, win] of shots) {
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

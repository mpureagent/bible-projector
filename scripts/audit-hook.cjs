// T5-audit：主进程注入 hook（NODE_OPTIONS=--require 加载，零业务代码改动）。
// --require 阶段 electron 绑定尚未注册，故拦截 Module._load 等主入口首次
// 真正 require('electron') 时再装配（届时 app 对象已存在）。
// 职责：session.webRequest 全量请求按协议计数、冷启动计时、CSP 违规控制台捕获、
// E2E 关键路径驱动（选经/切主题/黑场）、投影窗子集字体可用性回读。
const Module = require('node:module')

const START_MS = Date.now()
const RUN = process.env.AUDIT_RUN ?? '1'
const DRIVE = process.env.AUDIT_DRIVE === '1'
const STEADY_MS = Number(process.env.AUDIT_STEADY_MS ?? 9000)

const counters = { total: 0, external: 0, file: 0, devtools: 0, other: 0 }
const externalUrls = []
const cspViolations = []
let coldStartMs = null
let finished = false
let BrowserWindow = null // install() 时从 electron 绑定注入

function emitReport(reason) {
  if (finished) return
  finished = true
  console.log(
    `[audit] report=${JSON.stringify({ run: RUN, reason, counters, externalUrls, cspViolations, coldStartMs })}`,
  )
}

function install(electron) {
  const { app, session } = electron
  BrowserWindow = electron.BrowserWindow

  app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      counters.total++
      const url = details.url
      if (url.startsWith('file://')) counters.file++
      else if (url.startsWith('devtools://') || url.startsWith('devtools:')) counters.devtools++
      else if (url.startsWith('http://') || url.startsWith('https://')) {
        counters.external++
        externalUrls.push(url)
      } else counters.other++
      callback({})
    })

    app.on('browser-window-created', (_e, win) => {
      win.webContents.on('console-message', (_e, _level, message) => {
        if (/Content Security Policy|Refused to/i.test(message)) cspViolations.push(message)
      })
      win.webContents.once('did-finish-load', () => {
        if (coldStartMs === null) {
          // 首个完成加载的窗口=控制窗（创建顺序在前），即"主窗可交互"
          coldStartMs = Date.now() - START_MS
          console.log(`[audit] cold-start-run=${RUN} main-window-interactive-ms=${coldStartMs}`)
        }
      })
    })

    // 看门狗：任何路径下都保证本进程退出，审计永不挂起
    setTimeout(() => quitSoon('watchdog'), 60000)

    if (DRIVE) {
      let started = false
      let tries = 0
      const timer = setInterval(() => {
        tries++
        const control = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('控制窗'))
        const probe = control && !control.isDestroyed()
          ? control.webContents.executeJavaScript('!!window.bridge && !!window.bridge.getState').catch(() => false)
          : Promise.resolve(false)
        void probe.then((ok) => {
          if (started) return
          if (ok) {
            started = true
            clearInterval(timer)
            void drive(control).then(() => quitSoon('driven'), (err) => quitSoon(`drive-error:${err}`))
          } else if (tries > 80) {
            started = true
            clearInterval(timer)
            quitSoon('bridge-timeout')
          }
        })
      }, 300)
    } else {
      // 非驱动轮：稳态采样窗口后退出
      setTimeout(() => quitSoon('steady-state-sampled'), STEADY_MS)
    }
  })

  function quitSoon(reason) {
    emitReport(reason)
    setTimeout(() => app.quit(), 200)
  }

  app.on('will-quit', () => emitReport('will-quit'))
}

async function drive(control) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  // 1) 选经：创世记 1:1（控制窗 UI 真实点击，经 IPC→store→广播→投影渲染）
  await control.webContents.executeJavaScript(
    `(() => {
      const book = [...document.querySelectorAll('.book-btn')].find((b) => b.title === '创世记')
      book && book.click()
      const chapter = [...document.querySelectorAll('.chapter-btn')].find((b) => b.textContent === '1')
      chapter && chapter.click()
      const verse = [...document.querySelectorAll('.verse-btn')].find((b) => b.dataset.verse === '1')
      verse && verse.click()
      return true
    })()`,
  )
  await wait(800)
  // 2) 切预设主题：米白（style-view 预设按钮真实点击）
  await control.webContents.executeJavaScript(
    `(() => { const btn = document.querySelector('[data-theme="ivory"]'); btn && btn.click(); return !!btn })()`,
  )
  await wait(800)
  // 3) 黑场开→关（bridge action 真实 dispatch）
  const state = await control.webContents.executeJavaScript(
    `(async () => {
      await window.bridge.dispatch({ type: 'blank', value: true })
      await new Promise((r) => setTimeout(r, 300))
      const blankOn = (await window.bridge.getState()).blank
      await window.bridge.dispatch({ type: 'blank', value: false })
      await new Promise((r) => setTimeout(r, 300))
      const after = await window.bridge.getState()
      return { blankOn, blankAfter: after.blank, selection: after.selection }
    })()`,
  )
  console.log(`[audit] e2e-state=${JSON.stringify(state)}`)
  // 4) 投影窗子集字体 + 舞台（离线资源真实可用佐证；5s 超时防挂）
  const projection = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('投影窗'))
  if (projection && !projection.isDestroyed()) {
    const probe = await Promise.race([
      projection.webContents.executeJavaScript(
        `document.fonts.ready.then(() => ({
          font: document.fonts.check('16px "Bible Serif SC"'),
          stage: document.getElementById('stage')?.innerText ?? '',
          background: getComputedStyle(document.getElementById('stage')).backgroundColor,
        }))`,
      ),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 5000)),
    ])
    console.log(`[audit] projection-probe=${JSON.stringify(probe)}`)
  }
}

const origLoad = Module._load
let installed = false
Module._load = function patchedLoad(request, parent, isMain) {
  const exports = origLoad.call(this, request, parent, isMain)
  if (request === 'electron' && !installed && exports && typeof exports.app === 'object') {
    installed = true
    install(exports)
  }
  return exports
}

process.on('exit', () => emitReport('exit'))

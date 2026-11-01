import type { AppState, BridgeApi } from '../shared/types'
import { createWebBridge } from '../web/bridge-client'

// W1：控制窗 Web 引导——先安装 window.bridge 与宿主能力，再加载共享 main.ts。
// 投屏：同步（用户手势内）window.open('/projection/')，已开则聚焦；关闭后自动回同步状态。

window.hostCapabilities = { customBackgroundImage: false }
const bridge = createWebBridge()
window.bridge = bridge
installProjectionLauncher(bridge)

function installProjectionLauncher(bridgeApi: BridgeApi): void {
  let current: AppState | null = null
  let ready = false
  let projectionWindow: Window | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let popupBlocked = false

  const showBanner = (text: string | null): void => {
    const el = document.getElementById('banner')
    if (!el) return
    el.textContent = text ?? ''
    el.classList.toggle('visible', text !== null && text !== '')
  }

  const stopPolling = (): void => {
    if (poll !== null) {
      clearInterval(poll)
      poll = null
    }
  }

  const closeProjection = (): void => {
    stopPolling()
    const win = projectionWindow
    projectionWindow = null
    if (win && !win.closed) win.close()
  }

  const watchClosed = (win: Window): void => {
    stopPolling()
    poll = setInterval(() => {
      if (!win.closed) return
      stopPolling()
      if (projectionWindow !== win) return
      projectionWindow = null
      // 用户关闭投影页 = 取消投屏，按钮回同步（验收 8：再次点击可重新打开）
      if (current?.projecting) void bridgeApi.dispatch({ type: 'projecting', value: false })
    }, 300)
  }

  const openProjection = (fromGesture: boolean): void => {
    if (projectionWindow && !projectionWindow.closed) {
      projectionWindow.focus()
      return
    }
    if (!fromGesture && popupBlocked) return
    const win = window.open('/projection/', 'shengyan-projection')
    if (!win) {
      popupBlocked = true
      showBanner('浏览器拦截了投影弹窗，请允许本站弹窗后重试')
      return
    }
    popupBlocked = false
    showBanner(null)
    projectionWindow = win
    win.focus()
    watchClosed(win)
  }

  const reconcile = (state: AppState): void => {
    current = state
    if (!ready) {
      // 首屏状态只做同步，不自动弹窗
      ready = true
      return
    }
    if (state.projecting) openProjection(false)
    else closeProjection()
  }

  bridgeApi.onState(reconcile)
  void bridgeApi.getState().then(reconcile).catch(() => {})

  // 捕获阶段同步开/关，保留用户手势，避免异步 SSE 回调里 window.open 被拦截。
  // 已开时再点 = 聚焦复用（不重复开）；关闭投影页后按钮会回同步，再点即重开。
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('#btn-project')) return
      if (!current?.projecting) {
        openProjection(true)
        return
      }
      if (projectionWindow && !projectionWindow.closed) {
        event.preventDefault()
        event.stopImmediatePropagation()
        projectionWindow.focus()
        return
      }
      // 状态仍为投屏中但窗口已消失（关闭检测尚未落地的极短窗口）：直接重开
      event.preventDefault()
      event.stopImmediatePropagation()
      closeProjection()
      openProjection(true)
    },
    true,
  )

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'p' && event.key !== 'P') return
      const target = event.target
      if (target instanceof Element && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if (!current?.projecting) openProjection(true)
    },
    true,
  )
}
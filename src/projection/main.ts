import type { AppState } from '../shared/types'
import { applyFontStack } from '../shared/font-dom'
import { renderProjection } from './render'

applyFontStack(document)
window.bridge.onState(render)
void window.bridge.getState().then(render)

// T6-project：投影窗内 Esc = 取消投屏（单屏预览窗可关闭之外的第二条退出路径，确保永远可退出）
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    void window.bridge.dispatch({ type: 'projecting', value: false })
  }
})

// T7-projection（R1）：单屏本机浮动窗的顶栏提示（主进程 banner 推送，多屏全屏不提示）
window.bridge.onBanner(({ text }) => {
  const hint = document.getElementById('hint')
  if (hint) hint.style.display = text ? 'block' : 'none'
})

function render(state: AppState): void {
  const root = document.getElementById('stage')
  if (root) renderProjection(root, state, { width: window.innerWidth, height: window.innerHeight })
  const meta = document.getElementById('meta')
  if (meta) {
    meta.textContent = `主题 ${state.style.theme} · 字号 ${state.style.fontSize}`
  }
}

export {}

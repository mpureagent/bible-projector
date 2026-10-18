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

function render(state: AppState): void {
  const root = document.getElementById('stage')
  if (root) renderProjection(root, state, { width: window.innerWidth, height: window.innerHeight })
  const meta = document.getElementById('meta')
  if (meta) {
    meta.textContent = `主题 ${state.style.theme} · 字号 ${state.style.fontSize} · 黑场 ${state.blank ? '开' : '关'} · 锁定 ${state.lock ? '开' : '关'} · 显示器 ${state.display ?? '主屏'}`
  }
}

export {}

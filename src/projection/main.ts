import type { AppState } from '../shared/types'
import { renderProjection } from './render'

window.bridge.onState(render)
void window.bridge.getState().then(render)

function render(state: AppState): void {
  const root = document.getElementById('stage')
  if (root) renderProjection(root, state)
  const meta = document.getElementById('meta')
  if (meta) {
    meta.textContent = `主题 ${state.style.theme} · 字号 ${state.style.fontSize} · 黑场 ${state.blank ? '开' : '关'} · 锁定 ${state.lock ? '开' : '关'} · 显示器 ${state.display ?? '主屏'}`
  }
}

export {}

import type { AppState, ProjectionStyle } from '../shared/types'

// §7.2 预设主题 token（M3 将扩展为完整样式面板）
const THEMES: Record<ProjectionStyle['theme'], { background: string; color: string }> = {
  ink: { background: '#101418', color: '#E8C87A' },
  ivory: { background: '#F5F1E8', color: '#2A2622' },
  ocean: { background: '#0E1B2A', color: '#F0E6D2' },
}

window.bridge.onState(render)
void window.bridge.getState().then(render)

function render(state: AppState): void {
  const theme = THEMES[state.style.theme]
  document.body.style.background = theme.background
  document.body.style.color = theme.color
  const verse = document.getElementById('verse')
  if (verse) {
    verse.style.fontSize = `${state.style.fontSize}px`
    verse.textContent = state.selection
      ? `卷 ${state.selection.sn} · ${state.selection.chapter}章 ${state.selection.verses.from}-${state.selection.verses.to} 节`
      : '圣言投屏（M1 骨架）'
  }
  const meta = document.getElementById('meta')
  if (meta) {
    meta.textContent = `主题 ${state.style.theme} · 字号 ${state.style.fontSize} · 黑场 ${state.blank ? '开' : '关'} · 锁定 ${state.lock ? '开' : '关'} · 显示器 ${state.display ?? '主屏'}`
  }
  const overlay = document.getElementById('blank-overlay')
  if (overlay) overlay.style.display = state.blank ? 'block' : 'none'
}

export {}

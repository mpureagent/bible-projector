import type { AppState } from '../shared/types'
import { applyFontStack } from '../shared/font-dom'
import { renderProjection } from './render'
import { ScrollController } from './scroll'

applyFontStack(document)
window.bridge.onState(render)
void window.bridge.getState().then(render)

// T4-layout/T7-flow：投影窗滚动控制器（拖动惯性 / 一屏 / 进度条 / 高亮跟随）
const stage = document.getElementById('stage')!
const scrollbar = document.getElementById('scrollbar')
const controller = new ScrollController(stage, scrollbar, {
  screenHeight: () => window.innerHeight,
})

// T6/T7：投影窗内 Esc = 取消投屏（第二条退出路径，确保永远可退出）
// R4：PgUp/PgDn=滚动一屏；↑↓=移动当前节高亮（投影窗内直接生效，与控制窗同源语义）
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    void window.bridge.dispatch({ type: 'projecting', value: false })
    return
  }
  if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault()
    controller.scrollByScreen(event.key === 'PageDown' ? 'down' : 'up')
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void window.bridge.getState().then((state) => {
      const sel = state.selection
      if (!sel) return
      const verse = event.key === 'ArrowDown' ? sel.verses.from + 1 : sel.verses.from - 1
      void window.bridge.dispatch({ type: 'select', selection: { ...sel, verses: { from: verse, to: verse } } })
    })
  }
})

// 控制窗 PgUp/PgDn 副通道：主进程转发 → 投影窗滚动一屏
window.bridge.onScroll((direction) => controller.scrollByScreen(direction))

// T7-projection（R1）：单屏本机浮动窗的顶栏提示（主进程 banner 推送，多屏全屏不提示）
window.bridge.onBanner(({ text }) => {
  const hint = document.getElementById('hint')
  if (hint) hint.style.display = text ? 'block' : 'none'
})

function render(state: AppState): void {
  renderProjection(stage, state)
  // R4：↑↓ 高亮移动后，出屏自动滚动跟随
  if (state.selection) controller.followVerse(state.selection.verses.from)
}

export {}
import type { AppState } from '../shared/types'
import { applyFontStack } from '../shared/font-dom'
import { moveHighlight } from '../shared/keymap'
import { resolveCurrentVerse, VERSE_ATTR } from '../shared/passage'
import { renderProjection } from './render'
import { ScrollController, verseAtTop } from './scroll'
import { domPointDeps, resolveVerseFromPoint, verseFromElement } from './hit-test'

applyFontStack(document)
window.bridge.onState(render)
void window.bridge.getState().then(render)

// T4-layout/T7-flow：投影窗滚动控制器（拖动惯性 / 一屏 / 进度条 / 高亮跟随）
const stage = document.getElementById('stage')!
const scrollbar = document.getElementById('scrollbar')

let lastState: AppState | null = null
// 连按方向键时不等异步回包：乐观节号只用于下一次按键的起点
let optimisticVerse: number | null = null
// 滚动结算后的高亮派发去重：状态回包前不重复打点
let pendingHighlight: number | null = null
// 方向键/换经导致的程序化滚动，不应反过来把高亮改成"顶部第一行"
let suppressNextSettle = false
// 点击来源的高亮不做滚动跟随（工单：用户点的节本来就在眼前）
let clickHighlight: number | null = null

const controller = new ScrollController(stage, scrollbar, {
  screenHeight: () => window.innerHeight,
  onScrollSettled: () => {
    if (suppressNextSettle) {
      suppressNextSettle = false
      return
    }
    syncHighlightFromTop()
  },
})

// 点击命中的坐标兜底（见 hit-test.ts：行内排版的行末空白不归 [data-verse] 所有）
const pointDeps = domPointDeps(stage)

// W3：滚动停下 → 点亮屏幕顶部第一行所在节（状态回包前去重）
function syncHighlightFromTop(): void {
  const state = lastState
  if (!state?.selection) return
  const verse = verseAtTop(stage)
  if (verse === null) return
  if (verse === resolveCurrentVerse(state)) return
  if (verse === pendingHighlight) return
  pendingHighlight = verse
  void window.bridge.dispatch({ type: 'highlight', verse })
}

function sameSelection(a: AppState, b: AppState): boolean {
  const x = a.selection
  const y = b.selection
  if (!x || !y) return x === y
  return x.sn === y.sn && x.chapter === y.chapter && x.verses.from === y.verses.from && x.verses.to === y.verses.to
}

// W3：点击某一节 → 只移动高亮，不滚动（用户点的节本来就在眼前）
stage.addEventListener('click', (event) => {
  if (controller.consumeClickSuppressed()) return
  // 正在选中经文文本时不改高亮（复制/摘录是真实场景）
  const textSelection = window.getSelection()
  if (textSelection && !textSelection.isCollapsed && textSelection.toString().trim() !== '') return
  const target = event.target
  // 先按元素精确命中；经文是行内 span，点在行末空白/行间隙时 target 会落到父级 .flow，
  // 此时再用坐标（caret）反查最近的节——否则手机上手指导航一点就"点空"，表现为必须点两次。
  const verse =
    verseFromElement(target instanceof Element ? target : null) ??
    resolveVerseFromPoint(event.clientX, event.clientY, pointDeps)
  if (verse === null) return
  const state = lastState
  if (!state?.selection) return
  if (verse < state.selection.verses.from || verse > state.selection.verses.to) return
  if (verse === resolveCurrentVerse(state)) return
  clickHighlight = verse
  void window.bridge.dispatch({ type: 'highlight', verse })
})

// T6/T7：投影窗内 Esc = 取消投屏（第二条退出路径，确保永远可退出）
// R4：PgUp/PgDn=滚动一屏；↑↓=移动当前节高亮（只发 highlight，绝不动 selection）
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
    const state = lastState
    if (!state) return
    const base = optimisticVerse === null ? state : { ...state, currentVerse: optimisticVerse }
    const verse = moveHighlight(base, event.key === 'ArrowDown' ? 1 : -1)
    if (verse === null) return
    optimisticVerse = verse
    void window.bridge.dispatch({ type: 'highlight', verse })
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
  const previous = lastState
  const previousCurrent = previous ? resolveCurrentVerse(previous) : null
  const rebuilt = renderProjection(stage, state)
  const current = resolveCurrentVerse(state)
  lastState = state
  optimisticVerse = current

  // 本次高亮是否由滚动取节产生：是则不再做滚动跟随（否则会把用户刚停下的位置顶走）
  const fromScroll = pendingHighlight !== null && current === pendingHighlight
  if (fromScroll) {
    pendingHighlight = null
  } else if (pendingHighlight !== null && previous && !sameSelection(previous, state)) {
    pendingHighlight = null
  }

  const fromClick = clickHighlight !== null && current === clickHighlight
  if (fromClick) clickHighlight = null
  else if (clickHighlight !== null && previous && !sameSelection(previous, state)) clickHighlight = null

  // R4/W3：仅键盘/换经等来源的高亮变化才在出屏时自动跟随；滚动与点击不跟随
  if (!fromScroll && !fromClick && (rebuilt || current !== previousCurrent)) {
    const target = current ?? state.selection?.verses.from ?? null
    if (target !== null && controller.followVerse(target)) suppressNextSettle = true
  }
}

export {}
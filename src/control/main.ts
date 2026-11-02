import type { AppState } from '../shared/types'
import { bookBySn } from '../shared/bible'
import { passageRangeText } from '../shared/passage'
import { applyFontStack } from '../shared/font-dom'
import { createKeyboardController } from './keyboard'
import { BooksView } from './books-view'
import { CascadeView } from './cascade-view'
import { HistoryView } from './history-view'
import { ControlLayout, NARROW_MEDIA_QUERY } from './layout-controller'
import { PreviewView } from './preview-view'
import { SearchView } from './search-view'
import { StyleView } from './style-view'
import { ThemePalette } from './theme-palette'

applyFontStack(document)

// 启动遮罩：经文数据 3.3MB 打包在 bundle 里，慢网（如隧道）首屏要等十几秒。
// 遮罩本身在 HTML 内联，不依赖 JS，因此能先于脚本渲染出来。
// 延迟 250ms 才淡入，保证本地/Electron 秒开时用户完全看不到它。
document.getElementById('boot-splash')?.remove()

let current: AppState | null = null

const selectionLabel = (): string => {
  const sel = current?.selection
  if (!sel) return '未选经文'
  const name = bookBySn(sel.sn)?.name ?? `卷 ${sel.sn}`
  return `${name} ${sel.chapter}:${passageRangeText(sel.verses.from, sel.verses.to)}`
}

// W2：窄屏单栏两态（list/detail），返回按钮与左右栏都用 hidden 切换
const narrowMedia = window.matchMedia(NARROW_MEDIA_QUERY)
const layout = new ControlLayout(
  {
    body: document.body,
    left: document.getElementById('left-panel')!,
    right: document.getElementById('right-panel')!,
    back: document.getElementById('btn-back')!,
  },
  narrowMedia,
)
document.getElementById('btn-back')!.addEventListener('click', () => layout.backToList())

const historyView = new HistoryView(document.getElementById('history-panel')!, {
  onSelect: (selection) => {
    // 历史条目点击 = 直接回填选区上屏（R2）；窄屏立即进入 detail
    layout.showDetail()
    void window.bridge.dispatch({ type: 'select', selection })
  },
})
const refreshHistory = (): void => {
  void window.bridge.getHistory().then((entries) => historyView.render(entries))
}

// T7-cascade（R2）：四列级联弹窗——书卷列表/搜索点选唤起，选完 dispatch select
const cascade = new CascadeView(document.getElementById('cascade-root')!, {
  onSelect: (selection) => {
    // 窄屏选中即进入 detail 看预览
    layout.showDetail()
    void window.bridge.dispatch({ type: 'select', selection })
  },
  narrow: narrowMedia.matches,
})
// W2：横竖屏切换时级联弹窗按当前进度落到对应步骤
narrowMedia.addEventListener('change', (event) => cascade.setNarrow(event.matches))

// T7-layout（R3）：左栏 = 搜索 → Tab → 书卷列表（每卷一行全名）；历史 Tab 顶替列表位
new BooksView(document.getElementById('books-panel')!, {
  onBook: (sn) => cascade.openWithBook(sn),
  onModeChange: (mode) => historyView.setVisible(mode === 'history'),
})
new SearchView(document.getElementById('search-panel')!, {
  onBook: (sn) => cascade.openWithBook(sn),
})

// T7-layout（R3/R5）：预览与投影同源渲染；主题色板与样式抽屉即时同步
const preview = new PreviewView(document.getElementById('preview-panel')!, {
  copyText: async (text) => {
    await navigator.clipboard?.writeText(text)
  },
  onHighlight: (verse) => void window.bridge.dispatch({ type: 'highlight', verse }),
})
const palette = new ThemePalette(document.getElementById('theme-palette')!, {
  onSelect: (theme) => void window.bridge.dispatch({ type: 'style', patch: { theme } }),
})

window.bridge.onState(render)
void window.bridge.getState().then(render)
window.bridge.onBanner(({ text }) => {
  const el = document.getElementById('banner')
  if (!el) return
  el.textContent = text ?? ''
  el.classList.toggle('visible', text !== null && text !== '')
})

function render(state: AppState): void {
  current = state
  // W2：先同步窄屏视图，选中换区时预览栏已可见再渲染
  layout.handleState(state)
  const btnProject = document.getElementById('btn-project')
  if (btnProject) {
    btnProject.textContent = state.projecting ? '取消投屏' : '投屏'
    btnProject.classList.toggle('active', state.projecting)
  }
  // 「当前选区」标签（未选置灰，R2/R3）
  const btnSelection = document.getElementById('btn-selection') as HTMLButtonElement | null
  if (btnSelection) {
    btnSelection.textContent = selectionLabel()
    btnSelection.classList.toggle('empty', state.selection === null)
    btnSelection.disabled = state.selection === null
  }
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement | null
  if (btnCopy) btnCopy.disabled = state.selection === null
  palette.renderState(state.style.theme)
  preview.render(state)
  styleView.renderState(state.style)
  refreshHistory()
}

const on = (id: string, fn: () => void) => {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', fn)
}

// 「当前选区」标签：点击重新唤起级联弹窗回填修改（R2）
on('btn-selection', () => {
  cascade.open(current?.selection ?? null)
})
on('btn-project', () => void window.bridge.dispatch({ type: 'projecting', value: !(current?.projecting ?? false) }))
on('btn-copy', () => void preview.copyCurrent())
on('btn-font-up', () => void window.bridge.dispatch({ type: 'style', patch: { fontSize: (current?.style.fontSize ?? 72) + 12 } }))
on('btn-font-down', () =>
  void window.bridge.dispatch({ type: 'style', patch: { fontSize: Math.max(8, (current?.style.fontSize ?? 72) - 12) } }),
)

// T4-style：样式抽屉（齿轮按钮 / S 键唤出），全部变更即时 dispatch → 广播投影窗
const styleViewRoot = document.getElementById('style-drawer')!
const styleView = new StyleView(styleViewRoot, {
  onPatch: (patch) => {
    void window.bridge.dispatch({ type: 'style', patch })
  },
})
on('btn-style', () => styleView.toggle())

createKeyboardController({
  getState: () => current,
  dispatch: (action) => {
    void window.bridge.dispatch(action)
  },
  highlight: (verse) => {
    // 连按方向键时先更新本地快照，预览/投影随状态回包同步
    if (current) current = { ...current, currentVerse: verse }
    void window.bridge.dispatch({ type: 'highlight', verse })
  },
  isDrawerOpen: () => !styleViewRoot.hidden,
  closeDrawer: () => styleView.setVisible(false),
  toggleDrawer: () => styleView.toggle(),
  // T7-flow（R4）：PgUp/PgDn=一屏——预览本地滚动，并副通道令投影窗同步
  scroll: (direction) => {
    preview.scrollByScreen(direction)
    window.bridge.sendScroll(direction)
  },
})

export {}
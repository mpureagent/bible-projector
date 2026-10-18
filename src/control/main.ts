import type { AppState } from '../shared/types'
import { bookBySn } from '../shared/bible'
import { passageRangeText } from '../shared/passage'
import { applyFontStack } from '../shared/font-dom'
import { createKeyboardController } from './keyboard'
import { BooksView } from './books-view'
import { CascadeView } from './cascade-view'
import { HistoryView } from './history-view'
import { PreviewView } from './preview-view'
import { SearchView } from './search-view'
import { StyleView } from './style-view'
import { ThemePalette } from './theme-palette'

applyFontStack(document)

let current: AppState | null = null

const selectionLabel = (): string => {
  const sel = current?.selection
  if (!sel) return '未选经文'
  const name = bookBySn(sel.sn)?.name ?? `卷 ${sel.sn}`
  return `${name} ${sel.chapter}:${passageRangeText(sel.verses.from, sel.verses.to)}`
}

const historyView = new HistoryView(document.getElementById('history-panel')!, {
  onSelect: (selection) => {
    // 历史条目点击 = 直接回填选区上屏（R2）
    void window.bridge.dispatch({ type: 'select', selection })
  },
})
const refreshHistory = (): void => {
  void window.bridge.getHistory().then((entries) => historyView.render(entries))
}

// T7-cascade（R2）：四列级联弹窗——书卷列表/搜索点选唤起，选完 dispatch select
const cascade = new CascadeView(document.getElementById('cascade-root')!, {
  onSelect: (selection) => {
    void window.bridge.dispatch({ type: 'select', selection })
  },
})

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
  isDrawerOpen: () => !styleViewRoot.hidden,
  closeDrawer: () => styleView.setVisible(false),
  toggleDrawer: () => styleView.toggle(),
})

export {}
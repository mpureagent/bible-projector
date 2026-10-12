import type { AppState, ThemeName } from '../shared/types'
import { BooksView } from './books-view'
import { ChaptersView } from './chapters-view'
import { HistoryView } from './history-view'
import { SearchView } from './search-view'
import { VersesView } from './verses-view'

const THEMES: ThemeName[] = ['ink', 'ivory', 'ocean']

let current: AppState | null = null

const historyView = new HistoryView(document.getElementById('history-panel')!, {
  onSelect: (selection) => {
    void window.bridge.dispatch({ type: 'select', selection })
  },
})
const refreshHistory = (): void => {
  void window.bridge.getHistory().then((entries) => historyView.render(entries))
}
const versesView = new VersesView(document.getElementById('verses-panel')!, {
  onSelect: (selection) => {
    void window.bridge.dispatch({ type: 'select', selection })
  },
})
const chaptersView = new ChaptersView(document.getElementById('chapters-panel')!, {
  onChapter: (chapter) => {
    const book = chaptersView.getBook()
    if (book !== null) versesView.setChapter(book, chapter)
  },
})
new BooksView(document.getElementById('books-panel')!, {
  onBook: (sn) => chaptersView.setBook(sn),
  onModeChange: (mode) => {
    historyView.setVisible(mode === 'history')
    if (mode === 'history') refreshHistory()
  },
})
// 历史 Tab 顶替书卷网格位：把 tab-bar 挪到搜索框之后、历史列表之前
{
  const panel = document.getElementById('books-panel')!
  const tabBar = panel.querySelector('.tab-bar')
  const historyPanel = document.getElementById('history-panel')
  if (tabBar && historyPanel) panel.insertBefore(tabBar, historyPanel)
}
new SearchView(document.getElementById('search-panel')!, {
  onBook: (sn) => chaptersView.setBook(sn),
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
  const set = (id: string, text: string) => {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  }
  set('st-selection', state.selection ? `${state.selection.sn} ${state.selection.chapter}:${state.selection.verses.from}-${state.selection.verses.to}` : 'null')
  set('st-style', `${state.style.theme} / ${state.style.fontSize}px`)
  set('st-blank', String(state.blank))
  set('st-lock', String(state.lock))
  set('st-display', String(state.display))
  refreshHistory()
}

const on = (id: string, fn: () => void) => {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', fn)
}

on('btn-blank', () => void window.bridge.dispatch({ type: 'blank', value: !(current?.blank ?? false) }))
on('btn-lock', () => void window.bridge.dispatch({ type: 'lock', value: !(current?.lock ?? false) }))
on('btn-font-up', () => void window.bridge.dispatch({ type: 'style', patch: { fontSize: (current?.style.fontSize ?? 72) + 12 } }))
on('btn-font-down', () => void window.bridge.dispatch({ type: 'style', patch: { fontSize: Math.max(24, (current?.style.fontSize ?? 72) - 12) } }))
on('btn-theme', () => {
  const next = THEMES[(THEMES.indexOf(current?.style.theme ?? 'ink') + 1) % THEMES.length]
  void window.bridge.dispatch({ type: 'style', patch: { theme: next } })
})

export {}

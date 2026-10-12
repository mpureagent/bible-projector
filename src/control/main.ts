import type { AppState, ThemeName } from '../shared/types'
import { BooksView } from './books-view'
import { ChaptersView } from './chapters-view'
import { SearchView } from './search-view'
import { VersesView } from './verses-view'

const THEMES: ThemeName[] = ['ink', 'ivory', 'ocean']

let current: AppState | null = null

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
})
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

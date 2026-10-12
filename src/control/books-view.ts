import { BOOKS } from '../shared/bible'
import { CATEGORY_COLORS } from '../shared/themes'

// T3-grid：书卷网格 + 旧/新约 Tab（§5.2 分类着色、§6.2 左栏）。
// 视图只依赖注入的 onBook 回调，DOM 可在 happy-dom 组件测试中独立驱动。

export interface BooksViewOptions {
  onBook(sn: number): void
  onModeChange?(mode: 'books' | 'history'): void
}

export class BooksView {
  private readonly tabs: HTMLElement
  private readonly grid: HTMLElement
  private readonly options: BooksViewOptions
  private mode: 'books' | 'history' = 'books'
  private testament = 0

  constructor(root: HTMLElement, options: BooksViewOptions) {
    this.options = options
    const bar = document.createElement('div')
    bar.className = 'tab-bar'
    this.tabs = bar
    const grid = document.createElement('div')
    grid.className = 'book-grid'
    this.grid = grid
    root.append(bar, grid)

    for (const t of [0, 1] as const) {
      const tab = document.createElement('button')
      tab.type = 'button'
      tab.className = 'tab-btn'
      tab.dataset.testament = String(t)
      tab.textContent = t === 0 ? '旧约' : '新约'
      tab.addEventListener('click', () => this.setTestament(t))
      bar.appendChild(tab)
    }
    const historyTab = document.createElement('button')
    historyTab.type = 'button'
    historyTab.className = 'tab-btn'
    historyTab.textContent = '历史'
    historyTab.addEventListener('click', () => this.setMode('history'))
    bar.appendChild(historyTab)
    this.render()
  }

  setTestament(testament: number): void {
    this.testament = testament
    this.setMode('books')
  }

  getTestament(): number {
    return this.testament
  }

  setMode(mode: 'books' | 'history'): void {
    this.mode = mode
    this.render()
    this.options.onModeChange?.(mode)
  }

  private render(): void {
    const tabs = [...this.tabs.children] as HTMLElement[]
    const activeTab = this.mode === 'history' ? 2 : this.testament
    tabs.forEach((tab, i) => tab.classList.toggle('active', i === activeTab))
    this.grid.hidden = this.mode === 'history'
    if (this.mode !== 'books') return
    this.grid.replaceChildren()
    for (const book of BOOKS) {
      if (book.testament !== this.testament) continue
      const token = CATEGORY_COLORS[book.cat]
      if (!token) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'book-btn'
      btn.title = book.name
      btn.textContent = book.short
      btn.style.backgroundColor = token.background
      btn.style.borderColor = token.border
      btn.addEventListener('click', () => this.options.onBook(book.sn))
      this.grid.appendChild(btn)
    }
  }
}

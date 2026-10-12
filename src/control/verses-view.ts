import { bookBySn, chapterVerses } from '../shared/bible'
import type { Selection } from '../shared/types'

// T3-cascade：节列表视图（§6.1 第三击）。点击节回调 onSelect；Shift 点击与锚点连选，
// 锚点在 setChapter 时重置——章节切换即换上下文，跨章连选结构上不可能发生。

export interface VersesViewOptions {
  onSelect(selection: Selection): void
}

export class VersesView {
  private readonly title: HTMLElement
  private readonly list: HTMLElement
  private readonly options: VersesViewOptions
  private sn: number | null = null
  private chapter: number | null = null
  private anchor: number | null = null

  constructor(root: HTMLElement, options: VersesViewOptions) {
    this.options = options
    const title = document.createElement('h2')
    title.className = 'verses-title'
    this.title = title
    const list = document.createElement('ol')
    list.className = 'verse-list'
    this.list = list
    root.replaceChildren(title, list)
    root.hidden = true
  }

  setChapter(sn: number, chapter: number): void {
    this.sn = sn
    this.chapter = chapter
    this.anchor = null
    this.render()
    this.renderRange(null)
  }

  getSelection(): { sn: number; chapter: number } | null {
    if (this.sn === null || this.chapter === null) return null
    return { sn: this.sn, chapter: this.chapter }
  }

  private render(): void {
    const root = this.title.parentElement
    if (root) root.hidden = false
    const sn = this.sn
    const chapter = this.chapter
    if (sn === null || chapter === null) return
    const book = bookBySn(sn)
    if (!book) return
    this.title.textContent = `${book.name} · 第 ${chapter} 章`
    this.list.replaceChildren()
    const verses = chapterVerses(sn, chapter)
    verses.forEach((text, i) => {
      const verse = i + 1
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'verse-btn'
      btn.dataset.verse = String(verse)
      const num = document.createElement('sup')
      num.className = 'vnum'
      num.textContent = String(verse)
      const body = document.createElement('span')
      body.className = 'vtext'
      body.textContent = text
      btn.append(num, body)
      btn.addEventListener('click', (event) => this.pick(verse, (event as MouseEvent).shiftKey))
      this.list.appendChild(btn)
    })
  }

  private pick(verse: number, shiftKey: boolean): void {
    if (this.sn === null || this.chapter === null) return
    let from = verse
    let to = verse
    if (shiftKey && this.anchor !== null) {
      from = Math.min(this.anchor, verse)
      to = Math.max(this.anchor, verse)
    } else {
      this.anchor = verse
    }
    const selection: Selection = { sn: this.sn, chapter: this.chapter, verses: { from, to } }
    this.options.onSelect(selection)
    this.renderRange(selection.verses)
  }

  private renderRange(range: { from: number; to: number } | null): void {
    for (const btn of [...this.list.children] as HTMLElement[]) {
      const verse = Number(btn.dataset.verse)
      const inRange = range !== null && verse >= range.from && verse <= range.to
      btn.classList.toggle('in-range', inRange)
    }
  }
}

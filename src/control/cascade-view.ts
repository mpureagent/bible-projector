import { BOOKS, bookBySn, chapterVerses } from '../shared/bible'
import type { Selection } from '../shared/types'

// T7-cascade（R2 定稿）：四列一体级联选经弹窗（书|章|起始节|结束节）。
// 点列刷新其右侧列；起始>结束钳制（结束<起始时抬到起始）；选完自动关窗回调 onSelect。
// 三途径关闭：点遮罩 / ✕ / 选完。回填：open(selection) 唤起并预置四列。
// 不跨章：数据结构 (sn, chapter, from, to)，章切换即清空起止。
// W2：≤900px 改分步（书 → 章 → 节范围），只显示当前步骤，禁止横向滚动；桌面四列不变。

export interface CascadeViewOptions {
  onSelect(selection: Selection): void
  narrow?: boolean
}

type CascadeStep = 'books' | 'chapters' | 'verses'

const STEP_LABELS: Record<CascadeStep, string> = {
  books: '选择书卷',
  chapters: '选择章',
  verses: '选择节范围',
}

export class CascadeView {
  private readonly options: CascadeViewOptions
  private readonly overlay: HTMLElement
  private readonly mask: HTMLElement
  private readonly dialog: HTMLElement
  private readonly closeBtn: HTMLElement
  private readonly title: HTMLElement
  private readonly stepBack: HTMLElement
  private readonly colsRow: HTMLElement
  private readonly cols: Record<'books' | 'chapters' | 'from' | 'to', HTMLElement>
  private narrow: boolean
  private step: CascadeStep = 'books'
  private sn: number | null = null
  private chapter: number | null = null
  private from: number | null = null
  private to: number | null = null

  constructor(root: HTMLElement, options: CascadeViewOptions) {
    this.options = options
    this.narrow = options.narrow ?? false

    const overlay = document.createElement('div')
    overlay.className = 'cascade-overlay'
    overlay.hidden = true

    const mask = document.createElement('div')
    mask.className = 'cascade-mask'
    mask.addEventListener('click', () => this.close())

    const dialog = document.createElement('div')
    dialog.className = 'cascade-dialog'
    const head = document.createElement('div')
    head.className = 'cascade-head'
    const title = document.createElement('span')
    title.className = 'cascade-title'
    title.textContent = '选经（书 · 章 · 起始节 · 结束节）'
    const stepBack = document.createElement('button')
    stepBack.type = 'button'
    stepBack.className = 'cascade-step-back'
    stepBack.textContent = '‹ 上一步'
    stepBack.hidden = true
    stepBack.addEventListener('click', () => this.stepBackward())
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cascade-close'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => this.close())
    head.append(title, stepBack, closeBtn)

    const colsRow = document.createElement('div')
    colsRow.className = 'cascade-cols'
    const cols = {
      books: this.column('书卷'),
      chapters: this.column('章'),
      from: this.column('起始节'),
      to: this.column('结束节'),
    }
    colsRow.append(cols.books, cols.chapters, cols.from, cols.to)

    dialog.append(head, colsRow)
    overlay.append(mask, dialog)
    root.appendChild(overlay)
    this.overlay = overlay
    this.mask = mask
    this.dialog = dialog
    this.closeBtn = closeBtn
    this.title = title
    this.stepBack = stepBack
    this.colsRow = colsRow
    this.cols = cols
    this.renderColumns()
  }

  isOpen(): boolean {
    return !this.overlay.hidden
  }

  open(prefill?: Selection | null): void {
    if (prefill) {
      this.sn = prefill.sn
      this.chapter = prefill.chapter
      this.from = prefill.verses.from
      this.to = prefill.verses.to
      if (this.narrow) this.step = 'verses'
    } else if (this.narrow) {
      this.step = 'books'
    }
    this.overlay.hidden = false
    this.renderColumns()
  }

  openWithBook(sn: number): void {
    this.sn = sn
    this.chapter = null
    this.from = null
    this.to = null
    if (this.narrow) this.step = 'chapters'
    this.overlay.hidden = false
    this.renderColumns()
  }

  close(): void {
    this.overlay.hidden = true
  }

  // W2：运行时跨断点（横竖屏切换）按当前进度落到对应步骤
  setNarrow(narrow: boolean): void {
    if (this.narrow === narrow) return
    this.narrow = narrow
    this.step = narrow ? this.stepForProgress() : 'books'
    this.renderColumns()
  }

  private stepForProgress(): CascadeStep {
    if (this.sn === null) return 'books'
    if (this.chapter === null) return 'chapters'
    return 'verses'
  }

  getSelection(): Selection | null {
    if (this.sn === null || this.chapter === null || this.from === null || this.to === null) return null
    return { sn: this.sn, chapter: this.chapter, verses: { from: this.from, to: this.to } }
  }

  private column(label: string): HTMLElement {
    const col = document.createElement('div')
    col.className = 'cascade-col'
    const head = document.createElement('div')
    head.className = 'cascade-col-title'
    head.textContent = label
    const list = document.createElement('div')
    list.className = 'cascade-col-list'
    col.append(head, list)
    return col
  }

  private pickBook(sn: number): void {
    if (this.sn !== sn) {
      this.sn = sn
      this.chapter = null
      this.from = null
      this.to = null
    }
    if (this.narrow) this.step = 'chapters'
    this.renderColumns()
  }

  private pickChapter(chapter: number): void {
    this.chapter = chapter
    this.from = null
    this.to = null
    if (this.narrow) this.step = 'verses'
    this.renderColumns()
  }

  private pickFrom(verse: number): void {
    this.from = verse
    if (this.to !== null && this.to < verse) this.to = verse
    this.renderColumns()
  }

  private pickTo(verse: number): void {
    if (this.from === null) return
    // R2：起始>结束 → 钳制（结束抬到起始）
    this.to = Math.max(verse, this.from)
    const selection = this.getSelection()
    if (selection) {
      this.options.onSelect(selection)
      this.close()
    }
  }

  private renderColumns(): void {
    this.renderBookColumn()
    this.renderChapterColumn()
    this.renderVerseColumn('from')
    this.renderVerseColumn('to')
    this.applyStep()
  }

  // W2：窄屏分步视图——只显示当前步骤（节范围为起/止双列），桌面四列全显
  private applyStep(): void {
    const narrow = this.narrow
    const step = narrow ? this.step : null
    this.dialog.classList.toggle('narrow', narrow)
    this.colsRow.classList.toggle('step-verses', step === 'verses')
    this.cols.books.hidden = step !== null && step !== 'books'
    this.cols.chapters.hidden = step !== null && step !== 'chapters'
    this.cols.from.hidden = step !== null && step !== 'verses'
    this.cols.to.hidden = step !== null && step !== 'verses'
    this.stepBack.hidden = !(narrow && this.step !== 'books')
    this.title.textContent = narrow
      ? `选经 · ${STEP_LABELS[this.step]}`
      : '选经（书 · 章 · 起始节 · 结束节）'
  }

  private stepBackward(): void {
    if (!this.narrow) return
    if (this.step === 'verses') {
      this.step = 'chapters'
      this.from = null
      this.to = null
    } else if (this.step === 'chapters') {
      this.step = 'books'
      this.chapter = null
      this.from = null
      this.to = null
    }
    this.renderColumns()
  }

  private renderBookColumn(): void {
    const list = this.cols.books.querySelector<HTMLElement>('.cascade-col-list')!
    list.replaceChildren()
    for (const book of BOOKS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'cascade-book'
      btn.dataset.sn = String(book.sn)
      if (book.sn === this.sn) btn.classList.add('selected')
      btn.textContent = book.name
      btn.addEventListener('click', () => this.pickBook(book.sn))
      list.appendChild(btn)
    }
  }

  private renderChapterColumn(): void {
    const list = this.cols.chapters.querySelector<HTMLElement>('.cascade-col-list')!
    list.replaceChildren()
    const book = this.sn === null ? undefined : bookBySn(this.sn)
    if (!book) {
      list.appendChild(this.hint('先选书卷'))
      return
    }
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'cascade-chapter'
      btn.textContent = String(chapter)
      if (chapter === this.chapter) btn.classList.add('selected')
      btn.addEventListener('click', () => this.pickChapter(chapter))
      list.appendChild(btn)
    }
  }

  private renderVerseColumn(kind: 'from' | 'to'): void {
    const list = this.cols[kind].querySelector<HTMLElement>('.cascade-col-list')!
    list.replaceChildren()
    const picked = kind === 'from' ? this.from : this.to
    if (this.sn === null || this.chapter === null) {
      list.appendChild(this.hint(kind === 'from' ? '先选书章' : '先选起始节'))
      return
    }
    if (kind === 'to' && this.from === null) {
      list.appendChild(this.hint('先选起始节'))
      return
    }
    const verses = chapterVerses(this.sn, this.chapter)
    for (let verse = 1; verse <= verses.length; verse++) {
      if (kind === 'to' && this.from !== null && verse < this.from) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'cascade-verse'
      btn.dataset.kind = kind
      btn.textContent = String(verse)
      if (verse === picked) btn.classList.add('selected')
      btn.addEventListener('click', () =>
        kind === 'from' ? this.pickFrom(verse) : this.pickTo(verse),
      )
      list.appendChild(btn)
    }
  }

  private hint(text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cascade-hint'
    el.textContent = text
    return el
  }
}

import { bookBySn, chapterVerses } from '../shared/bible'
import {
  applyStageStyle,
  buildPassage,
  passageRangeText,
  passageText,
  PREVIEW_SCALE,
  resolveFontSize,
  type PassageVerse,
} from '../shared/passage'
import type { AppState, Selection } from '../shared/types'

// T7-layout（R3/R5）：右栏预览区——与投影窗**同源排版核**（shared/passage.ts），
// 字号按 PREVIEW_SCALE 缩放，主题/字体/行距/节号显隐全部跟随样式状态（修复问题 6）。
// 文本保持可选中可复制（R3：从预览复制经文为真实使用场景）。

export interface PreviewViewOptions {
  copyText?(text: string): void | Promise<void>
}

export class PreviewView {
  private state: AppState | null = null
  private readonly options: PreviewViewOptions

  constructor(private readonly root: HTMLElement, options: PreviewViewOptions = {}) {
    this.options = options
    this.root.classList.add('preview-stage')
  }

  render(state: AppState): void {
    this.state = state
    applyStageStyle(this.root, state.style)
    this.root.replaceChildren()
    if (!state.selection) {
      const empty = document.createElement('div')
      empty.className = 'preview-empty'
      empty.textContent = '左栏选经后此处预览（与投影同源）'
      this.root.appendChild(empty)
      return
    }
    const sel = state.selection
    const verses = chapterVerses(sel.sn, sel.chapter)
    const list: PassageVerse[] = []
    for (let v = sel.verses.from; v <= sel.verses.to; v++) {
      const text = verses[v - 1]
      if (text !== undefined) list.push({ number: v, text })
    }
    const book = bookBySn(sel.sn)?.name ?? `卷 ${sel.sn}`
    this.root.appendChild(
      buildPassage(
        { bookName: book, chapter: sel.chapter, from: sel.verses.from, to: sel.verses.to },
        list,
        state.style,
        {
          fontSize: resolveFontSize(state.style, PREVIEW_SCALE),
          currentVerse: sel.verses.from,
          mode: state.style.mode,
        },
      ),
    )
  }

  // 「复制经文」按钮：选中经文 → 剪贴板（无选区时不动作）
  async copyCurrent(): Promise<string | null> {
    const sel = this.state?.selection
    if (!sel) return null
    const text = passageText(sel)
    await this.options.copyText?.(text)
    return text
  }

  getSelection(): Selection | null {
    return this.state?.selection ?? null
  }

  rangeLabel(): string {
    const sel = this.state?.selection
    if (!sel) return ''
    return passageRangeText(sel.verses.from, sel.verses.to)
  }
}
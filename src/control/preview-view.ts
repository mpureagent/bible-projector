import {
  applyStageStyle,
  applyVerseHighlight,
  buildStatePassage,
  passageRangeText,
  passageText,
  PREVIEW_SCALE,
  resolveCurrentVerse,
  resolveFontSize,
  VERSE_ATTR,
} from '../shared/passage'
import type { AppState, ScrollDirection, Selection } from '../shared/types'
import { ScrollController, verseAtTop } from '../projection/scroll'

// T7-layout/T7-flow（R3/R5/R4）：右栏预览区——与投影窗**同源排版核**（shared/passage.ts），
// 字号 ×PREVIEW_SCALE；主题/字体/行距/节号显隐跟随样式状态（修复问题 6）。
// R4：预览亦为纵向滚动容器，PgUp/PgDn 一屏、高亮出屏跟随，与投影窗同源交互。
// W3：当前节与选区解耦；高亮变化只增量更新，滚动/点击也能移动当前节。
// 文本保持可选中可复制（R3：从预览复制经文为真实使用场景）。

export interface PreviewViewOptions {
  copyText?(text: string): void | Promise<void>
  onHighlight?(verse: number): void
}

interface Snapshot {
  selectionKey: string
  styleKey: string
}

function selectionKey(selection: Selection | null): string {
  return selection
    ? `${selection.sn}/${selection.chapter}/${selection.verses.from}/${selection.verses.to}`
    : 'null'
}

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return selectionKey(a) === selectionKey(b)
}

export class PreviewView {
  private state: AppState | null = null
  private snapshot: Snapshot | null = null
  private pendingHighlight: number | null = null
  private clickHighlight: number | null = null
  private suppressNextSettle = false
  private readonly options: PreviewViewOptions
  private readonly scroll: ScrollController

  constructor(private readonly root: HTMLElement, options: PreviewViewOptions = {}) {
    this.options = options
    this.root.classList.add('preview-stage')
    const bar = this.root.parentElement?.querySelector<HTMLElement>('#preview-scrollbar') ?? null
    this.scroll = new ScrollController(this.root, bar, {
      screenHeight: () => this.root.clientHeight || 480,
      onScrollSettled: () => {
        if (this.suppressNextSettle) {
          this.suppressNextSettle = false
          return
        }
        this.highlightFromTop()
      },
    })
    this.root.addEventListener('click', this.onClick)
  }

  // W3：点击预览中的某一节 → 只移动高亮，不滚动
  private onClick = (event: Event): void => {
    if (this.scroll.consumeClickSuppressed()) return
    const textSelection = window.getSelection()
    if (textSelection && !textSelection.isCollapsed && textSelection.toString().trim() !== '') return
    const target = event.target
    if (!(target instanceof Element)) return
    const el = target.closest<HTMLElement>(`[${VERSE_ATTR}]`)
    if (!el) return
    const verse = Number(el.getAttribute(VERSE_ATTR))
    const state = this.state
    if (!state?.selection) return
    if (verse < state.selection.verses.from || verse > state.selection.verses.to) return
    if (verse === resolveCurrentVerse(state)) return
    this.clickHighlight = verse
    this.options.onHighlight?.(verse)
  }

  // W3：滚动停下 → 屏幕顶部第一行
  private highlightFromTop(): void {
    if (!this.options.onHighlight) return
    const state = this.state
    if (!state?.selection) return
    const verse = verseAtTop(this.root)
    if (verse === null) return
    if (verse === resolveCurrentVerse(state)) return
    if (verse === this.pendingHighlight) return
    this.pendingHighlight = verse
    this.options.onHighlight(verse)
  }

  render(state: AppState): void {
    const previous = this.state
    const previousCurrent = previous ? resolveCurrentVerse(previous) : null
    const next: Snapshot = { selectionKey: selectionKey(state.selection), styleKey: JSON.stringify(state.style) }
    const rebuild =
      this.snapshot === null ||
      this.snapshot.selectionKey !== next.selectionKey ||
      this.snapshot.styleKey !== next.styleKey

    if (rebuild) {
      applyStageStyle(this.root, state.style)
      this.root.replaceChildren()
      const passage = buildStatePassage(state, resolveFontSize(state.style, PREVIEW_SCALE))
      if (passage) {
        this.root.appendChild(passage)
      } else {
        const empty = document.createElement('div')
        empty.className = 'preview-empty'
        empty.textContent = '左栏选经后此处预览（与投影同源）'
        this.root.appendChild(empty)
      }
      this.snapshot = next
    }

    const current = resolveCurrentVerse(state)
    applyVerseHighlight(this.root, current, state.style)
    this.state = state

    const fromScroll = this.pendingHighlight !== null && current === this.pendingHighlight
    if (fromScroll) {
      this.pendingHighlight = null
    } else if (this.pendingHighlight !== null && previous && !sameSelection(previous.selection, state.selection)) {
      this.pendingHighlight = null
    }

    const fromClick = this.clickHighlight !== null && current === this.clickHighlight
    if (fromClick) {
      this.clickHighlight = null
    } else if (this.clickHighlight !== null && previous && !sameSelection(previous.selection, state.selection)) {
      this.clickHighlight = null
    }

    // 滚动取节、点击引起的高亮变化不做跟随（避免把预览滚动位置顶走）
    if (!fromScroll && !fromClick && (rebuild || current !== previousCurrent)) {
      const target = current ?? state.selection?.verses.from ?? null
      if (target !== null && this.scroll.followVerse(target)) this.suppressNextSettle = true
    }
  }

  scrollByScreen(direction: ScrollDirection): void {
    this.scroll.scrollByScreen(direction)
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
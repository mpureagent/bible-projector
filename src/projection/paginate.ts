// T4-layout 溢出分页（§2.2）：视口预算贪心装箱，节为最小单元（不跨页拆行）。
// 纯函数、确定性：同输入同输出；页内元素为 1 起始的节号。

export interface PageMetrics {
  viewportWidth: number
  viewportHeight: number
  fontSize: number
  lineHeight?: number // 默认 1.7（§7.1）
  marginPercent?: number // 默认 8（§11 安全区）
  showTitle?: boolean // 默认 true
}

// 估算常量与 projection/index.html CSS 对齐：标题 0.28em、节距 0.4em、节号占 2 字宽
const TITLE_EM = 0.28
const TITLE_MARGIN_EM = 0.5
const VERSE_GAP_EM = 0.4
const VNUM_CHARS = 2

export function computePages(verseTexts: readonly string[], metrics: PageMetrics): number[][] {
  const lineHeight = metrics.lineHeight ?? 1.7
  const margin = metrics.marginPercent ?? 8
  const contentW = Math.max(1, metrics.viewportWidth * (1 - (2 * margin) / 100))
  const contentH = Math.max(1, metrics.viewportHeight * (1 - (2 * margin) / 100))
  const fontSize = metrics.fontSize
  const lineH = fontSize * lineHeight
  const gap = fontSize * VERSE_GAP_EM
  const charsPerLine = Math.max(1, Math.floor(contentW / fontSize))
  const titleH =
    metrics.showTitle === false
      ? 0
      : TITLE_EM * fontSize * lineHeight + TITLE_MARGIN_EM * fontSize + gap

  const verseH = (text: string): number =>
    Math.max(1, Math.ceil((text.length + VNUM_CHARS) / charsPerLine)) * lineH + gap

  const pages: number[][] = []
  let page: number[] = []
  let used = titleH
  for (let i = 0; i < verseTexts.length; i++) {
    const height = verseH(verseTexts[i] ?? '')
    if (page.length > 0 && used + height > contentH) {
      pages.push(page)
      page = []
      used = 0
    }
    page.push(i + 1)
    used += height
  }
  if (page.length > 0) pages.push(page)
  return pages.length > 0 ? pages : [[]]
}

export function pageForVerse(pages: number[][], verse: number): number {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i]!.includes(verse)) return i
  }
  return Math.max(0, pages.length - 1)
}

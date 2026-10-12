// §7.3 字体回退链：子集宋体（随包 woff2）→ 系统 Noto Serif CJK SC → Source Han Serif SC → 通用 serif。
// 唯一来源，控制窗与投影窗共用；投影窗注入 @font-face 指向随包产物。

export const SUBSET_FONT_FAMILY = 'Bible Serif SC'

export const FONT_FALLBACK_STACK = `"${SUBSET_FONT_FAMILY}", "Noto Serif CJK SC", "Source Han Serif SC", serif`

export const SUBSET_FONT_URL_RELATIVE = '../fonts/bible-serif-sc.woff2'

export function subsetFontUrl(): string {
  return new URL(SUBSET_FONT_URL_RELATIVE, document.baseURI).href
}

export function injectSubsetFontFace(doc: Document, url: string): void {
  const style = doc.createElement('style')
  style.textContent =
    `@font-face { font-family: "${SUBSET_FONT_FAMILY}"; ` +
    `src: url('${url}') format('woff2'); font-display: swap; }`
  doc.head.appendChild(style)
}

export function applyFontStack(doc: Document): void {
  injectSubsetFontFace(doc, subsetFontUrl())
  doc.body.style.fontFamily = FONT_FALLBACK_STACK
}

// 渲染窗专用：@font-face 注入与回退链应用（DOM 依赖，主进程不得引用）。
import {
  FONT_FALLBACK_STACK,
  SUBSET_FONT_FAMILY,
  SUBSET_FONT_URL_RELATIVE,
  SUBSET_SANS_FAMILY,
  SUBSET_SANS_URL_RELATIVE,
} from './fonts'

export function subsetFontUrl(): string {
  return new URL(SUBSET_FONT_URL_RELATIVE, document.baseURI).href
}

export function subsetSansFontUrl(): string {
  return new URL(SUBSET_SANS_URL_RELATIVE, document.baseURI).href
}

export function injectFontFace(doc: Document, family: string, url: string): void {
  const style = doc.createElement('style')
  style.textContent =
    `@font-face { font-family: "${family}"; ` +
    `src: url('${url}') format('woff2'); font-display: swap; }`
  doc.head.appendChild(style)
}

export function injectSubsetFontFace(doc: Document, url: string): void {
  injectFontFace(doc, SUBSET_FONT_FAMILY, url)
}

export function injectSubsetSansFontFace(doc: Document, url: string): void {
  injectFontFace(doc, SUBSET_SANS_FAMILY, url)
}

export function applyFontStack(doc: Document): void {
  injectSubsetFontFace(doc, subsetFontUrl())
  injectSubsetSansFontFace(doc, subsetSansFontUrl())
  doc.body.style.fontFamily = FONT_FALLBACK_STACK
}
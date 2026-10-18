// T7-layout（R3/R5）：经文排版核——预览与投影**同源渲染**的唯一实现。
// 主题 token、字体栈、行距字距、对齐、边距、节号显隐全部在 buildPassage/applyStageStyle 内解析，
// 控制窗预览（字号缩放）与投影窗（全尺寸）共用，修复验收问题 6「主题不生效」。

import { bookBySn, chapterVerses } from './bible'
import { FONT_STACKS, TEXTURES } from './style'
import { PROJECTION_THEMES, type ProjectionTheme } from './themes'
import type { LayoutMode, ProjectionStyle, Selection } from './types'

const BUILTIN_PREFIX = 'builtin:'
export const FONT_SIZE_MAX = 200 // §11：字号上限
export const SAFE_MARGIN_PERCENT = 8 // §11：边距 ≥8% 安全区
export const PREVIEW_SCALE = 0.4 // 预览面板相对投屏的字号缩放（同源渲染，仅尺寸不同）

export function themeFor(style: ProjectionStyle): ProjectionTheme {
  return PROJECTION_THEMES[style.theme] ?? PROJECTION_THEMES.ink!
}

// 舞台底色/字色/背景图（主题 token 或用户覆盖）；纹理走随包相对路径，本地图片走 file://
export function applyStageStyle(root: HTMLElement, style: ProjectionStyle): void {
  const theme = themeFor(style)
  root.style.backgroundColor = style.background ?? theme.background
  root.style.color = style.color ?? theme.color
  root.style.backgroundImage = ''
  root.style.backgroundSize = ''
  root.style.backgroundPosition = ''
  if (style.backgroundImage) {
    const tex = TEXTURES.find((t) => `${BUILTIN_PREFIX}${t.id}` === style.backgroundImage)
    if (tex) {
      root.style.backgroundImage = `url("../textures/${tex.file}")`
    } else if (style.backgroundImage.startsWith('/')) {
      // 校验后的本地绝对路径（网络 URL 已在 store 层清洗）
      root.style.backgroundImage = `url("file://${style.backgroundImage}")`
    }
    root.style.backgroundSize = 'cover'
    root.style.backgroundPosition = 'center'
  }
}

export function resolveFontSize(style: ProjectionStyle, scale = 1): number {
  return Math.min(FONT_SIZE_MAX, style.fontSize) * scale
}

export function resolveMargin(style: ProjectionStyle): number {
  return Math.max(SAFE_MARGIN_PERCENT, style.margin ?? SAFE_MARGIN_PERCENT)
}

export interface PassageVerse {
  number: number
  text: string
}

export interface PassageMeta {
  bookName: string
  chapter: number
  from: number
  to: number
}

export interface PassageOptions {
  fontSize: number
  currentVerse: number | null
  mode: LayoutMode
}

export function buildPassage(
  meta: PassageMeta,
  verses: readonly PassageVerse[],
  style: ProjectionStyle,
  opts: PassageOptions,
): HTMLElement {
  const theme = themeFor(style)
  const container = document.createElement('div')
  container.className = opts.mode === 'single' ? 'passage single' : 'passage'
  container.style.fontSize = `${opts.fontSize}px`
  container.style.padding = `${resolveMargin(style)}%`
  container.style.fontFamily = FONT_STACKS[style.fontFamily] ?? FONT_STACKS['embedded-serif']
  container.style.lineHeight = String(style.lineHeight ?? 1.7)
  container.style.letterSpacing = `${style.letterSpacing ?? 0}em`
  container.style.textAlign = style.align

  if (!style.hideTitle) container.appendChild(buildTitle(meta, opts.mode))
  for (const verse of verses) {
    container.appendChild(buildVerse(verse, verse.number === opts.currentVerse, theme, style))
  }
  return container
}

export function passageRangeText(from: number, to: number): string {
  return from === to ? `${from}` : `${from}-${to}`
}

// 「复制经文」按钮的纯文本载荷：参考行 + 逐节文本（不含节号上标，便于粘贴到 PPT/文档）
export function passageText(selection: Selection): string {
  const book = bookBySn(selection.sn)
  const verses = chapterVerses(selection.sn, selection.chapter)
  const header = `${book?.name ?? `卷 ${selection.sn}`} ${selection.chapter}:${passageRangeText(selection.verses.from, selection.verses.to)}`
  const lines: string[] = []
  for (let v = selection.verses.from; v <= selection.verses.to; v++) {
    const text = verses[v - 1]
    if (text !== undefined) lines.push(text)
  }
  return [header, ...lines].join('\n')
}

function buildTitle(meta: PassageMeta, mode: LayoutMode): HTMLElement {
  const title = document.createElement('div')
  title.className = 'passage-title'
  title.textContent =
    mode === 'single'
      ? `${meta.bookName} · 第 ${meta.chapter} 章 · 第 ${meta.from} 节`
      : `${meta.bookName} · 第 ${meta.chapter} 章 · ${passageRangeText(meta.from, meta.to)} 节`
  return title
}

function buildVerse(
  verse: PassageVerse,
  current: boolean,
  theme: ProjectionTheme,
  style: ProjectionStyle,
): HTMLElement {
  const line = document.createElement('p')
  line.className = current ? 'verse current' : 'verse'
  if (!style.hideVerseNumbers) {
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(verse.number)
    num.style.color = style.verseNumberColor ?? theme.verseNumber
    line.appendChild(num)
  }
  const body = document.createElement('span')
  body.className = 'vtext'
  body.textContent = verse.text
  if (current) body.style.color = style.currentColor ?? theme.currentColor
  line.appendChild(body)
  return line
}
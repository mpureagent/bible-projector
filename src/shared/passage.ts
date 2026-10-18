// T7-layout（R3/R5）：经文排版核——预览与投影**同源渲染**的唯一实现。
// 主题 token、字体栈、行距字距、对齐、边距、节号显隐全部在 buildPassage/applyStageStyle 内解析，
// 控制窗预览（字号缩放）与投影窗（全尺寸）共用，修复验收问题 6「主题不生效」。

import { bookBySn, chapterVerses } from './bible'
import { FONT_STACKS, TEXTURES } from './style'
import { PROJECTION_THEMES, type ProjectionTheme } from './themes'
import type { ProjectionStyle, Selection } from './types'

const BUILTIN_PREFIX = 'builtin:'
export const FONT_SIZE_MAX = 200 // §11：字号上限
export const SAFE_MARGIN_PERCENT = 8 // §11：边距 ≥8% 安全区
export const PREVIEW_SCALE = 0.4 // 预览面板相对投屏的字号缩放（同源渲染，仅尺寸不同）

export function themeFor(style: ProjectionStyle): ProjectionTheme {
  return PROJECTION_THEMES[style.theme] ?? PROJECTION_THEMES.ink!
}

// 舞台底色/字色/背景图（R8c 三选一：theme 随 token / texture / image / color）；
// 纹理走随包相对路径，本地图片走 file://
export function applyStageStyle(root: HTMLElement, style: ProjectionStyle): void {
  const theme = themeFor(style)
  root.style.backgroundColor = style.backgroundMode === 'color' && style.background ? style.background : theme.background
  root.style.color = style.color ?? theme.color
  root.style.backgroundImage = ''
  root.style.backgroundSize = ''
  root.style.backgroundPosition = ''
  const value = style.backgroundMode === 'texture' || style.backgroundMode === 'image' ? style.backgroundImage : null
  if (value) {
    const tex = TEXTURES.find((t) => `${BUILTIN_PREFIX}${t.id}` === value)
    if (tex) {
      root.style.backgroundImage = `url("../textures/${tex.file}")`
    } else if (value.startsWith('/')) {
      // 校验后的本地绝对路径（网络 URL 已在 store 层清洗）
      root.style.backgroundImage = `url("file://${value}")`
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
}

// R2/R4：自然段落连续流——整个所选范围排一段，节号上标嵌句首（不再一节一行）。
// 当前节 = 段内句子级点亮：其 vtext 加 class="current" + 高亮底色/字色（会众跟读定位）。
export function buildPassage(
  meta: PassageMeta,
  verses: readonly PassageVerse[],
  style: ProjectionStyle,
  opts: PassageOptions,
): HTMLElement {
  const theme = themeFor(style)
  const container = document.createElement('div')
  container.className = 'passage'
  container.style.fontSize = `${opts.fontSize}px`
  container.style.padding = `${resolveMargin(style)}%`
  container.style.fontFamily = FONT_STACKS[style.fontFamily] ?? FONT_STACKS['embedded-serif']
  container.style.lineHeight = String(style.lineHeight ?? 1.7)
  container.style.letterSpacing = `${style.letterSpacing ?? 0}em`
  container.style.textAlign = style.align

  if (!style.hideTitle) container.appendChild(buildTitle(meta, opts.fontSize))
  const flow = document.createElement('p')
  flow.className = 'flow'
  for (const verse of verses) flow.appendChild(buildVerse(verse, verse.number === opts.currentVerse, theme, style))
  container.appendChild(flow)
  return container
}

export function passageRangeText(from: number, to: number): string {
  return from === to ? `${from}` : `${from}-${to}`
}

// 当前节 DOM 定位锚（滚动跟随用）：data-verse 标在 vtext 上
export const VERSE_ATTR = 'data-verse'

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

function buildTitle(meta: PassageMeta, fontSize: number): HTMLElement {
  const title = document.createElement('div')
  title.className = 'passage-title'
  title.style.fontSize = `${Math.round(fontSize * 0.28)}px`
  title.textContent = `${meta.bookName} · 第 ${meta.chapter} 章 · ${passageRangeText(meta.from, meta.to)} 节`
  return title
}

// 单个节 = 行内片段（上标节号 + 正文），随流自然换行；不再产出逐行块结构
function buildVerse(
  verse: PassageVerse,
  current: boolean,
  theme: ProjectionTheme,
  style: ProjectionStyle,
): DocumentFragment {
  const frag = document.createDocumentFragment()
  if (!style.hideVerseNumbers) {
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(verse.number)
    num.style.color = style.verseNumberColor ?? theme.verseNumber
    frag.appendChild(num)
  }
  const body = document.createElement('span')
  body.className = current ? 'vtext current' : 'vtext'
  body.setAttribute(VERSE_ATTR, String(verse.number))
  body.textContent = verse.text
  if (current) {
    body.style.color = style.currentColor ?? theme.currentColor
    body.style.backgroundColor = theme.currentBackground
  }
  frag.appendChild(body)
  return frag
}
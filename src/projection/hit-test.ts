// 点击命中解析（W3 修复）。
//
// 经文用**行内 span** 排版（自然段落连续流），inline 元素内多行文字的
// getBoundingClientRect() 返回**跨行合并的包围盒**，盒内包含大量不属于该元素的区域：
// 行末空白、行间隙。点在那里时 event.target 是父级 <p class="flow">，
// closest('[data-verse]') 为 null，点击被当成"没点到经文"丢弃。
// 手指导航粗，用户频繁点在行末空白 → 表现为"单击不亮，要点第二次"。
//
// 判据改为**按行矩形就近**：
//   1. 精确命中（元素自身/祖先在 [data-verse] 内）
//   2. 精确命中节号上标 .vnum（它是 vtext 的兄弟，取其后继正文元素）
//   3. 否则按行矩形：取垂直距离最近的视觉行，再在该行内取水平距离最近的节
//      —— 点在哪一行，就点亮那一行上的节；行内越靠右，越趋向该行末尾那个节
//
// 早先用 caretRangeFromPoint 做过兜底，但它取"最近的字符"，在行末空白处会落到
// **上一节**的末字（实测点第 3 节的行末，点亮了第 2 节），故弃用。
//
// 依赖以参数注入，便于在无 DOM 环境下做纯函数测试。

import { VERSE_ATTR } from '../shared/passage'

export const VERSE_SELECTOR = `[${VERSE_ATTR}]`
export const VERSE_NUMBER_CLASS = 'vnum'

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
}

export interface VerseRects {
  verse: number
  /** 每个视觉行一个矩形（inline 元素 getClientRects 的天然结果） */
  rects: readonly RectLike[]
}

export interface PointHitDeps {
  /** 等价于 document.elementFromPoint */
  elementAt(x: number, y: number): Element | null
  /** 当前各节的逐行矩形（每次点击现取，滚动后坐标才准） */
  verseRects(): readonly VerseRects[]
}

function verseNumberOf(el: Element): number | null {
  const raw = el.getAttribute(VERSE_ATTR)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * 从命中的元素反查节号：自身/祖先在 [data-verse] 内直接取；
 * 若落在节号上标，则取它紧随其后的正文元素（sup 与 span 是兄弟关系）。
 */
export function verseFromElement(el: Element | null): number | null {
  if (!el) return null
  const holder = el.closest(VERSE_SELECTOR)
  if (holder) return verseNumberOf(holder)
  const num = el.closest(`.${VERSE_NUMBER_CLASS}`)
  const sibling = num?.nextElementSibling
  if (sibling && sibling.matches(VERSE_SELECTOR)) return verseNumberOf(sibling)
  return null
}

/** 点到正文区域外（标题、页边）时留的容差，避免误点亮 */
export const POINT_TOLERANCE_PX = 4

/**
 * 按行矩形就近选节。返回 null = 该点不在任何经文行的垂直范围内。
 * 评分：垂直距离优先（先锁定"哪一行"），同行内再比水平距离。
 */
export function pickVerseByRects(
  x: number,
  y: number,
  items: readonly VerseRects[],
  tolerance = POINT_TOLERANCE_PX,
): number | null {
  let bestVerse: number | null = null
  let bestDy = Number.POSITIVE_INFINITY
  let bestDx = Number.POSITIVE_INFINITY

  for (const item of items) {
    for (const r of item.rects) {
      if (r.right <= r.left) continue // 空矩形（换行产生的 0 宽矩形）
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      // 垂直距离严格优先：先锁定"哪一行"，同一行内再比水平距离。
      // 容差只用于最后判定"是否点得太远"，不参与比较，否则相邻行会互相压不住。
      const better = dy < bestDy - 1e-6 || (Math.abs(dy - bestDy) <= 1e-6 && dx < bestDx)
      if (better) {
        bestDy = dy
        bestDx = dx
        bestVerse = item.verse
      }
    }
  }

  if (bestVerse === null) return null
  // 垂直方向离所有行都太远 → 视为点在正文之外，不动高亮
  return bestDy > tolerance ? null : bestVerse
}

/**
 * 按坐标解析节号：先精确命中（元素/节号上标），再按行矩形就近。
 * 返回 null 表示这一点不落在任何经文行上。
 */
export function resolveVerseFromPoint(x: number, y: number, deps: PointHitDeps): number | null {
  const direct = verseFromElement(deps.elementAt(x, y))
  if (direct !== null) return direct
  return pickVerseByRects(x, y, deps.verseRects())
}

/** 收集某容器内所有节的逐行矩形（浏览器侧） */
export function collectVerseRects(root: ParentNode, selector = VERSE_SELECTOR): VerseRects[] {
  const out: VerseRects[] = []
  root.querySelectorAll(selector).forEach((el) => {
    const verse = verseNumberOf(el)
    if (verse === null) return
    const rects: RectLike[] = []
    for (const r of Array.from(el.getClientRects())) {
      if (r.width <= 0 && r.height <= 0) continue
      rects.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
    }
    if (rects.length > 0) out.push({ verse, rects })
  })
  return out
}

/** 浏览器侧构造依赖 */
export function domPointDeps(root: ParentNode, doc: Document = document): PointHitDeps {
  return {
    elementAt: (x, y) => doc.elementFromPoint(x, y),
    verseRects: () => collectVerseRects(root),
  }
}

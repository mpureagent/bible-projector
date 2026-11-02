// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { VERSE_ATTR } from '../../src/shared/passage'
import {
  collectVerseRects,
  pickVerseByRects,
  resolveVerseFromPoint,
  verseFromElement,
  type VerseRects,
} from '../../src/projection/hit-test'

// 点击命中解析（W3 修复）。
// 症状：手机上单击经文不点亮，要再点一次才亮。
// 根因：经文是行内 span，包围盒跨行且含行末空白，点空白处 event.target 落到父级 .flow，
//       closest('[data-verse]') 为 null → 点击被丢弃。

function buildFlow() {
  document.body.innerHTML = ''
  const flow = document.createElement('p')
  flow.className = 'flow'
  for (const v of [1, 2, 3]) {
    const num = document.createElement('sup')
    num.className = 'vnum'
    num.textContent = String(v)
    const body = document.createElement('span')
    body.className = 'vtext'
    body.setAttribute(VERSE_ATTR, String(v))
    body.textContent = `第${v}节经文内容`
    flow.append(num, body)
  }
  document.body.appendChild(flow)
  return {
    flow,
    bodyOf: (v: number) => flow.querySelector<HTMLElement>(`[${VERSE_ATTR}="${v}"]`)!,
    numOf: (v: number) => [...flow.querySelectorAll<HTMLElement>('.vnum')].find((n) => n.textContent === String(v))!,
  }
}

// 构造"每一节占一行、行高 40"的矩形布局，便于精确验证就近判据
function rows(top = 0, lineHeight = 40, width = 300): VerseRects[] {
  return [1, 2, 3].map((verse) => ({
    verse,
    rects: [{ top: top + (verse - 1) * lineHeight, bottom: top + verse * lineHeight, left: 20, right: 20 + width }],
  }))
}

describe('verseFromElement：精确命中', () => {
  let flow: HTMLElement
  let bodyOf: (v: number) => HTMLElement
  let numOf: (v: number) => HTMLElement

  beforeEach(() => {
    ;({ flow, bodyOf, numOf } = buildFlow())
  })

  it('命中文正元素 → 该节', () => {
    expect(verseFromElement(bodyOf(2))).toBe(2)
  })

  it('命中正文内部子节点 → 该节', () => {
    const inner = document.createElement('em')
    inner.textContent = '强调'
    bodyOf(3).appendChild(inner)
    expect(verseFromElement(inner)).toBe(3)
  })

  it('命中节号上标（vtext 的兄弟）→ 后继正文那一节', () => {
    expect(verseFromElement(numOf(2))).toBe(2)
  })

  it('命中父级段落（行末空白）→ null，交给坐标兜底', () => {
    expect(verseFromElement(flow)).toBeNull()
  })

  it('null / 无关元素 / 非法数据 → null', () => {
    expect(verseFromElement(null)).toBeNull()
    const other = document.createElement('div')
    document.body.appendChild(other)
    expect(verseFromElement(other)).toBeNull()
    const bad = document.createElement('span')
    bad.setAttribute(VERSE_ATTR, 'abc')
    document.body.appendChild(bad)
    expect(verseFromElement(bad)).toBeNull()
  })
})

describe('pickVerseByRects：按行就近', () => {
  it('点在第二节行内正中 → 2', () => {
    expect(pickVerseByRects(100, 60, rows())).toBe(2)
  })

  it('点在该行行末空白（超出右边界）→ 仍是该行的节，不跳到上一节', () => {
    // 第 3 行是 y∈[80,120]；x=400 远超右边界 320，垂直距离 0，应选 3
    expect(pickVerseByRects(400, 100, rows())).toBe(3)
  })

  it('点在第一行行末空白 → 1（不是 2）', () => {
    expect(pickVerseByRects(400, 20, rows())).toBe(1)
  })

  it('点在最左页边（同一行内）→ 该行节', () => {
    expect(pickVerseByRects(0, 100, rows())).toBe(3)
  })

  it('上下远离正文（超出容差）→ null，不动高亮', () => {
    expect(pickVerseByRects(100, 300, rows())).toBeNull()
    expect(pickVerseByRects(100, -100, rows())).toBeNull()
  })

  it('点在两行之间的缝隙（容差内）→ 就近那一行', () => {
    // 行 1: [0,40]，行 2: [40,80]；y=41 落在行 2 内
    expect(pickVerseByRects(100, 41, rows())).toBe(2)
    expect(pickVerseByRects(100, 39, rows())).toBe(1)
  })

  it('多行节（同一节占两行）→ 两行都归属同一节', () => {
    const items: VerseRects[] = [
      { verse: 7, rects: [
        { top: 0, bottom: 40, left: 0, right: 200 },
        { top: 40, bottom: 80, left: 0, right: 120 },
      ] },
      { verse: 8, rects: [{ top: 40, bottom: 80, left: 120, right: 300 }] },
    ]
    expect(pickVerseByRects(50, 20, items)).toBe(7)
    expect(pickVerseByRects(50, 60, items)).toBe(7) // 第二行左半仍属 7
    expect(pickVerseByRects(250, 60, items)).toBe(8) // 第二行右半属 8
  })

  it('空矩形被忽略（换行产生的 0 宽矩形）', () => {
    const items: VerseRects[] = [
      { verse: 1, rects: [{ top: 0, bottom: 0, left: 0, right: 0 }] },
      { verse: 2, rects: [{ top: 100, bottom: 140, left: 0, right: 100 }] },
    ]
    expect(pickVerseByRects(50, 120, items)).toBe(2)
  })
})

describe('resolveVerseFromPoint：组合路径', () => {
  it('精确命中优先，不查矩形', () => {
    const { bodyOf } = buildFlow()
    let called = false
    const v = resolveVerseFromPoint(10, 10, {
      elementAt: () => bodyOf(1),
      verseRects: () => {
        called = true
        return []
      },
    })
    expect(v).toBe(1)
    expect(called).toBe(false)
  })

  it('命中父级段落（行末空白）→ 用矩形就近解析', () => {
    const { flow } = buildFlow()
    expect(
      resolveVerseFromPoint(400, 100, { elementAt: () => flow, verseRects: () => rows() }),
    ).toBe(3)
  })

  it('两条路径都落空 → null', () => {
    const { flow } = buildFlow()
    expect(resolveVerseFromPoint(0, 9999, { elementAt: () => flow, verseRects: () => rows() })).toBeNull()
  })
})

describe('collectVerseRects：真实 DOM 收集', () => {
  it('按节收集逐行矩形，无布局信息的元素被跳过（不产空记录）', () => {
    const { flow, bodyOf } = buildFlow()
    // happy-dom 不做布局，getClientRects 恒为空；这里注入两行矩形模拟真实浏览器
    const stub = (el: HTMLElement, rects: Array<[number, number, number, number]>) => {
      Object.defineProperty(el, 'getClientRects', {
        configurable: true,
        value: () =>
          rects.map(([top, bottom, left, right]) => ({ top, bottom, left, right, width: right - left, height: bottom - top })),
      })
    }
    stub(bodyOf(1), [[0, 40, 20, 320]])
    stub(bodyOf(2), [
      [40, 80, 20, 320],
      [80, 120, 20, 140],
    ])
    // 第 3 节故意不给矩形 → 应被过滤

    const rects = collectVerseRects(flow)
    expect(rects.map((r) => r.verse)).toEqual([1, 2])
    expect(rects[1]!.rects).toHaveLength(2)
    expect(rects[0]!.rects[0]).toMatchObject({ top: 0, bottom: 40, left: 20, right: 320 })
  })
})

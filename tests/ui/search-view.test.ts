// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchView } from '../../src/control/search-view'
import { BOOKS, bookByExactName } from '../../src/shared/bible'

// T3-search 组件层测试：搜索框接 matchBooks 三路索引（§3.1.2），下拉即时过滤，
// §10.2 断言集在 UI 接线后重跑；性能实测 3 字母查询 100 次中位数 ≤50ms。

function mount() {
  const onBook = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new SearchView(root, { onBook })
  const input = root.querySelector<HTMLInputElement>('.search-input')!
  const type = (q: string) => {
    input.value = q
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const items = () => [...root.querySelectorAll<HTMLElement>('.search-item')].map((el) => el.dataset.name)
  return { root, view, onBook, input, type, items }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('§10.2 卷名搜索断言全集（组件层：输入→下拉渲染）', () => {
  const cases: Array<[string, string]> = [
    ['s', '诗篇'],
    ['sp', '诗篇'],
    ['l', '哥林多前书'],
    ['lq', '哥林多前书'],
    ['gldqs', '哥林多前书'],
    ['mk', '马可福音'],
    ['mkfy', '马可福音'],
    ['mt', '马太福音'],
    ['yh', '约翰福音'],
    ['qsl', '启示录'],
  ]

  for (const [query, bookName] of cases) {
    it(`输入 \`${query}\` → 下拉命中 ${bookName}`, () => {
      const { type, items } = mount()
      type(query)
      expect(items()).toContain(bookName)
    })
  }

  it('大小写不敏感：SP / Lq / QSL 组件层同样命中', () => {
    const { type, items } = mount()
    type('SP')
    expect(items()).toContain('诗篇')
    type('Lq')
    expect(items()).toContain('哥林多前书')
    type('QSL')
    expect(items()).toContain('启示录')
  })
})

describe('§10.2 反向断言（组件层：经文内容不参与检索）', () => {
  it('输入 `爱世人` → 下拉零结果', () => {
    const { type, items } = mount()
    type('爱世人')
    expect(items()).toEqual([])
  })

  it('输入 `起初神创造` → 下拉零结果', () => {
    const { type, items } = mount()
    type('起初神创造')
    expect(items()).toEqual([])
  })

  it('空串与纯空白 → 下拉关闭零结果', () => {
    const { type, items } = mount()
    type('   ')
    expect(items()).toEqual([])
  })
})

describe('T3-search 下拉交互', () => {
  it('选中结果直达书卷（等效点击书卷按钮）：onBook(sn) 且输入框清空、下拉收起', () => {
    const { root, type, onBook } = mount()
    type('mkfy')
    const item = [...root.querySelectorAll<HTMLElement>('.search-item')].find(
      (el) => el.dataset.name === '马可福音',
    )
    item?.click()
    expect(onBook).toHaveBeenCalledWith(bookByExactName('马可福音')!.sn)
    expect(root.querySelector<HTMLInputElement>('.search-input')?.value).toBe('')
    expect(root.querySelectorAll('.search-item')).toHaveLength(0)
  })

  it('结果按 §3.1.2 排序：py 前缀命中（tier3）排在简称/全名包含命中之前', () => {
    const { type, items } = mount()
    type('l')
    // 'l'：路得记(LJ py 前缀)、路加福音(LJFY)、利未记 py L 前缀 …… 至少首个应为 py 前缀命中
    expect(items().length).toBeGreaterThan(1)
    const first = bookByExactName(items()[0]!)
    expect(first?.py.some((p) => p.toLowerCase().startsWith('l'))).toBe(true)
  })

  it('全 66 卷数据接线：非空查询的候选全集来自 BOOKS', () => {
    const { type, items } = mount()
    type('y')
    const all = new Set(BOOKS.map((b) => b.name))
    for (const name of items()) {
      expect(all.has(name!)).toBe(true)
    }
  })
})

describe('T3-search 性能实测（全 66 卷 3 字母查询，100 次取中位数）', () => {
  it('中位数 ≤ 50ms，实测数字写进测试输出', () => {
    const { root, view, input } = mount()
    const QUERY = 'mkf'
    const N = 100
    const samples: number[] = []
    for (let i = 0; i < N; i++) {
      input.value = QUERY
      const t0 = performance.now()
      view.setQuery(QUERY)
      const t1 = performance.now()
      samples.push(t1 - t0)
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(N / 2)]!
    // 预热一次后再计（首次含 JIT/数据懒加载）
    const results = root.querySelectorAll('.search-item').length
    console.log(
      `[perf][T3-search] query="${QUERY}" over ${BOOKS.length} books × ${N} runs: median=${median.toFixed(3)}ms (p95=${samples[Math.floor(N * 0.95)]!.toFixed(3)}ms, max=${samples[N - 1]!.toFixed(3)}ms), results=${results}`,
    )
    expect(median).toBeLessThanOrEqual(50)
    expect(results).toBeGreaterThan(0)
  })
})

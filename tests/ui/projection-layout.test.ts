// @vitest-environment happy-dom
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { renderProjection } from '../../src/projection/render'
import { chapterVerses } from '../../src/shared/bible'
import { AppStateStore } from '../../src/main/store'
import type { AppState, ProjectionStyle, Selection } from '../../src/shared/types'
import type { Persistence } from '../../src/main/store'

// T7-flow（R2/R4）投影排版：整段所选范围自然段落连续流一次排版（分页引擎已退役）、
// 隐藏开关、字号上限、8% 安全区、≤100ms 实测。

const ps119 = chapterVerses(19, 119)

const baseStyle: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  backgroundMode: 'theme',
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

const style = (patch: Partial<ProjectionStyle>): ProjectionStyle => ({ ...baseStyle, ...patch })

const stateWith = (patch: Partial<AppState>): AppState => ({
  selection: null,
  style: style({}),
  display: null,
  projecting: false,
  ...patch,
})

const ps119sel = (from: number, to = from): Selection => ({ sn: 19, chapter: 119, verses: { from, to } })

function mount(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

describe('T7-flow 整段渲染（分页引擎退役，纵向瀑布流）', () => {
  it('整章 176 节：.flow 内上标节号 = 1..176 全覆盖、无丢失无重复', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1, 176) }))
    const nums = [...root.querySelectorAll('.flow sup.vnum')].map((s) => Number(s.textContent))
    expect(nums).toEqual(Array.from({ length: 176 }, (_, i) => i + 1))
    expect(root.querySelectorAll('.flow > .vtext')).toHaveLength(176)
  })

  it('不再只渲染一页：from=1..176 时首节与末节文本同时在 DOM（分页语义消失）', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1, 176) }))
    expect(root.textContent).toContain(ps119[0]!)
    expect(root.textContent).toContain(ps119[175]!)
  })

  it('当前节高亮唯一且落在 selection.verses.from（段内句子级点亮）', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(5, 12) }))
    const currents = [...root.querySelectorAll<HTMLElement>('.flow .vtext.current')]
    expect(currents).toHaveLength(1)
    expect(currents[0]?.dataset.verse).toBe('5')
  })

  it('单节范围 from=to 亦走同一流结构（无单节模式分支）', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(3, 3) }))
    expect([...root.querySelectorAll('.flow sup.vnum')].map((s) => s.textContent)).toEqual(['3'])
    expect(root.textContent).toContain(ps119[2]!)
  })
})

describe('T7-flow 隐藏开关组合（节号/标题）', () => {
  const cases = [
    { hideVerseNumbers: false, hideTitle: false },
    { hideVerseNumbers: true, hideTitle: false },
    { hideVerseNumbers: false, hideTitle: true },
    { hideVerseNumbers: true, hideTitle: true },
  ] as const

  for (const c of cases) {
    it(`hide=${JSON.stringify(c)}：DOM 与开关一致（默认节号显示）`, () => {
      const root = mount()
      renderProjection(root, stateWith({ selection: ps119sel(1, 4), style: style(c) }))
      expect(root.querySelectorAll('sup.vnum').length).toBe(c.hideVerseNumbers ? 0 : 4)
      expect(root.querySelectorAll('.passage-title').length).toBe(c.hideTitle ? 0 : 1)
    })
  }
})

describe('T7-flow 字号上限 200px 与 8% 安全区（§11）', () => {
  it('渲染层钳制：style.fontSize 250 → .passage 200px', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1), style: style({ fontSize: 250 }) }))
    expect(root.querySelector<HTMLElement>('.passage')?.style.fontSize).toBe('200px')
  })

  it('store 层钳制：dispatch style fontSize 250 → 状态 200', () => {
    const persistence: Persistence = {
      loadConfig: () => ({}),
      saveConfig: () => {},
      loadHistory: () => [],
      saveHistory: () => {},
    }
    const store = new AppStateStore(persistence)
    store.dispatch({ type: 'style', patch: { fontSize: 250 } })
    expect(store.getState().style.fontSize).toBe(200)
  })

  it('边距 ≥8%：.passage 内联 padding 为 8%', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1) }))
    expect(root.querySelector<HTMLElement>('.passage')?.style.padding).toBe('8%')
  })
})

describe('T7-flow 性能：经文切换→投影更新 ≤100ms（×100 取中位数）', () => {
  it('诗 119 整段渲染逐次切换中位数 ≤100ms，实测数字进日志', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1, 176) }))
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const from = (i % 176) + 1
      const state = stateWith({ selection: ps119sel(from, Math.min(176, from + 8)) })
      const t0 = performance.now()
      renderProjection(root, state)
      samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    const median = samples[49]!
    console.log(
      `[T7-flow] projection-update median=${median.toFixed(3)}ms p95=${samples[94]!.toFixed(3)}ms (n=100, 诗119 段流渲染)`,
    )
    expect(median).toBeLessThanOrEqual(100)
  })
})
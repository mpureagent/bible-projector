// @vitest-environment happy-dom
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { computePages, pageForVerse } from '../../src/projection/paginate'
import { renderProjection } from '../../src/projection/render'
import { chapterVerses } from '../../src/shared/bible'
import { AppStateStore } from '../../src/main/store'
import type { AppState, ProjectionStyle, Selection } from '../../src/shared/types'
import type { Persistence } from '../../src/main/store'

// T4-layout 投影排版引擎：段落/单节两模式 DOM、翻页跟随、隐藏开关、字号上限、8% 安全区、≤100ms 实测

const ps119 = chapterVerses(19, 119)

const baseStyle: ProjectionStyle = {
  theme: 'ink',
  fontSize: 72,
  mode: 'paragraph',
  hideVerseNumbers: false,
  hideTitle: false,
  fontFamily: 'embedded-serif',
  color: null,
  verseNumberColor: null,
  currentColor: null,
  background: null,
  backgroundImage: null,
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

const style = (patch: Partial<ProjectionStyle>): ProjectionStyle => ({ ...baseStyle, ...patch })

const stateWith = (patch: Partial<AppState>): AppState => ({
  selection: null,
  style: style({}),
  blank: false,
  lock: false,
  display: null,
  projecting: false,
  ...patch,
})

const ps119sel = (verse: number): Selection => ({ sn: 19, chapter: 119, verses: { from: verse, to: verse } })

function mount(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

const viewport = { width: 1280, height: 720 }

describe('T4-layout 单节模式（一次一节超大字）', () => {
  it('仅渲染当前节：DOM 一条 .verse.current，无第 2 节文本', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1), style: style({ mode: 'single' }) }), viewport)
    const verses = root.querySelectorAll('.verse')
    expect(verses).toHaveLength(1)
    expect(verses[0]?.classList.contains('current')).toBe(true)
    expect(root.textContent).toContain(ps119[0]!)
    expect(root.textContent).not.toContain(ps119[1]!)
  })

  it('超大字生效：fontSize 200 → .passage 200px；标题行含节号', () => {
    const root = mount()
    renderProjection(
      root,
      stateWith({ selection: ps119sel(5), style: style({ mode: 'single', fontSize: 200 }) }),
      viewport,
    )
    expect(root.querySelector<HTMLElement>('.passage')?.style.fontSize).toBe('200px')
    expect(root.querySelector('.passage-title')?.textContent).toContain('第 5 节')
  })
})

describe('T4-layout 段落模式（整章连续排版 + 分页）', () => {
  it('DOM 只含当前页经文：节号集合与 computePages 当前页全等', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1) }), viewport)
    const pages = computePages(ps119, { viewportWidth: 1280, viewportHeight: 720, fontSize: 72 })
    const domNums = [...root.querySelectorAll('.verse')].map((v) => Number(v.querySelector('sup.vnum')?.textContent))
    expect(domNums).toEqual(pages[pageForVerse(pages, 1)])
  })

  it('翻节翻页跟随：from=176 → 含末节文本不含首节；from=1 → 相反', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(176) }), viewport)
    expect(root.textContent).toContain(ps119[175]!)
    expect(root.textContent).not.toContain(ps119[0]!)

    const root2 = mount()
    renderProjection(root2, stateWith({ selection: ps119sel(1) }), viewport)
    expect(root2.textContent).toContain(ps119[0]!)
    expect(root2.textContent).not.toContain(ps119[175]!)
  })

  it('当前节高亮只落在 selection.verses.from', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1) }), viewport)
    const currents = [...root.querySelectorAll('.verse.current')]
    expect(currents).toHaveLength(1)
    expect(currents[0]?.querySelector('sup.vnum')?.textContent).toBe('1')
  })
})

describe('T4-layout 隐藏开关组合（节号/标题）', () => {
  const cases = [
    { hideVerseNumbers: false, hideTitle: false },
    { hideVerseNumbers: true, hideTitle: false },
    { hideVerseNumbers: false, hideTitle: true },
    { hideVerseNumbers: true, hideTitle: true },
  ] as const

  for (const c of cases) {
    it(`hide=${JSON.stringify(c)}：DOM 与开关一致`, () => {
      const root = mount()
      renderProjection(root, stateWith({ selection: ps119sel(1), style: style(c) }), viewport)
      expect(root.querySelectorAll('sup.vnum').length).toBe(c.hideVerseNumbers ? 0 : root.querySelectorAll('.verse').length)
      expect(root.querySelectorAll('.passage-title').length).toBe(c.hideTitle ? 0 : 1)
    })
  }
})

describe('T4-layout 字号上限 200px 与 8% 安全区（§11）', () => {
  it('渲染层钳制：style.fontSize 250 → .passage 200px', () => {
    const root = mount()
    renderProjection(root, stateWith({ selection: ps119sel(1), style: style({ fontSize: 250 }) }), viewport)
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
    renderProjection(root, stateWith({ selection: ps119sel(1) }), viewport)
    expect(root.querySelector<HTMLElement>('.passage')?.style.padding).toBe('8%')
  })
})

describe('T4-layout 性能：经文切换→投影更新 ≤100ms（×100 取中位数）', () => {
  it('诗 119 段落模式逐节切换渲染中位数 ≤100ms，实测数字进日志', () => {
    const root = mount()
    const base = stateWith({ selection: ps119sel(1) })
    renderProjection(root, base, viewport)
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const verse = (i % 176) + 1
      const state = stateWith({ selection: ps119sel(verse) })
      const t0 = performance.now()
      renderProjection(root, state, viewport)
      samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    const median = samples[49]!
    console.log(
      `[T4-layout] projection-update median=${median.toFixed(3)}ms p95=${samples[94]!.toFixed(3)}ms (n=100, 诗119 整章分页渲染)`,
    )
    expect(median).toBeLessThanOrEqual(100)
  })
})

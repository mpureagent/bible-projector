// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderProjection } from '../../src/projection/render'
import { TEXTURES } from '../../src/shared/style'
import { PROJECTION_THEMES, PROJECTION_THEME_PRESETS } from '../../src/shared/themes'
import type { AppState, ProjectionStyle } from '../../src/shared/types'

// T4-style：投影渲染端 §2.3 全项接线 + §7.2 三套主题 token 全等

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
  lineHeight: 1.7,
  letterSpacing: 0,
  align: 'center',
  margin: 8,
}

const stateWith = (style: Partial<ProjectionStyle>, selectionVerse = 1): AppState => ({
  selection: { sn: 19, chapter: 119, verses: { from: selectionVerse, to: selectionVerse } },
  style: { ...baseStyle, ...style },
  display: null,
  projecting: false,
})

function mount(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}


describe('T4-style 渲染端样式全项（§2.3）', () => {
  it('字体四选：fontFamily 栈特征字体逐一致（DOM 会规范化引号）', () => {
    const features: Record<string, string> = {
      'embedded-serif': '"Bible Serif SC"',
      'system-serif': 'SimSun',
      kai: 'KaiTi',
      sans: 'Noto Sans CJK SC',
    }
    for (const key of ['embedded-serif', 'system-serif', 'kai', 'sans'] as const) {
      const root = mount()
      renderProjection(root, stateWith({ fontFamily: key }))
      expect(root.querySelector<HTMLElement>('.passage')?.style.fontFamily).toContain(features[key])
    }
  })

  it('自定义色覆盖主题：字色/节号色/当前节高亮色/背景色', () => {
    const root = mount()
    renderProjection(
      root,
      stateWith({ color: '#AABBCC', verseNumberColor: '#112233', currentColor: '#445566', background: '#001122' }),
    )
    expect(root.style.color).toBe('#AABBCC')
    expect(root.style.backgroundColor).toBe('#001122')
    expect(root.querySelector<HTMLElement>('sup.vnum')?.style.color).toBe('#112233')
    expect(root.querySelector<HTMLElement>('.flow .vtext.current')?.style.color).toBe('#445566')
  })

  it('内置纹理：backgroundImage 指向随包 svg 且 cover', () => {
    const root = mount()
    const tex = TEXTURES[0]!
    renderProjection(root, stateWith({ backgroundImage: `builtin:${tex.id}` }))
    expect(root.style.backgroundImage).toContain(`../textures/${tex.file}`)
    expect(root.style.backgroundSize).toBe('cover')
  })

  it('自定义本地背景图：file:// URL 引用', () => {
    const root = mount()
    renderProjection(root, stateWith({ backgroundImage: '/data/pics/bg.png' }))
    expect(root.style.backgroundImage).toContain('file:///data/pics/bg.png')
  })

  it('行距/字距/对齐/边距内联生效，分页跟随行距与边距', () => {
    const root = mount()
    renderProjection(root, stateWith({ lineHeight: 2.4, letterSpacing: 0.12, align: 'left', margin: 15 }))
    const passage = root.querySelector<HTMLElement>('.passage')!
    expect(passage.style.lineHeight).toBe('2.4')
    expect(passage.style.letterSpacing).toBe('0.12em')
    expect(passage.style.textAlign).toBe('left')
    expect(passage.style.padding).toBe('15%')
  })
})

describe('T4-style 预设主题一键套用（三套 token 全等）', () => {
  for (const name of ['ink', 'ivory', 'ocean'] as const) {
    it(`${name}：套用预设补丁后投影 token === PROJECTION_THEMES.${name}`, () => {
      const root = mount()
      renderProjection(root, stateWith(PROJECTION_THEME_PRESETS[name]!))
      const theme = PROJECTION_THEMES[name]!
      expect(root.style.backgroundColor).toBe(theme.background)
      expect(root.style.color).toBe(theme.color)
      expect(root.querySelector<HTMLElement>('sup.vnum')?.style.color).toBe(theme.verseNumber)
      expect(root.querySelector<HTMLElement>('.flow .vtext.current')?.style.color).toBe(theme.currentColor)
      expect(root.querySelector<HTMLElement>('.flow .vtext.current')?.style.backgroundColor).toBe(theme.currentBackground)
    })
  }
})

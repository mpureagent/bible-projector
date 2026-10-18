import { describe, expect, it } from 'vitest'
import { mapKey } from '../src/shared/keymap'
import { chapterVerses } from '../src/shared/bible'
import type { AppState, ProjectionStyle } from '../src/shared/types'

// T7-projection（R1）：黑场/锁屏功能不存在——B/L 键无意图、blank/lock 动作不在契约；
// F/Esc=退出投屏；P=投屏开合；↑↓ 翻节高亮；PgUp/PgDn 翻章边界保留。

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

const state = (patch: Partial<AppState> = {}): AppState => ({
  selection: { sn: 1, chapter: 1, verses: { from: 3, to: 3 } },
  style: { ...baseStyle },
  display: null,
  projecting: false,
  ...patch,
})

const ps119 = chapterVerses(19, 119).length

describe('§6.3 键位映射表', () => {
  it('↑↓ 翻节：创 1:3 → 2 / 4；章首章尾钳制', () => {
    const up = mapKey('ArrowUp', state())
    expect(up).toEqual({
      kind: 'action',
      action: { type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 2, to: 2 } } },
    })
    const down = mapKey('ArrowDown', state())
    expect(down).toEqual({
      kind: 'action',
      action: { type: 'select', selection: { sn: 1, chapter: 1, verses: { from: 4, to: 4 } } },
    })
    const top = mapKey('ArrowUp', state({ selection: { sn: 1, chapter: 1, verses: { from: 1, to: 1 } } }))
    expect(top).toBeNull()
    const bottom = mapKey('ArrowDown', state({ selection: { sn: 19, chapter: 119, verses: { from: ps119, to: ps119 } } }))
    expect(bottom).toBeNull()
  })

  it('PgUp/PgDn 翻章：创 1 → 出 1（无前章则忽略）；诗 119 → 诗 118；书末章忽略', () => {
    const next = mapKey('PageDown', state())
    expect(next).toEqual({
      kind: 'action',
      action: { type: 'select', selection: { sn: 1, chapter: 2, verses: { from: 1, to: 1 } } },
    })
    expect(mapKey('PageUp', state())).toBeNull() // 创 1 无前章
    const ps = state({ selection: { sn: 19, chapter: 119, verses: { from: 1, to: 1 } } })
    expect(mapKey('PageUp', ps)).toEqual({
      kind: 'action',
      action: { type: 'select', selection: { sn: 19, chapter: 118, verses: { from: 1, to: 1 } } },
    })
    const lastChapter = state({ selection: { sn: 19, chapter: 150, verses: { from: 1, to: 1 } } })
    expect(mapKey('PageDown', lastChapter)).toBeNull() // 诗篇共 150 章
  })

  it('±字号、S 抽屉', () => {
    expect(mapKey('+', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 84 } } })
    expect(mapKey('=', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 84 } } })
    expect(mapKey('-', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 60 } } })
    expect(mapKey('s', state())).toEqual({ kind: 'toggle-drawer' })
    expect(mapKey('S', state())).toEqual({ kind: 'toggle-drawer' })
  })

  it('未定义键不产生意图（防误触）', () => {
    for (const key of ['x', 'X', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', '1']) {
      expect(mapKey(key, state()), `键 ${key}`).toBeNull()
    }
  })
})

describe('T7-projection 投屏键位（R1）', () => {
  it('P 投屏/取消投屏：projecting=false → true；true → false', () => {
    expect(mapKey('p', state())).toEqual({ kind: 'action', action: { type: 'projecting', value: true } })
    expect(mapKey('P', state({ projecting: true }))).toEqual({
      kind: 'action',
      action: { type: 'projecting', value: false },
    })
  })

  it('F / Esc = 退出投屏（投屏中才产生意图；未投屏无动作）', () => {
    expect(mapKey('f', state({ projecting: true }))).toEqual({
      kind: 'action',
      action: { type: 'projecting', value: false },
    })
    expect(mapKey('F', state({ projecting: true }))).toEqual({
      kind: 'action',
      action: { type: 'projecting', value: false },
    })
    expect(mapKey('Escape', state({ projecting: true }))).toEqual({
      kind: 'action',
      action: { type: 'projecting', value: false },
    })
    expect(mapKey('f', state())).toBeNull()
    expect(mapKey('Escape', state())).toBeNull()
  })
})

describe('T7-projection 黑场/锁屏功能不存在（R1 删除令）', () => {
  it('B / L 键无任何意图（黑场/锁屏键位不存在）', () => {
    for (const key of ['b', 'B', 'l', 'L']) {
      expect(mapKey(key, state()), `键 ${key} 应为无意图`).toBeNull()
      expect(mapKey(key, state({ projecting: true })), `投屏中键 ${key} 应为无意图`).toBeNull()
    }
  })

  it('AppState 无 blank/lock 字段（状态链路不存在）', () => {
    const s = state()
    expect('blank' in s).toBe(false)
    expect('lock' in s).toBe(false)
  })

  it('无选择时翻节翻章为空操作', () => {
    const empty = state({ selection: null })
    expect(mapKey('ArrowDown', empty)).toBeNull()
    expect(mapKey('PageDown', empty)).toBeNull()
  })
})

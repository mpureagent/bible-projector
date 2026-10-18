import { describe, expect, it } from 'vitest'
import { mapKey } from '../src/shared/keymap'
import { chapterVerses } from '../src/shared/bible'
import type { AppState, ProjectionStyle } from '../src/shared/types'

// T4-keys：§6.3 键位映射表 + 锁屏拦截（除 L 外全禁）+ 翻节/翻章边界

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
  blank: false,
  lock: false,
  display: null,
  projecting: false,
  ...patch,
})

const ps119 = chapterVerses(19, 119).length

describe('T4-keys §6.3 键位映射表', () => {
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

  it('B 黑场开关、L 锁屏开关、±字号、S 抽屉、F 全屏、Esc 语义', () => {
    expect(mapKey('b', state())).toEqual({ kind: 'action', action: { type: 'blank', value: true } })
    expect(mapKey('b', state({ blank: true }))).toEqual({ kind: 'action', action: { type: 'blank', value: false } })
    expect(mapKey('l', state())).toEqual({ kind: 'action', action: { type: 'lock', value: true } })
    expect(mapKey('l', state({ lock: true }))).toEqual({ kind: 'action', action: { type: 'lock', value: false } })
    expect(mapKey('+', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 84 } } })
    expect(mapKey('=', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 84 } } })
    expect(mapKey('-', state())).toEqual({ kind: 'action', action: { type: 'style', patch: { fontSize: 60 } } })
    expect(mapKey('s', state())).toEqual({ kind: 'toggle-drawer' })
    expect(mapKey('S', state())).toEqual({ kind: 'toggle-drawer' })
    expect(mapKey('f', state())).toEqual({ kind: 'toggle-fullscreen' })
    // Esc：黑场开 → 一键恢复黑场；无黑场 → 退出全屏
    expect(mapKey('Escape', state({ blank: true }))).toEqual({ kind: 'action', action: { type: 'blank', value: false } })
    expect(mapKey('Escape', state())).toEqual({ kind: 'exit-fullscreen' })
  })

  it('未定义键不产生意图（防误触）', () => {
    for (const key of ['x', 'X', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', '1']) {
      expect(mapKey(key, state()), `键 ${key}`).toBeNull()
    }
  })
})

describe('T6-project 投屏键位（P 键 + Esc 语义不变）', () => {
  it('P 投屏/取消投屏：projecting=false → true；true → false', () => {
    expect(mapKey('p', state())).toEqual({ kind: 'action', action: { type: 'projecting', value: true } })
    expect(mapKey('P', state({ projecting: true }))).toEqual({
      kind: 'action',
      action: { type: 'projecting', value: false },
    })
  })

  it('锁屏下 P 被拦截（防误触，与 B/F 同语义）', () => {
    expect(mapKey('p', state({ lock: true }))).toBeNull()
    expect(mapKey('P', state({ lock: true }))).toBeNull()
  })

  it('控制窗 Esc 语义保持既有：黑场优先，否则退出全屏', () => {
    expect(mapKey('Escape', state({ blank: true }))).toEqual({ kind: 'action', action: { type: 'blank', value: false } })
    expect(mapKey('Escape', state())).toEqual({ kind: 'exit-fullscreen' })
  })
})

describe('T4-keys 锁屏拦截（防误触语义）', () => {
  const locked = state({ lock: true })

  it('锁屏下除 L 外全部禁用', () => {
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'b',
      'B',
      'f',
      'F',
      's',
      'S',
      '+',
      '-',
      'Escape',
    ]) {
      expect(mapKey(key, locked), `锁屏下键 ${key} 应被拦截`).toBeNull()
    }
  })

  it('L 在锁屏下仍可解锁', () => {
    expect(mapKey('l', locked)).toEqual({ kind: 'action', action: { type: 'lock', value: false } })
    expect(mapKey('L', locked)).toEqual({ kind: 'action', action: { type: 'lock', value: false } })
  })

  it('无选择时翻节翻章为空操作', () => {
    const empty = state({ selection: null })
    expect(mapKey('ArrowDown', empty)).toBeNull()
    expect(mapKey('PageDown', empty)).toBeNull()
  })
})

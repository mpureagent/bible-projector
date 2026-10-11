import { describe, expect, it } from 'vitest'
import { normalizeVerse } from '../scripts/normalize.mjs'

// 语义基线：docs/technical-plan.md §3.1.1 对账总数（3589 节 / 1,069,107→1,064,925）
// 唯一可复现来源为 T1 spike /data/spikes/db-analysis/normalize_check.py 的 normalize()，
// 见 tests/build-data.test.mjs 与 spike 产物的逐节比对断言。
describe('归一化规则（§3.1.1，方案对账数字为标准）', () => {
  it('N1：删除 U+3000 全角敬空格（不转半角）', () => {
    expect(normalizeVerse('起初，\u3000神创造天地。')).toBe('起初，神创造天地。')
  })

  it('N1：节首 U+3000 删除', () => {
    expect(normalizeVerse('\u3000神说：“要有光”')).toBe('神说：“要有光”')
  })

  it('N1：句中连续 U+3000 删除', () => {
    expect(normalizeVerse('称水的聚处为“海”。\u3000\u3000神看着是好的。')).toBe(
      '称水的聚处为“海”。神看着是好的。',
    )
  })

  it('N2：删除制表符（诗 105:17 原文样张）', () => {
    expect(normalizeVerse('在他们以先打发一个人去，\t\t\t\t\t约瑟被卖为奴仆。')).toBe(
      '在他们以先打发一个人去，约瑟被卖为奴仆。',
    )
  })

  it('N3：\r 空洞连同其空白串一并消除（申 32:20 原文样张）', () => {
    expect(normalizeVerse('说：\r                    ‘我要向他们掩面')).toBe(
      '说：‘我要向他们掩面',
    )
  })

  it('N4：节首尾空白去除', () => {
    expect(normalizeVerse('  经文。 ')).toBe('经文。')
  })

  it('N4：引号后 CJK 邻接多余空格删除（创 3:16 原文样张）', () => {
    expect(normalizeVerse('说：“ 我必多多加增你怀胎的苦楚')).toBe('说：“我必多多加增你怀胎的苦楚')
  })

  it('N4：ASCII 字母/数字邻接的空格保留（代上 6:33 “： 34” 样张）', () => {
    expect(normalizeVerse('记在下面： 34哥辖的子孙')).toBe('记在下面： 34哥辖的子孙')
  })

  it('N5：空经文保持空串（保留行号由数组下标承担）', () => {
    expect(normalizeVerse('')).toBe('')
  })

  it('N6：未列字符原样保留（〔〕·、数字等）', () => {
    expect(normalizeVerse('（有古卷加：16有耳可听的，就应当听！）')).toBe(
      '（有古卷加：16有耳可听的，就应当听！）',
    )
  })

  it('ASCII 句点串（≥3）折叠为中文省略号……', () => {
    expect(normalizeVerse('他说......完了')).toBe('他说……完了')
    expect(normalizeVerse('三点了...')).toBe('三点了……')
    expect(normalizeVerse('两个点..不折叠')).toBe('两个点..不折叠')
  })
})

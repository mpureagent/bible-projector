import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildBible } from '../scripts/build-data.mjs'

// 断言数字来源：docs/technical-plan.md §3.1.1 / §10.2（标准，不许改）
const SPIKE_BIBLE = '/data/spikes/db-analysis/generated/bible.json'

let db
let bible
let stats

beforeAll(() => {
  db = new Database('data/cuv-simplified.db', { readonly: true })
  const built = buildBible(db)
  bible = built.bible
  stats = built.stats
})

describe('归一化总量对账（§3.1.1）', () => {
  it('改写 3589 节', () => {
    expect(stats.changedVerses).toBe(3589)
  })

  it('字符 1,069,107 → 1,064,925', () => {
    expect(stats.rawChars).toBe(1069107)
    expect(stats.normalizedChars).toBe(1064925)
  })

  it('U+3000 共删除 4104 处', () => {
    expect(stats.u3000Removed).toBe(4104)
  })

  it('N5 skip 标记 82 行', () => {
    expect(stats.skipVerses).toBe(82)
  })
})

describe('定点样张（§3.1.1 / T2 任务单）', () => {
  it('创 1:1 渲染后 = 起初，神创造天地。', () => {
    expect(bible.verses['1']['1'][0]).toBe('起初，神创造天地。')
  })

  it('申 32:20 无 \\r 空洞', () => {
    const t = bible.verses['5']['32'][19]
    expect(t).not.toContain('\r')
    expect(t.startsWith('说：‘')).toBe(true)
  })

  it('诗 105:17 无制表符', () => {
    expect(bible.verses['19']['105'][16]).not.toContain('\t')
  })

  it('产物全文无 U+3000 / 制表符 / CR 残留', () => {
    let bad = 0
    for (const chapters of Object.values(bible.verses)) {
      for (const verses of Object.values(chapters)) {
        for (const t of verses) {
          if (/[\u3000\t\r]/.test(t)) bad++
        }
      }
    }
    expect(bad).toBe(0)
  })
})

describe('bible.json 结构（§5.3）', () => {
  it('66 卷，31,103 节', () => {
    expect(bible.books).toHaveLength(66)
    let total = 0
    for (const chapters of Object.values(bible.verses)) {
      for (const verses of Object.values(chapters)) total += verses.length
    }
    expect(total).toBe(31103)
  })

  it('books 字段：sn/name/short/py/cat/testament/chapters（约翰福音样例）', () => {
    const john = bible.books.find((b) => b.sn === 43)
    expect(john).toEqual({
      sn: 43,
      name: '约翰福音',
      short: '约',
      py: ['YH', 'YHFY', 'Y'],
      cat: 6,
      testament: 1,
      chapters: 21,
    })
  })

  it('py 为数组且三路来源正确（诗篇/林前/马可福音/启示录）', () => {
    expect(bible.books.find((b) => b.sn === 19).py).toEqual(['SP', 'S'])
    expect(bible.books.find((b) => b.sn === 46).py).toEqual(['GLQ', 'GLDQS', 'LQ'])
    expect(bible.books.find((b) => b.sn === 41).py).toEqual(['MK', 'MKFY', 'K'])
    expect(bible.books.find((b) => b.sn === 66).py).toEqual(['QSL', 'Q'])
  })

  it('N5 空经文 = 空串占位（行号由数组下标保持，如创 24:30）', () => {
    expect(bible.verses['1']['24'][29]).toBe('')
    let empty = 0
    for (const chapters of Object.values(bible.verses)) {
      for (const verses of Object.values(chapters)) {
        for (const t of verses) if (t === '') empty++
      }
    }
    expect(empty).toBe(82)
  })
})

describe('与 T1 spike 产物逐节比对（对账数字的原始来源）', () => {
  it('全部 31,103 节文本与 spike generated/bible.json 完全一致', () => {
    const spike = JSON.parse(readFileSync(SPIKE_BIBLE, 'utf-8'))
    let compared = 0
    for (const [vol, chapters] of Object.entries(spike.verses)) {
      for (const [ch, d] of Object.entries(chapters)) {
        const mine = bible.verses[vol][ch]
        expect(mine, `vol=${vol} ch=${ch}`).toBeDefined()
        expect(mine.length).toBe(d.t.length)
        for (let i = 0; i < d.t.length; i++) {
          expect(mine[i]).toBe(d.t[i])
          compared++
        }
      }
    }
    expect(compared).toBe(31103)
  })
})

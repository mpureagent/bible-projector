import Database from 'better-sqlite3'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildBible } from '../scripts/build-data.mjs'
import { matchBooks } from '../src/shared/search'
import pinyinMap from '../src/shared/pinyin-initials.json'

let books

beforeAll(() => {
  const db = new Database('data/cuv-simplified.db', { readonly: true })
  books = buildBible(db).bible.books
})

describe('拼音首字母映射表（§3.1.2）', () => {
  it('手工映射表覆盖 66 卷全名+简称全部字符，且 ≤120 字', () => {
    const needed = new Set()
    for (const b of books) {
      for (const c of b.name) needed.add(c)
      for (const c of b.short) needed.add(c)
    }
    const keys = Object.keys(pinyinMap)
    expect(keys.length).toBeLessThanOrEqual(120)
    expect(needed.size).toBe(106)
    for (const c of needed) {
      expect(pinyinMap[c], `缺少卷名字符 ${c} 的拼音首字母`).toBeDefined()
    }
  })

  it('映射值为单个大写字母 A–Z', () => {
    for (const v of Object.values(pinyinMap)) {
      expect(v).toMatch(/^[A-Z]$/)
    }
  })

  it('全名逐字首字母抽查：马可福音→MKFY、哥林多前书→GLDQS、启示录→QSL、王上→WS', () => {
    const initials = (s) => [...s].map((c) => pinyinMap[c]).join('')
    expect(initials('马可福音')).toBe('MKFY')
    expect(initials('哥林多前书')).toBe('GLDQS')
    expect(initials('启示录')).toBe('QSL')
    expect(initials('王上')).toBe('WS')
  })
})

describe('§10.2 卷名搜索断言全集（正向十条）', () => {
  const cases = [
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
    it(`\`${query}\` → 命中 ${bookName}`, () => {
      const hits = matchBooks(query, books).map((b) => b.name)
      expect(hits).toContain(bookName)
    })
  }

  it('大小写不敏感：SP / Lq / QSL 同样命中', () => {
    expect(matchBooks('SP', books).map((b) => b.name)).toContain('诗篇')
    expect(matchBooks('Lq', books).map((b) => b.name)).toContain('哥林多前书')
    expect(matchBooks('QSL', books).map((b) => b.name)).toContain('启示录')
  })
})

describe('§10.2 反向断言（经文内容检索不存在）', () => {
  it('输入 `爱世人` 零结果', () => {
    expect(matchBooks('爱世人', books)).toEqual([])
  })

  it('输入 `起初神创造` 零结果', () => {
    expect(matchBooks('起初神创造', books)).toEqual([])
  })
})

describe('排序规则（§3.1.2.3：前缀精确 > 简称命中 > 全名包含）', () => {
  const fixture = [
    { sn: 1, name: '甲乙全书', short: '甲', py: ['JYQS', 'J'], cat: 1, testament: 0, chapters: 1 },
    { sn: 2, name: '甲乙略书', short: '略', py: ['AB', 'L'], cat: 1, testament: 0, chapters: 1 },
    { sn: 3, name: '丙丁书', short: '丙', py: ['CD', 'B'], cat: 1, testament: 0, chapters: 1 },
  ]

  it('py 前缀精确命中排在简称/全名包含命中之前', () => {
    // 'j' 在卷1 py(JYQS/J) 前缀命中；卷2 全名包含 '甲' 不含 'j'；query '甲' 时卷1/卷2 全名包含、卷1 简称命中
    const r = matchBooks('甲', fixture)
    expect(r[0].sn).toBe(1) // 简称命中(甲) 优于 全名包含
    expect(r.map((b) => b.sn)).toEqual([1, 2])
    const r2 = matchBooks('j', fixture)
    expect(r2.map((b) => b.sn)).toEqual([1]) // 唯一 py 前缀命中
  })
})

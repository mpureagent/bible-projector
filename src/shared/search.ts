// §3.1.2 卷名拼音首字母三路索引 + §10.2 搜索断言的匹配器。
// 检索仅作用于卷名（66 卷），不触碰经文内容——反向断言（爱世人→零结果）由本模块结构保证。

export interface BookEntry {
  sn: number
  name: string
  short: string
  py: string[]
  cat: number
  testament: number
  chapters: number
}

export function matchBooks(query: string, books: BookEntry[]): BookEntry[] {
  const q = query.trim()
  if (!q) return []
  const lower = q.toLowerCase()
  const hits: Array<{ book: BookEntry; tier: number }> = []
  for (const book of books) {
    let tier = 0
    if (book.py.some((p) => p.toLowerCase().startsWith(lower))) {
      tier = 3
    } else if (book.short.includes(q)) {
      tier = 2
    } else if (book.name.includes(q)) {
      tier = 1
    }
    if (tier > 0) hits.push({ book, tier })
  }
  return hits
    .sort((a, b) => b.tier - a.tier || a.book.sn - b.book.sn)
    .map((h) => h.book)
}

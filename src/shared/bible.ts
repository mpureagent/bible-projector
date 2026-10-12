// 渲染端经文数据访问：唯一来源 generated/bible.json（build-data.mjs 产物，§5.3）。
import bible from '../../generated/bible.json'

export interface BibleBook {
  sn: number
  name: string
  short: string
  py: string[]
  cat: number
  testament: number
  chapters: number
}

interface BibleData {
  books: BibleBook[]
  verses: Record<string, Record<string, string[]>>
}

const data = bible as unknown as BibleData

export const BOOKS: readonly BibleBook[] = data.books

export function bookBySn(sn: number): BibleBook | undefined {
  return data.books.find((b) => b.sn === sn)
}

export function bookByExactName(name: string): BibleBook | undefined {
  return data.books.find((b) => b.name === name)
}

export function chapterVerses(sn: number, chapter: number): string[] {
  return data.verses[String(sn)]?.[String(chapter)] ?? []
}

export function verseText(sn: number, chapter: number, verse: number): string | undefined {
  return chapterVerses(sn, chapter)[verse - 1]
}

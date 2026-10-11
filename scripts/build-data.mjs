#!/usr/bin/env node
// §3.1.1/§3.1.2/§5.3：SQLite → generated/bible.json 构建脚本（better-sqlite3 仅限构建期使用）。
// 用法：node scripts/build-data.mjs [输出路径=generated/bible.json]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeVerse } from './normalize.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pinyinMap = JSON.parse(
  readFileSync(resolve(here, '../src/shared/pinyin-initials.json'), 'utf-8'),
)

const initialsOf = (name) => [...name].map((c) => pinyinMap[c]).join('')

export function buildBible(db) {
  const bookRows = db
    .prepare(
      'SELECT SN, KindSN, ChapterNumber, NewOrOld, PinYin, ShortName, FullName FROM BibleID ORDER BY SN',
    )
    .all()
  const verseRows = db
    .prepare(
      'SELECT VolumeSN, ChapterSN, VerseSN, Lection FROM Bible ORDER BY VolumeSN, ChapterSN, VerseSN',
    )
    .all()

  const verses = {}
  const stats = {
    versesTotal: 0,
    changedVerses: 0,
    rawChars: 0,
    normalizedChars: 0,
    u3000Removed: 0,
    skipVerses: 0,
  }

  for (const row of verseRows) {
    const raw = row.Lection ?? ''
    const text = normalizeVerse(raw)
    stats.versesTotal += 1
    stats.rawChars += raw.length
    stats.normalizedChars += text.length
    if (text !== raw) stats.changedVerses += 1
    stats.u3000Removed += (raw.match(/\u3000/g) || []).length
    if (text === '') stats.skipVerses += 1
    const vol = (verses[String(row.VolumeSN)] ??= {})
    const chapter = (vol[String(row.ChapterSN)] ??= [])
    chapter[row.VerseSN - 1] = text
  }

  const books = bookRows.map((b) => {
    const py = [String(b.PinYin || '').toUpperCase(), initialsOf(b.FullName), initialsOf(b.ShortName)]
      .filter(Boolean)
    return {
      sn: b.SN,
      name: b.FullName,
      short: b.ShortName,
      py: [...new Set(py)],
      cat: b.KindSN,
      testament: b.NewOrOld ? 1 : 0,
      chapters: b.ChapterNumber,
    }
  })

  return { bible: { books, verses }, stats }
}

async function main() {
  const [, , dbArg, outArg] = process.argv
  const dbPath = dbArg ?? 'data/cuv-simplified.db'
  const outPath = outArg ?? 'generated/bible.json'
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(dbPath, { readonly: true })
  const { bible, stats } = buildBible(db)
  mkdirSync(dirname(outPath) || '.', { recursive: true })
  writeFileSync(outPath, JSON.stringify(bible))
  const size = readFileSync(outPath).length
  console.log(
    `bible.json: books=${bible.books.length} verses=${stats.versesTotal} ` +
      `changed=${stats.changedVerses} rawChars=${stats.rawChars} ` +
      `normalizedChars=${stats.normalizedChars} u3000Removed=${stats.u3000Removed} ` +
      `skip=${stats.skipVerses} size=${(size / 1024 / 1024).toFixed(2)}MB`,
  )
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) await main()

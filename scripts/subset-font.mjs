#!/usr/bin/env node
// T4-font：从 generated/bible.json 全量经文提取字符集（确定性、可审计），
// 用 fontTools 对本地 Noto Serif CJK SC（TTC font-number=2）做子集 → woff2 ≤5MB（§2.4）。
// 产物：assets/fonts/{charset.txt, bible-serif-sc.woff2, manifest.json}
// 用法：node scripts/subset-font.mjs [源TTC路径=/usr/share/fonts/google-noto-cjk/NotoSerifCJK-Regular.ttc]

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')

// 投影/控制窗固定 UI 文本（§7.1/R3/R5/R8c）；显式列出保持可审计。
// 覆盖全部界面文案 + 符号（✕ ⚙ − ＋ ≥ 全角括号等），确保打包后无缺字豆腐块。
const UI_CHARS =
  '圣言投屏控制窗搜索书卷拼音首字母简称全名旧约新约历史暂无历史未选经文复制经文投屏取消样式' +
  '预设主题排版字号字体对齐行距字距边距颜色字色节号色当前节高亮背景跟随内置纹理自定义图片纯色' +
  '显隐隐藏书卷标题重置为当前墨雾米白宣纸深水墨金深蓝羊皮纸深墨绿炭灰金雾白高对比酒红金' +
  '宋体子集黑体楷系统默认左居本地绝对路径如选经书籍起始结束先章电视请用扩展模式第卷' +
  '主题字号主屏显示器投影预览关闭抽屉窗口提示方向上下左右键' +
  '×−＋-≤≥（）%·／/；：，。、－…:： ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function extractCharset(bible) {
  const chars = new Set()
  for (const chapters of Object.values(bible.verses)) {
    for (const verses of Object.values(chapters)) {
      for (const text of verses) {
        for (const ch of text) chars.add(ch)
      }
    }
  }
  for (const book of bible.books) {
    for (const ch of book.name + book.short) chars.add(ch)
  }
  for (const ch of UI_CHARS) chars.add(ch)
  return new Set([...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)))
}

const FONT_NUMBER = 2 // TTC 内 SC 的索引（fontTools 枚举核实，Serif/Sans 同索引）

// 宋体（子集）与黑体（子集）两个源（R5：黑体优先本机 Noto Sans CJK SC 子集化）
const SOURCES = {
  serif: { path: '/usr/share/fonts/google-noto-cjk/NotoSerifCJK-Regular.ttc', number: FONT_NUMBER, family: 'Noto Serif CJK SC', out: 'bible-serif-sc.woff2' },
  sans: { path: '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc', number: FONT_NUMBER, family: 'Noto Sans CJK SC', out: 'bible-sans-sc.woff2' },
}

function subsetOne(source, fontNumber, outName, outDir) {
  const out = resolve(outDir, outName)
  execFileSync(
    'pyftsubset',
    [
      source,
      `--font-number=${fontNumber}`,
      `--text-file=${resolve(outDir, 'charset.txt')}`,
      '--flavor=woff2',
      `--output-file=${out}`,
      "--layout-features='*'",
      '--no-hinting',
      '--desubroutinize',
    ],
    { stdio: 'inherit' },
  )
  const bytes = statSync(out).size
  const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex')
  console.log(`subset: ${outName} bytes=${bytes} (${(bytes / 1024 / 1024).toFixed(3)}MB) sha256=${sha256.slice(0, 12)}…`)
  return { bytes, sha256 }
}

function main() {
  const [, , sourceArg] = process.argv
  const bible = JSON.parse(readFileSync(resolve(ROOT, 'generated/bible.json'), 'utf-8'))

  const charset = extractCharset(bible)
  const charsetText = [...charset].join('')
  const outDir = resolve(ROOT, 'assets/fonts')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'charset.txt'), charsetText)

  const serifSource = sourceArg ?? SOURCES.serif.path
  const serif = subsetOne(serifSource, SOURCES.serif.number, SOURCES.serif.out, outDir)
  const sans = subsetOne(SOURCES.sans.path, SOURCES.sans.number, SOURCES.sans.out, outDir)

  const manifest = {
    font: 'bible-serif-sc.woff2',
    source: serifSource,
    sourceFontNumber: SOURCES.serif.number,
    sourceFamily: SOURCES.serif.family,
    codepoints: [...charset].map((c) => c.codePointAt(0).toString(16)),
    chars: charset.size,
    bytes: serif.bytes,
    sha256: serif.sha256,
    sans: {
      file: 'bible-sans-sc.woff2',
      source: SOURCES.sans.path,
      sourceFontNumber: SOURCES.sans.number,
      sourceFamily: SOURCES.sans.family,
      bytes: sans.bytes,
      sha256: sans.sha256,
    },
  }
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`subset: chars=${charset.size} serif=${serif.bytes}B sans=${sans.bytes}B`)
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) main()

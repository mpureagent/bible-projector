// §2.3/§7.3 样式项枚举与校验：字体栈、对齐、内置纹理、背景图路径校验（唯一来源，控制窗与投影窗共用）。
import { FONT_FALLBACK_STACK } from './fonts'

export type FontChoice = 'embedded-serif' | 'system-serif' | 'kai' | 'sans'

export type Align = 'left' | 'center' | 'right'

export const FONT_STACKS: Record<FontChoice, string> = {
  'embedded-serif': FONT_FALLBACK_STACK,
  'system-serif': '"Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif',
  kai: '"KaiTi", "STKaiti", "AR PL UKai CN", "Noto Serif CJK SC", serif',
  sans: '"Noto Sans CJK SC", "Microsoft YaHei", "SimHei", sans-serif',
}

export const FONT_CHOICES: ReadonlyArray<{ value: FontChoice; label: string }> = [
  { value: 'embedded-serif', label: '内嵌宋体' },
  { value: 'system-serif', label: '系统宋体' },
  { value: 'kai', label: '楷体' },
  { value: 'sans', label: '黑体' },
]

export const ALIGNS: ReadonlyArray<{ value: Align; label: string }> = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

export interface Texture {
  id: string
  file: string
  name: string
}

// 内置素雅纹理（程序化 SVG 随包，scripts/gen-textures.mjs 产物）
export const TEXTURES: readonly Texture[] = [
  { id: 'ink-mist', file: 'ink-mist.svg', name: '墨雾' },
  { id: 'rice-paper', file: 'rice-paper.svg', name: '米白宣纸' },
  { id: 'deep-water', file: 'deep-water.svg', name: '深水' },
]

const BUILTIN_PREFIX = 'builtin:'
const builtinIds = new Set(TEXTURES.map((t) => `${BUILTIN_PREFIX}${t.id}`))

// 背景图取值校验：null/'' = 无；builtin:<id>；本地绝对路径。
// 返回 null 表示合法，否则返回错误文案（网络 URL 一律拒绝——离线纪律）。
export function validateBackgroundImage(value: string | null): string | null {
  if (value === null || value === '') return null
  if (value.startsWith(BUILTIN_PREFIX)) {
    return builtinIds.has(value) ? null : `未知内置纹理：${value}`
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || value.startsWith('//')) {
    return `拒绝网络 URL：${value}（仅支持本地文件）`
  }
  if (!value.startsWith('/')) {
    return `须为本地绝对路径：${value}`
  }
  return null
}

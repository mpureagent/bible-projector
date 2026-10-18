// §2.3/§7.3/§R5 样式项枚举与校验：字体栈、对齐、背景三选一（唯一来源，控制窗与投影窗共用）。
import { FONT_FALLBACK_STACK, SANS_FALLBACK_STACK } from './fonts'

export type FontChoice = 'embedded-serif' | 'sans' | 'kai' | 'system-serif'

export type Align = 'left' | 'center'

// R5：字体四选——宋体（子集）/黑体（子集）/楷体/系统默认；楷体不内嵌仅系统回退
export const FONT_STACKS: Record<FontChoice, string> = {
  'embedded-serif': FONT_FALLBACK_STACK,
  sans: SANS_FALLBACK_STACK,
  kai: '"楷体", "KaiTi", serif',
  'system-serif': 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
}

export const FONT_CHOICES: ReadonlyArray<{ value: FontChoice; label: string }> = [
  { value: 'embedded-serif', label: '宋体（子集）' },
  { value: 'sans', label: '黑体（子集）' },
  { value: 'kai', label: '楷体' },
  { value: 'system-serif', label: '系统默认' },
]

// R5：对齐仅左/居中（两端对齐否决）
export const ALIGNS: ReadonlyArray<{ value: Align; label: string }> = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
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

// R8c：背景三选一的状态枚举（theme=随主题 token；texture/image/color 互斥）
export type BackgroundMode = 'theme' | 'texture' | 'image' | 'color'

const BUILTIN_PREFIX = 'builtin:'
const builtinIds = new Set(TEXTURES.map((t) => `${BUILTIN_PREFIX}${t.id}`))
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

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

export function isBuiltinTexture(value: string | null): boolean {
  return value !== null && builtinIds.has(value)
}

export function validateColor(value: string | null): boolean {
  return value !== null && HEX_COLOR.test(value)
}
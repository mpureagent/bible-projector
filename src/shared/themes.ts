// §5.2 书卷分类着色 token：8 类低饱和色，与控制窗象牙白底（#F7F4EE）和谐。
// cat=2/7 同为雾蓝、cat=5/8 同为灰粉，遵 §5.2 表；渲染端与测试共用此唯一来源。

import type { ProjectionStyle, ThemeName } from './types'

export interface CategoryColor {
  background: string
  border: string
}

export const CATEGORY_NAMES: Record<number, string> = {
  1: '律法',
  2: '历史',
  3: '诗歌智慧',
  4: '大先知',
  5: '小先知',
  6: '福音·使徒',
  7: '保罗书信',
  8: '通用书信·启示',
}

export const CATEGORY_COLORS: Record<number, CategoryColor> = {
  1: { background: '#E9DFC9', border: '#CDBE9A' }, // 暖沙
  2: { background: '#D9E1E7', border: '#B4C2CC' }, // 雾蓝
  3: { background: '#E5DDE9', border: '#C6B8CF' }, // 藕紫
  4: { background: '#D6E1D3', border: '#AEC3AA' }, // 松绿
  5: { background: '#E8DCD7', border: '#CCB8B0' }, // 灰粉
  6: { background: '#EADFC2', border: '#C9B580' }, // 金黄
  7: { background: '#D9E1E7', border: '#B4C2CC' }, // 雾蓝
  8: { background: '#E8DCD7', border: '#CCB8B0' }, // 灰粉
}

// 主题中文显示名（R5 表）
export const THEME_LABELS: Record<ThemeName, string> = {
  ink: '墨金',
  ivory: '米白',
  ocean: '深蓝',
  parchment: '羊皮纸',
  forest: '深墨绿',
  charcoal: '炭灰金',
  contrast: '雾白高对比',
  wine: '酒红金',
}

// §7.2/R5 投影预设主题 token：background/color/verseNumber 严格照 design-v2-notes R5 表；
// currentColor/currentBackground = 当前节「句子级点亮」的高亮字色/底色（R2，会众跟读定位）。
export interface ProjectionTheme {
  background: string
  color: string
  verseNumber: string
  currentColor: string
  currentBackground: string
}

// R5 定稿 8 套（bg/fg/accent 三值严格照表；accent 即节号色）
export const PROJECTION_THEMES: Record<ThemeName, ProjectionTheme> = {
  ink: { background: '#101418', color: '#E8C87A', verseNumber: '#8A7440', currentColor: '#FFE9B0', currentBackground: '#33290F' },
  ivory: { background: '#F5F1E8', color: '#2A2622', verseNumber: '#8C8375', currentColor: '#8C5A2B', currentBackground: '#EFE0C2' },
  ocean: { background: '#0E1B2A', color: '#F0E6D2', verseNumber: '#7E8CA0', currentColor: '#FDF6E3', currentBackground: '#1C3247' },
  parchment: { background: '#EDE3D0', color: '#3A2F22', verseNumber: '#9A8468', currentColor: '#9A4A2A', currentBackground: '#E2C7A6' },
  forest: { background: '#0F1F18', color: '#D8E8D4', verseNumber: '#6F8A78', currentColor: '#EFF9EA', currentBackground: '#234034' },
  charcoal: { background: '#1C1C1E', color: '#E5E5E5', verseNumber: '#8E8E93', currentColor: '#FFFFFF', currentBackground: '#33333A' },
  contrast: { background: '#FFFFFF', color: '#111111', verseNumber: '#666666', currentColor: '#111111', currentBackground: '#FFE9A8' },
  wine: { background: '#2B0F14', color: '#F2D8B8', verseNumber: '#A87B5C', currentColor: '#FFE4C0', currentBackground: '#4A2028' },
}

// 一键套用补丁（R5/R8c）：置主题并清空全部自定义覆盖、背景回归主题 token
export const PROJECTION_THEME_PRESETS: Record<ThemeName, Partial<ProjectionStyle>> = {
  ink: { theme: 'ink', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  ivory: { theme: 'ivory', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  ocean: { theme: 'ocean', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  parchment: { theme: 'parchment', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  forest: { theme: 'forest', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  charcoal: { theme: 'charcoal', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  contrast: { theme: 'contrast', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
  wine: { theme: 'wine', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null, backgroundMode: 'theme' },
}
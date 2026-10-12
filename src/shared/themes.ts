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

// §7.2 投影预设主题 token（节号色/当前节高亮色为 T4 新增列，渲染端唯一来源）
export interface ProjectionTheme {
  background: string
  color: string
  verseNumber: string
  currentColor: string
}

export const PROJECTION_THEMES: Record<string, ProjectionTheme> = {
  ink: { background: '#101418', color: '#E8C87A', verseNumber: '#8A7440', currentColor: '#FFE9B0' },
  ivory: { background: '#F5F1E8', color: '#2A2622', verseNumber: '#8C8375', currentColor: '#8C5A2B' },
  ocean: { background: '#0E1B2A', color: '#F0E6D2', verseNumber: '#7E8CA0', currentColor: '#FDF6E3' },
}

// 一键套用补丁（§7.2）：置主题并清空全部自定义覆盖，回归主题 token
export const PROJECTION_THEME_PRESETS: Record<ThemeName, Partial<ProjectionStyle>> = {
  ink: { theme: 'ink', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null },
  ivory: { theme: 'ivory', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null },
  ocean: { theme: 'ocean', color: null, verseNumberColor: null, currentColor: null, background: null, backgroundImage: null },
}

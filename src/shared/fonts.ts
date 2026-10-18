// §7.3 字体回退链：子集宋体/黑体（随包 woff2）→ 系统 Noto CJK → 通用兜底。
// 楷体本机无源文件 → 不内嵌，仅走系统回退链（Windows 自带楷体，离线成立，见票尾声明）。
// 纯常量（主进程可安全引用）；DOM 注入见 font-dom.ts。

export const SUBSET_FONT_FAMILY = 'Bible Serif SC'
export const SUBSET_SANS_FAMILY = 'Bible Sans SC'

export const FONT_FALLBACK_STACK = `"${SUBSET_FONT_FAMILY}", "Noto Serif CJK SC", "Source Han Serif SC", serif`
export const SANS_FALLBACK_STACK = `"${SUBSET_SANS_FAMILY}", "Noto Sans CJK SC", "Microsoft YaHei", "SimHei", sans-serif`

export const SUBSET_FONT_URL_RELATIVE = '../fonts/bible-serif-sc.woff2'
export const SUBSET_SANS_URL_RELATIVE = '../fonts/bible-sans-sc.woff2'
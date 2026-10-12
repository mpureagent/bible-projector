// §7.3 字体回退链：子集宋体（随包 woff2）→ 系统 Noto Serif CJK SC → Source Han Serif SC → 通用 serif。
// 纯常量（主进程可安全引用）；DOM 注入见 font-dom.ts。

export const SUBSET_FONT_FAMILY = 'Bible Serif SC'

export const FONT_FALLBACK_STACK = `"${SUBSET_FONT_FAMILY}", "Noto Serif CJK SC", "Source Han Serif SC", serif`

export const SUBSET_FONT_URL_RELATIVE = '../fonts/bible-serif-sc.woff2'

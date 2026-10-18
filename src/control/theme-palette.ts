import { PROJECTION_THEMES, PROJECTION_THEME_PRESETS, THEME_LABELS } from '../shared/themes'
import type { ThemeName } from '../shared/types'

// T7-layout（R3/R5）：操作条上的主题色板选择器——每套主题一个色块缩略图。
// 色板数量由 PROJECTION_THEMES 驱动（T7-style 扩到 8 套后自动铺满），点击即 dispatch 预设补丁。

export interface ThemePaletteOptions {
  onSelect(theme: ThemeName): void
}

export class ThemePalette {
  private readonly buttons = new Map<ThemeName, HTMLButtonElement>()

  constructor(private readonly root: HTMLElement, private readonly options: ThemePaletteOptions) {
    root.classList.add('theme-palette')
    root.replaceChildren()
    for (const name of Object.keys(PROJECTION_THEMES) as ThemeName[]) {
      const theme = PROJECTION_THEMES[name]!
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'theme-swatch'
      btn.dataset.theme = name
      btn.title = THEME_LABELS[name] ?? name
      btn.setAttribute('aria-label', btn.title)
      btn.style.backgroundColor = theme.background
      btn.style.color = theme.color
      btn.style.borderColor = theme.verseNumber
      const dot = document.createElement('span')
      dot.className = 'theme-swatch-accent'
      dot.style.backgroundColor = theme.verseNumber
      btn.appendChild(dot)
      btn.addEventListener('click', () => {
        this.options.onSelect(name)
      })
      root.appendChild(btn)
      this.buttons.set(name, btn)
    }
  }

  themeNames(): ThemeName[] {
    return [...this.buttons.keys()]
  }

  renderState(theme: ThemeName): void {
    for (const [name, btn] of this.buttons) btn.classList.toggle('active', name === theme)
  }

  // 供测试/调用方取预设补丁（与 one-click 行为一致）
  preset(theme: ThemeName): Record<string, unknown> {
    return { ...PROJECTION_THEME_PRESETS[theme] } as Record<string, unknown>
  }
}
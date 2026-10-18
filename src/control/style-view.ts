import { ALIGNS, FONT_CHOICES, TEXTURES, validateBackgroundImage } from '../shared/style'
import { PROJECTION_THEME_PRESETS } from '../shared/themes'
import type { ProjectionStyle, ThemeName } from '../shared/types'

// T4-style：样式抽屉（§6.2 右抽屉）——§2.3 全项控件 + §7.2 三套预设主题一键套用。
// 所有变更即时 onPatch，经控制窗 dispatch style → store → 广播投影窗。

export interface StyleViewOptions {
  onPatch(patch: Partial<ProjectionStyle>): void
}

const CUSTOM_VALUE = 'custom'
const THEME_LABELS: Record<ThemeName, string> = { ink: '墨金', ivory: '米白', ocean: '深蓝' }

export class StyleView {
  private readonly customInput: HTMLInputElement
  private readonly error: HTMLElement

  constructor(private readonly root: HTMLElement, private readonly options: StyleViewOptions) {
    root.className = 'style-drawer'
    root.hidden = true

    const customInput = document.createElement('input')
    customInput.type = 'text'
    customInput.className = 'style-custom-input'
    customInput.dataset.field = 'backgroundImageCustom'
    customInput.placeholder = '本地绝对路径，如 /data/pics/bg.png'
    customInput.hidden = true
    customInput.addEventListener('change', () => this.submitCustomPath())
    this.customInput = customInput

    const error = document.createElement('div')
    error.className = 'style-error'
    error.textContent = ''
    this.error = error

    root.append(
      this.section('预设主题', this.themeButtons()),
      this.section(
        '排版',
        this.numberField('字号 px', 'fontSize', 8, 200, 4),
        this.selectField('字体', 'fontFamily', FONT_CHOICES),
        this.selectField('对齐', 'align', ALIGNS),
        this.numberField('行距', 'lineHeight', 1, 3, 0.1),
        this.numberField('字距 em', 'letterSpacing', 0, 0.5, 0.05),
        this.numberField('边距 %', 'margin', 8, 30, 1),
      ),
      this.section(
        '颜色',
        this.colorField('字色', 'color'),
        this.colorField('节号色', 'verseNumberColor'),
        this.colorField('当前节高亮', 'currentColor'),
        this.colorField('背景色', 'background'),
        this.resetColorsButton(),
      ),
      this.section('背景', this.backgroundSelect(), customInput, error),
      this.section('显隐', this.checkboxField('隐藏节号', 'hideVerseNumbers'), this.checkboxField('隐藏书卷标题', 'hideTitle')),
    )
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden
  }

  renderState(style: ProjectionStyle): void {
    const record = style as unknown as Record<string, unknown>
    for (const name of ['fontFamily', 'align']) {
      const el = this.root.querySelector<HTMLSelectElement>(`[data-field="${name}"]`)
      if (el) el.value = String(record[name] ?? '')
    }
    for (const name of ['fontSize', 'lineHeight', 'letterSpacing', 'margin']) {
      const el = this.root.querySelector<HTMLInputElement>(`[data-field="${name}"]`)
      if (el) el.value = String(record[name] ?? '')
    }
    for (const name of ['hideVerseNumbers', 'hideTitle']) {
      const el = this.root.querySelector<HTMLInputElement>(`[data-field="${name}"]`)
      if (el) el.checked = Boolean(record[name])
    }
    const bg = this.root.querySelector<HTMLSelectElement>('[data-field="backgroundImage"]')
    if (bg) {
      const value = style.backgroundImage
      bg.value = value?.startsWith('builtin:') ? value : value ? CUSTOM_VALUE : ''
      this.customInput.hidden = bg.value !== CUSTOM_VALUE
      if (bg.value === CUSTOM_VALUE && value) this.customInput.value = value
    }
  }

  private section(title: string, ...children: HTMLElement[]): HTMLElement {
    const box = document.createElement('div')
    box.className = 'style-section'
    const heading = document.createElement('h3')
    heading.textContent = title
    box.append(heading, ...children)
    return box
  }

  private themeButtons(): HTMLElement {
    const row = document.createElement('div')
    row.className = 'style-theme-row'
    for (const name of ['ink', 'ivory', 'ocean'] as ThemeName[]) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.theme = name
      btn.textContent = THEME_LABELS[name]
      btn.addEventListener('click', () => this.options.onPatch(PROJECTION_THEME_PRESETS[name]))
      row.appendChild(btn)
    }
    return row
  }

  private label(text: string): HTMLLabelElement {
    const label = document.createElement('label')
    label.className = 'style-label'
    label.textContent = text
    return label
  }

  private selectField(
    text: string,
    field: string,
    choices: ReadonlyArray<{ value: string; label: string }>,
  ): HTMLElement {
    const select = document.createElement('select')
    select.dataset.field = field
    for (const c of choices) {
      const option = document.createElement('option')
      option.value = c.value
      option.textContent = c.label
      select.appendChild(option)
    }
    select.addEventListener('change', () =>
      this.options.onPatch({ [field]: select.value } as Partial<ProjectionStyle>),
    )
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label(text), select)
    return wrap
  }

  private numberField(text: string, field: string, min: number, max: number, step: number): HTMLElement {
    const input = document.createElement('input')
    input.type = 'number'
    input.dataset.field = field
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.addEventListener('change', () => {
      const value = Number(input.value)
      if (!Number.isNaN(value)) this.options.onPatch({ [field]: value } as Partial<ProjectionStyle>)
    })
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label(text), input)
    return wrap
  }

  private colorField(text: string, field: string): HTMLElement {
    const input = document.createElement('input')
    input.type = 'color'
    input.dataset.field = field
    input.addEventListener('change', () =>
      this.options.onPatch({ [field]: input.value } as Partial<ProjectionStyle>),
    )
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label(text), input)
    return wrap
  }

  private resetColorsButton(): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.reset = 'colors'
    btn.textContent = '重置为主题色'
    btn.addEventListener('click', () =>
      this.options.onPatch({ color: null, verseNumberColor: null, currentColor: null, background: null }),
    )
    return btn
  }

  private backgroundSelect(): HTMLElement {
    const select = document.createElement('select')
    select.dataset.field = 'backgroundImage'
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '无'
    select.appendChild(none)
    for (const tex of TEXTURES) {
      const option = document.createElement('option')
      option.value = `builtin:${tex.id}`
      option.textContent = tex.name
      select.appendChild(option)
    }
    const custom = document.createElement('option')
    custom.value = CUSTOM_VALUE
    custom.textContent = '自定义本地文件…'
    select.appendChild(custom)
    select.addEventListener('change', () => {
      this.customInput.hidden = select.value !== CUSTOM_VALUE
      if (select.value === CUSTOM_VALUE) {
        this.submitCustomPath()
        return
      }
      this.error.textContent = ''
      this.options.onPatch({ backgroundImage: select.value === '' ? null : select.value })
    })
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label('背景图'), select)
    return wrap
  }

  private submitCustomPath(): void {
    const value = this.customInput.value.trim()
    const error = value === '' ? null : validateBackgroundImage(value)
    if (error !== null) {
      this.error.textContent = error
      return
    }
    this.error.textContent = ''
    this.options.onPatch({ backgroundImage: value === '' ? null : value })
  }

  private checkboxField(text: string, field: string): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.dataset.field = field
    input.addEventListener('change', () =>
      this.options.onPatch({ [field]: input.checked } as Partial<ProjectionStyle>),
    )
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    const label = this.label(text)
    wrap.append(input, label)
    return wrap
  }
}

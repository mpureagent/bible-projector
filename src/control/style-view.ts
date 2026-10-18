import { ALIGNS, FONT_CHOICES, TEXTURES, validateBackgroundImage } from '../shared/style'
import { PROJECTION_THEMES, PROJECTION_THEME_PRESETS, THEME_LABELS } from '../shared/themes'
import type { ProjectionStyle, ThemeName } from '../shared/types'

// T4-style/T7-style（R5/R8c）：样式抽屉——右侧滑入，✕ + 遮罩关闭。
// 8 主题缩略图｜字体四选｜字号滑块+A±｜行距/字距｜对齐左/中｜边距≥8%｜节号显隐｜
// 背景三选一（跟随主题/内置纹理 3/自定义图片/纯色，互斥）｜重置为当前主题。
// 全部变更即时 onPatch → 控制窗 dispatch style → store（清洗+互斥）→ 广播预览+投影。

export interface StyleViewOptions {
  onPatch(patch: Partial<ProjectionStyle>): void
}

export class StyleView {
  private readonly customInput: HTMLInputElement
  private readonly error: HTMLElement
  private theme: ThemeName = 'ink'
  private modeSelect!: HTMLSelectElement
  private textureSelect!: HTMLSelectElement
  private colorInput!: HTMLInputElement

  constructor(private readonly root: HTMLElement, private readonly options: StyleViewOptions) {
    root.className = 'style-overlay'
    root.hidden = true

    const mask = document.createElement('div')
    mask.className = 'style-mask'
    mask.addEventListener('click', () => this.setVisible(false))

    const panel = document.createElement('div')
    panel.className = 'style-panel'

    const head = document.createElement('div')
    head.className = 'style-head'
    const title = document.createElement('span')
    title.className = 'style-title'
    title.textContent = '样式'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'style-close'
    close.textContent = '×'
    close.setAttribute('aria-label', '关闭样式抽屉')
    close.addEventListener('click', () => this.setVisible(false))
    head.append(title, close)

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

    panel.append(
      head,
      this.section('预设主题', this.themeGrid()),
      this.section(
        '排版',
        this.rangeField('字号 px', 'fontSize', 8, 200, 1, [this.fontSteps()]),
        this.selectField('字体', 'fontFamily', FONT_CHOICES),
        this.selectField('对齐', 'align', ALIGNS),
        this.rangeField('行距', 'lineHeight', 1, 3, 0.1),
        this.rangeField('字距 em', 'letterSpacing', 0, 0.5, 0.05),
        this.rangeField('边距 %（≥8）', 'margin', 8, 30, 1),
      ),
      this.section(
        '颜色',
        this.colorField('字色', 'color'),
        this.colorField('节号色', 'verseNumberColor'),
        this.colorField('当前节高亮', 'currentColor'),
        this.resetThemeButton(),
      ),
      this.section('背景', this.backgroundModeSelect(), this.textureSelectEl(), customInput, this.colorInputEl(), error),
      this.section('显隐', this.checkboxField('隐藏节号', 'hideVerseNumbers'), this.checkboxField('隐藏书卷标题', 'hideTitle')),
    )

    root.append(mask, panel)
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden
  }

  renderState(style: ProjectionStyle): void {
    this.theme = style.theme
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
    for (const name of ['color', 'verseNumberColor', 'currentColor']) {
      const el = this.root.querySelector<HTMLInputElement>(`[data-field="${name}"]`)
      const value = record[name]
      if (el && typeof value === 'string') el.value = value
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('[data-theme]')) {
      btn.classList.toggle('active', btn.dataset.theme === style.theme)
    }
    // 背景三选一：mode 决定子控件显隐与取值
    this.modeSelect.value = style.backgroundMode
    this.textureSelect.hidden = style.backgroundMode !== 'texture'
    this.customInput.hidden = style.backgroundMode !== 'image'
    this.colorInput.hidden = style.backgroundMode !== 'color'
    if (style.backgroundMode === 'texture' && style.backgroundImage) this.textureSelect.value = style.backgroundImage
    if (style.backgroundMode === 'image' && style.backgroundImage) this.customInput.value = style.backgroundImage
    if (style.backgroundMode === 'color' && style.background) this.colorInput.value = style.background
  }

  private section(title: string, ...children: HTMLElement[]): HTMLElement {
    const box = document.createElement('div')
    box.className = 'style-section'
    const heading = document.createElement('h3')
    heading.textContent = title
    box.append(heading, ...children)
    return box
  }

  private themeGrid(): HTMLElement {
    const grid = document.createElement('div')
    grid.className = 'style-theme-grid'
    for (const name of Object.keys(PROJECTION_THEMES) as ThemeName[]) {
      const theme = PROJECTION_THEMES[name]!
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'style-theme-btn'
      btn.dataset.theme = name
      btn.title = THEME_LABELS[name]
      btn.style.backgroundColor = theme.background
      btn.style.color = theme.color
      btn.style.borderColor = theme.verseNumber
      const label = document.createElement('span')
      label.textContent = THEME_LABELS[name]
      btn.appendChild(label)
      btn.addEventListener('click', () => this.options.onPatch({ ...PROJECTION_THEME_PRESETS[name] }))
      grid.appendChild(btn)
    }
    return grid
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

  private rangeField(
    text: string,
    field: string,
    min: number,
    max: number,
    step: number,
    extra: HTMLElement[] = [],
  ): HTMLElement {
    const input = document.createElement('input')
    input.type = 'range'
    input.dataset.field = field
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    const commit = (): void => {
      const value = Number(input.value)
      if (!Number.isNaN(value)) this.options.onPatch({ [field]: value } as Partial<ProjectionStyle>)
    }
    input.addEventListener('input', commit)
    input.addEventListener('change', commit)
    const wrap = document.createElement('div')
    wrap.className = 'style-field style-field-range'
    wrap.append(this.label(text), input, ...extra)
    return wrap
  }

  private fontSteps(): HTMLElement {
    const row = document.createElement('div')
    row.className = 'font-steps'
    for (const [text, delta] of [
      ['A−', -12],
      ['A+', 12],
    ] as const) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.step = String(delta)
      btn.textContent = text
      btn.addEventListener('click', () => {
        const current = Number(this.root.querySelector<HTMLInputElement>('[data-field="fontSize"]')?.value ?? 72)
        this.options.onPatch({ fontSize: current + delta })
      })
      row.appendChild(btn)
    }
    return row
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

  private resetThemeButton(): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.reset = 'theme'
    btn.textContent = '重置为当前主题'
    btn.addEventListener('click', () => this.options.onPatch({ ...PROJECTION_THEME_PRESETS[this.theme] }))
    return btn
  }

  private backgroundModeSelect(): HTMLElement {
    const select = document.createElement('select')
    select.dataset.field = 'backgroundMode'
    for (const [value, label] of [
      ['theme', '跟随主题'],
      ['texture', '内置纹理'],
      ['image', '自定义图片'],
      ['color', '纯色'],
    ] as const) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      select.appendChild(option)
    }
    select.addEventListener('change', () => {
      const mode = select.value as ProjectionStyle['backgroundMode']
      this.textureSelect.hidden = mode !== 'texture'
      this.customInput.hidden = mode !== 'image'
      this.colorInput.hidden = mode !== 'color'
      this.error.textContent = ''
      if (mode === 'texture') {
        this.options.onPatch({ backgroundMode: 'texture', backgroundImage: this.textureSelect.value })
      } else if (mode === 'image') {
        this.submitCustomPath()
      } else if (mode === 'color') {
        this.options.onPatch({ backgroundMode: 'color', background: this.colorInput.value })
      } else {
        this.options.onPatch({ backgroundMode: 'theme' })
      }
    })
    this.modeSelect = select
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label('背景'), select)
    return wrap
  }

  private textureSelectEl(): HTMLElement {
    const select = document.createElement('select')
    select.dataset.field = 'texture'
    select.hidden = true
    for (const tex of TEXTURES) {
      const option = document.createElement('option')
      option.value = `builtin:${tex.id}`
      option.textContent = tex.name
      select.appendChild(option)
    }
    select.addEventListener('change', () => {
      this.error.textContent = ''
      this.options.onPatch({ backgroundMode: 'texture', backgroundImage: select.value })
    })
    this.textureSelect = select
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label('纹理'), select)
    return wrap
  }

  private colorInputEl(): HTMLElement {
    const input = document.createElement('input')
    input.type = 'color'
    input.dataset.field = 'backgroundColor'
    input.hidden = true
    input.addEventListener('change', () => {
      this.error.textContent = ''
      this.options.onPatch({ backgroundMode: 'color', background: input.value })
    })
    this.colorInput = input
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(this.label('纯色'), input)
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
    this.options.onPatch(
      value === ''
        ? { backgroundMode: 'theme', backgroundImage: null }
        : { backgroundMode: 'image', backgroundImage: value },
    )
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
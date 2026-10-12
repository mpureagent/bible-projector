import type { DisplayInfo } from '../shared/types'

// T4-keys：目标显示器下拉（§3.3）——display.id 指派（持久化由 store 完成），主屏标识。

export interface DisplaySelectOptions {
  onAssign(id: number): void
}

export class DisplaySelect {
  private readonly select: HTMLSelectElement

  constructor(root: HTMLElement, options: DisplaySelectOptions) {
    const label = document.createElement('label')
    label.className = 'style-label'
    label.textContent = '目标显示器'
    const select = document.createElement('select')
    select.dataset.field = 'display'
    select.setAttribute('aria-label', '目标显示器')
    select.addEventListener('change', () => {
      const id = Number(select.value)
      if (!Number.isNaN(id)) options.onAssign(id)
    })
    this.select = select
    const wrap = document.createElement('div')
    wrap.className = 'style-field'
    wrap.append(label, select)
    root.replaceChildren(wrap)
  }

  renderState(displays: readonly DisplayInfo[], current: number | null): void {
    this.select.replaceChildren()
    for (const display of displays) {
      const option = document.createElement('option')
      option.value = String(display.id)
      option.textContent = display.primary ? `${display.label}（主屏）` : display.label
      this.select.appendChild(option)
    }
    const primary = displays.find((d) => d.primary)
    const target = current ?? primary?.id ?? displays[0]?.id ?? null
    if (target !== null) this.select.value = String(target)
  }
}

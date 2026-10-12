// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { DisplaySelect } from '../../src/control/display-select'
import type { DisplayInfo } from '../../src/shared/types'

// T4-keys：目标显示器下拉——display.id 指派、主屏标识、状态同步

const displays: DisplayInfo[] = [
  { id: 101, label: '1024×768 @(0,0)', primary: true },
  { id: 202, label: '1920×1080 @(1024,0)', primary: false },
]

function mount(onAssign = vi.fn()) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new DisplaySelect(root, { onAssign })
  return { view, root, onAssign }
}

describe('T4-keys 显示器下拉', () => {
  it('renderState 构建选项：含主屏标识，value=display.id', () => {
    const { root } = mount()
    const view = new DisplaySelect(root, { onAssign: () => {} })
    view.renderState(displays, null)
    const options = [...root.querySelectorAll('option')]
    expect(options).toHaveLength(2)
    expect(options[0]?.value).toBe('101')
    expect(options[0]?.textContent).toContain('主屏')
    expect(options[1]?.value).toBe('202')
  })

  it('改选 dispatch display.id（持久化指派语义）', () => {
    const { root, onAssign } = mount()
    const view = new DisplaySelect(root, { onAssign })
    view.renderState(displays, null)
    const select = root.querySelector<HTMLSelectElement>('select')!
    select.value = '202'
    select.dispatchEvent(new Event('change'))
    expect(onAssign).toHaveBeenCalledWith(202)
  })

  it('状态同步：display=202 时选中项随状态', () => {
    const { root } = mount()
    const view = new DisplaySelect(root, { onAssign: () => {} })
    view.renderState(displays, 202)
    expect(root.querySelector<HTMLSelectElement>('select')?.value).toBe('202')
  })

  it('display=null 选中主屏', () => {
    const { root } = mount()
    const view = new DisplaySelect(root, { onAssign: () => {} })
    view.renderState(displays, null)
    expect(root.querySelector<HTMLSelectElement>('select')?.value).toBe('101')
  })
})

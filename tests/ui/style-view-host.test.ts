// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { StyleView } from '../../src/control/style-view'

// W1：浏览器宿主不支持自定义背景图片——能力判断驱动下拉隐藏；Electron 默认行为不变。

function mount(): HTMLElement {
  document.body.innerHTML = ''
  const root = document.createElement('aside')
  document.body.appendChild(root)
  new StyleView(root, { onPatch: () => {} })
  return root
}

afterEach(() => {
  delete window.hostCapabilities
})

describe('W1 宿主能力：自定义图片背景', () => {
  it('Web 宿主能力为 false → 背景模式无“自定义图片”、无路径输入框', () => {
    window.hostCapabilities = { customBackgroundImage: false }
    const root = mount()
    const values = [...root.querySelectorAll<HTMLOptionElement>('[data-field="backgroundMode"] option')].map(
      (option) => option.value,
    )
    expect(values).toEqual(['theme', 'texture', 'color'])
    expect(root.querySelector('[data-field="backgroundImageCustom"]')).toBeNull()
  })

  it('未声明能力（Electron 默认）→ 保留“自定义图片”与路径输入框', () => {
    const root = mount()
    const values = [...root.querySelectorAll<HTMLOptionElement>('[data-field="backgroundMode"] option')].map(
      (option) => option.value,
    )
    expect(values).toEqual(['theme', 'texture', 'image', 'color'])
    expect(root.querySelector('[data-field="backgroundImageCustom"]')).not.toBeNull()
  })
})
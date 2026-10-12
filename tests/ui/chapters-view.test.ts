// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChaptersView } from '../../src/control/chapters-view'
import { bookBySn } from '../../src/shared/bible'

function mount() {
  const onChapter = vi.fn()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = new ChaptersView(root, { onChapter })
  return { root, view, onChapter }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('T3-grid 章列表（点击书卷后中栏渲染）', () => {
  it('选择创世记渲染 50 个章按钮，点击回调 onChapter(章号)', () => {
    const { root, view, onChapter } = mount()
    view.setBook(1)
    expect(root.querySelectorAll('.chapter-btn')).toHaveLength(50)
    const third = root.querySelectorAll<HTMLElement>('.chapter-btn')[2]
    third?.click()
    expect(onChapter).toHaveBeenCalledWith(3)
  })

  it('标题展示书卷全名，切换书卷后章数随之更新（马可福音 16）', () => {
    const { root, view } = mount()
    view.setBook(1)
    expect(root.querySelector('.chapters-title')?.textContent).toContain('创世记')
    view.setBook(41)
    expect(root.querySelector('.chapters-title')?.textContent).toContain('马可福音')
    expect(root.querySelectorAll('.chapter-btn')).toHaveLength(bookBySn(41)!.chapters)
  })
})

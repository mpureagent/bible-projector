// T7-projection（R1）：显示器下拉删除——控制窗不再有手动指派显示器 UI；
// 多屏自动全屏第二屏、热插拔兜底全在主进程（windows.ts / hotplug.ts）。
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('T7-projection 显示器下拉不存在（R1 删除令）', () => {
  it('控制窗 DOM 无 display-panel / 显示器 select 元素', () => {
    const source = readFileSync('src/control/index.html', 'utf-8')
    expect(source).not.toMatch(/id="display-panel"/)
    expect(source).not.toMatch(/<select[^>]*display/)
  })

  it('控制窗 main.ts 不再实例化 DisplaySelect', () => {
    const source = readFileSync('src/control/main.ts', 'utf-8')
    expect(source).not.toContain('DisplaySelect')
    expect(source).not.toContain('getDisplays')
  })

  it('源文件 display-select.ts 已删除', () => {
    expect(existsSync('src/control/display-select.ts')).toBe(false)
  })

  it('窗口层保留 display 状态动作（断开兜底参考用，非 UI 指派）', () => {
    const source = readFileSync('src/main/windows.ts', 'utf-8')
    expect(source).toContain('displayById')
    expect(source).toContain('persistDisplay')
  })
})

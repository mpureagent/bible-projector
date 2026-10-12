import { describe, expect, it } from 'vitest'
import { computePages, pageForVerse } from '../src/projection/paginate'
import { chapterVerses } from '../src/shared/bible'

// T4-layout 溢出分页纯函数（§2.2）：诗篇 119 = 176 节最长章，视口预算贪心装箱

const ps119 = chapterVerses(19, 119)

describe('T4-layout computePages 分页边界（176 节长章）', () => {
  it('诗 119 全 176 节：页数 >1，串联恰好 1..176 无丢失无重复', () => {
    const pages = computePages(ps119, { viewportWidth: 1920, viewportHeight: 1080, fontSize: 72 })
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.flat()).toEqual(Array.from({ length: 176 }, (_, i) => i + 1))
  })

  it('每页预算不越界（除单节超高的孤页外，页高 ≤ 视口内容高）', () => {
    const fontSize = 48
    const metrics = { viewportWidth: 1280, viewportHeight: 720, fontSize }
    const pages = computePages(ps119, metrics)
    const contentH = 720 * (1 - 0.16)
    const lineH = fontSize * 1.7
    const gap = 0.4 * fontSize
    const cpl = Math.floor((1280 * 0.84) / fontSize)
    const titleH = 0.28 * fontSize * 1.7 + 0.5 * fontSize + gap
    for (const [i, page] of pages.entries()) {
      let h = i === 0 ? titleH : 0
      for (const v of page) {
        const text = ps119[v - 1] ?? ''
        h += Math.max(1, Math.ceil((text.length + 2) / cpl)) * lineH + gap
      }
      if (page.length > 1) expect(h).toBeLessThanOrEqual(contentH)
    }
  })

  it('空章/单节章不炸：返回至少一页；单节超出视口仍成孤页', () => {
    expect(computePages([], { viewportWidth: 800, viewportHeight: 600, fontSize: 40 })).toEqual([[]])
    const long = ['长'.repeat(200)]
    expect(computePages(long, { viewportWidth: 800, viewportHeight: 600, fontSize: 40 })).toEqual([[1]])
  })

  it('pageForVerse：命中页索引，越界回退最后一页', () => {
    const pages = computePages(ps119, { viewportWidth: 1920, viewportHeight: 1080, fontSize: 72 })
    expect(pages[pageForVerse(pages, 1)]).toContain(1)
    expect(pages[pageForVerse(pages, 176)]).toContain(176)
    expect(pageForVerse(pages, 9999)).toBe(pages.length - 1)
  })

  it('字号越大页越多（同一视口 72px vs 28px）', () => {
    const big = computePages(ps119, { viewportWidth: 1920, viewportHeight: 1080, fontSize: 72 }).length
    const small = computePages(ps119, { viewportWidth: 1920, viewportHeight: 1080, fontSize: 28 }).length
    expect(big).toBeGreaterThan(small)
  })
})

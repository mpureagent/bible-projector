// §9 CSP 注入（scripts/inject-csp.mjs）：票面 T5-audit 的产物层断言配套。
import { describe, expect, it } from 'vitest'
import { CSP_DIRECTIVE, injectCsp } from '../scripts/inject-csp.mjs'

const HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>x</title>
  </head>
  <body></body>
</html>`

describe('inject-csp', () => {
  it('在 charset meta 后注入 §9 CSP 头', () => {
    const { html, injected } = injectCsp(HTML)
    expect(injected).toBe(true)
    expect(html).toContain(`http-equiv="Content-Security-Policy"`)
    expect(html).toContain(CSP_DIRECTIVE)
    expect(html.indexOf('charset=')).toBeLessThan(html.indexOf('http-equiv="Content-Security-Policy"'))
  })

  it('幂等：已注入不再重复', () => {
    const once = injectCsp(HTML).html
    const twice = injectCsp(once)
    expect(twice.injected).toBe(false)
    expect(twice.html.match(/Content-Security-Policy/g)?.length).toBe(1)
  })

  it('缺 charset 锚点时报错（防静默失败）', () => {
    expect(() => injectCsp('<html><head><title>x</title></head></html>')).toThrow()
  })

  it('§9 值与 technical-plan v2 §257 一致', () => {
    expect(CSP_DIRECTIVE).toBe(
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    )
  })
})

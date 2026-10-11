// §3.1.1 构建期经文归一化。语义基线为 T1 spike（/data/spikes/db-analysis/normalize_check.py），
// 其产物数字（改写 3589 节、1,069,107→1,064,925 字符）即方案 v2 §3.1.1 的对账标准。
// 注意：纯 N1–N4 白名单在算术上只能删 4155 字符，方案的总数仅在此处语义（含 ASCII 句点串
// 折叠与 CJK 邻接空白折叠）下可复现；tests/build-data.test.mjs 与 spike 逐节比对兜底。

const WS_RUN = /[ \t\r\n\u00a0\u2007\u2009\u202f]+/g
const ASCII_ALNUM = /[0-9A-Za-z]/

export function normalizeVerse(raw) {
  if (!raw) return ''
  let s = raw.replace(/\u3000/g, '')
  s = s.replace(/\.{3,}/g, '……')
  s = s.replace(WS_RUN, (run, offset, scanned) => {
    const before = offset > 0 ? scanned[offset - 1] : ''
    const after = offset + run.length < scanned.length ? scanned[offset + run.length] : ''
    if (ASCII_ALNUM.test(before) || ASCII_ALNUM.test(after)) return ' '
    return ''
  })
  return s.trim()
}

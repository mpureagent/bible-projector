#!/usr/bin/env node
// §T5 任务 1：程序化生成 build/icon.ico（零外链、零依赖、确定性输出）。
// 意象：墨底金十字 + 摊开书卷（OFL 色系，与投影主题 token 同源）。
// 用法：node scripts/gen-icon.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_ICO = resolve(here, '../build/icon.ico')
const OUT_PNG = resolve(here, '../build/icon-256.png')

const SIZES = [16, 32, 48, 256]
const INK = [0x10, 0x14, 0x18] // 深墨（themes.ts ink-black 同源）
const GOLD = [0xe8, 0xc8, 0x7a] // 暖金（gold token 同源）

// 归一化坐标画一枚"十字 + 书卷"字形；s 为像素边长
function draw(s) {
  const data = Buffer.alloc(s * s * 4)
  const radius = s * 0.16
  const ring = Math.max(1, s * 0.035)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = (x + 0.5) / s
      const cy = (y + 0.5) / s
      // 圆角矩形裁剪 + 边环
      const dx = Math.max(0, Math.abs(x + 0.5 - s / 2) - (s / 2 - radius))
      const dy = Math.max(0, Math.abs(y + 0.5 - s / 2) - (s / 2 - radius))
      const cornerDist = Math.sqrt(dx * dx + dy * dy)
      const inside = cornerDist <= radius
      if (!inside) continue
      const edge = Math.min(x, y, s - 1 - x, s - 1 - y)
      const onRing = s >= 32 && edge < ring
      const crossV = Math.abs(cx - 0.5) < 0.055 && cy > 0.24 && cy < 0.82
      const crossH = Math.abs(cy - 0.4) < 0.038 && Math.abs(cx - 0.5) < 0.22
      const book = cy > 0.76 && cy < 0.88 && cx > 0.16 && cx < 0.84
      const gold = crossV || crossH || book || onRing
      const px = gold ? GOLD : INK
      const o = (y * s + x) * 4
      data[o] = px[0]
      data[o + 1] = px[1]
      data[o + 2] = px[2]
      data[o + 3] = 255
    }
  }
  return data
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(tag, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(tag, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

// 无过滤行的 RGBA PNG（每行 1 个 filter 字节=0 + s*4 像素字节）
function encodePng(s, rgba) {
  const stride = s * 4 + 1
  const raw = Buffer.alloc(stride * s)
  for (let y = 0; y < s; y++) {
    raw[y * stride] = 0
    raw.set(rgba.subarray(y * s * 4, (y + 1) * s * 4), y * stride + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(s, 0)
  ihdr.writeUInt32BE(s, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function buildIco() {
  const pngs = SIZES.map((s) => ({ s, png: encodePng(s, draw(s)) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { s, png } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s // width
    e[1] = s >= 256 ? 0 : s // height
    e[4] = 1 // planes
    e[5] = 32 // bpp
    e.writeUInt16LE(1, 4) // planes（覆盖，防歧义）
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += png.length
  }
  return {
    ico: Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]),
    png256: pngs.find((p) => p.s === 256).png,
  }
}

mkdirSync(dirname(OUT_ICO), { recursive: true })
const { ico, png256 } = buildIco()
writeFileSync(OUT_ICO, ico)
writeFileSync(OUT_PNG, png256)
console.log(`icon: ${OUT_ICO} ${ico.length} bytes; ${OUT_PNG} ${png256.length} bytes`)

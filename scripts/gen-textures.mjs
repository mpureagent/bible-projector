#!/usr/bin/env node
// T4-style：内置 3 张素雅纹理（程序化 SVG 渐变/纹样，零外链下载，≤200KB/张）。
// 产物：assets/textures/{ink-mist,rice-paper,deep-water}.svg

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../assets/textures')

const WIDTH = 1920
const HEIGHT = 1080

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}</svg>`

const inkMist = svg(`
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#232B36"/>
      <stop offset="55%" stop-color="#161D26"/>
      <stop offset="100%" stop-color="#0B0F14"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  ${Array.from({ length: 26 }, (_, i) => {
    const y = 120 + i * 36
    const o = (0.03 + (i % 5) * 0.012).toFixed(3)
    return `<path d="M0 ${y} C 480 ${y - 22}, 960 ${y + 18}, ${WIDTH} ${y - 8}" fill="none" stroke="#E8C87A" stroke-opacity="${o}" stroke-width="1.4"/>`
  }).join('')}
`)

const ricePaper = svg(`
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EA"/>
      <stop offset="100%" stop-color="#EFE9DB"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  ${Array.from({ length: 60 }, (_, i) => {
    const x = 40 + i * 32
    const o = (0.04 + (i % 3) * 0.015).toFixed(3)
    return `<line x1="${x}" y1="0" x2="${x + 6}" y2="${HEIGHT}" stroke="#8C8375" stroke-opacity="${o}" stroke-width="0.8"/>`
  }).join('')}
  ${Array.from({ length: 14 }, (_, i) => {
    const y = 90 + i * 76
    return `<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y + 3}" stroke="#B4AA98" stroke-opacity="0.05" stroke-width="0.6"/>`
  }).join('')}
`)

const deepWater = svg(`
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0E1B2A"/>
      <stop offset="60%" stop-color="#12233A"/>
      <stop offset="100%" stop-color="#0A1522"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  ${Array.from({ length: 18 }, (_, i) => {
    const y = 60 + i * 60
    const o = (0.05 + (i % 4) * 0.01).toFixed(3)
    return `<path d="M0 ${y} q 240 ${i % 2 === 0 ? -26 : 26}, 480 0 t 480 0 t 480 0 t 480 0 t 480 0" fill="none" stroke="#7E8CA0" stroke-opacity="${o}" stroke-width="1.6"/>`
  }).join('')}
`)

mkdirSync(OUT, { recursive: true })
for (const [file, content] of [
  ['ink-mist.svg', inkMist],
  ['rice-paper.svg', ricePaper],
  ['deep-water.svg', deepWater],
]) {
  const path = resolve(OUT, file)
  writeFileSync(path, content.replace(/\n\s+/g, '\n'))
  console.log(`texture: ${file} bytes=${statSync(path).size}`)
}

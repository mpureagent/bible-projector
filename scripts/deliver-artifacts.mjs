#!/usr/bin/env node
// §T5 任务 2：出包后把三产物从 release/ 投递到 dist/（票面交付位置），并 stat 实测字节数。
// 输出目录必须与 files 白名单分离：electron-builder 会先解压 electron 到输出目录
// （release/win-unpacked），若输出在 dist/ 则 dist/** glob 会把整个 electron 打进 asar。

import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const { version, name } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

const artifacts = [
  `bible-projector-Setup-${version}.exe`,
  `bible-projector-Portable-${version}.exe`,
  `bible-projector-${version}-win-x64.zip`,
]

mkdirSync(resolve(root, 'dist'), { recursive: true })
for (const f of artifacts) {
  copyFileSync(resolve(root, 'release', f), resolve(root, 'dist', f))
  const size = statSync(resolve(root, 'dist', f)).size
  console.log(`${name} ${f} ${size} bytes`)
}

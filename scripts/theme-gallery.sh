#!/usr/bin/env bash
# T7-release（R5/R8）：8 套主题 × 固定经文（约3:16-17 + 诗23:1-3）1080p 投影效果图集。
# Xvfb 单次启动，逐主题逐经文跑 Electron（SMOKE_PROJ_RES=1920x1080），capturePage 落图。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.artifacts/theme-gallery"
mkdir -p "$OUT"
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export XDG_CONFIG_HOME="$ROOT/.artifacts/gallery-userdata"
mkdir -p "$XDG_CONFIG_HOME"

Xvfb :97 -screen 0 1920x1080x24 >/dev/null 2>&1 &
XPID=$!
trap 'kill $XPID 2>/dev/null || true' EXIT
sleep 1

THEMES=(ink ivory ocean parchment forest charcoal contrast wine)
LABELS=(01-墨金 02-米白 03-深蓝 04-羊皮纸 05-深墨绿 06-炭灰金 07-雾白高对比 08-酒红金)

i=0
for theme in "${THEMES[@]}"; do
  label="${LABELS[$i]}"
  for pair in "jn-3-16:约3-16-17" "ps-23-1:诗23-1-3"; do
    key="${pair%%:*}"
    tag="${pair##*:}"
    DISPLAY=:97 SMOKE_CAPTURE=1 SMOKE_HOLD_MS=0 SMOKE_PROJ_RES=1920x1080 SMOKE_NO_HINT=1 \
      SMOKE_SELECT="$key" SMOKE_STYLE="theme:$theme" \
      "$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu \
      > "$ROOT/.artifacts/gallery.log" 2>&1 || true
    cp "$ROOT/.artifacts/xvfb-projection.png" "$OUT/${label}-${tag}.png"
    echo "gallery: ${label}-${tag}.png"
  done
  i=$((i + 1))
done
echo "gallery dir: $OUT"
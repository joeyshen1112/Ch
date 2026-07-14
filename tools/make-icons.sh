#!/bin/bash
# 由 tools/icon.svg 產生 PWA 圖示（macOS 內建工具：qlmanage 轉檔、sips 縮放）
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p app/icons
qlmanage -t -s 512 -o app/icons tools/icon.svg >/dev/null
mv app/icons/icon.svg.png app/icons/icon-512.png
sips -z 192 192 app/icons/icon-512.png --out app/icons/icon-192.png >/dev/null
sips -z 180 180 app/icons/icon-512.png --out app/icons/apple-touch-icon.png >/dev/null
ls -la app/icons/

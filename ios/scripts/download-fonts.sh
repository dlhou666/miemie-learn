#!/bin/bash
# ------------------------------------------------------------------------------
# download-fonts.sh（可选）
# 将设计稿使用的 Noto Sans SC 本地化到 App Bundle，做到离线 1:1 还原字形。
#
# 不执行本脚本时，App 会回退到 iPadOS 自带的「苹方 PingFang SC」，
# 同为现代无衬线黑体，字重映射接近，视觉差异极小。
# 若追求与设计稿 100% 一致（或需离线演示），再执行本脚本。
# ------------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/MieMieLearn/Web/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
CSS_URL="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap"

mkdir -p "$DEST"
echo "🔤 下载 Noto Sans SC → $DEST"

curl -sSL -A "$UA" "$CSS_URL" -o "$DEST/fonts.css"

grep -o 'https://fonts\.gstatic\.com[^)]*' "$DEST/fonts.css" | sort -u > "$DEST/_urls.txt"
TOTAL=$(wc -l < "$DEST/_urls.txt" | tr -d ' ')
echo "   · 共 $TOTAL 个字体分片"

i=0
while IFS= read -r url; do
  i=$((i+1))
  name=$(basename "$url")
  curl -sSL "$url" -o "$DEST/$name"
  # CSS 内 URL 改为本地相对路径
  python3 - "$DEST/fonts.css" "$url" "fonts/$name" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding='utf-8').read().replace(old, new)
open(path, 'w', encoding='utf-8').write(s)
PY
  printf "\r   · 下载进度 %d/%d" "$i" "$TOTAL"
done < "$DEST/_urls.txt"
echo ""

rm -f "$DEST/_urls.txt"

# 在 index.html 中注入本地字体样式（幂等：已注入则跳过）
INDEX="$ROOT/MieMieLearn/Web/index.html"
if ! grep -q "fonts/fonts.css" "$INDEX"; then
  python3 - "$INDEX" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('</head>', '  <link href="fonts/fonts.css" rel="stylesheet">\n</head>', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
  echo "   ✔ 已注入本地字体样式到 Web/index.html"
fi

echo ""
echo "✅ 字体本地化完成，重新构建 App 即可生效："
echo "   ./build.sh sim    （或 auto / selfsign）"
echo ""
echo "⚠ 注意：本脚本修改的是 Web/index.html（Bundle 副本）。"
echo "   下次执行 sync-web.sh 会用上级目录的 index.html 覆盖，需重新运行本脚本。"

#!/bin/bash
# ------------------------------------------------------------------------------
# sync-web.sh
# 把 H5 应用（index.html + assets）同步进 Xcode 工程的 Web/ 资源目录，
# 并携带自签根证书 dev-ca.der 作为 WKWebView 信任锚。
# 每次修改 ../index.html 后都要执行本脚本，再重新构建 App。
# ------------------------------------------------------------------------------
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_SRC="$(cd "$IOS_DIR/.." && pwd)"
DEST="$IOS_DIR/MieMieLearn/Web"

mkdir -p "$DEST/certs"

echo "🔄 同步 H5 资源 → $DEST"

cp "$WEB_SRC/index.html"           "$DEST/index.html"
cp "$WEB_SRC/manifest.webmanifest" "$DEST/manifest.webmanifest"
cp "$WEB_SRC/sw.js"                "$DEST/sw.js"

rm -rf "$DEST/assets" "$DEST/css" "$DEST/js" "$DEST/icons"
cp -R "$WEB_SRC/assets" "$DEST/assets"
cp -R "$WEB_SRC/css"    "$DEST/css"
cp -R "$WEB_SRC/js"     "$DEST/js"
cp -R "$WEB_SRC/icons"  "$DEST/icons"

if [ -f "$IOS_DIR/certs/dev-ca.der" ]; then
  cp "$IOS_DIR/certs/dev-ca.der" "$DEST/certs/dev-ca.der"
  echo "   ✔ 已内置自签根证书 dev-ca.der（证书固定生效）"
else
  echo "   ⚠ 未找到 certs/dev-ca.der，跳过（App 将回退系统证书校验）"
  echo "     如需内网 HTTPS 自签信任，请先执行 ./make-tls-cert.sh"
fi

echo ""
echo "✅ 同步完成："
find "$DEST" -maxdepth 2 -type f | sed "s|$DEST|   Web|"

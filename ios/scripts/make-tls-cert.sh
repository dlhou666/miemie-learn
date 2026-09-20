#!/bin/bash
# ------------------------------------------------------------------------------
# make-tls-cert.sh
# 生成自签 HTTPS 根 CA + 服务器证书，供以下场景使用：
#   · 开发机用 HTTPS 承载 H5（localhost / 局域网 IP），iPad 真机内网访问调试
#   · 根证书 dev-ca.der 会内置到 App Bundle，作为 WKWebView 的唯一信任锚
#     （ViewController.swift 中 SecTrustSetAnchorCertificatesOnly=true 做证书固定）
#
# 用法:
#   ./make-tls-cert.sh                    # 自动探测本机 LAN IP
#   ./make-tls-cert.sh 192.168.1.20       # 指定 LAN IP
# ------------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/certs"

# 自动探测局域网 IP
LAN_IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)}"

mkdir -p "$OUT"
echo "🌐 自签 TLS 证书 · SAN 覆盖 localhost / 127.0.0.1 / $LAN_IP"

# ---------- 1. 根 CA ----------
openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$OUT/dev-ca.key" \
  -out    "$OUT/dev-ca.crt" \
  -subj   "/CN=MieMie Dev Root CA/O=MieMie Learn/C=CN" \
  -addext "keyUsage=critical,digitalSignature,keyCertSign,cRLSign" \
  -addext "basicConstraints=critical,CA:TRUE"

# ---------- 2. 服务器证书 ----------
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT/server.key" \
  -out    "$OUT/server.csr" \
  -subj   "/CN=$LAN_IP/O=MieMie Learn/C=CN"

cat > "$OUT/server.ext" <<EXT
subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1,IP:$LAN_IP
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
basicConstraints=critical,CA:FALSE
EXT

openssl x509 -req \
  -in      "$OUT/server.csr" \
  -CA      "$OUT/dev-ca.crt" \
  -CAkey   "$OUT/dev-ca.key" \
  -CAcreateserial \
  -out     "$OUT/server.crt" \
  -days    825 -sha256 \
  -extfile "$OUT/server.ext"

# ---------- 3. 导出 DER 根证书供 App 内置（证书固定用） ----------
openssl x509 -in "$OUT/dev-ca.crt" -outform DER -out "$OUT/dev-ca.der"

echo ""
echo "✅ 产出文件（$OUT）："
echo "   dev-ca.crt / dev-ca.key   自签根 CA"
echo "   dev-ca.der                根证书 DER —— 内置 App 做信任锚"
echo "   server.crt / server.key   HTTPS 服务器证书（SAN: localhost, $LAN_IP）"
echo ""
echo "📌 使用方式："
echo "   A) 本地 HTTPS 调试（在项目根目录执行）："
echo "      python3 -m http.server 8443 --directory ../ \\"
echo "        --bind 0.0.0.0   # 需配合 ssl 包装，或用："
echo "      openssl s_server -accept 8443 -cert $OUT/server.crt -key $OUT/server.key -WWW"
echo ""
echo "   B) 同步根证书到 App Bundle："
echo "      ./sync-web.sh   # 会自动把 dev-ca.der 拷入 Web/certs/"
echo ""
echo "   C) iPad 首次访问若提示不受信任，需安装描述文件或在"
echo "      「设置 → 通用 → 关于本机 → 证书信任设置」中启用 dev-ca.crt"
echo "      （本机 App 已内置该 CA 做证书固定，App 内访问无需此步）"

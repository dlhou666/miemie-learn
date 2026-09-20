#!/bin/bash
# ------------------------------------------------------------------------------
# make-codesign-cert.sh
# 生成「自签代码签名证书」（iPhone Developer）并导入登录钥匙串，
# 用于 iOS 工程的手动签名（Manual Signing）。
#
# 用法:
#   ./make-codesign-cert.sh "iPhone Developer: YourName (TEAMID)"
#
# ⚠️ 重要前提（请务必先读 README-iOS.md 的「签名现实」一节）：
#   Apple 的 installd 只接受 Apple 签发的证书链。未经 Apple 签发的纯自签证书，
#   在【未越狱】的 iPhone/iPad 上无法安装运行。本脚本产出的证书适用场景：
#     1) Xcode 手动签名流程验证 / macOS 本地 codesign 校验
#     2) iOS 模拟器（模拟器无需签名，可直接使用构建产物）
#     3) 越狱设备、企业 MDM 白名单通道
#     4) 内网分发前的签名占位，最终替换为 Apple 签发证书
#   若目标是「真机跑起来」，请使用免费 Apple ID 的自动签名（见 build.sh --auto）。
# ------------------------------------------------------------------------------
set -euo pipefail

CERT_CN="${1:-iPhone Developer: MieMie SelfSigned}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/certs"
P12_PASS="${P12_PASS:-mie123}"

mkdir -p "$OUT"
echo "🔐 生成自签代码签名证书: $CERT_CN"

# 1) 私钥 + CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT/dev.key" \
  -out    "$OUT/dev.csr" \
  -subj   "/CN=$CERT_CN/OU=SelfSigned/O=MieMie Learn/C=CN"

# 2) Apple 代码签名证书必需的扩展项
cat > "$OUT/dev.ext" <<'EXT'
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
basicConstraints=critical,CA:FALSE
EXT

# 3) 自签生成证书（有效期 365 天）
openssl x509 -req \
  -in      "$OUT/dev.csr" \
  -signkey "$OUT/dev.key" \
  -out     "$OUT/dev.crt" \
  -days    365 -sha256 \
  -extfile "$OUT/dev.ext"

# 4) 打包为 p12（legacy 算法，兼容 macOS 钥匙串）
openssl pkcs12 -export -legacy \
  -inkey  "$OUT/dev.key" \
  -in     "$OUT/dev.crt" \
  -out    "$OUT/dev.p12" \
  -passout "pass:$P12_PASS" \
  -name   "$CERT_CN"

# 5) 导入登录钥匙串，并授权 codesign 访问私钥
security import "$OUT/dev.p12" \
  -k ~/Library/Keychains/login.keychain-db \
  -P "$P12_PASS" \
  -T /usr/bin/codesign -T /usr/bin/security 2>/dev/null || true

security set-key-partition-list \
  -S "apple-tool:,apple:,codesign:" \
  -s -k "$P12_PASS" \
  -D "$CERT_CN" \
  -t private ~/Library/Keychains/login.keychain-db 2>/dev/null || true

echo ""
echo "✅ 完成，产出文件位于 $OUT:"
echo "   dev.crt   自签证书（可双击导入钥匙串并手动设为「始终信任」）"
echo "   dev.p12   含私钥的证书包（密码: $P12_PASS）"
echo ""
echo "📌 后续操作："
echo "   1. 打开「钥匙串访问」→ 登录 → 我的证书，确认证书存在"
echo "   2. 若无 teamID，Xcode 手动签名仍会报错，可改用："
echo "      codesign -f -s \"$CERT_CN\" --generate-entitlements-der <App路径>"
echo "   3. 验证签名：codesign -vvv --deep --strict <App路径>"
echo "   4. 查看可用签名身份：security find-identity -v -p codesigning"

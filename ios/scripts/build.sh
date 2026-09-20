#!/bin/bash
# ------------------------------------------------------------------------------
# build.sh — 构建「咩咩学」iOS App
#
# 三种签名模式：
#   ./build.sh sim         模拟器（不签名，最快验证）
#   ./build.sh auto        免费 Apple ID 自动签名 —— 真机可安装（推荐，7 天有效）
#   ./build.sh selfsign    自签证书手动签名 —— 本地/越狱/企业通道
#
# 环境变量:
#   TEAM=XXXXXXXXXX           自动签名所需的开发团队 ID（Xcode → Signing 可见）
#   SIGN_IDENTITY="iPhone Developer: ..."   自签证书名称
#   BUNDLE_ID=com.miemie.learn
# ------------------------------------------------------------------------------
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$IOS_DIR"

MODE="${1:---auto}"
SCHEME="MieMieLearn"
BUNDLE_ID="${BUNDLE_ID:-com.miemie.learn}"
TEAM="${TEAM:-}"
SIGN_IDENTITY="${SIGN_IDENTITY:-iPhone Developer: MieMie SelfSigned}"

echo "🔄 先同步最新的 H5 资源..."
"$(dirname "$0")/sync-web.sh"

case "$MODE" in

  --sim|sim)
    exec "$(dirname "$0")/run-sim.sh"
    ;;

  --auto|auto)
    if [ -z "$TEAM" ]; then
      echo "❌ 请提供开发团队 ID： TEAM=XXXXXXXXXX ./build.sh auto"
      echo "   获取方式：Xcode → Settings → Accounts → 选中 Apple ID → Team ID"
      exit 1
    fi
    echo "📦 自动签名构建（Apple ID: team $TEAM）"
    xcodebuild -project "$SCHEME.xcodeproj" \
      -scheme "$SCHEME" \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -derivedDataPath build/DerivedData \
      CODE_SIGN_STYLE=Automatic \
      DEVELOPMENT_TEAM="$TEAM" \
      PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
      -allowProvisioningUpdates \
      build

    APP=$(find build/DerivedData/Build/Products -maxdepth 2 -name "$SCHEME.app" | head -n1)
    echo "✅ 构建完成: $APP"
    echo "📲 安装到已连接设备："
    echo "   ios-deploy --bundle '$APP'    # 或直接在 Xcode 中 Run"
    echo ""
    echo "⚠ 免费 Apple ID 签名的 App 有效期 7 天，到期后需重新签名安装；"
    echo "   首次安装请在 iPad「设置 → 通用 → VPN与设备管理」中信任开发者。"
    ;;

  --selfsign|selfsign)
    echo "🔐 自签证书构建（$SIGN_IDENTITY）"
    echo "   若尚未生成证书，请先执行 ./make-codesign-cert.sh"

    xcodebuild -project "$SCHEME.xcodeproj" \
      -scheme "$SCHEME" \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -derivedDataPath build/DerivedData \
      CODE_SIGN_STYLE=Manual \
      CODE_SIGN_IDENTITY="$SIGN_IDENTITY" \
      CODE_SIGNING_REQUIRED=YES \
      CODE_SIGNING_ALLOWED=YES \
      DEVELOPMENT_TEAM="" \
      PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
      PROVISIONING_PROFILE_SPECIFIER="" \
      build || {
        echo ""
        echo "⚠ Xcode 手动签名需要 Apple 签发的配置文件，自签证书无法通过其校验。"
        echo "   改为：先产出未签名 App，再用 codesign 重签。"
        xcodebuild -project "$SCHEME.xcodeproj" \
          -scheme "$SCHEME" \
          -configuration Debug \
          -destination 'generic/platform=iOS' \
          -derivedDataPath build/DerivedData \
          CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
          PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
          build
      }

    APP=$(find build/DerivedData/Build/Products -maxdepth 2 -name "$SCHEME.app" | head -n1)
    echo ""
    echo "🔏 使用自签证书重签: $APP"
    codesign --force --deep --sign "$SIGN_IDENTITY" \
      --timestamp=none \
      --generate-entitlements-der \
      "$APP" || echo "⚠ codesign 失败，请确认钥匙串中存在该证书（security find-identity -v -p codesigning）"

    echo ""
    echo "🔍 签名校验："
    codesign -vvv --deep --strict "$APP" || true
    echo ""
    echo "📌 自签产物的适用边界（再次提醒）："
    echo "   · ✅ iOS 模拟器 / macOS 本地校验 / 越狱设备 / 企业 MDM 白名单"
    echo "   · ❌ 未越狱真机：installd 只认 Apple 签发链，安装会被拒绝"
    echo "   · 💡 真机验证请改用： TEAM=XXXXXXXXXX ./build.sh auto"
    ;;

  *)
    echo "用法: ./build.sh [sim|auto|selfsign]"
    exit 1
    ;;
esac

#!/bin/bash
# ------------------------------------------------------------------------------
# run-sim.sh
# 在 iOS 模拟器上构建并运行（模拟器无需代码签名，最快速的验证通道）。
#
# 用法:
#   ./run-sim.sh                              # 默认 iPad Pro 11-inch
#   ./run-sim.sh "iPad Air (5th generation)"  # 指定机型
# ------------------------------------------------------------------------------
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$IOS_DIR"

DEVICE="${1:-iPad Pro 11-inch (M4)}"
SCHEME="MieMieLearn"

echo "🔍 查找可用模拟器..."
# 若指定机型不存在则回退第一个可用 iPad
if ! xcrun simctl list devices available | grep -q "$DEVICE"; then
  FALLBACK=$(xcrun simctl list devices available | grep -m1 -o "iPad [^(]*([^)]*)" | sed 's/ *$//')
  echo "   ⚠ 未找到「$DEVICE」，回退到「$FALLBACK」"
  DEVICE="$FALLBACK"
fi

echo "📱 目标模拟器: $DEVICE"

# 构建前先把根目录的 web 代码同步进 Web/ —— 否则模拟器里跑的是旧副本，
# 表现为「改了代码但 App 里没变化」，极难排查。
echo "🔄 同步 Web 资源..."
bash "$IOS_DIR/scripts/sync-web.sh"

xcodebuild -project "$SCHEME.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$DEVICE" \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

APP_PATH=$(find build/DerivedData/Build/Products -maxdepth 2 -name "$SCHEME.app" | head -n1)
echo "✅ 构建完成: $APP_PATH"

echo "🚀 启动模拟器并安装..."
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator
xcrun simctl install booted "$APP_PATH"
xcrun simctl launch booted "com.miemie.learn"

echo "🎉 已在模拟器中启动「咩咩学」"

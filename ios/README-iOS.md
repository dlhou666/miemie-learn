# 咩咩学 · iOS / iPadOS 原生壳

把设计稿还原的 H5 应用封装为 iPad 原生 App（WKWebView 承载，离线运行），并提供完整的自签证书链路。

---

## 1. 目录结构

```
ios/
├── MieMieLearn.xcodeproj/          Xcode 工程（可直接双击打开）
│   └── xcshareddata/xcschemes/    共享 Scheme，供命令行构建
├── MieMieLearn/
│   ├── AppDelegate.swift           启动入口，全屏窗口
│   ├── ViewController.swift        WKWebView + 自签证书信任 + JS Bridge
│   ├── Info.plist                  ATS、状态栏、方向、Bundle 配置
│   ├── LaunchScreen.storyboard     启动页（沿用设计稿主色）
│   ├── Assets.xcassets/            图标占位（需替换为正式 App Icon）
│   └── Web/                        ← H5 应用副本（由脚本同步生成）
│       ├── index.html
│       ├── assets/*.png            5 张卡通羊插画
│       └── certs/dev-ca.der        自签根证书（证书固定信任锚）
├── scripts/
│   ├── sync-web.sh                 同步 H5 → Bundle（改完 HTML 必跑）
│   ├── make-codesign-cert.sh       生成自签「代码签名」证书
│   ├── make-tls-cert.sh            生成自签「HTTPS」CA + 服务器证书
│   ├── download-fonts.sh           可选：Noto Sans SC 字体本地化
│   ├── build.sh                    构建入口（sim / auto / selfsign）
│   └── run-sim.sh                  模拟器一键运行
└── certs/                          证书产物（脚本生成，已 gitignore 建议）
```

---

## 2. 前置条件

| 项目 | 要求 |
|---|---|
| 开发机 | macOS 13+，Xcode 15+（含 Command Line Tools） |
| 目标设备 | iPadOS 15.0+（工程 Deployment Target = iOS 15.0） |
| 网络 | 首次证书生成需要 openssl（macOS 自带 LibreSSL 亦可） |

```bash
xcode-select --install   # 如未安装命令行工具
```

---

## 3. 快速开始

```bash
cd ios/scripts
chmod +x *.sh

# ① 同步 H5 资源到 Bundle（每次改 index.html 后都要跑）
./sync-web.sh

# ② 模拟器运行（无需签名，最快看到效果）
./run-sim.sh "iPad Pro 11-inch (M4)"

# ②' 或真机运行（免费 Apple ID，见第 4 节）
TEAM=XXXXXXXXXX ./build.sh auto
```

`TARGETED_DEVICE_FAMILY = 2`（iPad），如需 iPhone 预览改为 `1,2`。

---

## 3.5 无 Mac？GitHub Actions 云端编译（Windows 友好）

仓库自带工作流 `.github/workflows/ios-build.yml`，把仓库推到 GitHub 后，在 **Actions → iOS Cloud Build → Run workflow** 即可用苹果官方云 Mac 编译：

| Job | 需要 Apple 账号？ | 产物 | 真机安装 |
|---|---|---|---|
| `simulator` | 否 | 模拟器 .app | ❌（仅模拟器） |
| `unsigned-ipa` | 否 | 未签名 IPA | ✅ Windows 上用 **Sideloadly**（免费 Apple ID 侧载，7 天有效可续签） |
| `ipa` | 需开发者账号（$99/年） | 已签名 IPA | ✅ 直接安装 / TestFlight，无 7 天限制 |

**免费真机路径**（零成本）：跑 `unsigned-ipa` job → 下载 `MieMieLearn-unsigned-ipa` 工件 → Windows 安装 [Sideloadly](https://sideloadly.io)，插上 iPad，把 IPA 拖进去，登录免费 Apple ID → 自动签名安装 → iPad 上信任开发者即可。

**额度说明**：公开仓库（public）不消耗 Actions 免费额度；私有仓库 macOS runner 按 10 倍计费（2000 分钟 ≈ 200 分钟，够每月 15-30 次构建）。

### iCloud 同步（原生壳）

v2 的原生壳已内置 iCloud 键值同步桥：`ViewController` 注册了名为 `icloud` 与 `haptic` 的 JS Bridge，
H5 每次数据变更会调用 `window.webkit.messageHandlers.icloud.postMessage({op:'save', payload})`
写入 `NSUbiquitousKeyValueStore`（键 `miemie.state`），App 启动时会回调 `window.MMCloudRestore(payload)` 合并回本地。

启用步骤（Xcode 中操作）：

1. Signing & Capabilities → **+ Capability** → 选 **iCloud**
2. 勾选 **Key-value storage**，容器保持默认 `iCloud.<你的BundleID>`
3. 确保设备已登录同一个 Apple ID 并开启 iCloud 云盘

> 若不使用 iCloud 能力，桥接会自动静默失败，不影响离线使用 —— 此时请用 H5 内的「备份与同步 → 导出 JSON」手动迁移。

## 4. 签名：先认清现实，再选路径

> **关键事实**：Apple 的 `installd` 强制校验 Apple 签发的证书链。**未经 Apple 签发的纯自签证书，在未越狱的 iPhone / iPad 上无法安装**——这是系统安全机制，不是配置技巧能绕过的。

| 你的目标 | 推荐方案 | 证书来源 | 有效期 | 未越狱真机 |
|---|---|---|---|---|
| 真机快速验证 | **免费 Apple ID 自动签名** | Apple 签发 | 7 天 | ✅ |
| 长期使用 / 上架 | Apple Developer Program | Apple 签发 | 1 年 | ✅ |
| 企业内部分发 | Apple Developer Enterprise | Apple 签发 | 3 年 | ✅ |
| 模拟器 / 本地签名校验 | **自签证书（本仓库脚本）** | 自签 | 自定 | 模拟器 ✅ |
| 越狱设备 / MDM 白名单 | 自签证书 | 自签 | 自定 | ✅ |

### 路径 A：免费 Apple ID 自动签名（真机推荐）

```bash
# ① Xcode → Settings → Accounts，登录你的 Apple ID（免费账号即可）
# ② Settings → Accounts → 选中账号 → 复制 Team ID
TEAM=ABCDE12345 ./build.sh auto
```

首次安装后在 iPad **设置 → 通用 → VPN与设备管理** 中信任该开发者。7 天后需重新签名安装。

### 路径 B：自签代码签名证书

```bash
./make-codesign-cert.sh "iPhone Developer: MieMie SelfSigned"
SIGN_IDENTITY="iPhone Developer: MieMie SelfSigned" ./build.sh selfsign
```

脚本会：
1. 生成 RSA 2048 私钥与 CSR
2. 写入 Apple 代码签名必需的扩展（`extendedKeyUsage=codeSigning`）
3. 自签 365 天证书并打包 `.p12`
4. 导入登录钥匙串并授权 `/usr/bin/codesign` 访问私钥

产物适用：模拟器、macOS 本地 `codesign -vvv` 校验、越狱设备、企业 MDM 白名单通道。
`build.sh selfsign` 在 Xcode 手动签名失败时会自动降级为「先出未签名 App → `codesign` 重签」。

验证签名：

```bash
codesign -vvv --deep --strict build/DerivedData/Build/Products/Debug-iphoneos/MieMieLearn.app
security find-identity -v -p codesigning    # 列出可用签名身份
```

### 路径 C：自签 HTTPS 证书（内网调试 / 证书固定）

当 App 需要访问内网 HTTPS 服务（而非 Bundle 内离线页面）时使用：

```bash
./make-tls-cert.sh 192.168.1.20      # 不传 IP 则自动探测
./sync-web.sh                         # 把 dev-ca.der 拷入 Bundle
```

`ViewController.swift` 中的信任逻辑：

```swift
SecTrustSetAnchorCertificates(trust, [ca] as CFArray)
SecTrustSetAnchorCertificatesOnly(trust, true)   // 只信任内置 CA
```

即**证书固定（Certificate Pinning）**——只认内置的自签根证书，中间人无法伪造。安全且真实可用。

---

## 5. 设计稿还原：iOS 侧做了什么

| 还原项 | 实现方式 |
|---|---|
| 820×1180 竖屏比例 | 原生不缩放，WKWebView 铺满屏幕，由 CSS 安全区适配 |
| 状态栏 | 隐藏系统状态栏（设计稿自带），`env(safe-area-inset-top)` 精确补偿 |
| 底部 Home Indicator | `.navwrap` 加 `safe-area-inset-bottom`，导航不被遮挡 |
| 内容溢出 | 真机高度不足 1180 时内容区可纵滚，隐藏滚动条保持干净观感 |
| 配色 / 圆角 / 间距 / 阴影 | 全部沿用 H5 内的 CSS 变量，原生层零覆盖 |
| 插画素材 | 5 张 PNG 随 Bundle 打包，完全离线 |
| 字体 | 无 Noto Sans SC 时回退苹方；可执行 `download-fonts.sh` 做 100% 本地化 |
| 交互手感 | 禁用双指缩放、双击缩放、长按菜单、橡皮筋回弹；按钮点击触发 `UIImpactFeedbackGenerator` |
| 启动体验 | LaunchScreen 用设计稿主色 `#EDF5FC`，避免白屏闪烁 |

H5 通过 `window.__NATIVE_SHELL__` 判定运行环境，据此隐藏 PWA 专属文案（如「重新添加到主屏幕」这类在原生 App 里不适用的提示）；布局本身仍全部由 CSS 安全区变量驱动，在普通浏览器中保持 820×1180 等比缩放预览。

---

## 6. 常见问题

**Q：改了 `index.html` 后 App 没变化？**
A：必须执行 `./sync-web.sh` 再重新构建。Xcode 已缓存旧的 Bundle 资源时，再执行一次 Clean Build。

**Q：App Icon 是空白？**
A：`Assets.xcassets/AppIcon.appiconset` 目前只有声明文件。把 1024×1024 的图标（建议沿用卡通羊形象）放入该目录并补全 `Contents.json` 即可。

**Q：真机提示「不受信任的企业级开发者」？**
A：设置 → 通用 → VPN与设备管理 → 信任。若使用自签证书则不会出现该入口——因为根本装不上，请改用路径 A。

**Q：iPad 横屏布局错乱？**
A：设计稿为竖屏。横屏时建议锁定方向：Xcode → Target → Deployment Info → 仅勾选 Portrait。

**Q：字体和电脑预览不一样？**
A：默认回退苹方。执行 `./download-fonts.sh` 可离线还原 Noto Sans SC（约数 MB）。

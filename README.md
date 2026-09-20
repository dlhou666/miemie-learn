# 咩咩学 · iPad 学习激励系统

面向 **5-6 年级小学生**的学习激励应用：先定计划 → 打卡得**小红花** → 兑换心愿奖励。
支持多孩子档案、多主题皮肤、按天日历计划、勋章荣誉墙、家长密码与数据迁移。

## 快速预览

```bash
cd mie-mie-app
python3 -m http.server 8768        # 然后浏览器打开 http://localhost:8768
```

iPad 使用：Safari 打开 → 分享 → **添加到主屏幕** → 全屏、有图标、可离线运行（PWA）。

## 目录结构

```
mie-mie-app/
├── index.html            应用外壳（顶栏 / 五个视图 / 底部导航 / 弹层）
├── css/app.css           全部样式：6 套主题变量、iPhone/iPad 响应式、安全区
├── js/data.js            预设数据：主题、头像、分类、难度、奖励、勋章体系
├── js/store.js           数据层：持久化、多账户、打卡结算、勋章解锁、备份
├── js/app.js             交互层：视图渲染、PIN、自定义面板、图片压缩、庆祝动画
├── manifest.webmanifest  PWA 清单
├── sw.js                 Service Worker（离线缓存）
├── assets/               卡通羊插画
├── icons/                App 图标（含 maskable、apple-touch-icon）
├── archive/index-v1.html 旧版单文件存档
└── ios/                  iOS 原生壳工程 + 云端编译工作流
```

## 需求实现对照

| # | 需求 | 实现位置 | 说明 |
|---|---|---|---|
| 1 | 多主题 / 自定义头像 / App 名称与 Logo | `data.js THEMES/AVATARS/LOGOS`、`app.js sheetSettings` | 6 套主题（天空蓝/薄荷绿/甜梦紫/暖阳橙/樱花粉/夜间）；头像可选 emoji 或从相册上传；名称与 Logo 即时生效 |
| 2 | 适配 iPhone | `css/app.css` | 全宽流式布局 + `env(safe-area-inset-*)`；窄屏隐藏 Tab 文字、卡片单列 |
| 3 | 任务数量可调 / 商城可排序 | `app.js sheetTaskEditor`、`store.js reorderReward` | 任务支持「数量 + 单位」（如 50 题 / 30 分钟），商城每项 ↑↓ 调整顺序 |
| 4 | 设为目标（≤3）/ 显示差距 | `store.js toggleGoal`、`app.js goalStripHtml` | 商城点 🎯 设为心愿，最多 3 个；今日页与日历页实时显示「还差 N 朵」 |
| 5 | 计划按天 + 日历 | `app.js calendarHtml` | 月历视图，有任务的日期显示花瓣圆点（已完成为绿），支持复制前一天 / 清空 |
| 6 | 荣誉墙页面 | `app.js renderHonor` | 勋章墙 + 荣誉时间线，可按勋章/全勤/兑换/心愿筛选 |
| 7 | 勋章规划与获得结构 | `data.js BADGES` | 12 枚勋章，5 类获取维度：累计花朵、连续打卡、挑战任务数、兑换次数、单周全勤 |
| 8 | 家长手动加/减花 | `app.js sheetParentAdjust` | 加/减切换 + 数量步进 + 常用理由快选 + 备注，全部记入流水账 |
| 9 | 家长模式 PIN | `app.js openPin / requireParent` | 4–6 位密码，进入家长 Tab 时校验；未设置时引导设置 |
| 10 | iCloud 同步 | `ViewController.swift CloudSync` | 原生壳通过 `NSUbiquitousKeyValueStore` 双向同步（需勾选 iCloud 能力） |
| 11 | 换设备同步 | `app.js sheetBackup` | 导出 JSON → 存 iCloud 云盘/隔空投送/微信 → 新设备导入，支持「合并」与「替换」两种恢复策略 |
| 12 | 多账户（多个孩子） | `store.js addProfile/switchProfile` | 每个孩子独立的小红花、计划、目标、勋章，互不影响 |
| 13 | 积分改小红花 | 全局 | 货币改为「朵」，图标为五瓣小红花，玻璃/金色系保留用于荣誉与阶段 progress |
| 14 | 分类自定义 / 删除预设 | `app.js sheetCategories` | 可新增（emoji + 名称）与删除，含预设也可删除，至少保留 1 个 |
| 15 | 难度与花数自定义 / 删除预设 | `app.js sheetDiffs` | 难度名称与对应花朵数均可改（步进调整），可增删 |

## 勋章体系

| 类型 | 勋章 | 达成条件 |
|---|---|---|
| 累计 | 第一朵花 / 小花坛 / 花开满园 / 花团锦簇 | 累计获得 1 / 100 / 500 / 2000 朵 |
| 坚持 | 三日之约 / 一周不断 / 廿一习惯 / 百日坚持 | 连续打卡 3 / 7 / 21 / 100 天 |
| 挑战 | 勇敢挑战 | 完成 10 个最高难度任务 |
| 全勤 | 全勤周冠军 | 某一周计划全部完成 |
| 兑换 | 兑换达人 | 成功兑换 5 次奖励 |
| 心愿 | 心愿达成 | 完成 1 个心愿目标 |

## 数据存储

- 全部数据保存在浏览器 `localStorage`（键 `miemie.state.v2`）
- 头像 / Logo 图片压缩到最长边 320px 后存储，避免占用过多空间
- **清除浏览器数据会导致数据丢失**，请定期用「备份与同步」导出 JSON

## iOS 原生壳

见 `ios/README-iOS.md`（含无 Mac 时的 GitHub Actions 云端编译与免费侧载方案）。

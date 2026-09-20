# 咩咩学 · GitHub 部署步骤

本地 git 仓库已初始化完毕，代码已提交。按下面的顺序做一次即可。

## 一、建仓库

1. 打开 https://github.com/new
2. Repository name 填 `miemie-learn`（或任意名字）
3. **选 Public（公开）** —— 公开仓库下 Actions 编译和 Pages 托管都免费、无限；私有仓库 Pages 在免费套餐下不可用，Actions 的 macOS 额度也只有约 200 分钟/月
4. **不要勾选** Add a README file / .gitignore / License，保持完全是空仓库
5. 点 Create repository

## 二、推送代码

在本机 `mie-mie-app` 目录下执行：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

推送时按提示用浏览器登录 GitHub 授权即可（GitHub 已不支持密码登录）。

## 三、开启 GitHub Pages

1. 进仓库 → **Settings** → 左侧 **Pages**
2. Source 选 **GitHub Actions**（不要选 "Deploy from a branch"）
3. 推送后 Actions 会自动跑一次；之后每次 push main 都会自动更新

跑完后 Pages 页面顶部会显示地址：

```
https://<用户名>.github.io/<仓库名>/
```

## 四、iPad 上使用

Safari 打开上面的地址 → 分享 → 添加到主屏幕。

> ⚠️ 换地址 = 换存储空间，旧的小红花数据不会自动跟过来。
> 先在旧地址导出 JSON（我 → 小红花 → 备份我的数据），再在新地址导入一次。

## 五、顺便编译 iOS

同一个仓库的 Actions 里有 `ios-build` 工作流，三个任务：

| 任务 | 说明 | 是否需要证书 |
|---|---|---|
| simulator | 模拟器包 | 否 |
| unsigned-ipa | 未签名 IPA，可下载 | 否 |
| ipa | 正式签名 IPA | 需要付费账号 + 配置 Secrets |

点 Actions → 选任务 → 下载产物。未签名 IPA 配合 AltServer / AppUploader 可装到 iPad（免费 Apple ID 有效期 7 天）。

## 六、改代码后怎么更新

```bash
git add -A
git commit -m "说明改了什么"
git push
```

**如果改了页面的 css/js/图片，记得把 `sw.js` 里的 `CACHE` 版本号 +1**，否则 iPad 上已添加到主屏幕的 App 会一直读旧缓存，看不到新界面。

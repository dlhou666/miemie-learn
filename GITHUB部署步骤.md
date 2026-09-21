# 咩咩学 · GitHub 部署步骤

## ✅ 当前部署状态（已完成）

| 项目 | 值 |
|---|---|
| 仓库 | https://github.com/dlhou666/miemie-learn （Public） |
| 分支 | `main`（默认分支） |
| Pages 地址 | **https://dlhou666.github.io/miemie-learn/** |
| Pages 模式 | Deploy from a branch（main / 根目录） |
| 已提交 | 69 个文件 |

首页、manifest、sw.js、CSS、JS、图标、插图均已验证可访问（HTTP 200）。

> ⚠️ **换地址 = 换存储空间。** 旧地址（workbuddy 那个）的小红花数据不会自动跟过来。
> 先在旧地址导出 JSON（我 → 小红花 → 备份我的数据），再在新地址导入一次。

---

以下为首次部署的操作记录，供迁移到其他仓库时参考。

## 一、建仓库

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

---

## 七、已知遗留问题与本机环境坑

### 1. `ios-build.yml` 已入库，但推送令牌可能没有 `workflow` 权限

`.github/workflows/ios-build.yml` **现在已经在本仓库里**（三个任务：simulator / unsigned-ipa / ipa）。
`pages.yml` 不需要——Pages 走的是「从分支部署」，不依赖 Actions。

要把它推上去，令牌必须勾 **`workflow`**：GitHub 对无权限的 workflow 文件操作**返回 404 而非 403**（故意隐藏），
`tools/gh-api-push.js` 会识别这种情况并跳过该文件（日志里会写明「跳过 N 个：令牌无 workflow 权限」），
其余文件照常提交。重新生成令牌时勾 `repo` + `workflow` 即可：https://github.com/settings/tokens/new

> 提示：旧版脚本建 tree 时不带 `base_tree`，会把本地索引里没有的文件从远端删掉——
> 按「网页手动创建 workflow」这条路走，下次跑脚本就会把它删掉。现在已修：默认只增不改不删，
> 只有显式加 `--prune` 才会删除远端独有文件。

### 2. 本机 `git push` 走不通

这台机器访问 `github.com` 会 `CONNECT tunnel failed, 502`（代理隧道问题），但 `api.github.com` 正常。所以代码是通过 **GitHub API（blobs → tree → commit → ref）** 提交的，不是 git push。

后续在本机更新代码，若 `git push` 失败，沿用同样方式即可。

### 3. 空仓库的 blobs API 限制

完全空的仓库（无任何 commit）上调用创建 blob 会返回 `409 Git Repository is empty`。必须先通过 Contents API 播一个初始提交。

### 4. 中文文件名

`git ls-files` 默认会把非 ASCII 路径转义成八进制（如 `GITHUB\351\203\250...md`）。提交脚本必须加 `-c core.quotepath=false`，否则路径会错。

### 5. 令牌已过期处理

首次部署用的令牌有效期 7 天。到期后重新生成一个即可，**记得勾 `workflow`**。

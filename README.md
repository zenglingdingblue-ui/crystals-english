# Crystal’s English

为 Crystal 定制的职场英文语境词库 App。纯离线、无账号、无后台，所有词库和学习进度都只在手机本地。

## 这是什么样的 App

技术上它是一个 **PWA（可安装的网页应用）**：用 iPhone 的 Safari 打开一次网址，点「添加到主屏幕」，
之后它就像一个普通 App 一样有自己的图标、全屏运行、没有浏览器地址栏，**断网也能用**（第一次打开时已把全部内容缓存到手机）。

不需要 App Store、不需要开发者账号、不需要 TestFlight。

## 把它装到 Crystal 的 iPhone 上（三步）

1. 把 `crystals-english` 这个文件夹整体放到任意一个 **https 的静态网站托管**上（下面给了三种免费做法）。
2. 在 iPhone 上用 **Safari**（必须是 Safari）打开那个网址。
3. 点底部的「分享」按钮 → **「添加到主屏幕」** → 「添加」。

之后从主屏幕的 💎 图标打开即可。第一次打开时在有网络的情况下停留几秒，让它把内容缓存好；之后关掉网络也能完整使用。

### 托管方式 A：GitHub Pages（推荐，永久免费）

1. 在 GitHub 新建一个仓库（可以是私有仓库之外的任意名字，例如 `crystals-english`）。
2. 把本文件夹里的所有文件上传到仓库根目录。
3. 仓库 Settings → Pages → Source 选 `main` 分支、根目录 `/` → Save。
4. 一两分钟后网址是 `https://<你的用户名>.github.io/crystals-english/`。

### 托管方式 B：Netlify Drop

打开 https://app.netlify.com/drop ，把整个文件夹拖进去，立刻得到一个 https 网址。

### 托管方式 C：Cloudflare Pages

Cloudflare 控制台 → Workers & Pages → Create → Upload assets → 上传文件夹。

> 本地测试：在本文件夹运行 `python3 -m http.server 8787`，然后用浏览器打开 `http://localhost:8787`。
> 注意：PWA 的离线缓存只在 https（或 localhost）下生效。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 入口页面 |
| `style.css` | 全部样式（含深色模式） |
| `app.js` | 应用逻辑：今日计划、间隔复习、词库、搜索、设置、朗读 |
| `data/deck-*.js` | 词库，每个主题一个文件 |
| `sw.js` | 离线缓存（Service Worker），由 `build.js` 生成 |
| `manifest.webmanifest` | 安装到主屏幕时的名称、图标、颜色 |
| `icons/` | App 图标 |
| `build.js` | 把 `data/` 里的词库注入 `index.html`，并刷新 `sw.js` 的缓存清单 |
| `validate.js` | 校验词库格式：`node validate.js data/deck-xxx.js` |
| `CONTENT_SPEC.md` | 词库内容规范（加词/改词时照着写） |

## 怎么加词、改词

1. 打开 `data/` 里对应主题的文件，照着已有条目的格式加一条（字段说明见 `CONTENT_SPEC.md`）。
2. 运行 `node validate.js data/deck-xxx.js` 确认格式没问题。
3. 运行 `node build.js`（会更新离线缓存版本号），再把文件重新上传到托管处。
4. iPhone 上下次联网打开 App 时会自动拿到新内容（会提示「内容已更新，下次打开生效」）。

## 学习机制

- **每日计划**：到期复习 + 当天新词额度（默认 10，可在「我的」里改）。
- **三档评分**：没印象（10 分钟后再来）、有点模糊（明天）、掌握了（1 → 3 → 7 → 15 → 30 天…，到 21 天以上标记为已掌握）。
- **发音**：用 iPhone 自带的英语语音（离线可用），单词、邮件句、会议句、搭配都能点读。
- **进度**只存在手机本地（localStorage）。删除 App 会清空进度。

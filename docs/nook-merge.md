# Hot AI × NewsNook 合并方案（v1 · 落地到 hotai.yeuxark.com）

> 状态：已批准执行。本文档是实现的唯一规格。改核心行为前先改这里。
> 相关：[`design.md`](./design.md)、[`../CLAUDE.md`](../CLAUDE.md)、参考站点 [music.yeuxark.com](https://music.yeuxark.com)（KAZAM）、[news.aizeek.com](https://news.aizeek.com)（NewsNook Web）。

---

## 0. 一句话

**默认产品是 NewsNook 式速闻（分类轨 + 多源时间线 + 站内读 + OPML）。Hot AI 的打分热榜 / 简报 / 问答收成 `/hot` + `/digest` 小模块。** 部署 `https://hotai.yeuxark.com`。速闻条目不进 `Article` 表。

不是把 NewsNook Capacitor 工程搬进来，也不是做 Android 包。NewsNook 的网页版本来就是同一套 React SPA（`news.aizeek.com` + Cloudflare Functions 反代）；我们把它的 **信息架构** 移植进现有 `apps/web`。

---

## 1. NewsNook 有没有网页版？

有。官方 README / 架构文档：

| 形态 | 地址 / 打包 | 能力 |
|---|---|---|
| Android | GitHub Releases，cloud ~2MB / local ~60MB | CapacitorHttp + 可选 SOCKS + 本地翻译 |
| **Web** | **https://news.aizeek.com** | Vite SPA + Cloudflare Pages Functions 做 CORS 边缘代理 |
| iOS | 非官方 fork（自行签名 IPA） | 不纳入本次范围 |

Web 版没有 App 内 SOCKS 隧道，国际源依赖 Functions 代理。Hot AI 已经有 Node 服务端，**代理改由 Next.js route 做**，比 Cloudflare Functions 更合适。

---

## 2. 两边优点如何同时保住

| 优点来源 | 具体能力 | 合并后落点 |
|---|---|---|
| Hot AI | 全局打分（源权重 × 衰减 × 信号 × aiImportance） | `/hot` 数据库热榜；默认 `/` 是实时速闻目录 |
| Hot AI | 每篇 LLM 双语摘要 / topics / 情感 / 重要度 | 列表卡 + 站内阅读器顶部 |
| Hot AI | 每日 digest + `/api/ask` | 桌面左侧「今日脉搏」+ `/digest` 全页 |
| Hot AI | 14 天硬删除、无账号、无个性化推荐 | **不变**（见 §3） |
| Hot AI | fetcher 去重 / 转载合并 / 源健康 | **不变** |
| Hot AI | 精选博客目录 | `/blogs` + OPML 里的 Blogs 分组 |
| NewsNook | 分类轨 + 场景预设，显式切换 | 顶栏 tabs（热榜 / 简报 / 分类 / 订阅） |
| NewsNook | 混合时间线按 `publishedAt` | 非热榜场景（分类、单源、我的订阅） |
| NewsNook | 站内读正文，外链是次要操作 | 新路由 `/a/[id]` + Readability 代理 |
| NewsNook | 自建 RSS/Atom/JSON Feed + OPML | `/subscribe`，**只存 localStorage** |
| NewsNook | 稍后读 / 已读，本机 | localStorage，不进 Postgres |
| NewsNook | 中文优先、阅读器衬线正文 | 默认 `zh`；阅读器 `Noto Serif SC` |
| KAZAM | 奶油底 + 3px 黑框 + 硬阴影；暗色虚空黑 + 藏青 | 全站 token，见 §6 |

**热榜排序不会污染混合时间线。** 作者原话是「按时间顺序展示」。处理：

- 场景 `hot`：`ORDER BY score DESC`（Hot AI 的理由存在这里）
- 其它场景：`ORDER BY publishedAt DESC`
- 用户点「今日热榜」才看到排名，等于订阅一份编辑过的源，而不是偷偷改时间线

---

## 3. 硬边界（合并也不许破）

沿用 `design.md` / `CLAUDE.md`：

| 允许 | 禁止 |
|---|---|
| localStorage：场景、自定义源、稍后读、已读、主题、语言 | User 表、登录、云同步 |
| 全局同一份热榜 | 按阅读历史「猜你喜欢」 |
| 自定义源只在「我的订阅」里、客户端拉 | 把用户 OPML 写入 `Article` / 污染全局排名 |
| 14 天 Article 保留 | 长期归档 |
| 匿名 RSS / JSON Feed / OPML 出口 | 鉴权开放 API、Push、邮件 |

这是方案 C 的正确形态：OPML 是 **目录互通 + 用户本机订阅**，不是第二套后端。

**不移植 NewsNook 的：** Capacitor、Android/iOS、ML Kit/Bergamot、SOCKS 隧道、网易/体育等 90 综合频道、媒体嗅探/HLS 播放器、墨水屏分页、跟贴。Hot AI 仍然是 **AI 垂直站**。

**不拷贝 NewsNook 源码。** Apache-2.0 允许参考交互，但实现全部自写。解析器用现有 `rss-parser` + 自写 OPML，Readability 用 `@mozilla/readability`。

---

## 4. 目标产品地图

部署域名：`https://hotai.yeuxark.com`（`NEXT_PUBLIC_SITE_URL` 默认值同步改）。

```
桌面（≥960px）                          手机
┌────────────┬──────────────────┐     ┌──────────────────┐
│ 今日脉搏    │ 顶栏 logo/搜索/主题│     │ 顶栏 + 场景 tabs │
│ digest 卡  │ 场景 tabs         │     │ 今日脉搏折叠卡   │
│ Ask 迷你   ├──────────────────┤     ├──────────────────┤
│ 统计       │ 分类轨            │     │ 分类轨           │
│            │ 信息流            │     │ 信息流           │
│ ←yeuxark   │                  │     │                  │
└────────────┴──────────────────┘     └──────────────────┘
点击条目 → /a/[id] 站内阅读器（摘要 + 正文 + 原文链接）
```

### 4.1 路由

| 路径 | 角色 |
|---|---|
| `/` | 默认实时速闻目录。客户端拉 allowlisted RSS/Atom/JSON Feed；可切场景 |
| `/hot` | 数据库热榜（top 50，按 score / AI 重要度排序） |
| `/digest` | 今日简报全页 + AskBox |
| `/a/[id]` | **新** 站内阅读器 |
| `/category/[slug]` | 分类时间线（publishedAt） |
| `/source/[slug]` | 单源时间线 |
| `/blogs` | 精选博客目录 |
| `/search` | 搜索 |
| `/subscribe` | **新** 自定义源 + OPML 导入导出 |
| `/feed.xml` | RSS 2.0，**description 用 aiSummaryZh/En** |
| `/feed.json` | **新** JSON Feed 1.1 |
| `/hotai.opml` | **新** 编辑源 + 博客 feedUrl |
| `/api/digest` | 简报 JSON（保留） |
| `/api/ask` | SSE 问答（保留；IP 限流 + AskCache + PostgreSQL 日配额/并发预约） |
| `/api/readability` | **新** POST `{url}` → 抽取正文（SSRF 防护） |
| `/api/proxy/feed` | **新** GET `?url=` 拉用户自建源（SSRF 防护，不入库） |
| `/api/revalidate` | 现有；cycle 增加 `/` `/digest` 之外如需要再列 |

### 4.2 场景（localStorage `hotai.scene`）

| id | 名称 | 数据 | 排序 |
|---|---|---|---|
| `hot` | 今日热榜 | `getTopArticles` | score |
| `digest` | 今日简报 | Digest 行 + 今日 top | n/a（跳 `/digest` 或首页左栏） |
| `research` / `industry` / `opensource` / `media` | 四分类 | `getCategoryArticles` | publishedAt |
| `blogs` | 研究者 | CuratedBlog 目录 | sortOrder |
| `mine` | 我的订阅 | localStorage 自定义源，经 `/api/proxy/feed` | publishedAt |

预设不需要 NewsNook 那 7 套综合门户。Hot AI 垂直，5～6 个场景足够。

---

## 5. 数据与 API 规格

### 5.1 `queries.ts` 增补

```ts
getArticleById(id: number)
getArticlesByIds(ids: number[])
getEnabledSources() // slug, name, category, homepage, url, type, lang
```

读层仍只走 `lib/queries.ts`，页面不直接 Prisma。

### 5.2 RSS `/feed.xml`

每个 `<item>`：

- `<title>` `<link>` `<guid>` `<pubDate>` `<source>` 保留
- `<description>` = `aiSummaryZh || aiSummaryEn || summary`（HTML escape）
- `<category>` 重复输出 `aiTopics`
- 可选 `<content:encoded>` 包一层短 HTML：摘要 + topics + 「重要度」

支持 query（缺省 = 热榜 50）：

- `?category=research`
- `?min_importance=0.8`
- `?lang=zh|en`（选摘要语言）

### 5.3 JSON Feed `/feed.json`

NewsNook `parseJsonFeed` 能吃的字段必须齐：

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Hot AI",
  "home_page_url": "https://hotai.yeuxark.com",
  "feed_url": "https://hotai.yeuxark.com/feed.json",
  "items": [{
    "id": "https://...",
    "url": "https://hotai.yeuxark.com/a/123",
    "external_url": "https://original.example/post",
    "title": "...",
    "summary": "中文摘要",
    "content_html": "<p>摘要</p><p>主题：…</p>",
    "date_published": "2026-08-23T12:00:00Z",
    "tags": ["agents"]
  }]
}
```

`url` 指站内阅读器；`external_url` 指原文。同一套 query 参数。

### 5.4 OPML `/hotai.opml`

```
Hot AI
  ├── Industry   (openai-blog, anthropic-news, ...)
  ├── Research   (arxiv-*, huggingface-papers)
  ├── Media      (hn, reddit, 机器之心, ...)
  ├── Open Source
  └── Blogs      (CuratedBlog.feedUrl 非空的)
```

每条 `xmlUrl` 是 **上游原始 RSS**，不是再包一层热榜。文档里写清：热榜 Feed 和实验室 RSS 不要挂在同一分类，否则重复。

### 5.5 Readability `POST /api/readability`

- body: `{ url: string }`
- 超时 12s，响应体上限 1.5MB
- **SSRF**：只允许 http/https；DNS 解析后拒绝私网 / 环回 / link-local / metadata（10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, ::1, fc00::/7, 198.18/15 fake-ip）
- 用 `@mozilla/readability` + `linkedom`（或 jsdom）
- 返回 `{ ok, title, contentHtml, excerpt }`；失败 422
- 只服务站内阅读器（可校验 `Referer` 同源，非硬依赖）

### 5.6 自建源代理 `GET /api/proxy/feed?url=`

- 同一套 SSRF 规则
- 用 `rss-parser` 解析 RSS/Atom；若 body 是 JSON 且 `items` 为数组则当 JSON Feed
- 返回 `{ ok, title, items: [{title,url,summary,publishedAt}] }` 最多 40 条
- **绝不写入 Article 表**
- 限流：每 IP 30/60s（共享 PostgreSQL fixed-window bucket；数据库不可用时 fail-closed）

### 5.7 revalidate

fetcher cycle 仍 POST `["/", "/digest"]`。阅读器走 `force-dynamic` 或 `revalidate=600` 按 id。

---

## 6. 视觉规格（对齐 KAZAM / music.yeuxark.com）

从 `https://music.yeuxark.com/static/style.css` 抽 token，**不要**再走现在的橙紫渐变 Hero。

### 6.1 颜色

**浅色 · cream neo-brutalism**

| token | 值 |
|---|---|
| `--bg` | `#fdf6e3` |
| `--bg-elevated` / `--card` | `#fffef9` |
| `--ink` | `#1a1a2e` |
| `--mild` | `#555570` |
| `--fade` | `#9999b0` |
| `--border` | `#1a1a2e` |
| `--yellow` | `#facc15` |
| `--red` | `#ff4d6a` |
| `--blue` | `#3b82f6` |
| `--shadow` | `4px 4px 0 #1a1a2e` |
| `--shadow-sm` | `3px 3px 0 #1a1a2e` |

**暗色 · Void Navy**

| token | 值 |
|---|---|
| `--bg` | `#000000` |
| `--card` | `#050505` |
| `--ink` | `#f0f0f0` |
| `--border` | `#2a2a2a` |
| `--accent` / `--yellow` 别名 | `#173A52` |
| `--shadow` | `4px 4px 0 #173A52` |
| `--theme-meta` | `#000000` |

### 6.2 形体语言

- 边框 **3px solid**
- 按钮/logo/卡片：**硬偏移阴影**，hover `translate(-1px,-1px)`
- Logo：「HOT AI」黄底黑框字标（暗色改为黑底藏青阴影），`font-weight: 900; letter-spacing: -1px`
- 顶栏 tabs：相连的 3px 框（`margin-left: -3px`），active = 浅色墨底反白 / 暗色藏青底
- 搜索框：3px 边框，右侧黄/蓝提交钮
- **不要** 大面积 blur 光斑、圆角 3xl 渐变 Hero、Inter 字体、紫渐变
- 圆角最多 `0`～`2px`（KAZAM 基本直角）

### 6.3 字体

- UI：`"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif`（KAZAM）
- 阅读器正文：`"Noto Serif SC", "Source Serif 4", Georgia, serif`（NewsNook 阅读感）
- 等宽：`JetBrains Mono`（元数据、分数）
- Google fonts 用 `media="print" onload="this.media='all'"` 防阻塞，与 NewsNook 相同

### 6.4 主题脚本

现有 `ThemeNoFlashScript` 改为同时写：

- `html.classList.toggle("dark", ...)`（Tailwind `darkMode: "class"` 继续用）
- `html.setAttribute("data-theme", "light"|"dark")`
- `meta theme-color`：浅 `#facc15`，暗 `#000000`

storage key 仍 `hotai-theme`。

### 6.5 语言

- `layout.tsx` `html lang="zh"`
- `LangContext` 默认 `"zh"`（无 localStorage 时）
- 文案中文优先，英文靠切换

### 6.6 页脚

一条 `← yeuxark.com` 链到 `https://yeuxark.com`，风格同 KAZAM footer-link。

---

## 7. 组件改造清单（`apps/web`）

全部视觉走 CSS 变量，在 `globals.css` 定义；Tailwind 扩展 `ink`/`accent` 映射到这些变量，或混用 `@apply` + 原始 CSS。优先 **CSS 变量 + 少量工具类**，避免再堆 `rounded-3xl fire-gradient`。

| 文件 | 动作 |
|---|---|
| `app/globals.css` | 重写成 KAZAM token + 工具类 `.kz-btn` `.kz-card` `.kz-tab` `.kz-logo` |
| `tailwind.config.js` | 颜色映射到 cream/void；fontFamily 改 DM Sans |
| `app/layout.tsx` | 新壳：`AppShell`（顶栏 + 可选左栏），去旧 Header/Footer 默认营销风 |
| `components/AppShell.tsx` | **新** 顶栏 logo/搜索/主题/tabs |
| `components/PulseRail.tsx` | **新** 桌面左栏：digest 头条 + 迷你 Ask + 统计 |
| `components/FeedList.tsx` | **新** 信息流（热榜带名次，其它不带） |
| `components/ArticleCard.tsx` | 直角硬边卡片；摘要用 aiSummaryZh；外链改成进 `/a/[id]` |
| `components/Reader.tsx` | **新** 客户端阅读器：摘要 → 正文 → 原文 |
| `components/ThemeToggle.tsx` | 42px 3px 边框，☾/☀ |
| `components/SearchBox.tsx` / Header 搜索 | KAZAM search-wrap |
| `components/Hero.tsx` | **删除或降级**。首页不再用大 Hero |
| `components/HotList.tsx` | 由 FeedList 替代或内部改皮肤 |
| `app/page.tsx` | 新布局 |
| `app/a/[id]/page.tsx` | **新** |
| `app/subscribe/page.tsx` | **新** |
| `app/digest/page.tsx` | 同皮肤，保留 AskBox |
| `app/blogs/page.tsx` 等 | 同皮肤 |
| `lib/local-sources.ts` | **新** OPML 解析/序列化 + localStorage |
| `lib/ssrf.ts` | **新** URL 校验 |
| `lib/constants.ts` | `SITE.url` 默认 `https://hotai.yeuxark.com`；默认语言 zh |
| `lib/article.ts` | `toCard` 增加站内 href `/a/${id}` |

fetcher / `packages/ai` / Prisma **本轮不改 schema**（自定义源不入库）。

---

## 8. 阅读器行为

1. SSR 输出标题、来源、时间、AI 双语摘要、topics、importance、crossPosts
2. 客户端再 `POST /api/readability` 抽原文 HTML，DOMPurify 后注入
3. 抽失败：显示摘要 + 「打开原文」按钮，不白屏
4. 「稍后读 / 已读」只写 localStorage
5. 相关文章：`aiTopics` 交集，最多 5 条（queries 已有 GIN）

---

## 9. 部署

现有拓扑不变：Nginx → `hotai-web:3000`，`hotai-fetcher` cron，Postgres。

改动文件：

- `deploy/nginx.conf`：`server_name hotai.yeuxark.com;`
- `deploy/README.md`：域名换成 `hotai.yeuxark.com`；SSE `/api/ask` 加

```
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 120s;
```

（现在 60s 对长问答偏紧）

- `apps/web/lib/constants.ts`：`SITE.url`
- `.env.example`：`NEXT_PUBLIC_SITE_URL=https://hotai.yeuxark.com`
- README 首页说明新 UI / 新路由

**本 workflow 不 SSH 上生产机。** 代码与 nginx 模板改完；上线步骤写在 `deploy/README.md`（git pull → migrate → build → pm2 reload → nginx）。若本机可 `pnpm dev:web`，用浏览器验证。

---

## 10. 实现顺序（workflow 相位）

1. **Foundation** — token、layout 壳、主题脚本、constants、design.md 范围段
2. **APIs** — queries、feed.xml/json、opml、ssrf、readability、proxy/feed
3. **Home feed** — page + PulseRail + FeedList + ArticleCard 进 `/a/[id]`
4. **Reader** — `/a/[id]` + Reader 组件
5. **Surfaces** — digest / search / blogs / category / source 换皮
6. **Subscribe** — OPML 导入导出 + 我的订阅时间线
7. **Deploy docs** — nginx / README / .env.example
8. **Verify** — `pnpm test`、`pnpm typecheck`、修编译错误；能起 dev server 则浏览器走主路径

每步必须可独立合并：前一步不能让站点红屏。

---

## 11. 验收

- [ ] 浅色：奶油底、黄 logo、3px 黑框、硬阴影
- [ ] 暗色：纯黑 + 藏青强调，无雾面蓝紫
- [ ] 默认中文
- [ ] `/` 热榜按 score，带名次
- [ ] `/category/*` 按时间
- [ ] `/a/[id]` 先出 AI 摘要，再出正文或降级
- [ ] `/feed.json` 可被通用 JSON Feed 阅读器解析
- [ ] `/feed.xml` description 是 AI 摘要
- [ ] `/hotai.opml` 含 Source + 有 feedUrl 的博客
- [ ] `/subscribe` 导入 OPML 后「我的订阅」出现条目，且 **Postgres Article 行数不变**
- [ ] `/api/readability` 与 `/api/proxy/feed` 拒绝 `http://127.0.0.1/`
- [ ] `/digest` + Ask 仍可用
- [ ] 无新 Prisma model、无登录
- [ ] `pnpm test` 与 `pnpm typecheck` 通过
- [ ] 页脚有 `yeuxark.com`

---

## 12. 明确不做（v1）

- Android / iOS 壳
- 把网易、体育、门户源灌进 fetcher
- 用户账号、云同步稍后读
- 把自定义源写入热榜
- SimHash、webhook、PWA push（design.md 原计划可后做）
- 拷贝 NewsNook 仓库文件

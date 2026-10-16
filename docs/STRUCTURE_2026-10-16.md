# 结构梳理 · 2026-10-16

起点是 `d1f3b3f`（橘鸦改版上线后）。目标：找出结构上的重复、残留和隐患，在不改变页面外观和行为的前提下清理掉。

## 1 · 现状

| 项目 | 测量 | 结论 |
|---|---|---|
| 服务端耗时（VPS 本机，3 次） | `/` 25–40 ms，`/juya` 50–75 ms，`/hot` 100–135 ms，`/search` 120–160 ms，`/category` 100–130 ms | 都不慢；外网访问约 0.5 s 主要是网络往返 |
| 数据库 | Article 2260 行、7.4 MB；热榜查询 0.7 ms，走 `score, publishedAt` 索引；`raw` 列平均 38 字节 | 列表查询多取了几列，但代价可以忽略 |
| 前端 JS（gzip） | 每页公共约 142 KB（React + Next 运行时），首页另加 17 KB，橘鸦 2.3 KB | 已经很精简，再压收益有限 |
| CSS | 单文件 64.4 KB / gzip 12.9 KB，其中约 8 KB 是 Tailwind 生成的 | 见下文 |
| fetcher 每轮 | 抓取 4–5 s，重算分数约 200–260 行；AI 摘要轮次 30–350 s | 正常 |

## 2 · 发现

1. **Tailwind 只剩空壳。** 组件里只用了 `sr-only`、`font-bold`、`min-w-0`、`flex-1` 四个工具类，`font-bold` 还全被 `.kz-feed-empty` 的规则盖住，实际没起作用。它带来的是：3 个开发依赖（锁文件 1100 多行）、两份配置，以及给每个元素都设一遍的 52 个 `--tw-*` 自定义属性。它还会扫描源码里出现的单词，生成 `.hidden`、`.sticky`、`.block` 这类规则，这些规则会作用到远程正文里同名的 class 上。
2. **远程 HTML 保留了 `class`。** 站内阅读器和橘鸦的正文经过 DOMPurify 后仍保留 class，所以 feed 里的 `class="kz-juya-lightbox"`、`class="sr-only"` 可以借用本站样式，做出全屏覆盖层或隐藏文字。
3. **简报生成写了两遍。** fetcher 的 `ensureTodayDigest` 和 Web 首访兜底的 `loadDigest` 各自实现了一遍：取语料、认领租约、租约下复查、续租调用模型、在租约内 upsert、结算租约。合同要求两边“同一协议”，但只能靠两份代码手工保持一致。
4. **环境变量解析有四份。** `ask-guard`、`ask-quota`、`digest`、`health` 各有一个 `bounded()`，`ask-guard` 还有不设上下限的 `num()`：`ASK_CACHE_TTL_HOURS` 在 Web 侧没有上限，而 fetcher 按 1–720 小时清理缓存，两边可能不一致。`startOfUtcDay` 也有三份（queries、health、fetcher 的 `utcDayWindow`）。
5. **死代码。** `CategoryNav` 组件和它的 4 个图标、`getArticlesByIds`、`getCuratedBlogSlugs`、`defaultEnabledIds`、`CategorySlug`、只在测试里用到的 `addId` / `removeId`、`.kz-topic` 样式、`force-dynamic` 页面上的 `generateStaticParams` 和 `revalidate`、`SubscribeClient` 里的第三份 `mapPool`。
6. **`NookFeed.tsx` 727 行。** 卡片渲染、NDJSON 行解析和拉取状态机写在同一个文件里，其中流解析没有测试。
7. **文档。** `docs/` 下有 7 份 8–9 月的审计报告（约 2700 行），和当前文档混在一起；`CLAUDE.md` 说 `@hotai/db` 不用构建（实际运行时加载的是 `dist/`），还说源连续失败会设 `enabled=false`（实际是 `autoPausedUntil`）。

## 3 · 改动

| 提交 | 内容 |
|---|---|
| 去掉 Tailwind | `globals.css` 的 Base 段改为手写的重置（规则沿用 preflight），`.sr-only` 写进样式表；空状态标题改用 `kz-feed-empty-title`，博客卡片正文改用 `kz-blog-info`；删除 `tailwind.config.js`、`postcss.config.mjs` 及 `tailwindcss` / `autoprefixer` / `postcss` 三个依赖。浏览器前缀由 Next 内置的 PostCSS 继续添加 |
| 远程 HTML 去 class | `sanitizeRemoteHtml` 的 `FORBID_ATTR` 加上 `class`；`id` 保留，供页内锚点使用；新增测试 |
| 简报生成合一 | `packages/db/src/digest.ts`：`runDigestGeneration`、`loadDigestCorpus`、`startOfUtcDay`。调用方只传入“已有简报是否可用”的判断（fetcher：6 小时内的算可用；Web：有就用）和生成函数。fetcher 的 `digest.ts` 从 136 行减到 42 行，Web 的 `loadDigest` 只保留单飞和等待逻辑。新增 PostgreSQL 测试，覆盖跳过、写入、沿用、被占用、模型无结果五种情况 |
| 环境变量 | `lib/env.ts` 的 `envInt` 替代四份 `bounded`；`ASK_CACHE_TTL_HOURS` 限定为与 fetcher 相同的 1–720 小时；`ARTICLE_RETENTION_DAYS` 也改用它 |
| 死代码 | 删除第 5 条列出的各项；`ART_REQUIREMENTS.md` 记录图标已移除 |
| NookFeed 拆分 | 卡片拆到 `NookCard.tsx`，流解析拆到 `lib/catalog-stream.ts`（带测试），`sameTimelineItems` 移到 `nook-merge`。`NookFeed` 降到 600 行，只保留拉取、编辑排序等待和滚动恢复 |
| 文档 | 历史报告移到 `docs/archive/`，新增 `docs/README.md` 索引；修正 `CLAUDE.md`、`CURRENT_BEHAVIOR.md`、`README.md` 中的相应说明 |

## 4 · 验证（本机生产构建，测试库）

- **样式不变**：旧版（`d1f3b3f`）和新版各起一份生产构建，在浅色桌面、深色桌面、浅色手机三种组合下，对热榜、简报、搜索、分类、来源、文章、博客、我的、404、橘鸦十个页面，逐个元素比较 68 项计算样式（包括 `::before`、`::after`、`::placeholder`、`::marker`）。除了改名的两个元素，以及 PostCSS 给 `font-variant-numeric: tabular-nums` 补的等价 `font-feature-settings: "tnum"` 之外，**差异为 0**。首页是实时内容，两次加载本身就不同，没有纳入比较。
- **CSS**：64,389 → 60,905 字节，gzip 12,895 → 12,133 字节，`--tw-*` 声明 104 → 0。样式重算时间的差别在测量噪声以内（同一构建两次测量能差 50%），不算作性能收益。
- **测试**：单元测试 227 个通过（原 223 个，新增 envInt、流解析、远程 class、UTC 日四组；删除了只测死代码的一组）。打开 `RUN_DB_TESTS` 后共 249 个通过，包括新的简报生成测试。类型检查、ESLint 无报错。
- **浏览器回归**：11 条用户路径全部通过。另外用真实来源加载首页：7 个源、113 条，切换频道、加载更多、橘鸦 37 条都正常，控制台没有错误。
- **fetcher**：编译产物的 smoke 检查通过。

## 5 · 生产

- 部署 `b962bea`（`/root/hotai-releases/b962bea`），数据库结构没有变化，不需要迁移。备份在 `/root/hotai-backups/20261016-081523-b962bea/`。回滚到 `d1f3b3f`：`bash /root/hotai-backups/20261016-081523-b962bea/rollback.sh`。
- 重启后第一次访问 `/hot` 用了 6.8 s：当时 fetcher 正在跑启动后的第一轮抓取，2 核机器负载到 5。之后 3 轮实测 `/hot` 85–230 ms，`/juya` 45–95 ms，`/category` 90–200 ms，`/search` 130–270 ms，文章页约 60 ms。
- 浏览器检查（浅色桌面、深色手机）：首页、热榜、简报、橘鸦、博客、我的、搜索、分类、404 状态码都正确，控制台没有错误，没有横向滚动，背景色和分隔线颜色符合两套主题，`--tw-*` 变量已经不存在。Web 错误日志为空，PM2 没有重启。
- CI：浏览器回归的 OPML 导入一步又出现一次偶发超时（2026-10-15 也出现过）。原因是 Playwright 在 `waitForEvent` 时才开启文件选择框拦截，和打开选择框的按键形成竞争。已改为页面创建时就开启拦截，本机连续 3 次 11/11 通过。

## 6 · 没做的

- **`lib/` 分子目录**：36 个模块平铺，但命名前缀已经能分组（`ask-*`、`catalog-*`、`juya*`、`nook-*`、`reading-*`）。移动文件会改动几十处 import，并打乱 git 历史，收益不够。
- **`globals.css` 按模块拆文件**：之前专门合并成一个文件，避免不同文件之间互相覆盖；“舒适密度”“减少动效”两段本来就要覆盖其他段的规则，拆开后又会出现跨文件覆盖。维持一个文件，按 `/* --- 段名 --- */` 分段。
- **列表查询改成 `select`**：实测多取的列只有几百字节，查询本身不到 1 ms。
- **升级 React 19**：App Router 实际运行的是 Next 自带的 React 19；`react@18.3.1` 只用于类型和 Pages Router，Next 16 也支持它。升级没有用户可见的收益。
- **VPS 旧版本清理**：磁盘 83%，`/root/hotai-releases` 下还有 5 个比回滚目标更旧的版本。删除前需要确认。

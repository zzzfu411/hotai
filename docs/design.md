# Hot AI · 设计文档

> 本文档涵盖项目当前的运行逻辑、已知痛点,以及按 ROI 排序的优化与扩展方案。
> 与 [`ART_REQUIREMENTS.md`](./ART_REQUIREMENTS.md)(美术资产清单)、[`../CLAUDE.md`](../CLAUDE.md)(给 Claude Code 的编码约定)互为补充。

---

## 项目宗旨(范围声明)

**Hot AI 是一个面向 AI 行业的"今日热门聚合站",目标是把每一天最重要、最热门的新闻 / 论文 / 开源项目推到用户眼前。**

围绕这个目标的硬性边界:

| 决策 | 选择 | 理由 |
|---|---|---|
| **保留窗口** | 文章硬性保留 **14 天**,过期自动删除 | 站点是"今日热度",不是档案馆;DB 体积可控,查询永远快 |
| **用户系统** | **不做** | 没有账号 = 没有登录 / 找回 / 反垃圾的运维成本;也不需要个性化引擎 |
| **个性化推荐** | **不做** | 所有用户看到的"今日热门"是同一份;靠源权重 + 时间衰减 + 信号 + AI 重要度排序 |
| **AI 介入粒度** | **每一篇** 新文章都过一次 LLM,产出摘要 / 主题 / 类型 / 重要度 | 重要度评分要进入排序公式,所以必须每篇都打 |
| **AI 编辑产出** | 每日 **digest** —— 一份给所有人看的"今天发生了什么"简报 | digest 就是"推送"的主体 |

下面所有的优化和扩展方案都必须服务于上面这些边界。**任何引入"用户态"或"长期归档"的方案默认不做。**

---

## 目录

- [一 · 项目当前逻辑](#一--项目当前逻辑)
- [二 · 当前痛点](#二--当前痛点)
- [三 · 优化方案](#三--优化方案改现有的)
- [四 · 功能扩展](#四--功能扩展加新的)
- [五 · 可靠性 / 运维](#五--可靠性--运维)
- [六 · 推荐落地顺序](#六--推荐落地顺序按-roi)
- [七 · 已被划掉的方向](#七--已被划掉的方向)

---

# 一 · 项目当前逻辑

## 1.1 进程拓扑

```
                ┌────────────────────────────────────────┐
                │  Postgres (唯一状态)                   │
                │  Source · Article (14d) · Digest       │
                └────────────────────────────────────────┘
                       ▲                       ▲
                  writes│                       │reads
                       │                       │
            ┌──────────┴──────────┐   ┌────────┴──────────┐
            │  apps/fetcher       │   │  apps/web         │
            │  (Node + cron)      │   │  (Next.js SSR/ISR)│
            │                     │   │                   │
            │  唯一写入者         │   │  只读             │
            └──────────┬──────────┘   └────────▲──────────┘
                       │                       │
                       │  POST /api/revalidate │
                       └───────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  你的中转站           │
                       │  /v1/messages 协议    │
                       └──────────────────────┘
                                  ▲
                                  │  enrich + digest + ask
                       ┌──────────┴───────────┐
                       │  packages/ai         │
                       │  (Anthropic SDK)     │
                       └──────────────────────┘
```

**关键设计:** 单向数据流。fetcher 是唯一写库者,web 完全只读。两边通过 `/api/revalidate` 弱耦合。**没有用户表、没有 session、没有冷归档** —— 整个 Postgres 永远只有不到 14 天的内容,体量上限可预测。

## 1.2 一轮 fetcher cycle 干了什么

```
[cron tick @ :07]
  │
  ├── purgeOldArticles()                  ← 先清,别浪费 AI 配额给马上要删的内容
  │     └── DELETE FROM Article WHERE publishedAt < now - 14d
  │
  ├── prisma.source.findMany({ enabled: true })
  │
  ├── for each source:
  │     ├── dispatch.ts 按 slug→type 选 fetcher
  │     │     ├── slug 命中 (github-trending / hf-*) → 专用抓取器
  │     │     └── 否则按 type: rss → rss-parser; scrape → cheerio
  │     │
  │     ├── store.upsertArticles(source, items)
  │     │     ├── normalizeUrl     ← 砍 utm_*, ref, gclid, fbclid…
  │     │     ├── hashUrl/Title    ← SHA-1
  │     │     ├── computeScore(...) ← 见 1.3
  │     │     └── prisma.article.upsert({ where: urlHash })
  │     │
  │     └── update source.lastFetch
  │
  ├── enrichPendingArticles()             ← AI 流水线 1/2
  │     ├── 取 aiAnalyzedAt IS NULL 的所有文章 (按 score DESC, 软上限 AI_ENRICH_PER_RUN)
  │     ├── N 个 worker 并发跑 LLM_MODEL_FAST
  │     ├── 每篇返回 { summaryEn, summaryZh, topics, sentiment, importance }
  │     └── 失败的也写 aiAnalyzedAt=now / aiModel="skipped" 防止热循环
  │
  ├── ensureTodayDigest()                 ← AI 流水线 2/2
  │     ├── 当日 (UTC) 文章 ≥5 篇才生成
  │     ├── 已存在且 <6h → 跳过
  │     ├── 取 top-40 投给 LLM_MODEL_SMART
  │     └── 写入 Digest 表 (headline / overview / bullets / themes)
  │
  └── POST /api/revalidate { paths: ["/", "/digest"] }
```

## 1.3 打分公式

定义于 `apps/fetcher/src/scoring.ts`:

```
score = (sourceWeight + signalBoost + keywordBoost) × decay + sourceWeight × 0.1
       │              │              │                │
       │              │              │                └── exp 衰减,半衰期 24h
       │              │              └── 标题/摘要命中 keywords 每个 +0.4(封顶 2.0)
       │              └── log1p(points + comments×0.5 + stars×0.8 + min(downloads,100k)×0.01)
       └── 源权重,seed 里手填:OpenAI/Anthropic 2.0,arXiv 1.2,reddit 0.9
```

**当前缺口:** `aiImportance` 字段已经在落库,但 **还没进入这条公式**。这是 3.1 要做的事。

**特性:**
- 每次 upsert 重算,所以一篇老文如果今天又拿到新 signals(HN 评论涨)会自动重排
- "权威源 × 时间新鲜 × 信号热度 × 关键词相关性" 四维加权
- HF 模型 `lastModified` 早于 30 天的会被钳到 `now()`,否则老模型永远榜上无名
- 14d 保留期 + 24h 半衰期 → 14 天后 decay = 2⁻¹⁴ ≈ 0.006%,老文实际上从未进入排序

## 1.4 去重

| 层 | 做了什么 | 没做什么 |
|---|---|---|
| URL 层 | `normalizeUrl` 砍追踪参数 → SHA-1 → 作为 unique key | 不识别 301 重定向的最终 URL |
| 标题层 | `titleHash` 已存进库 + 建了索引 | **没有任何查询用它** —— 同一新闻被 HN/机器之心/量子位转载会重复出现 3 次 |
| 语义层 | 无 | 同一论文用不同标题转写 → 完全无法识别 |

## 1.5 AI 流水线状态

| 接入点 | 模型 | 触发 | 频率 | 用途 |
|---|---|---|---|---|
| `enrich.ts` | `LLM_MODEL_FAST` | fetcher cycle 末尾 | **每篇新文,软上限 30/cycle** | 摘要 + 主题 + 类型 + 重要度 |
| `digest.ts` | `LLM_MODEL_SMART` | fetcher cycle 末尾 | 每天 ≤4 次刷新 | 当日 headline + bullets |
| `/api/ask` | `LLM_MODEL_FAST` (流式) | 用户每问一次 | 按访客量 | 基于过去 48h 的问答 |

**字段写入:** `Article.aiSummaryEn/Zh`、`aiTopics[]`、`aiSentiment`、`aiImportance`、`aiAnalyzedAt`、`aiModel`。每个 AI 路径都先查 `AI_ENABLED`,key 没配就静默跳过。

**容量核算:**
- 20 源 × 平均 10 篇新文/天 ≈ 200 新文/天
- 软上限 30/cycle × 24 cycle/天 = 720 enrich slot/天
- 大概率每篇都能在当天被 AI 处理 ✓
- 极端情况(突发新闻周末)排队 → 按 score 降序消费,重要的先处理

## 1.6 web 渲染策略

| 路由 | 渲染 | 缓存 | 数据源 |
|---|---|---|---|
| `/` | RSC + ISR | `revalidate=600` | 直查 Postgres,top 50 by score |
| `/digest` | RSC + ISR | `revalidate=1800` | DB hit → 缺则在线生成 + 落库 |
| `/category/{slug}` | RSC + ISR + SSG params | `revalidate=600` | DB,filter by category |
| `/source/{slug}` | RSC + ISR | `revalidate=600` | DB,filter by source |
| `/search` | RSC | `force-dynamic` | DB `ILIKE` |
| `/api/ask` | Node runtime | 无(亟需限流) | DB + 流式 LLM (SSE) |
| `/api/digest` | RSC | `revalidate=600` | DB |
| `/feed.xml` | RSC | `revalidate=600` | DB,RSS 2.0 输出 |

---

# 二 · 当前痛点

按严重程度排:

| 级别 | 痛点 | 后果 |
|---|---|---|
| 🔴 高 | **`aiImportance` 没进打分公式** | LLM 评估的"重要度"白算了,首页排序没用上 |
| 🔴 高 | **跨源转载不去重** | 一条 OpenAI 新闻在首页可能占 3-5 个坑;digest 也会被拉低质量 |
| 🔴 高 | **AI 单篇调用** | 30 篇 = 30 次 API call;批量化能砍 50-75% 成本 |
| 🔴 高 | **`/api/ask` 无任何限流** | 公开访问,有人按住 enter 就是真金白银 |
| 🟠 中 | **失效源静默死亡** | RSS 改 URL / 站点改版,日志里报错但没人看,源消失若干天 |
| 🟠 中 | **没有任何测试** | 改 scoring / dedupe / parser 都靠手感 |
| 🟠 中 | **中文媒体抓取脆弱** | 选择器写死,36kr 改版就归零 |
| 🟠 中 | **HF papers 没拿到 abstract** | 摘要为 null,AI 拿不到上下文,质量差 |
| 🟠 中 | **`aiTopics` 没建索引** | 按主题查会全表扫(主题页落地后必须建) |
| 🟡 低 | **arxiv 三个 feed 实际重叠很大** | 同一篇论文出现在 cs.AI + cs.CL + cs.LG |
| 🟡 低 | **没有 admin UI** | 启用/停用源、调权重要进 Prisma Studio |

---

# 三 · 优化方案(改现有的)

## 3.1 把 `aiImportance` 接入打分公式 ⭐⭐⭐⭐⭐

**问题:** LLM 已经给每篇文章评了 0-1 的重要度,但这个字段从来没参与排序。

**改造:** scoring.ts 加一项,系数留作可调:

```ts
const importanceBoost = (args.aiImportance ?? 0) * config.aiImportanceWeight;
//                                                 └── env: AI_IMPORTANCE_WEIGHT, 默认 2.0
return (base + signalBoost + keywordBoost + importanceBoost) * decay + base * 0.1;
```

**注意点:**
- AI enrichment 在 upsert 之后才发生,所以新文第一次入库时还没 `aiImportance`,得分按 0 算。下一轮 fetcher cycle 会重算分数 —— 但当前 `upsertArticles` 只在 article 新建/更新时算 score。需要在 `enrich.ts` 写回 AI 字段时**同时重算并写回 score**
- 权重 2.0 让重要度 0.9 的文章相当于 +1.8 base score,约等于源权重为 OpenAI 的力度,可观但不失控

**收益:** "今日最重要"真正按 LLM 判断来排,而不是只看源 + 信号

## 3.2 AI 调用批量化 ⭐⭐⭐⭐⭐

**问题:** 30 articles = 30 round-trips。每次调用 200-500 token input,有大量协议开销。

**改造:** 一次发 10 篇,prompt 改成:

```
请为下面 10 篇文章各输出一个 JSON 对象,放在一个数组里,按输入顺序:

[1] Title: ...
    Source: ...
    Snippet: ...

[2] Title: ...
...

输出: [{...}, {...}, ...]
```

**收益估算(按 720 enrich/day):**

| 方案 | 调用数/天 | 估算 token/天 | 相对成本 |
|---|---|---|---|
| 当前(单篇) | 720 | ~720 × 600 = 432k | 1.0x |
| 10 篇/批 | 72 | ~72 × 3500 = 252k | 0.6x |
| 加上 prompt cache(中转站支持的话) | 72 | ~72 × 1500 = 108k | 0.25x |

**实现要点:**
- system prompt 不变(已经写好了 schema)
- max_tokens 改成 400 × N
- 解析时严格按返回数组长度对齐;长度不对就降级到单篇
- 出错回滚整批到队列尾部

## 3.3 跨源转载去重 ⭐⭐⭐⭐⭐

**问题:** 同一新闻多源转载,首页和 digest 都被稀释。

**方案 A · 标题哈希精确去重(成本低,1 工时)**
- `titleHash` 已经在库 + 建了索引,缺的只是查询
- upsert 前 `findFirst({ titleHash, publishedAt: { gte: now-3d } })`
- 命中就不新建,把 `signals` 合并(stars/points 取 max),并把转载源记录到原文的 `crossPosts Json` 字段
- Schema 加一个 `crossPosts Json?` 字段保存 `[{ sourceSlug, url, publishedAt }]`

**方案 B · SimHash 模糊去重(半天)**
- 标题归一化后做 SimHash(64-bit)
- 新文写入前查 Hamming distance < 3 的近期 Article
- 比 LLM 便宜几个数量级
- 库:50 行自己写就够

**推荐:** A + B 串起来。A 抓"标题一模一样"的复制粘贴,B 抓"中文翻译 + 改编标题"。

## 3.4 `/api/ask` 限流 + 缓存 ⭐⭐⭐⭐⭐

**威胁:** 完全公开,无任何保护。一个恶意脚本就能让中转站账单爆炸。

**最小可行方案:**
1. **IP 级 token bucket** —— `60s / 5 次`,内存 `Map<ip, { count, resetAt }>`
2. **问题去重缓存** —— 同一问题 24h 内只算第一次,后续返回缓存。key = `sha1(question.toLowerCase().trim())`,value 落到新表 `AskCache { hash, question, answer, createdAt, hits }`
3. **总配额阀门** —— 每日总 token 上限 env 配置,超过返回"今日额度用完"

```ini
ASK_DAILY_TOKEN_LIMIT=1000000
ASK_RATE_PER_IP=5/60
```

## 3.5 失效源监控 ⭐⭐⭐⭐

**当前:** fetch 失败只 `console.error`,生产是 PM2 log 文件,基本没人看。

**方案:**
1. `Source` 加 `consecutiveFails: Int @default(0)`、`lastError: String?`、`lastErrorAt: DateTime?`
2. fetch 失败时 `consecutiveFails++`;成功置 0
3. `>= 5` 自动 `enabled = false`
4. web 加 `/admin/sources` 页面(无鉴权,通过 IP allowlist 或部署到内网)列出来手动 review
5. digest 末尾追加一行 "Today's source health" 提醒被自动停用的源

## 3.6 arXiv 多 feed 重叠 ⭐⭐⭐

**当前:** `arxiv-cs-ai` + `arxiv-cs-cl` + `arxiv-cs-lg` 三个源,论文 ID 重叠约 30%。

**改造:**
- arXiv URL 形如 `https://arxiv.org/abs/2401.12345v2` → 在 `normalizeUrl` 加规则去掉 `vN` 后缀
- 统一成 `abs/2401.12345`
- `urlHash` 去重自动生效

## 3.7 中文媒体抓取强化 ⭐⭐⭐

**当前:** 36kr / InfoQ 用启发式选择器,极易失效;抓不到摘要。

**方案:**
- 切到 `@mozilla/readability` —— Mozilla 阅读器同款,对中文 / 各种排版都鲁棒
- 流程:抓 list 页 → 拿 article URL → 二次请求 article 页 → readability 抽 title/content
- 增加并发限制(不然封 IP):`p-limit(3)`
- 加 `If-Modified-Since` / `ETag` —— 当前每次都全量重抓

## 3.8 HF papers 拿 abstract ⭐⭐⭐

**当前:** `fetchHuggingFacePapers` 只抓 list 页,摘要永远是 null,AI enrichment 拿不到上下文。

**改造:** 改用 `https://huggingface.co/api/daily_papers`,JSON 直接含 abstract,一次请求拿全。

## 3.9 评分公式调优 ⭐⭐

**当前 keyword 列表是字面匹配,容易漏:**
- "GPT" 命中但 "ChatGPT" 不会
- "o1" 命中但讨论 "o3-mini" 不会
- 中文标题完全不命中(关键词全英文)

**方案:** 改成不区分大小写 + 中文同义词字典(GPT≈生成模型, LLM≈大模型 等)。
或者:用 `aiTopics` 反过来加分,命中 hot topic 列表时 +0.5。

3.1 落地之后这一项可能就不需要了 —— `aiImportance` 本来就考虑了语义。

---

# 四 · 功能扩展(加新的)

按对"今日热门"主线的贡献度排。

## 4.1 主题页 `/topic/{slug}` ⭐⭐⭐⭐⭐

**为什么:** `aiTopics` 是核心资产但完全没暴露。"今天 agents 主题最热的 5 篇"是一个直接的内容入口。

**做什么:**
- 列出过去 14 天出现频次 top-30 的 topic
- 每个 topic 一个页面:本周时间线 + 头条文章
- 时间线柱状图(按天):看到 "agents" 在某天突然飙升 → 链接到那天的 digest
- SEO 长尾流量

**先决条件:** `Article.aiTopics` 字段加 GIN 索引。

## 4.2 文章详情页 `/a/{id}` ⭐⭐⭐⭐

**当前:** 卡片 → 直接外链跳走,我们的 AI 摘要 + 主题被埋没。

**详情页应有:**
- AI 中英双语摘要全文
- 一句话"为什么这是 hot":展开打分明细(source weight × signals × decay × importance)
- "相关文章" —— 用 `aiTopics` 取交集
- 跨源链接(3.3 之后):"另有 3 个源报道"
- 二级 AI 操作按钮:"用一句话总结"、"翻译全文"、"列要点" —— 按需调一次 LLM,**走 3.4 的缓存表**

## 4.3 RSS / Webhook 推送通道 ⭐⭐⭐⭐

**为什么这条比邮件优先:** 没有用户系统,邮件需要"订阅 → 验证 → 退订"那一整套,RSS / Webhook 是匿名 GET,零运维。

- **RSS per topic / source / category / importance:** 已经有 `/feed.xml` 框架,扩展查询参数:
  - `/feed.xml?topic=agents`
  - `/feed.xml?min_importance=0.8`
  - `/feed.xml?category=opensource`
- **Webhook(配置即用,匿名):** 不写在 web 里,而是用 fetcher 内的一个独立小模块。
  - 在 `Source` 同级加 `Webhook { url, filter Json, lastFiredAt }`
  - filter 形如 `{ minImportance: 0.9, topics: ["agents"] }`
  - 每个 fetcher cycle 末尾,把符合条件的"新增 + AI 已完成"的文章 POST 出去
  - 通过 Prisma Studio 添加 webhook(不做 UI)
  - 用户想接 Slack / Discord / 飞书 / 钉钉,自己给个对应的 incoming URL 就行

## 4.4 时间线 / 热度图 ⭐⭐⭐⭐

- 首页加一个迷你 sparkline:过去 7 天每天的"文章数 × 平均 importance"
- 进阶:topic 维度的 heatmap(7×24 格子,颜色深浅 = 当时段该 topic 文章数)
- 纯 SSR 渲染 SVG,不上任何前端图表库

## 4.5 论文专区 `/papers` ⭐⭐⭐

- 当前 research 分类里 arXiv 论文 + 博客文章混在一起
- 单独的 `/papers` 页面:只有论文,按"被讨论度"排序(HN/Reddit/Twitter 反向链接数)
- 每篇额外字段:有无开源代码(GitHub 链接探测)、有无 demo
- AI 额外做一行 "TL;DR for non-experts"

## 4.6 实验室 / 公司聚合页 `/lab/{slug}` ⭐⭐⭐

**只做聚合,不做"关注"**(没有用户系统)。
- 从 source 抽派:OpenAI / Anthropic / DeepMind / Meta / FAIR / 智源 / 旷视 各一页
- 列出过去 14 天该实验室所有动态(博客 + 论文 + GitHub trending repo)
- 顶部一条 AI 写的"近期动态摘要"(每天刷一次)

## 4.7 数据洞察页 `/insights` ⭐⭐

**周报性质,自动生成:**
- "本周最活跃的 5 个实验室"
- "出现频次飙升 top 10 topic"
- "本周开源 trending"
- 全是聚合统计,DB 一把查完,LLM 写两段评语
- 每周一刷一次,缓存到一张表里

## 4.8 PWA(只做"装到桌面",不做 push)⭐⭐

- `manifest.json`(图标在美术清单已列)
- service worker:首页 + digest 离线可看,缓存策略 NetworkFirst
- **不做** web push notification —— 那个需要用户授权 + 服务端密钥管理,跟"无用户系统"原则冲突

## 4.9 多语言路径化 ⭐⭐

- 当前 zh/en 切换是 client localStorage,SSR 拿不到中文版,SEO 损失
- 改成路径 prefix:`/zh/...` `/en/...`,Next.js i18n 路由
- 静态资源(分类标签、Hero 文案)走 i18n 字典;文章内容本身已有 `aiSummaryEn/Zh`

---

# 五 · 可靠性 / 运维

## 5.1 观测

| 维度 | 工具 | 接入成本 |
|---|---|---|
| 错误 | Sentry(免费 5k/月) | 半小时 |
| 流量 | Plausible(自托管)/ Umami | 半小时 |
| 日志 | Pino + 文件 + logrotate | 半天 |
| 指标 | 自建 `/api/metrics` 暴露关键数 → uptime kuma 抓 | 半天 |

**最小必备指标:**
- `articles_total` —— 应该在 ~2-3k 上下浮动(14d 窗口)
- `articles_24h`、`articles_unenriched`
- `sources_enabled`、`sources_failing`
- `ai_calls_today`、`ai_tokens_today`、`ai_cost_estimate_today`
- `last_successful_fetch_ago_seconds` —— 超过 2 小时就该报警

## 5.2 测试

**优先级(全部 vitest):**
1. `scoring.test.ts` —— 纯函数,黄金值 5 个 case;加上 3.1 之后必须覆盖 importance 维度
2. `dedupe.test.ts` —— URL/标题归一化的 corner case,加 arxiv 专项
3. `parseJson.test.ts` —— LLM 返回带 fence / 带 prose 都得能解
4. `purge.test.ts` —— 14d 边界、digest 不被误删

## 5.3 备份

- `pg_dump` cron 一份到对象存储,加密
- 14 天保留期意味着备份意义其实不大(丢了也就重抓一遍),但 `Digest` 是 LLM 生成的、永远没了就是真没了
- **简化方案:** 只备份 `Source` 表(权重 / 启用状态)+ `Digest` 表;`Article` 表不用备
- 保留 30 天日级 + 12 周周级

## 5.4 部署演进

| 当前 | 下一步 |
|---|---|
| PM2 单机 web + fetcher | docker-compose 容器化 |
| 直连 Postgres | PgBouncer 池化(用户量起来后) |
| 无 staging | neon 免费层做 staging DB |
| fetch 失败靠 PM2 自动重启 | 加 healthcheck script + 5.1 报警 |

---

# 六 · 推荐落地顺序(按 ROI)

| 阶段 | 任务 | 工时 | 收益 |
|---|---|---|---|
| **Sprint 1 · 救命 + 主线** | 把 `aiImportance` 接入 score(3.1) | 3h | 排序终于符合"最重要" ★★★★★ |
| | `/api/ask` 限流 + 总配额阀(3.4) | 2h | 防账单爆炸 ★★★★★ |
| | AI 调用批量化(3.2) | 4h | 砍 50%+ AI 成本 ★★★★★ |
| | 标题哈希精确去重(3.3 方案 A) | 3h | 首页质量肉眼可见提升 ★★★★ |
| | 失效源监控 + 自动停用(3.5) | 3h | 长期不掉链子 ★★★★ |
| **Sprint 2 · 信噪比** | arxiv URL 归一化(3.6) | 1h | 论文不重复 ★★★ |
| | HF papers 拿 abstract(3.8) | 2h | AI 摘要质量翻倍 ★★★★ |
| | `aiTopics` GIN 索引 + 主题页 `/topic/{slug}`(4.1) | 1d | 暴露已有 AI 资产,SEO ★★★★ |
| | 中文媒体改 readability(3.7) | 1d | 中文摘要质量翻倍 ★★★ |
| **Sprint 3 · 推送通道 + UX** | RSS 参数化 + Webhook(4.3) | 1d | 真正"推送出去" ★★★★ |
| | 文章详情页 + 相关推荐(4.2) | 1.5d | 留存提升 ★★★★ |
| | SimHash 模糊去重(3.3 方案 B) | 1d | 转载文聚合 ★★★ |
| | 首页 sparkline(4.4) | 0.5d | 视觉差异化 ★★ |
| **Sprint 4 · 运维收口** | vitest 4 个核心测试(5.2) | 0.5d | 改 scoring 不抖 ★★★ |
| | Sentry + 关键指标(5.1) | 0.5d | 出事看得见 ★★★★ |
| | `Digest` 备份脚本(5.3) | 0.5d | 防 LLM 产出丢失 ★★★ |
| **Sprint 5+ · 拓展面** | 论文专区 `/papers`(4.5) | 1.5d | 内容差异化 |
| | 实验室页 `/lab/{slug}`(4.6) | 1d | 内容差异化 |
| | 多语言路径化(4.9) | 1.5d | SEO + 国际化 |
| | PWA 离线模式(4.8) | 1d | 移动端体验 |

---

# 七 · 已被划掉的方向

下面这些在早期讨论中出现过,但因为项目宗旨(无用户、无归档、无个性化)已经被排除。新人来贡献前请先读这一节,免得做重复设计。

| 方向 | 为什么不做 |
|---|---|
| 用户账号 / magic link 登录 | 项目宗旨明确不做用户系统 |
| 收藏 / 阅读历史 / 个人首页 | 需要用户态,违反宗旨 |
| 基于用户行为的个性化推荐 | 所有人看到同一份"今日热门",这就是产品定义 |
| Web Push 通知 | 需要用户授权 + 后端密钥管理 + 退订流程,运维负担大;RSS / Webhook 已经覆盖"被动接收"场景 |
| 邮件订阅 + 退订 | 同上,运维成本不匹配"无用户"原则;有需要的人用 RSS 即可 |
| Embedding 向量库 / pgvector 语义搜索 | 14 天保留 + 主题页 + 标题哈希去重的组合已经覆盖 80% 的搜索/聚类需求,引入 pgvector 是 over-engineering |
| 文章长期归档 / 冷存储 | 项目是"今日热点",非历史档案;`Article` 表永远 ≤14d |
| API 开放 / 鉴权层 | 没有用户就没有 API key 的概念;有读需求的人用 RSS / `/api/digest` 即可 |
| Agentic 编辑部(每日深度评论) | 有意思但跑题,会让站点从"聚合"变成"自媒体",先稳定主线 |

---

> 文档维护约定:每完成一个 Sprint 任务,在对应行打 `~~删除线~~` 并在文末追加一段"更新日志"。修改项目宗旨(本文档最上面那张表)是重大决策,需在 commit message 里单独说明。

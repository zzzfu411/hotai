# Hot AI 安全审计架构基线

审计日期：2026-08-30

目标仓库：`D:\\Develop\\claude\\hotai`

审计提交：`b631bb4608790413b1366dce7412d9cd4ca66ad4`

## 1. 应用类型与可比基线

Hot AI 是匿名公开访问的新闻/RSS 聚合与阅读站，包含一个 Next.js Web 进程、一个定时抓取进程、PostgreSQL，以及可选的 Anthropic-compatible LLM 服务。合理的可比对象是小型自托管 RSS 阅读器、新闻聚合站和带匿名 LLM 问答的内容站，而不是有账号/RBAC 的企业 CMS。

与同类应用相比，本仓库已实现较好的 URL 抓取边界：公共 URL 语法检查、DNS 解析检查、逐跳重定向复核、DNS pin、总读取上限、缓存容量和并发上限均有源码实现。主要风险集中在匿名成本控制、外部内容进入 UI 的协议/CSS边界、默认第三方 AI 配置，以及进程内状态在代理链和并发下失效。

仓库内已有一份一般性审计 `docs/AUDIT_2026-08-30.md`，但此前没有符合 security-audit schema 的独立安全运行目录或 `findings.json`。本轮把旧报告当作待反证候选，不继承其定性。

## 2. 进程与数据拓扑

```text
Anonymous browser
  |-- GET pages / RSS / JSON Feed / OPML
  |-- POST /api/catalog/pull          -- allowlisted live feeds
  |-- GET  /api/proxy/feed?url=       -- arbitrary public feed URL
  |-- POST /api/readability {url}     -- arbitrary public article URL
  |-- POST /api/ask {question}        -- public token-spending LLM stream
  |-- POST /api/revalidate            -- shared-secret protected
  v
Next.js 14 web process (single PM2 fork)
  |-- reads Article / Source / CuratedBlog / Digest
  |-- writes Digest fallback and AskCache
  |-- fetches remote feeds/pages through SSRF guard
  |-- calls LLM for Ask and on-demand Digest
  v
PostgreSQL
  ^
  |-- Source, Article, Digest writes
Fetcher process (single PM2 fork, startup + cron)
  |-- remote RSS/API/scrape fetches
  |-- normalize, dedupe, score, persist, purge, rescore
  |-- LLM enrichment and Digest generation
  `-- shared-secret ISR revalidation call to Web

External trust domains:
  RSS/API/scrape origins; daily.juya.uk; arbitrary visitor-supplied public URLs;
  Anthropic or configured compatible relay; DNS resolver; reverse proxy.
```

## 3. 两条内容链路

### 3.1 速闻链路

`NookFeed` 请求 `/api/catalog/pull`，服务端只解析仓库内置 catalog ID，实时抓取并缓存 RSS/Atom/JSON Feed，返回到浏览器排序展示。自定义订阅经 `/api/proxy/feed` 抓取，配置仅存在浏览器 localStorage。该链路不写 Article 表，也不做 LLM enrichment。

### 3.2 Hot AI 链路

Fetcher 从 Source 表读取 enabled 来源，并行抓取后顺序持久化：URL/title hash 去重、信号合并、分数计算、全表重算、AI enrichment、Digest、ISR revalidate。Web 的 `/hot`、`/digest`、`/a/[id]`、分类/来源/搜索/Feed 出口读取这条链路的数据。

“Fetcher 是唯一写库者”不是实际边界：Web 会 upsert Digest，并写 AskCache。

## 4. 资产与安全目标

- `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`：供应商凭据，不能被错误路由到未授权 relay。
- LLM 预算：匿名 Ask、Digest、enrichment 均可能产生直接费用。
- PostgreSQL 内容完整性：Article、Digest、Source 健康与权重决定公开内容。
- Web 进程可用性：公开抓取接口、DNS/cache/rate-limit Map 和外部慢响应均消耗内存、连接和 worker 时间。
- 站点 UI 完整性：外部 HTML、URL、图片和 LLM 输出不能在 Hot AI 页面上形成脚本执行或可信界面覆盖。
- 内网/云元数据不可达：访客提供的 URL 必须始终限制为公网 HTTP/HTTPS。
- ISR shared secret：只允许 Fetcher 触发缓存刷新。

## 5. 信任边界

1. 浏览器到 Nginx/Web：所有请求匿名；`X-Forwarded-For` 只有在代理覆盖而非追加用户值时才可信。
2. Web 到外部 URL：`/api/proxy/feed` 和 `/api/readability` 接受访客 URL，依赖 `ssrf.ts`。
3. Catalog 到固定上游：ID allowlist 限制目标，但返回内容仍不可信。
4. Fetcher 到 Source：Source URL/类型来自数据库 seed 或管理员修改；响应内容不可信。
5. 外部内容到 React/DOM：文本默认转义；Reader/Juya 通过 DOMPurify 后使用 `dangerouslySetInnerHTML`；多个 URL 直接进入 `href`/`src`。
6. 站点到 LLM：文章标题、Feed snippet、URL、Ask 问题与 corpus 离开站点；base URL 和鉴权方式完全由环境变量决定。
7. LLM 输出到数据库/UI：enrichment 和 Digest 只做宽松手写归一化，没有完整运行时 schema 或输入 URL membership 校验。
8. Fetcher 到 Web revalidate：共享 header secret；路径数组来自已认证请求体。

## 6. 身份、权限与状态

- 无用户、session、角色或所有权模型。
- `/api/revalidate` 是唯一显式鉴权接口。
- 其他 API 均公开，依赖请求大小、URL allow/deny、IP rate limit、缓存和 LLM daily quota 控制成本。
- Rate limit、Ask quota、DNS memo、Feed/Readability cache 都是单进程内存状态；重启和多实例不共享。
- PM2 配置当前均为一个 fork，因此“跨实例不一致”是扩容风险；“重启清零”在当前部署也真实存在。

## 7. 完整输入面

### HTTP 输入

- `/api/ask`: JSON `question`、全部 headers，尤其 XFF/X-Real-IP。
- `/api/readability`: JSON `url`、headers。
- `/api/proxy/feed`: query `url`、headers。
- `/api/catalog/pull`: JSON `ids`、headers。
- `/api/revalidate`: header secret、JSON `paths`。
- `/feed.xml`, `/feed.json`: category、min_importance、lang query。
- `/r`: url、title、src query。
- `/search`: q、sort query。
- `/juya`: date query。
- 动态路径：Article id、category slug、source slug。

### 浏览器本地输入

- localStorage 自定义源 JSON、enabled catalog IDs、稍后读/已读 IDs、主题和语言。
- OPML 文件文本和自定义源名称/URL。

### 外部/数据库输入

- RSS/Atom/JSON Feed 字段、HTML scrape、HF/GitHub API/HTML。
- Article.url、crossPosts JSON、Digest bullets JSON、CuratedBlog guide JSON。
- Juya `content:encoded` HTML。
- LLM JSON/text/stream events。
- 环境变量中的 URL、secret、模型、限额、并发和保留期。

## 8. 高风险 sink

- `href={...}` / `<img src={...}>`：Article、crossPosts、Digest URL、remote feed URL/image、blog URL。
- `dangerouslySetInnerHTML`：Reader 正文、Juya HTML、主题初始化脚本。
- `undiciFetch` / `request` / global fetch：访客 URL、Source URL、revalidate URL、LLM base URL。
- Prisma create/update/upsert/delete：Article、Source health、Digest、AskCache、seed。
- Anthropic messages/stream：文章和匿名问题出站、供应商凭据 header。
- 内存 Map：Ask/IP buckets、DNS memo、Feed/Readability caches/inflight。

## 9. 已确认的正面控制

- Prisma 查询未发现 raw SQL 或字符串拼接 SQL。
- React 文本节点默认转义；Reader/Juya HTML 经过 DOMPurify。
- SSRF 实现拒绝非 HTTP(S)、credentials、常见私网/metadata host，并逐跳检查重定向、固定 DNS 地址、限制总时间和响应体。
- Catalog 只接受固定 ID，并限制源数、并发和每源条目数。
- Feed/Readability cache 有容量上限和 in-flight 合并。
- crossPosts 和 signals JSON 在消费前有形状过滤。
- revalidate 在 secret 未配置或不匹配时拒绝请求。
- LLM 批量 enrichment 检查输出数组长度。

## 10. Phase 2 优先假设

1. `.env.example` 的非空 placeholder token 与固定第三方 base URL 是否造成内容/真实 key 错误出站。
2. Nginx 追加 XFF、应用取首项是否允许绕过所有匿名成本阀。
3. 额度 check-after-use、断开不取消、内存计数是否可造成超预算。
4. 外部 URL scheme 是否在真实浏览器产生脚本执行，或仅为空白/被拦截导航。
5. DOMPurify 是否保留可覆盖视口的 inline style；Readability 是否在其前移除该属性。
6. SSRF NAT64/fake-IP 兼容逻辑是否存在可在当前部署证明的内网到达路径。
7. LLM 输出 URL/schema 是否可形成 UI 或内容完整性问题。
8. 公开抓取接口的 Map/inflight/cache 是否有可由单一客户端放大的无界资源路径。


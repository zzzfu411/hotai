# Hot AI 当前架构与安全边界

审计日期：2026-08-31  
目标仓库：`D:\Develop\claude\hotai`  
审计基线：`b631bb4608790413b1366dce7412d9cd4ca66ad4`  
当前对象：基线之上的未提交修整工作树

## 1. 应用类型与可比基线

Hot AI 是匿名公开访问的新闻/RSS 聚合与阅读站，由 Next.js Web、定时 Fetcher、
PostgreSQL 和可选 Anthropic-compatible LLM 组成。合理可比对象是小型自托管新闻聚合站、
RSS 阅读器和带匿名 LLM 问答的内容站，而不是带账号/RBAC 的企业 CMS。

与同类应用相比，当前工作树已具备较完整的远程抓取安全边界：URL 语法与协议检查、DNS
解析检查、逐跳重定向复核、DNS pin、响应大小/时间限制、缓存容量、请求体上限，以及远程
HTML 的脚本、样式和 URL sink 二次净化。浏览器 URL 策略阻止显式私网/loopback/内部
主机和嵌入私网 IPv4 的 mapped/NAT64 literal；匿名 LLM 成本由 PostgreSQL 预约而非单进程内存
计数控制。仍需依赖部署方正确维护反向代理、数据库可用性、备份与监控。

## 2. 技术栈与进程拓扑

- Node.js 生产基线：22.22.2；pnpm 9.12.0。
- Web：Next.js 16.3.3、React 18.3.1、App Router、ESLint 9 flat config。
- Fetcher：TypeScript 编译产物、node-cron 4.6.0、undici 6.28.0。
- 数据库：PostgreSQL 15、Prisma 5.19.1。
- AI：`@anthropic-ai/sdk` 0.122.0；默认官方端点，第三方端点必须显式 opt-in。

```text
Anonymous browser
  |-- pages / RSS / JSON Feed / OPML
  |-- POST /api/catalog/pull
  |-- GET  /api/proxy/feed?url=
  |-- POST /api/readability {url}
  |-- POST /api/ask {question}
  |-- POST /api/revalidate (shared secret)
  v
Nginx
  |-- overwrites client IP headers
  |-- cross-process /api/ask rate limit
  v
Next.js 16 web
  |-- reads Article / Source / CuratedBlog / Digest
  |-- writes Digest / AskCache / AskDailyUsage / AskReservation
  |-- public-URL fetch through SSRF guard
  |-- optional LLM calls
  v
PostgreSQL
  ^
  |-- Source / Article / Digest / AI state writes
Fetcher (startup + cron)
  |-- fetch -> normalize -> retention gate -> dedupe -> persist -> rescore
  |-- lease/CAS AI enrichment -> digest -> ISR revalidate
  `-- purges stale Article / AskCache / Ask quota history
```

## 3. 两条内容链路

### 3.1 速闻链路

`NookFeed` 通过 `/api/catalog/pull` 拉取仓库内置 catalog；自定义订阅通过
`/api/proxy/feed` 拉取，配置只在浏览器 localStorage。服务端限定请求体、ID 数量、抓取
并发、响应大小和目标公网属性；Feed 条目 URL 再经统一浏览器 URL 策略后进入 React sink。
该链路不写 `Article` 表，也不进入 LLM enrichment。

### 3.2 Hot AI 链路

Fetcher 从 `Source` 读取 enabled 来源，并行抓取、顺序持久化。持久化前拒绝超出保留窗或
未来偏移过大的时间，随后完成 URL/title hash 去重、信号合并和评分。AI enrichment 使用
`aiStatus`、`aiAttempts`、`aiNextAttemptAt` 和 `aiLeaseUntil` 构成可恢复状态机；成功后
写 AI 字段并重算分数。Web 的 `/hot`、`/digest`、`/a/[id]`、分类、来源、搜索和 Feed
出口统一限制在保留时间窗内。

## 4. 数据资产与安全目标

- AI 凭据：不得因模板或 base URL 误配发送到未批准的第三方。
- LLM 预算：匿名 Ask 必须在调用前预约日预算和并发槽；数据库故障时 fail-closed。
- 内容完整性：外部 Feed、HTML、LLM JSON 和数据库历史值都视为不可信。
- UI 完整性：远程内容不能执行脚本、覆盖整页可信界面，且显式私网/loopback URL 不进入 sink。
- 内网隔离：访客 URL 必须保持在公网 HTTP/HTTPS，且每次重定向都复核和 DNS pin。
- 数据可靠性：AI 失败可重试、多 worker 不重复消费、旧 Feed 不得重新插入过期文章。
- 发布完整性：migration、类型检查、Lint、测试、生产 build、dist smoke 和 SCA 都是门禁。

## 5. 身份、权限与状态

- 无用户、session、角色或所有权模型；大多数路由匿名公开。
- `/api/revalidate` 是唯一 shared-secret 路由，并限制请求体和可刷新的路径集合。
- 单 IP 速率桶仍是进程内 fallback；仓库 Nginx 对 `/api/ask` 另做跨进程限流。
- Ask 日预算和并发为 PostgreSQL 持久状态；过期预约按完整预算计费后释放槽位。
- AI enrichment 为数据库 lease/CAS 状态；过期 worker 可恢复，六次失败后终止。

## 6. 主要信任边界

1. 浏览器到 Nginx：公网匿名输入；只有仓库代理覆盖后的 IP header 可作为身份提示。
2. Nginx 到 Web：如果改为多层 CDN/代理，必须重新设计 trusted-hop 解析，不能照搬单层假设。
3. Web 到公网 URL：依赖 SSRF guard、逐跳校验、DNS pin、超时与大小上限。
4. 外部内容到 DOM：文本由 React 转义；HTML 经 DOMPurify 和 URL 属性二次遍历。
5. Web/Fetcher 到 LLM：只有合法且非占位凭据启用；非官方 host 需要显式批准。
6. 多 worker 到数据库：Ask quota 用 advisory lock；AI enrichment 用条件更新和 lease。
7. Fetcher 到 Web revalidate：secret 只能发往 HTTPS 或 loopback HTTP，且服务端只接受固定路径。

## 7. 高风险输入与 sink

- HTTP：Ask question、远程 URL、catalog IDs、revalidate paths、查询参数和动态路由。
- 浏览器本地：自定义源、OPML、主题、语言、稍后读/已读状态。
- 外部：RSS/Atom/JSON Feed、抓取 HTML、第三方 API、Juya HTML、LLM JSON/stream。
- sink：浏览器 `href/src`、`dangerouslySetInnerHTML`、undici/fetch、Prisma 写入、LLM 请求、
  in-memory Map、PostgreSQL advisory lock/预约表。

## 8. 已确认的正面控制

- 未发现字符串拼接 raw SQL；唯一 raw query 是固定 advisory-lock 语句，参数不是用户输入。
- 请求体采用流式限长读取，避免 chunked body 在检查前无限缓冲。
- SSRF 防护包含特殊 IPv4、IPv4-mapped IPv6、常见私网/metadata、DNS 与重定向复核。
- 远程 HTML禁止 `style`、脚本、iframe、form 等，并移除 `srcset`、显式私网 URL 与危险属性。
- Nginx 覆盖 XFF/X-Real-IP；应用不再读取客户端可控的左侧 XFF。
- AI 配置默认关闭、冲突凭据拒绝、非官方/不安全端点显式 opt-in。
- Ask 预算在调用前预约；异常和断开都会结算，数据库不可用不会继续消费模型。
- AI enrichment 有可重试状态、CAS 认领、lease 恢复和最终失败状态。
- CI 覆盖 migration、测试、全 workspace typecheck、Lint、build、dist smoke 与生产依赖审计。

## 9. 当前部署假设

- 生产使用仓库 Nginx 单层反代；若接入 CDN，应以 CDN 官方真实 IP 机制重做 trusted proxies。
- PostgreSQL 是 Ask 成本阀的依赖；数据库不可用时 Ask 返回 503 是预期的安全降级。
- 生产必须先应用 `20260831000000_ai_retry_state` 和 `20260831010000_ask_quota` migration。
- 代码审计没有生产环境变量、日志、真实数据库和真实网络流量，因此不能替代上线验证、
  凭据轮换、备份恢复演练和持续监控。

# Hot AI 安全审计报告（Run 3）

审计日期：2026-09-01  
审计基线：`b631bb4608790413b1366dce7412d9cd4ca66ad4`  
审计对象：基线之上的当前工作树（包含未提交的安全/可靠性修复批次）  
方法：源码追踪、边界测试、独立猎寻、Phase 3 反证验证、结构化输出校验。

## 执行摘要

在本次审计覆盖的公开 Web 路由、远程 feed/HTML 解析、匿名 Ask 成本状态机、AI 配置、Fetcher、部署配置和浏览器 sink 中，**没有发现当前工作树可被独立确认、且能造成有意义影响的 exploitable vulnerability**。这不是“生产环境已证明安全”：本机没有 PostgreSQL、Docker daemon 或真实 provider/代理链，因此数据库并发、真实 SSE 断连、生产 TLS/CDN header 和账单行为仍需 staging 验证。

Run 1/2 的三个 confirmed finding（AI relay/credential 错误路由、伪造 XFF 限流绕过、Juya inline CSS 视口覆盖）在当前代码中都有对应修复和回归测试。本轮验证的 Ask 欠记账候选属于修复前行为：旧代码在客户端断开、SSE 写入失败或 provider 异常时只结算输入估算；当前代码已传递 `req.signal`，所有异常路径都按完整 reservation 结算，并把估算改为 UTF-8 bytes/2，因此不作为当前 finding。

## 范围、基线与限制

- 应用由 Next.js 16 Web、Node Fetcher、Prisma/PostgreSQL 和 Anthropic-compatible AI 组成；默认 `/` 是实时 RSS catalog，`/hot` 是数据库热榜。
- 公开入口包括 `/api/catalog/pull`、`/api/proxy/feed`、`/api/readability`、`/api/ask`、`/api/digest`、`/api/revalidate`、健康/指标端点，以及 Feed、OPML、Juya、Reader 页面。
- 当前工作树故意有大量未提交改动；本审计不把未提交状态误判成已发布，也没有撤销用户改动。
- Node `v24.11.1`（目标/CI 为 `22.22.2`），pnpm `9.12.0`。`.env` 仅做敏感键存在性检查，值未进入任何审计产物。
- 本地无 `localhost:5432` PostgreSQL，Docker daemon 不可用；因此 integration suites 和依赖数据库的 Next 静态数据生成无法完成。

## 发现状态

| ID | 状态 | 结论 |
|---|---|---|
| 当前 confirmed findings | 0 | 未保留可复现且有实际影响的当前漏洞 |
| SEC-01（历史） | remediated | 示例 AI 配置为空、placeholder/双凭据拒绝；非本地 HTTP/第三方 relay 必须显式 opt-in（本地回环 HTTP 为开发例外） |
| SEC-02（历史） | remediated | Nginx 覆盖 XFF，应用使用受信地址，公共 limiter 有容量上限 |
| SEC-03（历史） | remediated | 远程 HTML 禁止 `style`，DOMPurify 后二次过滤 URL/sink |
| CAND-ASK（修复前候选） | rejected/currently fixed | 旧 Ask 可能欠记账；当前 abort、enqueue、provider catch 均全额 settle |
| CAND-URL（本轮候选） | rejected | Feed image、`javascript:`、凭据和明显 literal/private URL 在当前解析/渲染路径被过滤；DNS alias 属于部署 hardening |

## 已验证的防护

### 公共 URL、SSRF 和远程 HTML

`safe-url.ts`、`ssrf.ts`、`parse-remote-feed.ts`、`sanitize-remote-html.ts` 和 Reader/Juya 组件共同覆盖 scheme、凭据、literal/private/metadata 地址、DNS answer、重定向、响应大小和 HTML URL 属性。对服务端主动抓取的 URL，DNS 会逐跳校验并 pin；DNS memo 也有 512 项硬上限和过期/最旧项驱逐，避免由大量不同主机名造成进程内缓存无界增长。Feed/OPML/JSON/XML 输出还会再次调用 `safeShareableHttpUrl`，因此明显的坏 URL 不会直接成为外链 sink。持久化 Article/crossPost 链接在输出侧主要依赖语法和明显私网过滤，像 `127.0.0.1.nip.io` 这类 DNS alias 仍需按部署网络策略在 staging 评估。测试覆盖相对 URL、私网 enclosure/media/thumbnail、secret query key、`srcset` 和 inline style。

### 匿名成本与状态机

`/api/ask` 先做 IP rate limit 和 `AskCache`，再在 `AskDailyUsage`/`AskReservation` 上使用 PostgreSQL transaction advisory lock。预约过期按保守预算结算；settlement 与 expiry sweep 使用同一锁；配额或语料数据库不可用时现在都返回可重试的 503，且不会调用 provider。Fetcher AI enrichment 使用 `aiAttempts` CAS、lease、指数退避和最终失败状态；周期和 digest 也有 durable coordination lease。

### 配置、身份和输入边界

AI 客户端拒绝 placeholder、双凭据、带凭据 URL 和未显式批准的第三方 host；非本地 HTTP relay 还需要显式不安全传输 opt-in（本地回环 HTTP 供开发使用）；公共 JSON body 使用增量字节上限；`/api/revalidate` 仅接受固定路径；Nginx 配置覆盖客户端伪造的代理身份头。Prisma 查询未发现用户输入进入未参数化 raw SQL 的路径。

## 历史候选：Ask 欠记账（已修复，不是当前漏洞）

修复前 `/api/ask` 在调用前预约 `estimateTokens(corpus + question) + 800`，但请求 abort、SSE `enqueue` 抛错和 provider stream 异常只结算输入估算，可能释放输出预算；旧 estimator 以 UTF-16 字符近似 token，也会低估 CJK/emoji。该机制在有真实 provider 计费时会造成日额度欠记账。

当前代码的关键闭合点：

- `apps/web/app/api/ask/route.ts` 将 `req.signal` 传给 SDK，并在 request abort、send failure 和 catch 分支调用 `settleAskQuota` 的完整 reservation。
- `apps/web/lib/ask-guard.ts` 以 UTF-8 byte length/2 估算，并有多语言测试。
- `apps/web/lib/ask-quota.ts` 对迟到 settlement、过期 sweep 和数据库故障做了幂等/保守处理。

由于本机没有 DB/provider，本轮没有声称真实账单或网络断连 E2E 已通过；调用链和单测足以把它从“当前 confirmed finding”降为已修复候选。

## Hardening notes（不是漏洞发现）

1. 当前响应头已加入 `nosniff`、严格 Referrer Policy、`X-Frame-Options` 和 Permissions Policy；CSP nonce 尚未加入，因为主题启动脚本和现有资源仍需迁移。
2. Fetcher Source URL 是运维信任输入。若未来增加匿名/半公开源管理入口，必须复用 Web SSRF policy，并对 DNS rebinding 做逐跳验证。
3. 多层 CDN/Cloudflare 部署需要按官方出口 CIDR 重做真实 IP 解析，不能把任意 header 继续当作可信身份。
4. 持久化链接的 DNS alias、`feed-cache`、中文媒体正文抽取、HN/GitHub 主题精度、SimHash、topic/admin 页面和无 JS 首页属于部署/产品/可靠性 hardening backlog，不应冒充安全 finding。
5. 依赖数据库的迁移、备份恢复、监控告警、原子发布和回滚必须在 staging/生产实际演练。

## 正面模式

- URL 到浏览器 sink 经过“解析/SSRF + HTML 净化 + sink 二次过滤”多层控制。
- Ask 成本控制在 provider 调用前预约，数据库故障 fail-closed，不回退到无限制模型调用。
- AI enrichment 明确记录 retry、lease、attempt 和 failed，而不是把失败永久伪装成成功。
- retention 同时约束写入和 Web 查询，避免 purge 后旧文重插或旧文重新暴露。
- CI workflow 已包含 Node 22.22.2、Postgres service、migration/seed、测试、typecheck、lint、build、dist smoke 和 production dependency audit。

## 当前验证证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | 27 files passed；134 passed、13 skipped、147 total |
| `pnpm typecheck` | db/ai/fetcher/web 全通过 |
| `pnpm lint` | ESLint 9 flat config，0 warning/error |
| Prisma schema validate | 通过（dummy `DATABASE_URL`，不连接 DB） |
| runtime build + compiled Fetcher smoke | 通过 |
| production dependency audit | 198 dependencies，所有 severity 0 |
| `pnpm build` | 编译/TS 通过；`/blogs` 静态生成因 `localhost:5432` 不可达退出 1 |
| DB integration / production black-box | 未执行，环境/权限不足 |

## 结论

`findings.json` 仅保留本轮被明确拒绝的历史候选；它不代表对未来配置、生产数据或第三方 provider 的保证。当前代码可进入 staging，完成数据库 migration、凭据轮换、真实代理/TLS、备份恢复和回滚演练后再决定公开放量。

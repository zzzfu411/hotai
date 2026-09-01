# Hot AI 安全与生产性修整审计报告（Run 2）

审计日期：2026-08-31  
审计基线：`b631bb4608790413b1366dce7412d9cd4ca66ad4`  
审计范围：整个 monorepo（Web、Fetcher、AI、数据库、测试、构建、依赖、部署）  
修整对象：基线之上的当前工作树

## 1. 执行摘要

基线安全审计确认 3 个真实问题：一个 **HIGH** 的 AI 凭据/内容错误路由路径、一个
**MEDIUM** 的代理身份伪造与公开成本阀绕过、一个 **LOW** 的第三方 HTML 全视口 CSS
覆盖；另外两个高风险候选在 Chromium/网络条件复核后被否决。当前工作树已修复全部 3
个确认问题，并进一步关闭 Ask 单进程额度、AI enrichment 永久跳过/重复消费、旧 Feed
重插保留期外文章、危险浏览器 URL、远程 HTML 二次 URL sink、无界请求体、任意 ISR
路径、依赖漏洞、构建产物和首次部署等问题。

最终门禁先后在临时 PostgreSQL 15.18 与 18.4 上完成：5 个 migration 和 seed 成功，
26 个测试文件共 126 个测试通过，全 workspace typecheck、ESLint、Fetcher compiled-dist smoke、生产
依赖审计和完整 Next.js 16.3.3 production build 均通过。生产依赖审计为 Critical/High/
Moderate/Low 全 0。

当前代码安全姿态由“有限流量 Beta、存在可利用配置/代理缺陷”提升为“可进入受控上线验证”。
这不等于生产环境已闭环：凭据轮换、migration 发布、真实代理链核验、备份恢复、监控告警
和原子发布仍需由部署方完成。

## 2. 风险与质量对比

| 维度 | 基线 | 当前工作树 | 结论 |
|---|---:|---:|---|
| 已确认安全漏洞 | 1 High / 1 Medium / 1 Low | 0 个未修复 | 基线确认项全部关闭 |
| 匿名 LLM 成本控制 | 单进程、可重启/并发绕过 | PostgreSQL 预约 + advisory lock + Nginx | 跨进程、fail-closed |
| 外部内容到浏览器 | 协议/CSS/资源边界不一致 | 统一 HTTP(S)/私网过滤 + HTML 二次净化 | 明显收敛 |
| AI enrichment | 失败永久 skipped、无 lease | retry/backoff/CAS/lease/final failure | 可恢复且防重复消费 |
| 数据保留 | purge 后可重插旧文章 | 写入前 retention guard + Web cutoff | 保留契约闭合 |
| 生产依赖 | 存在多项已知漏洞 | 0 Critical/High/Moderate/Low | SCA 门禁阻塞 CI |
| 工程门禁 | 漏 db typecheck、dist 不可验证 | 126 tests + 全 typecheck + lint/build/smoke | 当前通过 |
| 部署 | TLS 首装、弱口令、migration 文档错误 | HTTP bootstrap、随机 DB 密码、migrate deploy | 关键阻断已修 |

## 3. 安全发现与状态

| ID | 严重度 | 基线发现 | 当前状态 |
|---|---:|---|---|
| SEC-01 | HIGH | 示例配置把内容及特定误配下的真实 API key 路由到预填第三方 relay | **已修复** |
| SEC-02 | MEDIUM | 客户端伪造左侧 XFF 绕过 Ask/抓取接口单 IP 限流并扩张 Map | **已修复** |
| SEC-03 | LOW | Juya 上游 HTML 保留 inline style，可覆盖整页形成钓鱼 UI | **已修复** |
| CAND-01 | rejected | `javascript:` / `data:` 链接构成已确认点击 XSS | Chromium 证明原结论不成立；仍按硬化处理 |
| CAND-02 | rejected | NAT64/198.18 必然构成可利用 SSRF | 缺少可路由生产条件；保留部署专项测试 |

`findings.json` 保留基线的 3 个 confirmed 与 2 个 rejected 结论。该 schema 没有 remediation
status 字段，因此当前修复状态以本报告和下方代码证据为准。

### SEC-01：AI 配置错误路由 — 已修复

**基线攻击场景。** 部署者按文档复制 `.env.example`；非空 placeholder token 会启用 AI，
预填 base URL 会把文章和匿名问题发给第三方。若部署者清空 token、填写真实 API key 但
漏清 base URL，真实 key 也会随内容发给该第三方。

**影响。** 匿名问题、文章元数据和供应商凭据可被未批准的数据处理方接收，凭据还可能被
滥用产生费用。

**修复。** `.env.example:56` 起所有凭据/base URL 默认留空；
`packages/ai/src/client.ts:36` 的 `readAIConfig` 清理 placeholder、拒绝双凭据、校验 URL，
非官方 host 要求 `ALLOW_THIRD_PARTY_AI=true`，非安全 HTTP 另需显式批准。配置错误时 AI
保持关闭并在实际取 client 时给出明确错误。

**验证。** `packages/ai/src/client.test.ts` 覆盖默认关闭、placeholder、双凭据、官方端点、
第三方 opt-in 和 HTTP 约束；全量测试通过。

### SEC-02：伪造代理身份绕过成本阀 — 已修复

**基线攻击场景。** 客户端每次改变 `X-Forwarded-For` 左侧值；旧 Nginx 追加真实地址，旧
应用读取左侧值，于是同一客户端不断获得新 bucket，并可让 limiter Map 超出名义容量。

**影响。** 可绕过 Ask、Feed proxy、Readability 和 catalog pull 的单 IP限制，快速耗尽共享
预算并放大 CPU/内存/上游请求。

**修复。** `deploy/nginx.conf:25` 与 `deploy/nginx-https.conf:37` 直接覆盖 XFF；
`apps/web/lib/ask-guard.ts:43` 优先使用规范化 `X-Real-IP`，fallback 只取最右侧地址；Ask
与通用 limiter 在插入新 key 前实行硬容量拒绝。`/api/ask` 还由 Nginx 按真实连接地址跨进程
限流，模型成本则由 PostgreSQL 全局预约控制。

**验证。** `ask-guard.test.ts`、`ip-rate-limit.test.ts` 和 `request.test.ts` 覆盖伪造左侧 XFF、
硬容量和请求体边界；全量测试通过。

### SEC-03：第三方 HTML 全视口 CSS 覆盖 — 已修复

**基线攻击场景。** 控制或攻陷 `daily.juya.uk` 发布链路后，在 `content:encoded` 中放入
`position:fixed; inset:0; z-index:2147483647` 的链接。旧 sanitizer 删除 script/style 标签，
但保留 `style` 属性，真实 Chromium 中链接覆盖整个视口。

**影响。** `/juya` 访问者会在可信 Hot AI origin 内看到攻击者控制的整页 UI，可用于钓鱼
或诱导跳转；未证明 JavaScript 执行。

**修复。** `apps/web/lib/sanitize-remote-html.ts:12` 统一净化 Reader/Juya HTML，明确
`FORBID_ATTR: ["style"]`，删除高风险标签与 `srcset`，再遍历所有 URL 属性，移除非 HTTP(S)、
私网/loopback/内部目标并补全 `_blank` 的 `noopener noreferrer`。

**验证。** `sanitize-remote-html.test.ts`、`juya.test.ts` 和 `extract-article.test.ts` 覆盖 style、
私网资源、相对 URL、`srcset` 与 rel；全量测试通过。

## 4. 本轮额外修整

### 4.1 Ask 成本与并发闭环

- 新增 `AskDailyUsage`、`AskReservation` 及 migration `20260831010000_ask_quota`。
- `apps/web/lib/ask-quota.ts:44` 在固定 PostgreSQL transaction advisory lock 下清理过期预约、
  统计 settled + in-flight token、检查全局并发，并在模型调用前创建预约。
- 预约过期按完整预算计费后释放，避免 crash 成为绕过日额度的方法。
- 过期预约跨 UTC 日期统一清算；全局并发统计不按日期分区，避免午夜前后并发翻倍或前一日
  crash 预约永不计费。
- settlement 与 expiry sweep 使用同一锁，避免同一预约被实际用量与完整预算重复计算。
- `/api/ask` 把 `req.signal` 传给 SDK，浏览器断开时中止上游并结算已估算成本。
- Provider/network 异常只在服务端记录截断信息，匿名 SSE 客户端收到通用错误，不反射端点或
  账户元数据。
- PostgreSQL 不可用时返回 503，不回退到无限制模型调用。

### 4.2 AI enrichment 可靠性

- 新增 `aiStatus/aiAttempts/aiNextAttemptAt/aiLastError/aiLeaseUntil/aiPromptVersion`。
- 批次只在即将调用模型时认领，使用 `aiAttempts` CAS；不同 worker 不能重复拿同一行。
- transport/shape 失败转单条 fallback 前续租；失败指数退避，六次后进入 `failed`。
- worker 在最后一次尝试中崩溃时，过期 lease 会转为终止态，不会永久卡在 `processing`。
- 数据库持久化失败进入 retry/failed，而不是已经消费模型后永久悬挂。

### 4.3 URL、HTML、请求与 ISR 边界

- Browser/Feed/OPML/Article/crossPost/Digest URL 统一限制为无凭据 HTTP(S)，并阻止显式
  私网/loopback/内部主机及 mapped/NAT64 literal 中嵌入的私网 IPv4。
- OPML 不再输出 scrape/API 伪 Feed，也不发布包含 token/secret/signature 查询键的 URL。
- Readability/Juya HTML DOMPurify 后二次遍历 URL sink；移除私网资源和 `srcset`。
- SSRF DNS answer 检查补齐标准 `64:ff9b::/96` NAT64 last-32 解码，嵌入私网 IPv4 时拒绝。
- 所有公开 JSON 入口流式限长，避免 chunked body 先无限缓冲。
- `/api/revalidate` 只接受固定路径、去重并限制数量；Fetcher 的 secret 只发往 HTTPS 或
  loopback HTTP。

### 4.4 数据、构建、依赖与部署

- 写入前拒绝超过 retention window 或未来超过 24h 的文章；Web 所有文章查询使用相同 cutoff。
- Fetcher 在 cron 启动前校验表达式，持久化部分失败不再把 Source 标记为完全健康。
- workspace 包产出真实 `dist` 入口；Fetcher compiled-dist smoke 已纳入脚本和 CI。
- 根 typecheck 覆盖 db/ai/fetcher/web；Next 16 使用 webpack 保留 workspace `.js -> .ts` alias。
- 新增 CI：PostgreSQL migration/seed、测试、类型、Lint、build、smoke、阻塞式生产依赖审计。
- Nginx 首次配置改为 HTTP-only bootstrap，证书签发后切 HTTPS；setup 使用随机数据库密码；
  production migration 明确使用 `migrate deploy`。

## 5. 验证证据

所有命令在 `D:\Develop\claude\hotai` 执行。动态数据库验证使用临时 PostgreSQL 15.18
与 18.4；生产文档仍以 PostgreSQL 15 为部署基线。

| 门禁 | 结果 |
|---|---|
| Prisma schema validate | 通过 |
| 5 个 committed migrations | 全部成功 |
| Seed | 成功 |
| PostgreSQL AI lease/CAS integration | 2/2 通过 |
| PostgreSQL Ask quota integration | 2/2 通过；并发上限、结算、跨午夜并发和前日 crash 计费均通过 |
| 全量 Vitest | 26 files / 126 tests 通过 |
| 全 workspace TypeScript | 通过 |
| ESLint 9 flat config | 0 warning / 0 error |
| DB/AI/Fetcher runtime build | 通过 |
| Fetcher compiled-dist smoke | 通过 |
| Next 16 production build | webpack、TypeScript、page data、16/16 static pages 全部通过 |
| `pnpm audit --prod --audit-level=moderate` | 无已知漏洞 |

本机 Node 为 v24.11.1，而生产/CI 目标是 22.22.2；pnpm 因 engine 精确约束产生 warning，
但本次命令均完成。CI 在 Node 22.22.2 上重新执行同一组门禁。

## 6. 详细修整计划与状态

| 阶段 | 工作项 | 状态 | 验收条件 |
|---|---|---|---|
| P0 | 默认 AI 配置 fail-closed、第三方显式 opt-in、双凭据拒绝 | 完成 | config 单测 + 无预填 relay |
| P0 | 覆盖代理 IP header、修复 limiter 容量 | 完成 | 伪造左侧 XFF 不产生新身份 |
| P0 | 移除远程 inline style、二次净化 URL sink | 完成 | CSS overlay/私网资源测试通过 |
| P1 | Ask PostgreSQL 日预算/并发预约/崩溃回收 | 完成 | 数据库并发集成测试通过 |
| P1 | AI enrichment lease/CAS/retry/final failure | 完成 | 双 worker 与崩溃恢复集成测试通过 |
| P1 | retention 写入和读取双边闭合 | 完成 | 旧文/未来文单测通过 |
| P1 | 依赖升级并清零 production advisories | 完成 | audit 0/0/0/0 |
| P1 | 全 workspace CI、production build、dist smoke | 完成 | 全部门禁通过 |
| P1 | 在生产部署 migration 并滚动发布 | **部署待办** | schema 与当前 Prisma 一致，无长事务/错误 |
| P1 | 审计并轮换可能受旧 relay 配置影响的凭据 | **运营待办** | 旧 key 撤销，供应商日志核验 |
| P2 | 全库异地备份和恢复演练 | **运营待办** | 定期 restore 成功、RPO/RTO 有记录 |
| P2 | readiness、source freshness、AI retry/failed、Ask quota 告警 | **运营待办** | 指标可查询且有告警阈值 |
| P2 | 原子 release/快速回滚，不在原目录覆盖 `.next` | **部署 hardening** | 演练切换和回滚不丢请求 |

详细票据见 `REMEDIATION-PLAN.md`。

## 7. 残余风险与 hardening notes

以下不是本轮确认的可利用漏洞，但上线前应处理或明确接受：

1. **生产代理拓扑。** 当前 IP 逻辑按仓库单层 Nginx 设计；接入 Cloudflare/CDN 后必须只信任
   官方出口网段或平台提供的真实客户端地址，不能把任意 header 当真实 IP。
2. **数据库可用性。** Ask 为安全起见依赖 PostgreSQL fail-closed；数据库故障会让 Ask 503。
   需要连接池、超时、容量和 HA 监控。
3. **进程内 fetch 限流。** 非 Ask 抓取接口仍是单进程 bucket；如果未来横向扩容 Web，应迁移
   到 Nginx/Redis/PostgreSQL 等共享限流。
4. **运营凭据。** 代码无法判断旧部署是否曾符合泄露条件。匹配旧配置的环境必须查日志并
   轮换，不应因代码已修就视为历史凭据安全。
5. **备份和发布。** 文档已修正，但仓库不能替代真实 restore drill、异地副本、原子 release
   和跨 migration 回滚方案。
6. **NAT64/fake-IP。** 源码候选没有在当前环境证明可利用；使用 NAT64、Clash/V2Ray fake-IP
   或特殊企业 DNS 的部署应做专项网络测试。
7. **浏览器 DNS 解析。** URL sink 的同步策略不能在服务端替浏览器解析每个公共 hostname；
   恶意域名若在访问时解析到局域网地址，是否发起请求还取决于浏览器 PNA/CORS/资源类型。
   当前已阻止 literal 和常见内部名，但高敏部署仍应使用严格 CSP、浏览器策略或图片代理。
8. **持续审计。** 本轮没有连接生产日志/数据库，也未对生产域名做黑盒渗透；未来依赖和
   Next/Prisma 行为还会变化，应由 CI SCA 与周期性复审覆盖。

## 8. 正面模式

- Prisma 查询默认参数化，未发现用户输入进入 raw SQL。
- SSRF guard 的 DNS pin、逐跳复核、特殊地址解析和响应上限优于多数小型聚合站。
- 外部内容经过“净化 + URL sink 二次遍历”，不依赖单一 sanitizer 默认值。
- 匿名 AI 成本在调用前预约且数据库故障 fail-closed。
- AI enrichment 状态机显式记录失败、重试和 lease，便于运维和追踪。
- 测试覆盖纯函数、请求边界、URL/HTML、安全配置以及真实 PostgreSQL 并发语义。
- CI 把 migration、生产 build、compiled artifact 和依赖审计设为实际门禁。

## 9. 审计限制

- 未读取或修改真实 `.env`；报告不包含任何真实凭据。
- 未访问生产数据库、供应商账单、Nginx/CDN 日志或生产网络路由。
- 未对公开生产站执行黑盒压力、成本或 SSRF 测试。
- 当前结论证明的是所审代码和本地动态环境，不是对未来配置和生产运维的绝对保证。

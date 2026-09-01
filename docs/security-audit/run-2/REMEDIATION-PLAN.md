# Hot AI 详细修整计划与执行台账

日期：2026-08-31  
基线：`b631bb4608790413b1366dce7412d9cd4ca66ad4`

## 1. 优先级规则

- P0：凭据/数据错误出站、匿名边界绕过、同源 UI 欺骗；必须先关闭。
- P1：可导致成本失控、重复消费、永久卡死、数据契约失真或生产门禁失效。
- P2：部署恢复、观测、扩容和长期维护 hardening。
- 每个票据必须同时具备代码/配置变更、自动化测试或动态证据、回滚/部署注意事项。

## 2. 已执行票据

| 票据 | 优先级 | 内容 | 主要文件 | 状态/验收 |
|---|---:|---|---|---|
| AI-01 | P0 | 示例 AI 配置默认关闭，清理 placeholder，双凭据 fail-fast | `.env.example`, `packages/ai/src/client.ts` | 完成；10 个 client 测试通过 |
| AI-02 | P0 | 非官方 relay 与远程 HTTP 显式 opt-in | `packages/ai/src/client.ts`, README | 完成；配置矩阵测试通过 |
| NET-01 | P0 | Nginx 覆盖 XFF/X-Real-IP，应用不信任左侧伪造值 | `deploy/nginx*.conf`, `ask-guard.ts` | 完成；伪造 XFF 测试通过 |
| WEB-01 | P0 | Juya/Reader 禁止 inline style，净化 URL sink | `sanitize-remote-html.ts`, `juya.ts`, `extract-article.ts` | 完成；HTML 回归测试通过 |
| COST-01 | P1 | Ask DB 日预算、跨午夜全局并发、预约 TTL、fail-closed | schema, migration, `ask-quota.ts`, Ask route | 完成；并发/跨日 crash 集成测试通过 |
| COST-02 | P1 | Ask 断开取消上游、真实/估算 token 结算、Nginx 限流 | Ask route, Nginx | 完成；类型/测试/build 通过 |
| AI-03 | P1 | Enrichment lease/CAS、指数退避、最终失败、崩溃恢复 | schema, migration, `fetcher/enrich.ts` | 完成；PostgreSQL 集成测试 2/2 |
| DATA-01 | P1 | 旧/未来文章写入拒绝，所有 Web 读取统一 retention cutoff | `retention.ts`, `store.ts`, `queries.ts` | 完成；retention 测试通过 |
| WEB-02 | P1 | 统一 browser URL policy；Feed/OPML 不输出 secret URL | `safe-url.ts`, Feed/OPML/组件 | 完成；URL/Feed 测试通过 |
| WEB-03 | P1 | 公共 JSON body 流式限长；ISR path allowlist | `request.ts`, API routes | 完成；请求边界测试通过 |
| FETCH-01 | P1 | Fetch 超时/体积边界，cron 语法 fail-fast，持久化失败计入 source health | Fetcher config/http/cycle | 完成；测试、smoke 通过 |
| BUILD-01 | P1 | 全 workspace typecheck、真实 dist、Next 16/ESLint 9 | package scripts/config | 完成；所有工程门禁通过 |
| SCA-01 | P1 | 升级 Next/undici/node-cron/Anthropic/PostCSS 等 | package manifests/lock | 完成；production audit 全 0 |
| CI-01 | P1 | PostgreSQL migration/seed、test/type/lint/build/smoke/SCA | `.github/workflows/ci.yml` | 完成；配置为阻塞门禁 |
| DEPLOY-01 | P1 | HTTP bootstrap 后签 TLS、随机 DB 密码、生产 migrate deploy | `deploy/*`, docs | 完成；静态审阅与本地 migration 验证 |

## 3. 生产发布顺序

1. 备份当前生产数据库并验证备份文件可读。
2. 核对旧环境是否存在“真实 API key + 第三方 base URL”或预填 relay；命中则立即撤销/轮换
   凭据，并检查供应商/relay 访问日志。
3. 在 staging 使用与生产相同 PostgreSQL 主版本执行 `prisma migrate deploy`。
4. 确认新增 `Article.ai*` 状态列、`AskDailyUsage`、`AskReservation` 和索引存在。
5. 部署 Web/Fetcher 代码；先单实例观察，避免旧 worker 与新 schema 长期混跑。
6. 安装仓库 Nginx 配置；验证客户端传入 XFF 会被覆盖，Ask 429 与 SSE 均正常。
7. 执行一次 fetch cycle，观察 pending -> processing -> success/retry/failed 状态迁移。
8. 并发调用 Ask，确认预约不超过 `ASK_MAX_CONCURRENT`，完成后 reservation 清空。
9. 检查页面、Feed、OPML、Readability/Juya 和 revalidate；再逐步恢复公开流量。

## 4. 尚需生产/运营执行的票据

### OPS-01 — P1 — 历史凭据审计与轮换

- 条件：任何环境曾使用基线 `.env.example`，或真实 key 与非官方 base URL 同时存在。
- 动作：撤销旧 key、创建最小权限新 key、检查供应商/relay 日志和费用异常、记录调查窗口。
- 验收：旧 key 失效；新 key 仅出现在受控 secret store；日志无未解释调用。

### DB-01 — P1 — Migration 与兼容发布

- staging 先跑全部 migration 和回归；生产使用 `migrate deploy`，禁止 `migrate dev`。
- rollout 期间监控锁等待、失败 transaction、Ask 503、AI processing lease 数量。
- 验收：schema drift 为 0；旧/新进程兼容窗口内无写入错误。

### OPS-02 — P2 — 全库备份与恢复演练

- 每日 `pg_dump -Fc` 全库备份，至少一份异机/对象存储副本；加密并限制访问。
- 每月至隔离 DB 做 `pg_restore`，核对 migrations、Source/Article/Digest 和 Ask quota。
- 验收：记录实际 RPO/RTO；随机抽取备份可恢复。

### OBS-01 — P2 — 健康与告警

- 指标：articles_24h、last_fetch_age、source fail/disabled、AI retry/failed/expired lease、Ask
  used/reserved/concurrency、DB latency/errors、provider latency/status、SSE abort。
- 告警：抓取长期无新增、processing lease 过期、failed 激增、Ask 预算异常燃烧、DB 不可用。
- 验收：故障注入可触发告警并定位到具体 source/provider/DB。

### RELEASE-01 — P2 — 原子发布与回滚

- 使用版本化 release 目录或容器镜像；构建完成后原子切换 symlink/服务版本。
- 回滚代码前先判断 migration 是否 backward-compatible；数据库回退必须单独设计。
- 验收：演练 Web/Fetcher 切换与回滚，无原地覆盖 `.next`、无明显请求丢失。

### PROXY-01 — P2 — CDN/多层代理专项

- 当前只支持仓库单层 Nginx 假设。接入 CDN 时基于官方出口 CIDR或受信 header 重做真实
  IP 提取，并确保用户不能直连源站伪造该 header。
- 验收：从 CDN 与直连源站分别测试，只有受信链能改变客户端身份。

## 5. 完成定义

代码修整已经满足本地完成定义：migration、seed、126 tests、全 workspace typecheck、Lint、
runtime/dist smoke、生产依赖审计和完整 production build 全部通过。Goal 的代码目标可完成；
OPS/DB/OBS/RELEASE/PROXY 票据因需要真实生产权限和外部状态，交付为明确的部署执行清单，
不在本地伪造“已上线”结论。

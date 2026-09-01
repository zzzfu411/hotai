# Run 3 Findings Detail

## Current confirmed findings

无。按照安全审计规则，本文件不把缺少 CSP、缺少生产 DB、运维输入信任或未实现产品功能列为漏洞；这些项目见 `REPORT.md` 的 hardening/运营清单。

## CAND-ASK：旧 Ask 配额欠记账（已修复，拒绝作为当前 finding）

**旧攻击路径（基线/修复前）：** 匿名客户端向 `POST /api/ask` 提交合法问题；服务端先预约 corpus 输入估算加 800 输出预算；客户端在流式响应中断、SSE 写入失败或 provider 抛错时，旧异常分支只按输入估算结算。重复并发请求可令实际 provider 消耗高于 `AskDailyUsage.usedTokens`，并且 UTF-16 `/4` 估算会低估中文/emoji。

**当前代码反证：**

1. `apps/web/app/api/ask/route.ts` 把 `req.signal` 传给 `client().messages.stream`。
2. request abort、SSE send failure 和 provider catch 都调用完整 reservation 的 `settleAskQuota`，并在必要时 abort provider。
3. `apps/web/lib/ask-guard.ts` 用 UTF-8 bytes/2 做保守估算；`ask-guard.test.ts` 覆盖 ASCII、CJK 和 emoji。
4. `apps/web/lib/ask-quota.ts` 对过期 reservation 做全额清算，并用同一 advisory lock 避免迟到 settlement 双重计费。

**验证限制：** 当前主机没有 PostgreSQL 或真实 Anthropic-compatible provider，无法运行真实网络断开与账单 E2E；因此报告只确认代码路径和本地单测，不声称生产计费已经实测。

## CAND-URL：远程 Feed 图片/危险协议（拒绝）

本轮以 RSS enclosure、`media:content`、`media:thumbnail`、JSON Feed `url/external_url` 和 HTML `img` 为输入尝试构造私网、凭据、`javascript:`、`data:` URL。当前解析层统一调用 `safeHttpUrl`，NookFeed 在消费 API 响应时再次校验图片/链接，公共 Feed/OPML 输出也有 `safeShareableHttpUrl` fallback。没有找到能穿过现有过滤并到达可利用浏览器 sink 的输入，因此不构成当前 finding。


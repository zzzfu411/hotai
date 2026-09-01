# Hot AI Finding 详细数据流（Run 2）

审计基线：`b631bb4608790413b1366dce7412d9cd4ca66ad4`  
当前状态：以下 3 个基线 confirmed finding 均已在当前工作树修复。行号中的“基线”指该
commit；“当前”指 2026-08-31 工作树。

## SEC-01 — HIGH — AI 配置把内容和特定误配下的 API key 发往第三方

### 基线完整数据流

1. **入口** — `apps/web/app/api/ask/route.ts:29`，`POST`：匿名请求进入 Ask。
2. **语料传播** — `apps/web/app/api/ask/route.ts:71`：读取 48h 内最多 25 篇文章，将标题、
   source、URL、摘要和问题拼为模型输入。
3. **配置传播** — `packages/ai/src/client.ts:30`：旧 client 只按 token 优先选择鉴权，接受
   环境中的任意 base URL，不校验 placeholder 或第三方 opt-in。
4. **sink** — `apps/web/app/api/ask/route.ts:86`：SDK `messages.stream` 把 credential header
   和 assembled corpus 发往配置的 `/v1/messages`。

Fetcher enrichment 与 Digest 共享同一 client，因此文章内容也走相同 sink。

### 精确复现

配置 A（确认内容错误出站，不发送真实 API key）：

```ini
ANTHROPIC_AUTH_TOKEN=<your-relay-key>
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=http://127.0.0.1:PORT
```

配置 B（确认条件性真实 API key 错误路由）：

```ini
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_API_KEY=sk-real-looking-key
ANTHROPIC_BASE_URL=http://127.0.0.1:PORT
```

请求：

```http
POST /api/ask HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{"question":"audit relay routing"}
```

基线动态验证观察到：A 使用 `Authorization: Bearer ...`，B 使用 `X-Api-Key: ...`；两者
请求体均包含应用语料。该实验使用本地 recorder，不向真实第三方发送凭据。

### 攻击者得到什么

第三方 relay 运营者或其入侵者可读取匿名问题和文章语料；在配置 B 下还可获取可计费的
供应商 API key。此 finding 不代表生产环境已经发生泄露。

### 当前修复链

- `.env.example:56`、`:58`、`:68` 默认凭据和 base URL 为空。
- `packages/ai/src/client.ts:36` 清理 placeholder、拒绝双凭据、验证 URL/协议/host。
- 非官方 host 必须设置 `ALLOW_THIRD_PARTY_AI=true`；远程 HTTP 另需显式开关。
- `packages/ai/src/client.ts:87` 在配置被拒绝或 AI 关闭时不构造 SDK client。

### 可比基线

同类自托管 LLM 应用通常允许自定义 provider，但安全默认是“未配置即关闭”，且第三方
provider 是显式信任决策。旧模板违反这一默认；当前实现恢复了该基线。

## SEC-02 — MEDIUM — 伪造 XFF 绕过公开成本和抓取限流

### 基线完整数据流

1. **入口** — `deploy/nginx.conf:35`：匿名客户端进入通用 reverse-proxy location。
2. **header 传播** — `deploy/nginx.conf:40`：`$proxy_add_x_forwarded_for` 保留客户端提供的
   左侧列表，再把真实连接地址追加到末尾。
3. **身份解析** — `apps/web/lib/ask-guard.ts:44`：旧 `clientIp` 读取 XFF。
4. **sink** — `apps/web/lib/ask-guard.ts:50`：左侧伪造值作为 Map key；每个新值获得新 bucket。

相同身份函数被 Ask、catalog、Feed proxy 和 Readability 使用。

### 精确复现

先固定 header 直至命中 429：

```http
POST /api/ask HTTP/1.1
X-Forwarded-For: 203.0.113.1
Content-Type: application/json

{"question":"q1"}
```

再仅改变伪造值：

```text
X-Forwarded-For: 203.0.113.2
X-Forwarded-For: 203.0.113.3
...
```

基线最小实验中，同一 key 的第 6 次请求被阻止，而 6 个不同伪造首项全部通过；2,100 个
未过期伪造身份还产生了 2,100 个 live entries，超过名义 2,048 阈值。

### 攻击者得到什么

攻击者无需登录即可移除 per-IP 公平性，快速耗尽 Ask 共享预算、放大远程抓取工作，并增加
limiter Map 的 CPU/内存压力。基线仍有日额度，所以并非无限模型费用。

### 当前修复链

- `deploy/nginx.conf:25` 与 `deploy/nginx-https.conf:37` 用 `$remote_addr` 覆盖 XFF。
- `apps/web/lib/ask-guard.ts:43` 规范化 `X-Real-IP`，兼容 fallback 只取最右侧地址。
- `apps/web/lib/ask-guard.ts:70` 和 `apps/web/lib/ip-rate-limit.ts:34` 在插入前实行硬容量。
- Nginx 的 `/api/ask` `limit_req` 跨进程限制真实连接地址。
- `apps/web/lib/ask-quota.ts:44` 用 PostgreSQL 全局预算与并发预约控制实际模型成本。

### 可比基线

单层 reverse proxy 的通行安全做法是 outermost proxy 覆盖 forwarding header，应用只信任该
已覆盖值；多层代理则显式维护 trusted-hop/CIDR。当前仓库采用前者，并把成本状态移到 DB。

## SEC-03 — LOW — Juya 远程 HTML 可形成全视口 CSS 钓鱼层

### 基线完整数据流

1. `apps/web/lib/juya.ts:125` 从固定 `daily.juya.uk` RSS 获取条目。
2. `apps/web/lib/juya.ts:103` 选择 `content:encoded`/`content` 作为 raw HTML。
3. `apps/web/lib/juya.ts:77` 的旧 DOMPurify 配置禁止部分 tag，但允许 inline `style`。
4. `apps/web/app/juya/page.tsx:93` 以 `dangerouslySetInnerHTML` 注入同源页面。

### 精确 payload

```html
<a href="https://phish.example/"
   style="position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:white;display:block">
  Session expired - continue
</a>
```

基线 Chromium 布局测量显示该链接覆盖 1280x720 视口。前提是攻击者控制或攻陷固定上游
发布链路；未证明 JavaScript 执行。

### 当前修复链

- `apps/web/lib/juya.ts:78` 改用共享 `sanitizeRemoteHtml`。
- `apps/web/lib/sanitize-remote-html.ts:16` 禁止 `style` 属性。
- 净化后再遍历 URL 属性，删除私网目标、`srcset` 和危险 sink，并规范 `_blank` rel。

## 被否决候选

### CAND-01：危险 scheme 等同于已确认点击 XSS

源代码确有 scheme 不一致，但真实 Chromium 对实际 `target=_blank`/`noopener noreferrer`
sink 的 `javascript:` 导航打开 `about:blank` 且没有执行脚本，`data:` 导航被阻止。原“已确认
XSS”结论被否决；当前仍统一过滤为 HTTP(S)，作为产品完整性和纵深防御修整。

### CAND-02：NAT64/198.18 必然构成可利用 SSRF

字面 198.18 已被阻止，IPv4-mapped 地址有解析，literal NAT64 还会被其他 hostname 分支
拒绝。DNS 返回 NAT64-embedded private address 的场景需要生产网络实际路由 NAT64，并允许
translator 到达内网；本地没有建立该条件。198.18 DNS answer 例外是 Clash/V2Ray fake-IP
兼容决策。故不作为 confirmed finding，保留部署专项测试。

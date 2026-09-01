# Deployment Guide — Hot AI

按这份从零到上线大约 30-60 分钟。所有命令在服务器上执行,除非特别注明 `[本地]`。

## 拓扑回顾

```
┌─────────────────────────────────────────────┐
│                Your Server                   │
│                                              │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │ hotai-web    │    │ hotai-fetcher    │  │
│  │ Next.js :3000│◄───┤ Node dist worker │  │
│  │ (PM2)        │    │ (PM2)            │  │
│  └──────┬───────┘    └────────┬─────────┘  │
│         │  reads               │ writes     │
│         └───────┬───────┬──────┘            │
│                 ▼       ▼                   │
│              Postgres :5432                 │
│                                              │
│  Nginx :443 ──► hotai-web :3000             │
└─────────────────────────────────────────────┘
                    │
                    │ /v1/messages (optional, explicit opt-in)
                    ▼
            ┌───────────────┐
            │ Anthropic / relay │
            └───────────────┘
```

Fetcher 负责文章与来源健康写入；Web 还会在首访生成 Digest，并写入 AskCache。
每小时(默认 `:07`)抓一轮所有源,做 AI 摘要,生成当日 digest,然后 POST `/api/revalidate` 通知 web 刷新 ISR。

---

## 一、前置条件

- Ubuntu 20.04+ / Debian 11+
- 公网服务器,域名已 A 解析到服务器 IP
- 非 root 的 sudo 用户(例如 `ubuntu` 或自建账号)
- 中转站 / Anthropic API key(可选,但没它就只有抓取没 AI 摘要)

---

## 二、服务器初始化

```bash
# SSH 到服务器,非 root 用户
git clone https://github.com/zzzfu411/hotai.git
cd hotai
bash deploy/setup.sh
```

`setup.sh` 安装:Node 22 LTS（最低 22.22.2）、corepack(自带 pnpm)、PM2、PostgreSQL、Nginx、certbot,并创建 `hotai` 数据库 + 同名用户。
脚本会生成随机数据库密码并写入仅当前用户可读的 `.db-password`，不要提交或放入日志。

> **pnpm 版本由仓库锁定** —— `package.json` 里 `"packageManager": "pnpm@9.12.0"`,corepack 自动装这个版本。你不需要、也不应该 `npm i -g pnpm`。

---

## 三、配置环境

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

最少要填的字段:

```ini
# 必填
# setup.sh 将随机密码保存到 .db-password；把它填入此处，不要使用固定密码
DATABASE_URL="postgresql://hotai:<内容来自 .db-password>@localhost:5432/hotai?schema=public"
NEXT_PUBLIC_SITE_URL="https://hotai.yeuxark.com"
FETCHER_USER_AGENT="HotAI-Bot/0.1 (+https://hotai.yeuxark.com)"

# fetcher 通知 web 刷新 ISR 用的密钥 —— 先执行 `openssl rand -hex 32`
# 再把输出粘贴到这里；.env 文件不会执行 $(...)
REVALIDATE_SECRET="粘贴 openssl 输出"
# 仅 loopback 可用 HTTP；远程地址必须使用 HTTPS，避免明文发送 secret
REVALIDATE_URL="http://localhost:3000/api/revalidate"

# === AI(可选，默认关闭) ===
ANTHROPIC_AUTH_TOKEN=""                    # 与 API_KEY 只能填一种
ANTHROPIC_API_KEY=""
ANTHROPIC_BASE_URL=""                       # 留空 = 官方端点
ALLOW_THIRD_PARTY_AI="false"                # 非官方 relay 必须显式开启
ALLOW_INSECURE_AI_HTTP="false"              # 仅本机开发可考虑开启
LLM_MODEL_FAST=""
LLM_MODEL_SMART=""

# 大多数中转站不实现 Anthropic 的 prompt cache,会 400
# 不确定就先 false,跑通后再尝试 true
AI_PROMPT_CACHE="false"
```

`AI_ENRICH_PER_RUN`（默认 30）、`AI_BATCH_SIZE`（默认 10）、`AI_CONCURRENCY`
（默认 4）、`ARTICLE_RETENTION_DAYS`（默认 14）按需调整。公开 Ask 的持久化成本阀还可用
`ASK_DAILY_TOKEN_LIMIT`（默认 500000）、`ASK_MAX_CONCURRENT`（默认 8）和
`ASK_RESERVATION_TTL_SECONDS`（默认 600）配置。`FETCHER_CYCLE_LEASE_SECONDS` 与
`DIGEST_GENERATION_LEASE_SECONDS` 控制跨进程任务的崩溃恢复窗口；前者会在 cycle 运行中续租。

建议同时生成监控 token（不要提交）：

```bash
OBSERVABILITY_TOKEN="$(openssl rand -hex 32)"
# 将这一行写入 chmod 600 的 .env；/api/metrics 默认在 token 为空时关闭。
```

---

## 四、首次部署

```bash
# 1) 装依赖(corepack 第一次自动下载 pnpm 9.12.0)
pnpm install

# 2) 生成 Prisma 客户端(根据 schema 生成 TS 类型)
pnpm db:generate

# 3) 应用仓库中已经提交的全部 production migrations
pnpm db:migrate

# 4) 灌入/更新数据源
pnpm db:seed

# 5) 手动跑一次完整 cycle,验证抓取 + AI + digest 整条链路
pnpm fetch:once

# 6) 构建生产产物
pnpm build

# 7) 起 PM2
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup     # 按提示执行它输出的 sudo 命令,实现开机自启
```

### `pnpm fetch:once` 应该看到的输出

```
[purge] removed 0 articles older than 14d
[fetcher] cycle start — 20 sources, ai=on
  → arxiv-cs-ai (rss)
    ✓ 30 items, 30 upserted
  ...
[fetcher] fetch done — 18 ok, 2 failed, 412 upserted, 23456ms
[ai] enriching 30 article(s)…
[ai] enrich done — 30 ok, 0 skipped
[ai] digest generated for 2026-05-21 — 5 bullets
[fetcher] revalidate -> 200
[fetcher] cycle total 95234ms
```

如果看到大量 `skipped`，表示本轮返回无效或暂时失败，文章会按指数退避重试；连续 6 次
失败才进入 `failed`。中转站协议问题见 §九排障。

---

## 五、Nginx + HTTPS

模板已写死 `server_name hotai.yeuxark.com`。`location /` 关闭缓冲并把 `proxy_read_timeout` 提到 120s（`/api/ask` SSE 长问答），`/_next/static/` 仍长期缓存。

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo ln -sf /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/hotai
sudo nginx -t && sudo systemctl reload nginx

# 先用 HTTP-only bootstrap 申请证书；此时不要启用 443 ssl 配置
sudo certbot --nginx -d hotai.yeuxark.com

# 证书存在后切换到仓库中的 HTTPS 配置，再校验并 reload
sudo cp deploy/nginx-https.conf /etc/nginx/sites-available/hotai
sudo nginx -t && sudo systemctl reload nginx
```

访问 `https://hotai.yeuxark.com/`，应看到 NewsNook 式实时速闻时间线；`/hot` 是数据库热榜。

公开路由（Nginx 全部反代到 `:3000`；静态走 `/_next/static/` 长缓存）:

| 路径 | 说明 |
|---|---|
| `/` | 实时速闻时间线（客户端拉取公开 RSS） |
| `/hot` | 今日热榜（Postgres + AI 重要度排序） |
| `/digest` | 今日简报 + Ask |
| `/a/[id]` | 站内阅读器 |
| `/subscribe` | 本机自定义源 + OPML 导入导出（不入库） |
| `/feed.json` | JSON Feed 1.1 |
| `/hotai.opml` | 编辑源 + 博客 OPML |
| `/api/readability` | POST `{url}` 抽取正文（SSRF 防护） |
| `/api/ask` | SSE 问答（依赖 `proxy_buffering off` + 120s timeout） |
| `/api/proxy/feed` | GET 代理用户自建源（不入库） |
| `/api/live` | 无外部依赖的进程 liveness |
| `/api/health` | DB + 内容新鲜度 + AI/Ask/Fetcher readiness |
| `/api/metrics` | 需 Bearer token 的 Prometheus 指标 |
| `/feed.xml` `/blogs` `/search` `/category/*` `/source/*` | 既有页面 |

---

## 六、上线后的验证清单

| 检查项 | 命令 / URL | 期望 |
|---|---|---|
| Web 进程 | `pm2 status hotai-web` | online |
| Fetcher 进程 | `pm2 status hotai-fetcher` | online |
| Liveness | `curl -fsS https://hotai.yeuxark.com/api/live` | HTTP 200，`status=live` |
| Readiness | `curl -fsS https://hotai.yeuxark.com/api/health` | HTTP 200，`ready=true`；过久无抓取则 503 |
| Prometheus 指标 | `curl -fsS -H "Authorization: Bearer $OBSERVABILITY_TOKEN" https://hotai.yeuxark.com/api/metrics` | `hotai_up 1`、`hotai_ready 1` 等低基数指标 |
| 首页有内容 | `https://hotai.yeuxark.com/` | 热榜列表非空 |
| 站内阅读器 | `https://hotai.yeuxark.com/a/<id>` | AI 摘要先出，再出正文或降级到原文链接 |
| 本机订阅 | `https://hotai.yeuxark.com/subscribe` | OPML 导入导出；**不写入** `Article` |
| AI 简报已生成 | `https://hotai.yeuxark.com/digest` | 看到 headline + bullets |
| AI 状态闭环 | `psql -U hotai hotai -c "SELECT \"aiStatus\", count(*) FROM \"Article\" GROUP BY 1 ORDER BY 1"` | 可见 success；retry/failed 数量可解释且未长期卡在 processing |
| Ask 成本阀 | `psql -U hotai hotai -c "SELECT * FROM \"AskDailyUsage\" ORDER BY day DESC LIMIT 3"` | 当日调用后 usedTokens 增长；并发预约最终清空 |
| 流式问答可用 | 在 `/digest` 页点一个 suggestion 按钮 | 字符流出（Nginx `proxy_buffering off` + 120s timeout） |
| RSS 输出 | `curl https://hotai.yeuxark.com/feed.xml \| head` | XML，`<description>` 为 AI 摘要 |
| JSON Feed | `curl https://hotai.yeuxark.com/feed.json \| head` | JSON Feed 1.1 |
| OPML 目录 | `curl https://hotai.yeuxark.com/hotai.opml \| head` | 编辑源 + 有 `feedUrl` 的博客 |
| Readability | `curl -X POST https://hotai.yeuxark.com/api/readability -H 'content-type: application/json' -d '{"url":"https://example.com"}'` | 公网 URL 抽取；`http://127.0.0.1/` 应被拒 |
| ISR revalidate 工作 | 等 fetcher 下一轮(每小时 :07) | `pm2 logs hotai-fetcher` 出现 `revalidate -> 200` |

---

## 七、日常更新流程

```bash
cd ~/hotai
git pull
pnpm install         # 如果 lock 变了
pnpm db:generate     # 如果 schema 变了
pnpm db:migrate      # 如果有新 migration 文件
pnpm build
pm2 reload all       # 滚动重载；单实例 fetcher 仍会短暂重启，不等于全链路零停机

# nginx 模板有变时：证书存在则重新安装 nginx-https.conf；首次签证书前使用
# nginx.conf 的 HTTP-only bootstrap，避免无证书时 nginx -t 失败，然后：
sudo nginx -t && sudo systemctl reload nginx
```

**注意:** v0.2 之后的 schema 变更,开发者在本地用 `pnpm --filter @hotai/db migrate:dev --name <描述>` 生成 migration 并提交;服务器只跑 `pnpm db:migrate`(纯应用,不交互)。

---

## 八、常用运维命令

```bash
pm2 status                    # 看进程
pm2 logs hotai-web --lines 100
pm2 logs hotai-fetcher --lines 100
pm2 restart hotai-fetcher     # 立刻重启抓取器

pnpm fetch:once               # 立刻跑一次完整 cycle,不等定时
pnpm db:studio                # 在服务器开 Prisma Studio(端口 5555,建议 SSH 转发本地访问)

# 看当前文章 / 源 / digest 状态
psql -U hotai hotai -c "SELECT count(*), max(\"publishedAt\") FROM \"Article\";"
psql -U hotai hotai -c "SELECT slug, \"lastFetch\", enabled FROM \"Source\" ORDER BY \"lastFetch\" DESC;"
psql -U hotai hotai -c "SELECT date, headline FROM \"Digest\" ORDER BY date DESC LIMIT 5;"
```

---

## 九、AI 调用排障

绝大多数 AI 故障都是中转站配置问题。按下面顺序定位:

### 问题：大量 enrichment 进入 retry / failed

| 症状(看 `pm2 logs hotai-fetcher`) | 原因 | 修复 |
|---|---|---|
| `401 Unauthorized` | 密钥错误或鉴权方式不匹配 | Bearer 中转站检查 `ANTHROPIC_AUTH_TOKEN`；直连 Anthropic 检查 `ANTHROPIC_API_KEY` |
| `404` / `model not found` | 模型 ID 中转站不认 | 改 `LLM_MODEL_FAST` / `LLM_MODEL_SMART` 为中转站文档里给的 ID |
| `400` 含 `cache_control` 字样 | 中转站不支持 prompt cache | `AI_PROMPT_CACHE=false` 然后 `pm2 restart hotai-fetcher` |
| `ECONNREFUSED` / `ENOTFOUND` | `ANTHROPIC_BASE_URL` 不可达 | `curl -I $ANTHROPIC_BASE_URL` 确认能连;注意结尾**不要**带 `/v1` |
| `429 Too Many Requests` | 中转站限流 | 调小 `AI_CONCURRENCY=2` / `AI_BATCH_SIZE`，或拉长 `FETCHER_CRON` 间隔；系统会自动退避重试 |

### 问题:fetcher 正常但 `/digest` 一直显示"未生成"

- 至少要当日(UTC)入库 ≥5 篇文章 digest 才会生成
- 看 `pm2 logs hotai-fetcher | grep digest`
- 如果一直 skip,可手动触发:`pnpm fetch:once` 之后再访问 `/digest`(会按需生成)

### 问题:`/api/ask` 返回 503

- `AI_ENABLED` 是 false（`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 都没填）
- 或:web 进程加载 .env 时 key 还没填,`pm2 restart hotai-web` 重新读

---

## 十、监控 + 备份

### 日志轮转
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 备份
14 天保留期不等于可恢复性保证：上游内容可能删除，Digest、Source 配置、Ask 成本状态和
AI enrichment 状态也不能依赖重抓恢复。生产环境应备份整个数据库，而不是只挑两张表。

```bash
# 先创建仅部署用户可读的目录；每日 3 点全库备份，保留 30 天
mkdir -p ~/backups && chmod 700 ~/backups
# 为无人值守 pg_dump 配置 ~/.pgpass；密码取自 .db-password，文件必须 0600
printf 'localhost:5432:hotai:hotai:%s\n' "$(cat .db-password)" > ~/.pgpass
chmod 600 ~/.pgpass
0 3 * * * pg_dump -h localhost -U hotai -Fc hotai > ~/backups/hotai-$(date +\%F).dump
0 4 * * 0 find ~/backups -name 'hotai-*.dump' -mtime +30 -delete
```

至少每月在隔离数据库执行一次恢复演练：`createdb hotai_restore_test` 后运行
`pg_restore --clean --if-exists -d hotai_restore_test <backup.dump>`，再核对 migration、
Source/Article/Digest 数量和 Ask quota 表。备份还应复制到异机或对象存储并开启服务端加密。

### 健康检查与指标

仓库已提供三个不同语义的端点：

```bash
# 进程是否存活；不访问数据库
curl -fsS https://hotai.yeuxark.com/api/live

# 数据库与内容管线是否 ready；抓取超过 HEALTH_MAX_FETCH_AGE_SECONDS
# 未更新、无 enabled Source 或数据库不可用时返回 503
curl -fsS https://hotai.yeuxark.com/api/health | jq .

# Prometheus；OBSERVABILITY_TOKEN 为空时端点返回 404
curl -fsS \
  -H "Authorization: Bearer $OBSERVABILITY_TOKEN" \
  https://hotai.yeuxark.com/api/metrics
```

至少告警：`hotai_ready == 0`、`hotai_ai_expired_leases > 0`、
`hotai_ask_expired_reservations > 0`、`hotai_fetcher_cycle_lease_expired > 0`、
`hotai_sources{state="stale"} > 0` 和每日 token 燃烧异常。`/api/health` 只暴露聚合计数，
`/api/metrics` 必须通过反向代理或监控系统保管 Bearer token。

---

## 十一、回滚

```bash
cd ~/hotai
git log --oneline -10           # 找想回到的 commit
git checkout <commit-hash>
pnpm install
pnpm db:generate
pnpm build
pm2 reload all
```

**注意 schema 回滚:** Prisma 不会自动回滚 migration。如果回退跨过 schema 变更,需手动 `psql` 修复或 `prisma migrate resolve --rolled-back <name>`。所以重要的 schema 变更前请 `pg_dump` 一份全量。

# Deployment Guide — Hot AI

按这份从零到上线大约 30-60 分钟。所有命令在服务器上执行,除非特别注明 `[本地]`。

## 拓扑回顾

```
┌─────────────────────────────────────────────┐
│                Your Server                   │
│                                              │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │ hotai-web    │    │ hotai-fetcher    │  │
│  │ Next.js :3000│◄───┤ tsx cron worker  │  │
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
                    │ /v1/messages
                    ▼
            ┌───────────────┐
            │  你的中转站    │
            └───────────────┘
```

`hotai-fetcher` 是唯一写入数据库的进程。每小时(默认 `:07`)抓一轮所有源,做 AI 摘要,生成当日 digest,然后 POST `/api/revalidate` 通知 web 刷新 ISR。

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

`setup.sh` 安装:Node 20、corepack(自带 pnpm)、PM2、PostgreSQL、Nginx、certbot,并创建 `hotai` 数据库 + 同名用户(默认密码 `hotai`,生产请改)。

> **pnpm 版本由仓库锁定** —— `package.json` 里 `"packageManager": "pnpm@9.12.0"`,corepack 自动装这个版本。你不需要、也不应该 `npm i -g pnpm`。

---

## 三、配置环境

```bash
cp .env.example .env
nano .env
```

最少要填的字段:

```ini
# 必填
DATABASE_URL="postgresql://hotai:hotai@localhost:5432/hotai?schema=public"
NEXT_PUBLIC_SITE_URL="https://your-domain.com"

# fetcher 通知 web 刷新 ISR 用的密钥 —— 生成一个随机串
REVALIDATE_SECRET="$(openssl rand -hex 32)"
REVALIDATE_URL="http://localhost:3000/api/revalidate"

# === AI(可选,但强推) ===
ANTHROPIC_API_KEY="你中转站签发的 key"
ANTHROPIC_BASE_URL="https://api.your-relay.example"   # 不带 /v1
LLM_MODEL_FAST="claude-haiku-4-5"                     # 改成中转站接受的 ID
LLM_MODEL_SMART="claude-sonnet-4-6"

# 大多数中转站不实现 Anthropic 的 prompt cache,会 400
# 不确定就先 false,跑通后再尝试 true
AI_PROMPT_CACHE="false"
```

`AI_ENRICH_PER_RUN`(默认 30)、`AI_CONCURRENCY`(默认 4)、`ARTICLE_RETENTION_DAYS`(默认 14)按需调,通常默认就够。

---

## 四、首次部署

```bash
# 1) 装依赖(corepack 第一次自动下载 pnpm 9.12.0)
pnpm install

# 2) 生成 Prisma 客户端(根据 schema 生成 TS 类型)
pnpm db:generate

# 3) 创建并应用首个 migration
#    注意:这一步只在首次或 schema 变更时跑,会在
#    packages/db/prisma/migrations/ 下生成新文件
pnpm --filter @hotai/db migrate:dev --name init_with_ai

# 4) 把 migration 文件提交回仓库,以后部署只跑 pnpm db:migrate 就够
git add packages/db/prisma/migrations
git commit -m "chore: initial migration with AI fields"
git push

# 5) 灌入数据源
pnpm db:seed

# 6) 手动跑一次完整 cycle,验证抓取 + AI + digest 整条链路
pnpm fetch:once

# 7) 构建生产产物
pnpm build

# 8) 起 PM2
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

如果看到 `[ai] enrich done — 0 ok, 30 skipped`,中转站协议有问题,见 §九 排障。

---

## 五、Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo sed -i 's/YOUR_DOMAIN/your-domain.com/g' /etc/nginx/sites-available/hotai
sudo ln -sf /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/hotai
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt 证书 —— certbot 会自动改写 nginx.conf 加 ssl 段
sudo certbot --nginx -d your-domain.com
```

访问 `https://your-domain.com/`,应该看到首页热度榜。

---

## 六、上线后的验证清单

| 检查项 | 命令 / URL | 期望 |
|---|---|---|
| Web 进程 | `pm2 status hotai-web` | online |
| Fetcher 进程 | `pm2 status hotai-fetcher` | online |
| 首页有内容 | `https://your-domain.com/` | 列表非空 |
| AI 简报已生成 | `https://your-domain.com/digest` | 看到 headline + bullets |
| AI 字段已落库 | `psql -U hotai hotai -c "SELECT count(*) FROM \"Article\" WHERE \"aiAnalyzedAt\" IS NOT NULL"` | > 0 |
| 流式问答可用 | 在 `/digest` 页点一个 suggestion 按钮 | 字符流出 |
| RSS 输出 | `curl https://your-domain.com/feed.xml \| head` | XML |
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
pm2 reload all       # 零停机重启 web + fetcher
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

### 问题:`enrich done — 0 ok, N skipped`

| 症状(看 `pm2 logs hotai-fetcher`) | 原因 | 修复 |
|---|---|---|
| `401 Unauthorized` | API key 错 / 中转站未签发 | 检查 `ANTHROPIC_API_KEY` |
| `404` / `model not found` | 模型 ID 中转站不认 | 改 `LLM_MODEL_FAST` / `LLM_MODEL_SMART` 为中转站文档里给的 ID |
| `400` 含 `cache_control` 字样 | 中转站不支持 prompt cache | `AI_PROMPT_CACHE=false` 然后 `pm2 restart hotai-fetcher` |
| `ECONNREFUSED` / `ENOTFOUND` | `ANTHROPIC_BASE_URL` 不可达 | `curl -I $ANTHROPIC_BASE_URL` 确认能连;注意结尾**不要**带 `/v1` |
| `429 Too Many Requests` | 中转站限流 | 调小 `AI_CONCURRENCY=2`,或拉长 `FETCHER_CRON` 间隔 |

### 问题:fetcher 正常但 `/digest` 一直显示"未生成"

- 至少要当日(UTC)入库 ≥5 篇文章 digest 才会生成
- 看 `pm2 logs hotai-fetcher | grep digest`
- 如果一直 skip,可手动触发:`pnpm fetch:once` 之后再访问 `/digest`(会按需生成)

### 问题:`/api/ask` 返回 503

- `AI_ENABLED` 是 false(`ANTHROPIC_API_KEY` 没填)
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
14 天保留期意味着丢了 `Article` 表也能重抓回来,但 `Digest` 是 LLM 生成的、付了费的,**必须备**。`Source` 表权重 / 启用状态也建议备。

```bash
# 加到 crontab(crontab -e)—— 每日 3 点全量,保留 30 天
0 3 * * * pg_dump -U hotai -t '"Source"' -t '"Digest"' hotai | gzip > ~/backups/hotai-ai-$(date +\%F).sql.gz
0 4 * * 0 find ~/backups -name 'hotai-ai-*.sql.gz' -mtime +30 -delete
```

### 健康检查(可选)
最简方案:用 `uptime kuma` / `cronitor` 监控:
- HTTPS 首页 200
- `pm2 jlist` 里两个进程都 online
- DB 连通(`pg_isready`)

进阶:在 web 加 `/api/health` 暴露 `articles_24h`、`last_fetch_ago_seconds`,uptime kuma 按 JSON 字段断言。

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

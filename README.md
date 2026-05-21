# Hot AI

每日自动聚合 + Claude 实时分析的 AI 行业热度榜。数据源涵盖英文 RSS、中文科技媒体、GitHub Trending、HuggingFace。

## 架构

```
apps/web        Next.js 14 (App Router, SSR + ISR) 前端 + /api/ask 流式问答
apps/fetcher    Node.js worker — 每小时抓取 / 去重 / 打分 / AI 摘要 / 生成今日简报
packages/db     共享 Prisma client 和 schema (含 Article.ai* 字段 + Digest 表)
packages/ai     Anthropic SDK 封装 — enrichArticle / generateDigest / 流式客户端
```

数据流:`fetcher` 是唯一写入者; `web` 只读;每轮抓取结束后 fetcher 调 `/api/revalidate`
刷新 Next.js ISR 缓存。AI 字段为可选 —— 不配置 `ANTHROPIC_API_KEY` 时全站功能正常,
只是没有摘要、简报和问答。

## 本地开发

```bash
# 1) 准备 Postgres (Docker)
docker run -d --name hotai-pg -p 5432:5432 \
  -e POSTGRES_USER=hotai -e POSTGRES_PASSWORD=hotai -e POSTGRES_DB=hotai \
  postgres:15

# 2) 安装依赖
pnpm install

# 3) 复制环境变量,并(可选)填入 ANTHROPIC_API_KEY
cp .env.example .env

# 4) 生成 Prisma 客户端 + 建表 + 灌入来源
pnpm db:generate
pnpm db:migrate          # 首次运行 → pnpm --filter @hotai/db migrate:dev --name init
pnpm db:seed

# 5) 手动跑一次抓取(顺带触发 AI 摘要 + 生成今日简报)
pnpm fetch:once

# 6) 启动前端
pnpm dev:web             # http://localhost:3000
```

## 页面 / 接口

| 路径                 | 说明                                              |
| -------------------- | ------------------------------------------------- |
| `/`                  | 热度榜首页 + 24h 统计                             |
| `/digest`            | 今日 AI 简报(Claude Sonnet 生成)+ 实时问答     |
| `/search?q=…`        | 全文搜索(标题 / 摘要 / 主题标签)                |
| `/category/{slug}`   | 按分类过滤 (research / industry / opensource / media) |
| `/source/{slug}`     | 按来源过滤                                        |
| `/feed.xml`          | 站点 RSS                                          |
| `/api/ask`           | POST — Claude 流式问答 (SSE),基于过去 48h 文章 |
| `/api/digest`        | GET  — 今日简报 JSON                              |
| `/api/revalidate`    | POST — fetcher 用,需 `x-revalidate-secret`       |

## AI 流水线

每个 fetch cycle 结束后:
1. `enrichPendingArticles()` 取 `aiAnalyzedAt is null` 的 top-N 条,用 `LLM_MODEL_FAST` 并行
   生成中英摘要 + 主题 + 类型 + 重要度,写回 `Article.ai*` 字段。
2. `ensureTodayDigest()` 取当日 top-40,用 `LLM_MODEL_SMART` 生成 headline / overview /
   bullets,写入 `Digest`。同日内 6 小时内不重复生成。

调整 `AI_ENRICH_PER_RUN` / `AI_CONCURRENCY` 控制成本与延迟。

### 用中转站 / 自建 proxy

代码用的是 `@anthropic-ai/sdk`,只走 Anthropic 的 `/v1/messages` 协议 —— 任何
**实现了同协议** 的中转站都能直接用,无需改代码:

```ini
ANTHROPIC_API_KEY="sk-xxx"                    # 中转站签发的 key
ANTHROPIC_BASE_URL="https://api.your-relay.example"   # 注意:不要带 /v1
LLM_MODEL_FAST="claude-haiku-4-5"             # 改成中转站后端实际接受的 ID
LLM_MODEL_SMART="claude-sonnet-4-6"
AI_PROMPT_CACHE="false"                       # 多数中转站不支持 cache_control,关掉
```

如果中转站说的是 **OpenAI Chat Completions** 协议(`/v1/chat/completions`),
那就不能直接用,需要换 `openai` SDK 重写 `packages/ai/src/client.ts` —— 工作量也不大,
但本仓库目前只走 Anthropic 协议。

## 美术资产

待补图列在 [`docs/ART_REQUIREMENTS.md`](docs/ART_REQUIREMENTS.md)。当前 SVG logo /
favicon 是占位,设计稿到位后直接替换 `apps/web/public/*` 即可。

## 设计 / 路线图

整体逻辑详解、痛点自查、优化 + 扩展方案、按 ROI 排序的 sprint 清单见
[`docs/design.md`](docs/design.md)。改任何核心模块前请先翻一下,避免重复踩坑。

## 生产部署

见 `deploy/` 目录:

```bash
bash deploy/setup.sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo ln -s /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

# Hot AI

每日自动聚合 AI 领域热点新闻的网站,数据源涵盖英文 RSS、中文科技媒体、GitHub Trending、HuggingFace。

## 架构

- `apps/web` — Next.js 14 (App Router, SSR + ISR) 前端
- `apps/fetcher` — Node.js worker,每小时拉取 / 去重 / 打分 / 入库
- `packages/db` — 共享 Prisma client 和 schema

## 本地开发

```bash
# 1) 准备 Postgres (Docker)
docker run -d --name hotai-pg -p 5432:5432 \
  -e POSTGRES_USER=hotai -e POSTGRES_PASSWORD=hotai -e POSTGRES_DB=hotai \
  postgres:15

# 2) 安装依赖
pnpm install

# 3) 复制环境变量
cp .env.example .env

# 4) 生成客户端 + 初始化表 + 灌入来源
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5) 手动跑一次抓取(验证)
pnpm fetch:once

# 6) 启动前端
pnpm dev:web  # http://localhost:3000
```

## 生产部署

见 `deploy/` 目录。服务器准备好后:

```bash
bash deploy/setup.sh         # 安装 Node/pnpm/Postgres/Nginx/certbot
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo ln -s /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

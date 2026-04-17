# Deployment Guide — Hot AI

## 前置条件
- Ubuntu 20.04+ / Debian 11+
- 公网服务器,域名已解析至服务器 IP
- 非 root 的 sudo 用户(例如 `ubuntu` 或自建账号)

## 一、服务器初始化

```bash
# SSH 到服务器,非 root 用户
git clone <your-repo-url> hotai
cd hotai
bash deploy/setup.sh
```

脚本会安装 Node 20、pnpm、PM2、PostgreSQL、Nginx、certbot,并创建 `hotai` 数据库/用户。

## 二、配置环境

```bash
cp .env.example .env
vim .env
# 关键项:
#   DATABASE_URL="postgresql://hotai:hotai@localhost:5432/hotai?schema=public"
#   NEXT_PUBLIC_SITE_URL="https://your-domain.com"
#   REVALIDATE_SECRET="<生成一个随机字符串>"
#   REVALIDATE_URL="http://localhost:3000/api/revalidate"
```

## 三、首次部署

```bash
pnpm install
pnpm db:generate
pnpm db:migrate   # 初次运行需改用 migrate:dev 生成 migration,或直接 prisma db push
pnpm db:seed
pnpm build

mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup     # 按提示执行它输出的 sudo 命令,实现开机自启
```

## 四、Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo sed -i 's/YOUR_DOMAIN/your-domain.com/g' /etc/nginx/sites-available/hotai
sudo ln -sf /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/hotai
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

## 五、更新流程

```bash
cd ~/hotai
git pull
pnpm install
pnpm db:migrate    # 如有 schema 变更
pnpm build
pm2 reload all
```

## 六、常用命令

```bash
pm2 status                    # 查看进程
pm2 logs hotai-web            # Web 日志
pm2 logs hotai-fetcher        # 抓取日志
pm2 restart hotai-fetcher     # 手动重启抓取器
pnpm fetch:once               # 立即触发一次抓取(不走定时)
pnpm db:studio                # 打开 Prisma Studio(本地)
```

## 七、初次建库(无 migration 历史)

第一次在服务器上,`packages/db/prisma/migrations/` 目录还是空的。选其中一种:

**方案 A(推荐,简洁)**:在本地先跑 `pnpm --filter @hotai/db exec prisma migrate dev --name init` 生成 migration 提交;之后服务器上 `pnpm db:migrate` 即可。

**方案 B(快速起步)**:在服务器上直接用 `prisma db push`:
```bash
pnpm --filter @hotai/db exec prisma db push
pnpm db:seed
```

## 八、监控建议

- PM2 自带 `pm2 monit`
- 建议给 `pm2 logrotate` 装上:`pm2 install pm2-logrotate`
- 数据库备份:`crontab -e` 加一行 `0 3 * * * pg_dump -U hotai hotai | gzip > ~/backups/hotai-$(date +\%F).sql.gz`

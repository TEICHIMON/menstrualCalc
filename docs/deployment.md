# 部署指南：Vue + Docker Compose + Caddy

本项目沿用 `markdown_reader` 的部署流程：GitHub Actions 负责 lint、typecheck 和 test，然后把项目同步到 VPS。workflow 会在 VPS 上自动补齐 `rsync`、Docker 和 Docker Compose plugin，再执行 `docker compose build` 与 `docker compose up`；容器内由 Nginx 托管 Vite 构建产物，Caddy 负责 HTTPS、Basic Auth 和反向代理。

- VPS：`148.135.80.200`（沿用参考项目的服务器）
- 默认应用路径：`/opt/menstruation-calc/app`
- 应用监听：VPS 本机 `127.0.0.1:3001`
- 正式域名：首次部署前在 `deploy/Caddyfile.example` 中替换 `cycle.example.com`

## 流水线总览

```text
push 到 main
  -> GitHub Actions: npm ci -> lint -> typecheck -> test
  -> VPS: install missing rsync/docker/compose plugin
  -> rsync 项目源码到 VPS:/opt/menstruation-calc/app
  -> VPS: docker compose build
  -> VPS: docker compose up -d --remove-orphans
  -> Nginx: 托管 dist/，支持 Vue Router history fallback
  -> Caddy: reverse_proxy 127.0.0.1:3001
  -> HTTPS 站点
```

## GitHub 仓库

当前目录首次接入 GitHub 时，创建一个空仓库并把默认分支设为 `main`：

```bash
git init -b main
git add .
git commit -m "ci: add GitHub Actions deployment"
git remote add origin <your-repository-url>
git push -u origin main
```

不要把 `.env.local` 或任何私钥提交到仓库。

## DNS

在域名服务商后台添加指向 VPS 的记录。主机记录按最终域名调整：

| 类型 | 主机记录 | 记录值 | TTL |
|---|---|---|---|
| `A` | 例如 `cycle` | `148.135.80.200` | 600 |
| `AAAA`（可选） | 例如 `cycle` | `2607:f130:0:18f:216:3eff:fe64:ba0c` | 600 |

验证：

```bash
dig +short cycle.example.com
```

## VPS 准备

登录 VPS：

```bash
ssh root@148.135.80.200
```

安装 Caddy。`rsync`、Docker 和 Compose plugin 会由 workflow 自动补齐：

```bash
apt update
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
```

Ubuntu 24.04 默认源的 Caddy 版本不合适时，使用 Caddy 官方源：

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

创建应用目录。workflow 也会自动创建，这里手动创建一次便于首次检查：

```bash
mkdir -p /opt/menstruation-calc/app
```

如果启用了防火墙，放行 SSH、HTTP 和 HTTPS：

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

云服务商安全组也需要放行 TCP 22、80 和 443。端口 3001 只绑定在 `127.0.0.1`，不需要对公网开放。

## Caddy 配置

项目记录的是敏感健康数据，示例默认保留与参考项目一致的 Basic Auth 保护。生成密码哈希：

```bash
caddy hash-password
```

把 `deploy/Caddyfile.example` 中的站点块合并到 VPS 的 `/etc/caddy/Caddyfile`，替换邮箱、正式域名、用户名和密码哈希。核心配置如下：

```caddyfile
cycle.example.com {
  encode zstd gzip

  header {
    X-Robots-Tag "noindex, nofollow, noarchive"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
  }

  basic_auth {
    admin your_caddy_hash
  }

  reverse_proxy 127.0.0.1:3001
}
```

校验并重载：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
journalctl -u caddy -n 30 --no-pager
```

## GitHub Actions Secrets

在新仓库的 `Settings -> Secrets and variables -> Actions` 配置：

| Name | 值 |
|---|---|
| `VPS_HOST` | `148.135.80.200` |
| `VPS_USER` | `root` |
| `VPS_PORT` | 可选，默认 `22` |
| `VPS_SSH_KEY` | 与参考项目相同的部署 SSH 私钥全文 |
| `APP_PATH` | 可选，默认 `/opt/menstruation-calc/app` |
| `VITE_SUPABASE_URL` | 可选，Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 可选，Supabase anon key |

workflow 沿用参考项目的部署密钥指纹：

```text
SHA256:ODd9UA0Q/doLw45/PHC66K+jtasYGbA2GdSJ2TU8P3A
```

如果不复用参考项目的部署密钥，需要先把新公钥加入 VPS 的 `authorized_keys`，再把 `.github/workflows/deploy.yml` 中的 `EXPECTED_DEPLOY_KEY_FINGERPRINT` 改为新私钥对应的指纹。

生成新部署密钥的命令：

```bash
ssh-keygen -t ed25519 -C "gh-actions-menstruation-calc" -f ~/.ssh/menstruation_calc_deploy -N ""
ssh-copy-id -i ~/.ssh/menstruation_calc_deploy.pub root@148.135.80.200
ssh-keygen -lf ~/.ssh/menstruation_calc_deploy.pub
```

## Supabase 构建变量

Vite 的 `VITE_*` 变量会在 Docker 构建阶段写入前端 bundle。未配置两个 Supabase Secrets 时，应用仍可使用浏览器本地模式；配置后可使用云同步模式。

`VITE_SUPABASE_ANON_KEY` 本身是面向浏览器的公开 anon key，不应使用 Supabase service role key。数据权限必须由 `supabase/migrations/001_init.sql` 中的 RLS 策略保护。

## 部署

推送到 `main` 或手动运行 `Build and Deploy` workflow。成功后在 VPS 检查：

```bash
cd /opt/menstruation-calc/app
docker compose ps
docker compose logs -f app
curl -I http://127.0.0.1:3001/healthz
```

站点验证：

- 正式域名应启用 HTTPS 并弹出 Basic Auth。
- 刷新 `/calendar`、`/stats` 等前端路由不应返回 404。
- 浏览器开发者工具的 Application 面板中应能看到 PWA manifest 和 service worker。
- 配置 Supabase 后，应能注册、登录并同步数据。

## 故障排查

| 症状 | 排查 |
|---|---|
| Deploy 报 `Permission denied (publickey)` | `VPS_SSH_KEY` 没粘全，或对应公钥未安装到 VPS |
| Deploy 报私钥指纹不匹配 | Secret 不是参考项目使用的部署私钥，更新 Secret 或 workflow 指纹 |
| `docker: command not found` | 检查 Actions 使用的 VPS 用户是否有 `apt-get` 和 `systemctl` 权限 |
| `docker compose` 不存在 | 安装 `docker-compose-plugin` |
| 容器端口冲突 | 确认其他项目没有占用 VPS 的 `127.0.0.1:3001` |
| 网站返回 502 | 用 `docker compose ps` 和 `docker compose logs -f app` 查看容器状态 |
| 刷新子路由返回 404 | 确认容器使用仓库内的 `deploy/nginx.conf` |
| 页面能打开但 Supabase 不工作 | 检查两个 `VITE_SUPABASE_*` Secrets 后重新触发构建 |
| PWA 无法安装 | 确认使用 HTTPS，并检查 manifest 与 service worker 是否正常加载 |

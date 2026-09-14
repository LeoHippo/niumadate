# 部署：从一台空服务器到能发给好友的链接

这份文档假设你**没怎么部署过**，所以每一步都写全。有 🚩 的地方是需要你先做决定的。

---

## 第 0 步：先想清楚三件事

| 问题 | 选项 | 影响 |
| --- | --- | --- |
| **服务器放哪** 🚩 | 中国大陆 / 香港等境外 | 大陆**必须备案**域名才能用；境外不用备案，但大陆访问稍慢（几十毫秒，感觉不出来） |
| **有没有域名** 🚩 | 有 / 只用 IP | **强烈建议买一个**。用 IP 就没法上 HTTPS，微信里分享一条 `http://1.2.3.4` 的链接体验很差 |
| **代码怎么传** | Git（推荐）/ 直接打包上传 | 见第 4 步，两条路都给了 |

**我的建议**：香港/新加坡的**轻量应用服务器**（2 核 2G，一年一两百块）+ 一个十几块的域名。不用备案，当天就能上线。

> **为什么不用 Vercel / Railway 那类平台？**
> 这个应用把数据存在一个 SQLite 文件里，需要**持久磁盘**。而且好友主要在微信里点，
> 国内服务器的访问体验明显更好。

---

## 第 1 步：买服务器

1. 阿里云 / 腾讯云 / 其他，选「**轻量应用服务器**」（不是 ECS，轻量便宜且够用）
2. 配置：**2 核 2G**，系统选 **Ubuntu 24.04**
3. **地域**：香港 / 新加坡（不想备案就选这里）
4. 买完记下：**公网 IP**、**root 密码**（或密钥）

**防火墙**：在控制台的「防火墙 / 安全组」里放行 **80** 和 **443** 端口。（22 一般默认开着。）

---

## 第 2 步：域名（强烈建议）

1. 买个域名，做一条 **A 记录**指向服务器公网 IP
2. 等几分钟，本地验证一下解析对不对：

```powershell
# 在你自己的电脑上跑，应该显示服务器的 IP
Resolve-DnsName your-domain.com
```

> **大陆服务器**的话，这里还要走**ICP 备案**（在云厂商控制台申请，免费，一般 1~2 周）。
> 没备案之前 80/443 会被拦，只能先用 `IP:8787` 自己看看。

---

## 第 3 步：登录服务器，装 Node

```powershell
# 在你自己的电脑上
ssh root@你的公网IP
```

进去之后（下面的命令都在服务器上跑）：

```bash
# 更新软件源
apt update && apt upgrade -y

# 用 NodeSource 装 Node 22（node:sqlite 需要 22 以上）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git

# 确认
node -v     # 应该 >= v22
git --version
```

装 pnpm：

```bash
corepack enable
corepack prepare pnpm@12.4.1 --activate
pnpm -v
```

---

## 第 4 步：把代码弄上去

### 方式 A：用 Git（推荐，以后更新一条命令）

先在**你自己的电脑**上把项目推到一个仓库（GitHub / Gitee 都行）：

```powershell
cd E:\niumadate
git remote add origin <你的仓库地址>
git push -u origin main
```

然后在**服务器**上：

```bash
# 建一个专用用户，别用 root 跑业务
useradd -m -s /bin/bash niumadate

git clone <你的仓库地址> /opt/niumadate
chown -R niumadate:niumadate /opt/niumadate
```

### 方式 B：直接打包上传（不想碰 git 就走这条）

在**你自己的电脑**上：

```powershell
cd E:\niumadate
.\scripts\upload.ps1 -Server root@你的公网IP
```

它会本地构建、打包、传到服务器 `/opt/niumadate`。跑完按提示再执行两句就行。

---

## 第 5 步：写配置（.env）

```bash
cd /opt/niumadate
cat > .env << 'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=8787

# 后台口令和会话密钥——**这两行可以整段删掉**。
# 不写的话，服务第一次启动会各随机生成一个、存进 data/、并在日志里打印一次。
# 想自己定就填，详见下面的「管理员鉴权」。
# ADMIN_PASSWORD=换成一个又长又好记的密码
# SESSION_SECRET=换成一串随机字符串

# 🚩 换成你的域名，带 https
WEB_ORIGIN=https://your-domain.com

# 前面挂了 Caddy/Nginx，这一条**必须开**，否则限流会把所有好友当成同一个人
TRUST_PROXY=true

# 日志落到文件，方便事后翻账
LOG_FILE=/var/log/niumadate/app.log
LOG_FILE_MAX_MB=5
EOF

# 只有跑服务的人能看
chmod 600 .env
chown niumadate:niumadate .env

# 日志目录
mkdir -p /var/log/niumadate
chown niumadate:niumadate /var/log/niumadate
```

生成随机密钥的小办法（填 `SESSION_SECRET` 用得上）：

```bash
openssl rand -base64 32
```

---

## 管理员鉴权：口令从哪来、怎么改、忘了怎么办

后台**只有一个口令**，没有账号体系 —— 这是刻意的：只有你一个人用，
多一套用户名密码只会多一个忘记的地方。

### 口令有三个来源，按优先级

| 优先级 | 来源 | 什么时候用 |
| --- | --- | --- |
| 1 | 环境变量 `ADMIN_PASSWORD` | 想自己指定（推荐） |
| 2 | `data/admin-password` 文件 | 服务自动生成后存在这儿 |
| 3 | **随机生成** | 前两个都没有时，服务自己造一个 |

**为什么不给默认口令。** 这个仓库是公开的，任何写死的默认值都等于公开。
会话密钥更严重：它泄露的话，**别人不用知道口令，自己签一个合法 token 就进来了**。
所以「没配」的后果只能是随机生成，不能是兜底。

### 第一次部署：口令在哪看

不设 `ADMIN_PASSWORD` 直接起服务，日志里会有一段很显眼的提示：

```
════════════════════════════════════════════════════
  已为你生成新的密钥（只显示这一次，请立刻记下来）
════════════════════════════════════════════════════
  后台口令：942C-B7MK-VUBC
  会话密钥：W2XZ-WFHY-FZZG
  存放位置：/opt/niumadate/apps/server/data/admin-password、session-secret
════════════════════════════════════════════════════
```

```bash
# 抄下来之后，忘了也能随时再看
cat /opt/niumadate/apps/server/data/admin-password
```

> 生成的口令是 3 组 4 位、形如 `942C-B7MK-VUBC`。
> 字母表**故意不含 `0 O 1 I l`** —— 抄口令时最容易错的就是这几个，
> 而它只显示一次，抄错一次就得重来。

### 换成自己的口令

```bash
# 办法一：改 .env（推荐，重启后依然生效）
echo 'ADMIN_PASSWORD=你的新口令' >> /opt/niumadate/.env
systemctl restart niumadate

# 办法二：直接改文件
echo '你的新口令' > /opt/niumadate/apps/server/data/admin-password
systemctl restart niumadate
```

> 口令**短于 12 位**服务会打一条警告 —— 登录限流挡得住暴力猜，挡不住慢慢猜。
> 拿不准就干脆不设，让程序生成。

### 忘了口令

```bash
cat /opt/niumadate/apps/server/data/admin-password   # 先看一眼
# 真想换一个：
rm /opt/niumadate/apps/server/data/admin-password
systemctl restart niumadate      # 会重新生成并打印
```

### 登录之后是怎么记住的

| | |
| --- | --- |
| 形式 | `payload.signature` 的 token，HMAC-SHA256 签名 |
| 有效期 | **7 天**，存在浏览器 `localStorage` |
| 放在哪 | `Authorization: Bearer <token>` |
| 限流 | 登录接口 10 分钟 40 次（`LOGIN_RATE_MAX`） |

**换了 `SESSION_SECRET`，所有人都会被登出**（旧 token 签名对不上）——
这是想要的行为：密钥泄露时换掉它，就等于把所有旧会话一次性作废。

### 别做的事

- ❌ 把口令或 `SESSION_SECRET` 提交进仓库（`.env` 已在 `.gitignore` 里）
- ❌ 把 `data/` 目录提交进去（里面有 `admin-password`；已在 `.gitignore` 里）
- ❌ 在公网直接用 `HTTP` —— token 会在路上裸奔，务必挂 HTTPS

---

## 第 6 步：构建 + 起服务

```bash
cd /opt/niumadate
sudo -u niumadate pnpm install --frozen-lockfile
sudo -u niumadate pnpm build

# 先跑一次预检，有硬伤它会直接告诉你
sudo -u niumadate pnpm preflight
```

预检过了之后，装成系统服务（**崩了会自动拉起来，开机自启**）：

```bash
cp deploy/niumadate.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now niumadate

# 看状态
systemctl status niumadate

# 看日志（这个命令以后会经常用）
journalctl -u niumadate -f
```

**到这一步，在服务器上应该能自测通：**

```bash
curl -s http://127.0.0.1:8787/api/health
# 期望看到 {"status":"ok",...}
```

---

## 第 7 步：挂域名 + HTTPS

### 推荐：Caddy（两行配置，证书自动搞定）

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

改配置（把 `your-domain.com` 换成你的域名）：

```bash
cp /opt/niumadate/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile     # 只改域名那一行
systemctl reload caddy
systemctl status caddy
```

Caddy 会自己去申请证书。等十几秒，然后**在你自己电脑的浏览器**打开：

```
https://your-domain.com
```

### 备选：Nginx

配置在 `deploy/nginx.conf`，装法见文件顶部的注释。

---

## 第 8 步：验收清单

一条条打勾，别跳：

- [ ] 浏览器打开 `https://你的域名` —— 能看到红头 + 四张身份卡（**地址栏有小锁**）
- [ ] 随便选一个身份，走完一遍向导，最后看到回执
- [ ] 打开 `https://你的域名/admin`，用 `ADMIN_PASSWORD` 登录
- [ ] 后台能看到刚才那条，点「批准」，再点「复制回复话术」，粘到记事本看看格式对不对
- [ ] **微信里把这个链接发给自己**，点开看看分享卡片正不正常（标题、图标）
- [ ] 微信里打开链接，走一遍，确认手机上没问题
- [ ] 后台「暂停接单」，好友端刷新 —— 应该看到卷帘门
- [ ] 再「恢复接单」

> 最后两条很重要：**别在真要用的时候才发现总开关是关的。**

---

## 第 9 步：日常运维

### 更新版本

```bash
sudo -u niumadate /opt/niumadate/deploy/update.sh
```

它会拉代码 → 装依赖 → 构建 → 重启 → 跑预检。

> ⚠️ **改了 `packages/shared` 或服务端代码，一定要重启服务**；只改前端不用。
> （这条我自己踩过两次：改完不重启，接口返回的还是旧字段，现象很诡异。）

### 备份（**重要**）

数据全在 `apps/server/data/`：

| 文件 | 是什么 |
| --- | --- |
| `app.db` | SQLite 主库 |
| `app.db-wal` | **写前日志 —— 最新的单子可能还在这里** |
| `app.db-shm` | WAL 的索引 |
| `config.json` | 全部配置 |

> **⚠️ 一定要整个目录一起拷。** 实测过 `app.db` 才 40 KB 而 `app.db-wal` 有 4 MB，
> 只拷主库会把最新数据全丢掉。

```bash
# 每天凌晨 3 点备份一次，留 14 天
crontab -e
```

```cron
0 3 * * * tar czf /root/backup/niumadate-$(date +\%F).tar.gz -C /opt/niumadate/apps/server data/ && find /root/backup -name 'niumadate-*.tar.gz' -mtime +14 -delete
```

恢复就是把包解回去、然后 `systemctl restart niumadate`。

### 看日志

```bash
journalctl -u niumadate -f              # 实时看
journalctl -u niumadate --since "1 hour ago"
tail -f /var/log/niumadate/app.log      # 文件那份（带配置改动 diff、来源 IP）
```

程序自己会在日志超过 `LOG_FILE_MAX_MB` 时滚一代。想留更久就用系统的 logrotate，
`/etc/logrotate.d/niumadate`：

```
/var/log/niumadate/app.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

---

## 第 10 步：出问题怎么查

| 症状 | 多半是什么 |
| --- | --- |
| 浏览器打不开，`curl 127.0.0.1:8787` 也不行 | 服务没起来：`journalctl -u niumadate -n 50` |
| 服务器上能通，域名打不开 | DNS 没解析好 / 防火墙没放 80、443 / Caddy 没起来 |
| 页面打开是白屏 | 前端产物没构建：`ls apps/web/dist/index.html`，没有就 `pnpm build` |
| 分享卡片没有标题和图标 | `TRUST_PROXY` 之类无关；检查 `apps/web/dist` 里有没有 `favicon.svg`、`manifest.webmanifest` |
| 接口报 500，日志说配置不对 | `config.json` 坏了。后台「配置备份」里能导入一份好的 |
| 好友说「提交太频繁」 | 限流。确认 `TRUST_PROXY=true`，否则所有人共用一个桶 |
| 后台登录报「登录已过期」但口令没错 | 多半是**登录被限流了**（默认 10 分钟 40 次）。等一会儿，或调 `LOGIN_RATE_MAX` |
| 改了代码没生效 | **忘了重启**：`systemctl restart niumadate` |

---

## 环境变量速查

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 只监听本机，由反向代理对外 |
| `PORT` | `8787` | |
| `DATA_DIR` | `apps/server/data` | 数据库和配置放哪 |
| `WEB_DIST` | `apps/web/dist` | 前端产物在哪 |
| `ADMIN_PASSWORD` | **随机生成** | 不设就生成一个存进 `data/admin-password` 并打印一次 |
| `SESSION_SECRET` | **随机生成** | 同上；换掉它会让所有已登录的会话失效 |
| `WEB_ORIGIN` | `http://localhost:5173` | 允许跨域的来源，填你的域名 |
| `TRUST_PROXY` | `false` | **反代后面必须设 true** |
| `NODE_ENV` | — | 线上设 `production` |
| `LOG_LEVEL` | `info` | |
| `LOG_FILE` | 无 | 设了就额外落一份日志文件 |
| `LOG_FILE_MAX_MB` | `5` | 单文件上限，超了滚成 `.1` |
| `SUBMIT_RATE_MAX` | `120` | 提交限流：窗口内最多次数 |
| `SUBMIT_RATE_WINDOW_MIN` | `60` | 提交限流窗口（分钟） |
| `LOGIN_RATE_MAX` | `40` | 后台登录限流（定 20 时自己调试就先撞上了） |
| `LOGIN_RATE_WINDOW_MIN` | `10` | 后台登录限流窗口（分钟） |

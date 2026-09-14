# 让朋友在公网打开：两条路怎么选

这份文档只回答一个问题：**怎么把一个「只有我自己能打开」的应用，变成「朋友发到群里就能点开」的链接。**

两条路都能做到，区别只有一个：**你愿不愿意让家里电脑一直开着。**

| | **A. 隧道**（不买服务器） | **B. 云服务器** |
| --- | --- | --- |
| 花钱 | **0 元**（域名十几块/年可选） | 香港轻量 **28 元/月**（336 元/年） |
| 前提 | **你家电脑不能关** | 服务器 24 小时在线 |
| 地址 | 固定（要配自己的域名），或每次变的临时地址 | 固定，你自己的域名 |
| 国内访问速度 | 绕 Cloudflare，**可能慢** | 快 |
| 配置难度 | 两条命令 + 一个域名 | 二十来分钟 |
| 适合 | 先验证朋友那边体验 / 偶尔用 | **真的要发到群里长期用** |

**怎么选**：先按 A 的路子起个临时隧道，**拿手机用流量（关 WiFi）打开试**。
- 打开很快 → A 就够用，不用花那 336 块
- 转圈很久 / 打不开 → 直接走 B，隧道救不了

---

# 通用前置：先把应用跑起来

两条路都从这里开始。

```powershell
cd <你放代码的目录>
docker compose up -d

# 确认活着（别只看首页，接口才是真的）
curl.exe http://127.0.0.1:8787/api/health
# 期望：{"status":"ok","service":"niumadate-server",...}
```

看到 `{"status":"ok"...}` 就说明应用本身没问题，剩下都是「怎么让外面能访问」。

> **在国内拉不动镜像**的话先配代理，见 `README.md` 的 Docker 一节。
> 香港服务器不需要这一步。

---

# 路线 A：Cloudflare 隧道

原理是 `cloudflared` **主动往外连** Cloudflare，所以你家**没有公网 IP 也行**，不用在路由器上做端口映射。

**完整步骤见 [TUNNEL.md](TUNNEL.md)**，这里只给最短路径：

## A1. 临时地址（30 秒，验证用）

```powershell
cloudflared tunnel --url http://localhost:8787
```

会打印一个 `https://随机三个词.trycloudflare.com`。**手机用流量打开它** ——
这一步的结果决定你要不要买服务器。

> ⚠️ 这个地址**每次重启都会变**，只能用来验证，不能发到群里长期用。

## A2. 固定地址（要一个域名）

需要：一个域名（十几块/年）+ 免费 Cloudflare 账号。配完之后地址永远是
`https://niuma.你的域名.com`。

详细步骤在 [TUNNEL.md](TUNNEL.md) 的「二、固定隧道」。

## A3. 让它开机自启（可选）

不然每次重启电脑都要手动跑一遍。见 [TUNNEL.md](TUNNEL.md) 的「三、别让它每次开机都要手动跑」。

---

# 路线 B：云服务器

**完整十步见 [DEPLOY.md](DEPLOY.md)。** 用 Docker 的话是它的「附：换成 Docker 部署」一节。

最短路径：

```bash
# 1. 买一台香港轻量应用服务器（2 核 2G，Ubuntu 24.04），防火墙放行 80 和 443

# 2. 域名加一条 A 记录，指向服务器公网 IP

# 3. SSH 上去
ssh root@你的服务器IP

# 4. 装 Docker
curl -fsSL https://get.docker.com | sh

# 5. 拉代码起服务
git clone <你的仓库地址> /opt/niumadate
cd /opt/niumadate
docker compose up -d

# 6. 挂 Caddy 做 HTTPS（自动申请证书）
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# 把里面的 your-domain.com 改成你的域名
sudo systemctl reload caddy
```

> ⚠️ 服务器上要改一处：`docker-compose.yml` 里 `restart: unless-stopped` 已经够用，
> 但 **Caddy 反代的端口必须是 8787** —— 和 compose 里的映射保持一致（默认就是）。

## 服务器在国内的话

- **必须备案**，1~3 周，备案通过前 80/443 不能用
- **Docker 拉镜像也会卡**，要按 [DEPLOY.md](DEPLOY.md) 配 systemd 代理

所以：**想省事就选香港，想省钱才选国内 + 备案。**

---

# ⭐ 后台口令在哪找

**这是全篇最常被问的一个。** 先记住一句话：

> **数据不在容器里，在一个叫「数据卷」的地方。**
> 所以**删掉容器、重建容器、升级镜像，口令都不会变**；
> 只有 `docker compose down -v`（那个 `-v`）才会把它一起删掉。

## 情况 1：容器正在跑（最常用）

```powershell
cd <你放代码的目录>
docker compose exec -T app cat /data/admin-password
```

输出就是口令，形如 `ABCD-EFGH-JKLM`。

## 情况 2：容器停了或删了（数据卷还在）

这时上面那条会报 **`service "app" is not running`** —— 别慌，数据还在，换个方式读：

```powershell
# 先确认卷还在
docker volume ls

# 拿一个临时容器挂上这个卷，读出来就退出
docker run --rm -v niumadate_niumadate-data:/data niumadate:latest cat /data/admin-password
```

> 卷的名字是 `<compose项目名>_<卷名>`，所以是 `niumadate_niumadate-data`。
> 不确定的话先 `docker volume ls` 看一眼。

## 情况 3：翻启动日志

**第一次启动时**这段是打印在日志里的：

```powershell
docker compose logs app | Select-String "后台口令"
```

> 注意：日志会滚动。容器重建过、或者跑很久了，这条可能已经翻不到了 ——
> 所以**第一次看到就抄下来**。

## 情况 4：不是 Docker 部署的（裸机）

```bash
cat /opt/niumadate/apps/server/data/admin-password
```

## 情况 5：忘了，或者想换成自己的

```powershell
# 办法一：设环境变量（推荐，写进 docker-compose.yml 的 environment）
#   ADMIN_PASSWORD: 你的新口令
docker compose up -d

# 办法二：直接改卷里的文件
docker run --rm -v niumadate_niumadate-data:/data niumadate:latest \
  sh -c "echo 你的新口令 > /data/admin-password"
docker compose up -d

# 办法三：删掉让程序重新生成一个
docker run --rm -v niumadate_niumadate-data:/data niumadate:latest \
  rm /data/admin-password
docker compose up -d
docker compose logs app | Select-String "后台口令"
```

> 口令改了之后，**已经登录的浏览器会失效**（token 里的签名对不上了），重新登一次即可。

## 口令为什么不能设一个简单的

这个仓库是**公开的**，任何写死的默认值都等于公开。
会话密钥尤其危险 —— 知道它的人可以**自己签一个合法 token**，连口令都不用猜。

所以默认行为是：**没配就随机生成一个强口令**（3 组 4 位，字母表不含容易看错的 `0 O 1 I l`）。

---

# 上线后的验收清单

按顺序过一遍，都通过才算真的上线了：

| # | 检查 | 怎么查 |
| --- | --- | --- |
| 1 | 服务活着 | `curl.exe http://127.0.0.1:8787/api/health` 返回 `{"status":"ok"...}` |
| 2 | 公网能开 | **手机关 WiFi，用流量**打开你的链接 |
| 3 | HTTPS 有效 | 地址栏是锁，不是「不安全」 |
| 4 | 能提交一份 | 手机上选身份 → 选时间 → 提交，拿到回执 |
| 5 | 后台能进 | 打开 `/admin`，用口令登录 |
| 6 | 后台能看到刚提交的 | 列表里出现第 4 步那条 |
| 7 | **真实 IP 是对的** | `docker compose logs app` 里 `remoteAddress` **不是** `172.x` 开头 |
| 8 | 分享卡片正常 | 把链接发到微信，看卡片标题和图标 |

> **第 7 条最容易漏。** 如果 `remoteAddress` 全是 `172.18.0.1`，说明 `TRUST_PROXY` 没开，
> **所有好友在限流眼里是同一个人** —— 一个人刷几条就把大家全挡了。
> compose 里默认已经打开，用别的部署方式要自己设。

---

# 出问题怎么查

| 现象 | 十有八九是 |
| --- | --- |
| 手机打不开，电脑能打开 | Windows 防火墙没放行 8787 |
| 同一个 WiFi 能开，4G 打不开 | **正常** —— `192.168.` 是私有地址，出不了你家路由器。要公网地址就走隧道或服务器 |
| 隧道地址打开是 502 | 应用没在跑。先 `docker compose ps` |
| 服务器上 HTTPS 失败 | Caddy 反代的端口和 compose 映射的端口对不上 |
| 「登录已过期」但口令没错 | **登录被限流了**（默认 10 分钟 40 次），等一会儿 |
| 好友说「提交太频繁」 | 限流。确认 `TRUST_PROXY=true`，否则所有人共用一个桶 |
| 改了配置没生效 | 后端读的是 `data/config.json`，改完不用重启；但**改了环境变量要重启** |
| 容器明明停了端口还通 | 停错了容器。`docker ps` 看清楚哪个在跑 |

完整的问题清单在 [DEPLOY.md](DEPLOY.md) 的「第 10 步」。

---

# 备份（上线之后一定要做）

数据全在那一个卷里。备份就是备份它：

```bash
# 服务器上
docker run --rm -v niumadate_niumadate-data:/data -v "$(pwd)":/backup \
  alpine tar czf /backup/niumadate-data.tgz -C /data .
```

拷回来之后，恢复就是反过来：

```bash
docker run --rm -v niumadate_niumadate-data:/data -v "$(pwd)":/backup \
  alpine tar xzf /backup/niumadate-data.tgz -C /data
```

> **别忘了 `app.db-wal`** —— SQLite 的预写日志，里面可能还有没落盘的数据。
> 整个 `/data` 一起打包最省心。

# 把本机的应用暴露到公网（Cloudflare Tunnel）

**适用场景**：还没买服务器，但想让朋友**在公网上**打开链接看看效果。

原理是让 `cloudflared` **主动往外连** Cloudflare，所以：

- 不用买服务器
- 不用域名也能试（临时地址）
- **家里没有公网 IP 也行**，不用在路由器上做端口映射
- **不需要备案**（全程没有任何中国大陆的服务器参与）

---

## 两种隧道，先想清楚要哪种

| | 临时隧道（Quick Tunnel） | 固定隧道（Named Tunnel） |
| --- | --- | --- |
| 命令 | `cloudflared tunnel --url http://localhost:8788` | 见下面 |
| 地址 | `https://随机三个词.trycloudflare.com` | **`https://niuma.你的域名.com`** |
| 每次重启 | **换一个新地址** ✗ | 永远是这个 ✓ |
| 需要域名 | 不用 | **要**（十几块一年） |
| 需要 Cloudflare 账号 | 不用 | 要（免费） |
| 适合 | 临时给人看一眼 | **发给朋友长期用** |

**临时隧道适合"我现在就想让人看一眼"；要发到群里长期用，必须固定隧道** ——
否则你今天发出去的链接，明天重开一次就失效了。

---

## 一、临时隧道（30 秒）

```powershell
# 先确保应用在跑
docker compose up -d

# 起隧道（这个窗口别关）
& "E:\tools\cloudflared.exe" tunnel --url http://localhost:8788
```

输出里会有一行：

```
Your quick Tunnel has been created! Visit it at:
https://strictly-bernard-discs-diy.trycloudflare.com
```

**这个地址就是公网地址**，手机用流量能打开 ✓ 但重启就变 ✗

---

## 二、固定隧道（自己的域名）

### 需要准备

| | 大概花多少 | 说明 |
| --- | --- | --- |
| 一个域名 | **十几块/年** | 阿里云、腾讯云、Namecheap 都行。`.top` `.xyz` `.icu` 首年最便宜 |
| Cloudflare 账号 | **免费** | <https://dash.cloudflare.com/sign-up> |
| `cloudflared` | 免费 | 已经下好在 `E:\tools\cloudflared.exe` |

### 第 1 步：把域名交给 Cloudflare 管

1. 先买好域名
2. 登录 Cloudflare → **Add a site** → 填你的域名 → 选 **Free** 套餐
3. Cloudflare 会给你**两个 NS 地址**（形如 `xxx.ns.cloudflare.com`）
4. **回到你买域名的地方**，把域名的 NS 改成这两个
5. 等生效（几分钟到几小时，Cloudflare 面板上会变成 Active）

> 只有 NS 交给 Cloudflare，它才能给你签 HTTPS 证书、才能把域名指到隧道上。

### 第 2 步：登录并建隧道

```powershell
$cf = "E:\tools\cloudflared.exe"

# 会弹出浏览器，选你刚加的那个域名，点授权
& $cf tunnel login

# 建一条隧道（名字随便起）
& $cf tunnel create niumadate
```

`create` 会打印一串 **UUID**（形如 `4a1b2c3d-5e6f-...`），**记下来**，
下面要用，配置文件名也是它。

### 第 3 步：把一个子域名指到这条隧道

```powershell
& $cf tunnel route dns niumadate niuma.你的域名.com
```

这会自动在 Cloudflare 里加一条 CNAME 记录 ✓ 不用手动去配 DNS。

### 第 4 步：写配置文件

新建 `C:\Users\<你的用户名>\.cloudflared\config.yml`：

```yaml
tunnel: 把刚才那串-UUID-填这里
credentials-file: C:\Users\<你的用户名>\.cloudflared\把刚才那串-UUID-填这里.json

ingress:
  - hostname: niuma.你的域名.com
    service: http://localhost:8788
  # 最后这条是兜底，必须有
  - service: http_status:404
```

### 第 5 步：跑起来

```powershell
& $cf tunnel run niumadate
```

然后浏览器打开 **`https://niuma.你的域名.com`** —— HTTPS 证书 Cloudflare 自动签，不用管 ✓

---

## 三、别让它每次开机都要手动跑

临时和固定隧道都是**前台进程**，窗口一关就断。想省事有两种做法：

**做法 A：两个 PowerShell 窗口常开**（最土但最稳）

```powershell
# 窗口 1
cd E:\niumadate; docker compose up -d

# 窗口 2
& "E:\tools\cloudflared.exe" tunnel run niumadate
```

**做法 B：把 cloudflared 装成 Windows 服务**（开机自启，崩了自动重启）

```powershell
& "E:\tools\cloudflared.exe" service install
& "E:\tools\cloudflared.exe" service start

# 看状态 / 卸掉
Get-Service cloudflared
& "E:\tools\cloudflared.exe" service uninstall
```

---

## 四、这种方案的三个硬伤

| 问题 | 说明 |
| --- | --- |
| **电脑不能关** | 一睡一重启，链接就死。容器和隧道都不会自己回来（除非都做成自启服务） |
| **国内访问可能慢** | 流量绕道 Cloudflare 边缘（可能在境外）。**手机用流量实测一下**，转圈太久就要考虑换方案 |
| **家里宽带上行有限** | 每个访客都从你家宽带上行出。人少没事，几十个人同时刷就卡 |

### 什么时候该改用真正的服务器

- 朋友说「打不开 / 很慢」
- 你不想让电脑一直开着
- 要给几十个人用

那就按 `docs/DEPLOY.md` 买台**香港轻量服务器**（28 元/月）——
同样的代码、同样的 `docker compose up -d`，只是从你家换到机房。

---

## 五、安全提醒

隧道是**把本机端口开到公网**。这个应用本身做得比较稳（后台是指令 + HMAC token、口令自动随机生成、有登录限流），但注意：

- **别把 8788 以外的端口也穿出去**（尤其是 Docker 的 2375、或者是别的开发服务）
- 隧道地址**知道的人就能访问**，别发到公开的地方
- 用完就 `Ctrl+C` 停掉，别让它一直开着

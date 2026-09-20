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
| 命令 | `cloudflared tunnel --url http://localhost:8787` | 见下面 |
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
cloudflared tunnel --url http://localhost:8787
```

> 下面一律按 **8787** 写 —— 那是 `docker compose` 起的实例。
> 如果你用的是演练环境 `node scripts/sandbox.mjs`（**故意用 8788**，免得和主实例撞），
> 把下面所有 `8787` 换成 `8788` 即可。

输出里会有一行：

```
Your quick Tunnel has been created! Visit it at:
https://strictly-bernard-discs-diy.trycloudflare.com
```

**这个地址就是公网地址**，手机用流量能打开 ✓ 但重启就变 ✗

---

## 二、固定隧道（自己的域名）

### 需要准备

| | 花多少 | 在哪弄 |
| --- | --- | --- |
| 一个域名 | 首年 **3~15 元**，续费 30~80 元/年 | 阿里云 / 腾讯云（最省事）、Namecheap 等 |
| Cloudflare 账号 | **免费** | <https://dash.cloudflare.com/sign-up>，邮箱就能注册 |
| `cloudflared` | 免费 | 官网下载一个 exe，放 PATH 里或本目录 |

### ⭐ 需要备案吗？**不需要**

这是最多人卡住的地方，先说清楚：

- **备案是针对「中国大陆的服务器」的** —— 你的应用跑在**自己家电脑**上，
  流量从 Cloudflare 隧道出去，**全程没有任何大陆服务器参与** ✓
- 所以**不用备案** ✓✓✓
- 域名在国内注册商买**也不影响** —— **域名实名认证 ≠ 网站备案**，是两件事，别混

（只有当你把应用部署到**大陆的服务器**上，才需要备案。香港服务器同样不用。）

### 第 1 步：买域名

1. 打开阿里云 / 腾讯云 → **域名注册** → 搜一个名字 → 加入清单 → 付款
2. `.com` 最正式也最贵；`.top` `.xyz` `.icu` 首年经常几块钱
3. ⚠️ **一定要看「续费价」那一栏** —— 首年 5 元、明年 60 元的套路很常见
4. 买完要**实名认证**（身份证 + 人脸，几分钟）—— 不实名域名会被暂停解析 ✗

### 第 2 步：把域名交给 Cloudflare 管

1. 登录 Cloudflare → **Add a site** → 填你的域名 → 选 **Free** 套餐
2. Cloudflare 会给你**两个 NS 地址**，形如：
   ```
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```
3. **回到阿里云**改 NS：
   `域名控制台` → 点你的域名 → `DNS 修改`（或 `DNS 服务器`）
   → 选「**修改 DNS 服务器**」→ 选「**自定义 DNS**」→ 填那两个地址 → 保存
4. **等** —— 快则几分钟，慢则几小时。Cloudflare 面板上从 `Pending` 变成 `Active` 才算好

**验证 NS 改成功没有：**

```powershell
# 应该输出 Cloudflare 给你的那两个 NS
nslookup -type=NS 你的域名.com 223.5.5.5
```

> 只有 NS 交给 Cloudflare，它才能给你**自动签 HTTPS 证书**、才能把域名指到隧道上。
> 这一步没生效，后面的 `tunnel login` 里**根本选不到你的域名** ✗

### 第 3 步：登录并建隧道

```powershell
$cf = "cloudflared"   # 在 PATH 里，或者换成它的完整路径

# 会弹出浏览器，选你刚加的那个域名，点授权
& $cf tunnel login

# 建一条隧道（名字随便起）
& $cf tunnel create niumadate
```

`create` 会打印一串 **UUID**（形如 `4a1b2c3d-5e6f-...`），**记下来**，
下面要用，配置文件名也是它。

### 第 4 步：把一个子域名指到这条隧道

```powershell
& $cf tunnel route dns niumadate niuma.你的域名.com
```

这会自动在 Cloudflare 里加一条 CNAME 记录 ✓ 不用手动去配 DNS。

### 第 5 步：写配置文件

新建 `%USERPROFILE%\.cloudflared\config.yml`：

```yaml
tunnel: 把刚才那串-UUID-填这里
credentials-file: %USERPROFILE%\.cloudflared\把刚才那串-UUID-填这里.json

ingress:
  - hostname: niuma.你的域名.com
    service: http://localhost:8787
  # 最后这条是兜底，必须有
  - service: http_status:404
```

### 第 6 步：跑起来

```powershell
& $cf tunnel run niumadate
```

然后浏览器打开 **`https://niuma.你的域名.com`** —— HTTPS 证书 Cloudflare 自动签，不用管 ✓

---

## 三、每一步怎么验证

固定隧道涉及「浏览器点几下」和「命令行跑几条」两类操作，**每步都能验证**。
卡住的时候按这张表查，能立刻定位是哪一步没生效：

| 做完 | 验证命令 | 看到什么才算过 |
| --- | --- | --- |
| 买完域名 | 登录注册商控制台 | 域名状态是「正常」，且已实名 |
| 改完 NS | `nslookup -type=NS 你的域名.com 223.5.5.5` | 出现 `xxx.ns.cloudflare.com` |
| NS 生效 | Cloudflare 面板看域名 | 从 `Pending` 变成 **`Active`** |
| `tunnel login` | 浏览器弹出的授权页 | 页面里**能选到你的域名**（选不到 = NS 还没生效） |
| `tunnel create` | `cloudflared tunnel list` | 列出 `niumadate` 和它的 UUID |
| `tunnel route dns` | `nslookup niuma.你的域名.com 223.5.5.5` | 解析到一个 Cloudflare 的 IP |
| 写配置 | `cloudflared tunnel ingress validate` | `All good` |
| `tunnel run` | 看窗口输出 | `Registered tunnel connection` |
| 全部完成 | 手机 4G 打开 `https://niuma.你的域名.com` | 出页面，地址栏有锁 |

---

## 四、别让它每次开机都要手动跑

临时和固定隧道都是**前台进程**，窗口一关就断。想省事有两种做法：

**做法 A：两个 PowerShell 窗口常开**（最土但最稳）

```powershell
# 窗口 1
cd <你放代码的目录>; docker compose up -d

# 窗口 2
cloudflared tunnel run niumadate
```

**做法 B：把 cloudflared 装成 Windows 服务**（开机自启，崩了自动重启）

```powershell
cloudflared service install
cloudflared service start

# 看状态 / 卸掉
Get-Service cloudflared
cloudflared service uninstall
```

---

## 五、这种方案的三个硬伤

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

## 六、安全提醒

隧道是**把本机端口开到公网**。这个应用本身做得比较稳（后台是指令 + HMAC token、口令自动随机生成、有登录限流），但注意：

- **别把 8787 以外的端口也穿出去**（尤其是 Docker 的 2375、或者是别的开发服务）
- 隧道地址**知道的人就能访问**，别发到公开的地方
- 用完就 `Ctrl+C` 停掉，别让它一直开着

## 鍚庡彴涓嶈闇插湪鍏綉涓?
**闅ч亾鏄妸鏁翠釜绔欑偣鍘熸牱鎼嚭鍘荤殑** 鈥斺€?瀹冧笉鍖哄垎銆屽ソ鍙嬮〉闈€嶅拰銆屽悗鍙般€嶃€?涓嶇鐨勮瘽锛屼换浣曚汉鎵撳紑 `https://浣犵殑鍩熷悕/admin` 閮借兘鐪嬪埌鍚庡彴鐧诲綍椤碉紝
鍙墿鍙ｄ护涓€閬撻槻绾夸簡銆?
### 宸茬粡榛樿鎸′綇浜?
`scripts/tunnel-config.mjs` 鐢熸垚鐨勯厤缃噷锛?*灞忚斀瑙勫垯鍐欏湪鏀捐瑙勫垯鍓嶉潰**
锛坈loudflared 浠庝笂寰€涓嬪尮閰嶏紝绗竴鏉″懡涓氨缁撴潫锛夛細

```yaml
ingress:
  - hostname: niumadate.xyz
    path: ^/admin          # 鍚庡彴椤甸潰 鈫?鍏綉 404
    service: http_status:404
  - hostname: niumadate.xyz
    path: ^/api/admin      # 鍚庡彴鎺ュ彛涔熻鎸?鈥斺€?鍙尅椤甸潰涓嶆尅鎺ュ彛绛変簬娌℃尅
    service: http_status:404
  - hostname: niumadate.xyz
    service: http://127.0.0.1:8787
  - service: http_status:404
```

鑷繁鐢ㄥ悗鍙?*瀹屽叏涓嶅彈褰卞搷**锛氱洿鎺ュ紑 `http://127.0.0.1:8787/admin`銆?
鎯宠鍚庡彴涔熻兘浠庢墜鏈哄叕缃戣闂紝鎶婁笂闈㈤偅涓ゆ潯 `http_status:404` 鍒犳帀鍐?`cloudflared tunnel run` 鍗冲彲 鈥斺€?浣嗛偅鏍风瓑浜庢妸鐧诲綍椤垫寕鍦ㄥ叕缃戜笂锛岃嚜宸辨兂娓呮銆?
### 涓や釜蹇呴』杩欎箞鍐欑殑鍦版柟锛堥兘韪╄繃锛?
| 鍐欐硶 | 涓轰粈涔?|
| --- | --- |
| `service: http://127.0.0.1:8787` | **涓嶈兘鍐?`localhost`**銆俉indows 涓?localhost 甯稿厛瑙ｆ瀽鍒?IPv6 `::1`锛岃€?compose 鐨?`127.0.0.1:8787:8787` 鍙粦浜?IPv4 鈫?闅ч亾杩炰笉涓婃簮锛?*鍏綉鍏ㄧ嚎 502**锛堝疄娴嬭俯杩囦竴娆★級 |
| `ports: "127.0.0.1:8787:8787"` | 鍙粦**鏈満鍥炵幆**銆傝繖鏍峰悓涓€涓?WiFi 涓嬬殑鍒汉涔熸墦涓嶅紑 `192.168.x.x:8787/admin`銆傞毀閬撳拰 Caddy / Nginx 閮芥槸浠庡涓绘満杩?127.0.0.1锛岀収鏍峰寰楃潃 |

### 楠岃瘉锛堝洓鏉￠兘瑕佸锛?
```powershell
# 鍏綉锛氬ソ鍙嬮〉闈㈤€氾紝鍚庡彴 404
curl.exe --resolve niumadate.xyz:443:<Cloudflare鐨処P> -o NUL -s -w "%{http_code}\n" https://niumadate.xyz/
curl.exe --resolve niumadate.xyz:443:<Cloudflare鐨処P> -o NUL -s -w "%{http_code}\n" https://niumadate.xyz/admin
curl.exe --resolve niumadate.xyz:443:<Cloudflare鐨処P> -o NUL -s -w "%{http_code}\n" https://niumadate.xyz/api/admin/login

# 鏈満锛氬悗鍙扮収甯?200
curl.exe -o NUL -s -w "%{http_code}\n" http://127.0.0.1:8787/admin
```

鏈熸湜锛歚200` / `404` / `404` / `200`銆?
---

## 鏈湴璋冭瘯锛氫笁绉嶉渶姹傦紝涓夌鍋氭硶

### 1. 鍙槸鎯崇敤鍚庡彴 鈫?鐩存帴寮€鏈満鍦板潃

```
http://127.0.0.1:8787/admin
```

涓嶅彈闅ч亾灞忚斀褰卞搷锛堝睆钄藉彧绠″叕缃戦偅鏉¤矾锛夈€?
### 2. 鏀逛簡浠ｇ爜鎯宠瘯锛屼絾**涓嶆兂褰卞搷姝ｅ湪鐢ㄧ殑閭ｄ唤**

鐢ㄦ紨缁冪幆澧冿紝**鎹釜绔彛銆佹崲涓暟鎹洰褰曘€佷唬鐮佽繕鏄悓涓€浠?*锛?
```cmd
pnpm -r run build
node scripts/sandbox.mjs start      REM 璧峰湪 8788锛屾暟鎹湪 .sandbox/
node scripts/sandbox.mjs status     REM 鐪嬪畠娲荤潃娌°€佸彛浠ゆ槸浠€涔?node scripts/sandbox.mjs stop       REM 鍋滄帀锛屾暟鎹暀鐫€
node scripts/sandbox.mjs nuke       REM 杩炴暟鎹竴璧峰垹骞插噣
```

**8787 閭ｄ唤鐪熷疄鐨勶紙濂藉弸姝ｅ湪鐢ㄧ殑锛変竴鏍规睏姣涢兘涓嶄細鍔?* 鈥斺€?瀹冪殑搴撱€侀厤缃€佺敓鎴愮殑鍙ｄ护鍏ㄥ湪鏁版嵁鍗烽噷锛屽拰 `.sandbox/` 浜掍笉鐩稿共銆?
### 3. 鏀瑰姩涓嶆兂涓婄嚎涓?
- **鍏綉鐪嬪埌鐨勬槸瀹瑰櫒閲岀殑閭ｄ唤**銆備綘鍙敼鏈湴浠ｇ爜銆佷笉閲嶅缓闀滃儚锛屽叕缃戝氨涓嶄細鍙樸€?- 瑕佺湡鐨勬帹鍒板叕缃戯細`docker compose up -d --build`锛?*VPN 寰楀紑鐫€**锛屽惁鍒欐媺涓嶅埌鍩虹闀滃儚锛?- 瑕佹帹鍒?GitHub锛歚git push`锛堜笉鎺ㄥ氨鍙湪浣犳湰鏈猴級

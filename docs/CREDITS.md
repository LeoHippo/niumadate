# 素材来源与授权

## 动画 emoji

`apps/web/public/emoji/*.webp` 来自 **Google Noto Animated Emoji**。

- 项目：<https://googlefonts.github.io/noto-emoji-animation/>
- 仓库：<https://github.com/googlefonts/noto-emoji>
- 授权：**CC BY 4.0** —— 可自由使用、修改、再分发，署名即可（包括商用）。
- 用法：署名见本文件；程序里由 `apps/web/src/big-emoji.tsx` 引用。

### 做了哪些处理

原始素材是 512×512、单个 1–2 MB 的 GIF，直接用会让好友在微信里加载很惨。
用 Pillow 处理成 **112×112、每 3 帧抽 1 帧、WebP**，单个降到 40–95 KB。

**Pillow 必须装进虚拟环境，不要装进系统 Python**（见 `~/.dsh/AGENTS.md` 的隔离约定）：

```powershell
# 一次性工具，venv 建在临时目录，用完整个删掉
python -m venv .venv-emoji
.\.venv-emoji\Scripts\python.exe -m pip install Pillow
.\.venv-emoji\Scripts\python.exe one_emoji.py <码点> apps\web\public\emoji
Remove-Item -Recurse -Force .venv-emoji
```

> **踩过的坑**：不要用 Pillow 把调色板（P 模式）帧直接存成 WebP。
> `WebPImagePlugin._save_all` 会拿 `im.info["background"]` 去查调色板，
> 索引越界就抛 `ValueError: not enough values to unpack (expected 3, got 0)`。
> 而且清掉 `transparency` 会把透明背景变成实心方块。
> 正确做法：**RGB 量化后重新 putalpha，按 RGBA 帧存**。

## 牛马吉祥物

`NiumaMark`（牛角 + 马耳 + 马鬃 + 牛斑）是**本仓库手绘的 SVG**，见
`apps/web/src/components.tsx`。没有版权问题，随便用。

## 应用图标

`apps/web/public/favicon.svg` 与 `apple-touch-icon.png` 都由 `NiumaMark` 生成，
同样是自己的东西。

import { useState } from 'react';

/**
 * 带动画素材的 emoji。
 *
 * 素材是 **Google Noto Animated Emoji**（CC-BY 4.0，可自由使用，署名见 docs/CREDITS.md），
 * 已经下到 `public/emoji/` 并压过：112px、每 3 帧抽 1 帧、WebP，单个 40~95 KB。
 *
 * 存的是 **WebP 动图**。万一浏览器放不了（极老的内核），`onError` 会退回普通
 * emoji 字符 —— 最差就是回到改造之前的样子，不会开天窗。
 */
const ANIMATED: Record<string, string> = {
  '🥵': '1f975',
  '🥶': '1f976',
  '😭': '1f62d',
  '🥳': '1f973',
  '😴': '1f634',
  '🍻': '1f37b',
  '💅': '1f485',
  '🥰': '1f970',
  '🏠': '1f3e0',
  '🫠': '1fae0',
};

export function BigEmoji({
  char,
  size,
  className,
}: {
  char: string;
  size: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const code = ANIMATED[char.trim()];

  if (code === undefined || broken) {
    return (
      <span
        className={className}
        style={{ fontSize: Math.round(size * 0.86), lineHeight: 1 }}
        aria-hidden="true"
      >
        {char}
      </span>
    );
  }

  return (
    <img
      className={className === undefined ? 'big-emoji' : `big-emoji ${className}`}
      src={`/emoji/${code}.webp`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

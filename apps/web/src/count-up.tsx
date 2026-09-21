import { useEffect, useRef, useState } from 'react';

/**
 * 数字滚动增长 —— 网易云年度总结的招牌手法。
 *
 * 它的作用不是"好看"，是**引导视线**：
 * 一个静止的数字你一眼扫过；一个正在涨的数字你会**盯着它涨完**。
 * 网易官方那篇幕后说得很清楚：「动效不能喧宾夺主，得让注意力聚焦到文字信息上」——
 * 数字滚动恰恰是**把注意力引到数字上**，所以它不喧宾夺主，它就是主角。
 *
 * 用 requestAnimationFrame 手写，不引 countUp.js 之类的库（那点功能不值一个依赖）。
 * 缓动用 easeOutExpo：开始快、结尾稳稳停住 —— 停住那一下才有"落定"的感觉。
 */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    // 数字小的时候也至少给它一点时间演，不然"3"是一闪而过的
    const total = Math.max(420, duration);
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      // easeOutExpo：前段冲得快，末段稳稳收住
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round(target * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

/**
 * 逐句浮现：一屏里的几行文字**按次序**出现，而不是一起冒出来。
 *
 * 这是"不够动效"真正的答案 —— 不是加更多粒子，
 * 是给**已经在那儿的内容**排出一个**先后的节奏**。
 * 网易云每一屏都是这么做的：先出数字，再出一句话，最后出落款。
 *
 * 实现上很轻：一个递增的 CSS 变量当延迟，剩下的交给 CSS。
 */
export function Lines({
  children,
  step = 170,
  from = 0,
  className,
}: {
  children: React.ReactNode[];
  /** 每一行之间差多少毫秒 */
  step?: number;
  /** 第一行等多久（一般用来等上一屏的过渡走完） */
  from?: number;
  className?: string;
}) {
  return (
    <>
      {children.map((child, i) => (
        <span
          key={i}
          className={className === undefined ? 'reveal-line' : `reveal-line ${className}`}
          style={{ animationDelay: `${from + i * step}ms` }}
        >
          {child}
        </span>
      ))}
    </>
  );
}

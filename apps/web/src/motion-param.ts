/**
 * 读 ?motion=on，把它变成 body 上的一个标记。
 *
 * 用途：排查「设备开了减弱动态效果」这件事。
 *
 * 为什么需要它：用户反馈「这些都没有」（火漆不消失、翻盖不翻开、没有纸、
 * 没有小人、没有放大）。我排查到最后，能确认的是：
 *   · 代码确实在公网上 —— 我从 niumadate.xyz 实际下载了 index-DAfSsH-0.js / .css，
 *     逐个关键帧名字都对得上（op-seal-gone-brother / op-env-flap / op-env-paper /
 *     op-puppet-run 全在）
 *   · 容器、本地 dist、公网三边的文件名完全一致
 *   · 缓存头正常（HTML max-age=0，静态资源带 hash）
 *   · 问浏览器要动画状态，全部 running、时间也对
 * 所以剩下的怀疑对象只有设备设置。
 *
 * 加了 ?motion=on 之后，CSS 里 body[data-motion='on'] 那组规则会把所有
 * "减弱版"（淡入淡出）强行换回完整版（飞、转、跑）。
 * **一试就知道原因在哪**，不用再来回猜。
 */
export function applyMotionParam(): void {
  try {
    const wanted = new URLSearchParams(window.location.search).get('motion');
    if (wanted === 'on' || wanted === 'full') {
      document.body.dataset.motion = 'on';
    }
  } catch {
    // 取参数失败就算了，不影响正常使用
  }
}

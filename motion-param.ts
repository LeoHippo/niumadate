/**
 * 读 ?motion=on，把它变成 body 上的一个标记。
 *
 * 用途：排查"设备开了减弱动态效果"这件事。
 * 代码已经确认部署到公网（我从 niumadate.xyz 实际下载包逐个关键帧核对过），
 * 缓存头也正常，所以剩下的怀疑对象只有设备设置。
 *
 * 加了 ?motion=on 之后，CSS 里 body[data-motion='on'] 那组规则会把
 * 所有"减弱版"（淡入淡出）强行换回完整版（飞、转、跑）。
 * 用户一试就知道原因在哪，不用来回猜。
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

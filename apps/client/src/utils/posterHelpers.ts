/** 海报绘制共享的工具函数 */

/**
 * 海报位图的渲染倍数：**固定 3x，不跟设备 dpr 走**。
 *
 * 设备 dpr 在开发者工具里是 2（甚至 1），位图只有 680px 宽，
 * 存出去的照片类海报在 3x 手机屏上就是糊的。固定 3x 让任何环境下
 * 导出的图都是 1020px 宽。配套地，导出时必须显式传
 * `destWidth/destHeight = 位图尺寸`（见 chartExport 的说明），
 * 否则微信默认还会再乘一次屏幕像素密度，等于插值放大、白渲染了。
 */
export const POSTER_RENDER_SCALE = 3

/** 用画布节点加载网络图片，超时/失败返回 null；timeoutMs 默认 3 秒 */
export function loadCanvasImage(
  node: any,
  src?: string,
  timeoutMs = 3000,
): Promise<any> {
  return new Promise(resolve => {
    if (!src) {
      resolve(null)
      return
    }
    const img = node.createImage()
    let settled = false
    const done = (v: any) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    img.onload = () => {
      clearTimeout(timer)
      done(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      done(null)
    }
    img.src = src
  })
}

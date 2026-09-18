/** 海报绘制共享的工具函数 */
import Taro from '@tarojs/taro'

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

/** 按 id 取海报 canvas 节点（画布必须是页面里 type="2d" 的专用隐藏画布） */
export function queryPosterNode(canvasId: string, notReadyMsg: string): Promise<any> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true })
      .exec(res => {
        const r = (Array.isArray(res) ? res[0] : res) as { node?: any } | null
        if (!r || !r.node) {
          reject(new Error(notReadyMsg))
          return
        }
        resolve(r.node)
      })
  })
}

/**
 * 固定尺寸海报的画布准备：位图 = 逻辑尺寸 × POSTER_RENDER_SCALE，
 * 返回已按渲染倍数放大过的 ctx（绘制代码可以直接用 CSS 像素坐标）。
 * 尺寸由常量决定、不依赖画布 CSS 布局，避免被压缩。
 */
export async function preparePosterCanvas(
  canvasId: string,
  logicalW: number,
  logicalH: number,
  notReadyMsg: string,
): Promise<{ node: any; ctx: any }> {
  const node = await queryPosterNode(canvasId, notReadyMsg)
  node.width = logicalW * POSTER_RENDER_SCALE
  node.height = logicalH * POSTER_RENDER_SCALE
  const ctx = node.getContext('2d')
  ctx.scale(POSTER_RENDER_SCALE, POSTER_RENDER_SCALE)
  return { node, ctx }
}

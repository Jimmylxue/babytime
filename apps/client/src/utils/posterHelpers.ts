/** 海报绘制共享的工具函数 */

/** 用画布节点加载网络图片，超时/失败返回 null */
export function loadCanvasImage(node: any, src?: string): Promise<any> {
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
    const timer = setTimeout(() => done(null), 3000)
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

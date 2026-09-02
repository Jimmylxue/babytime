/** Canvas 图表共享的绘制小工具 */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** Catmull-Rom → Bezier，曲线平滑且经过每个数据点 */
export const pathSmoothLine = (
  ctx: any,
  pts: { x: number; y: number }[],
) => {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y)
    return
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    )
  }
}

export const roundRect = (
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export const roundTopRect = (
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h)
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

/** 绘制柔光装饰圆（海报装饰） */
export const drawSoftBlob = (
  ctx: any,
  x: number,
  y: number,
  r: number,
  rgb: string,
) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
  gradient.addColorStop(0, `rgba(${rgb}, 0.5)`)
  gradient.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** 实心小爱心（参考图装饰元素） */
export const drawHeart = (
  ctx: any,
  x: number,
  y: number,
  size: number,
  color: string,
) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.beginPath()
  ctx.moveTo(12, 21.35)
  ctx.bezierCurveTo(10.5, 20, 3.5, 15.36, 3.5, 9.5)
  ctx.bezierCurveTo(3.5, 6.42, 5.92, 4, 9, 4)
  ctx.bezierCurveTo(10.24, 4, 11.36, 4.6, 12, 5.5)
  ctx.bezierCurveTo(12.64, 4.6, 13.76, 4, 15, 4)
  ctx.bezierCurveTo(18.08, 4, 20.5, 6.42, 20.5, 9.5)
  ctx.bezierCurveTo(20.5, 15.36, 13.5, 20, 12, 21.35)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

/**
 * 让单行文字放进 maxWidth：先缩小字号（最低 minSize），再截断加省略号
 * 返回实际绘制文案；调用方需用返回的 font 设置 ctx.font
 */
export const fitText = (
  ctx: any,
  text: string,
  maxWidth: number,
  baseFont: string,
  minSize = 9,
): { text: string; font: string } => {
  const m = baseFont.match(/(\d+(?:\.\d+)?)(px)/)
  let size = m ? parseFloat(m[1]) : 11
  const family = m ? baseFont.slice(m.index! + m[0].length) : ' sans-serif'
  const weight = baseFont.includes('bold') ? 'bold ' : ''
  let current = text
  const setFont = (sz: number) => {
    ctx.font = `${weight}${sz}px${family}`
  }
  setFont(size)
  while (size > minSize && ctx.measureText(current).width > maxWidth) {
    size -= 0.5
    setFont(size)
  }
  if (ctx.measureText(current).width > maxWidth) {
    while (current.length > 1 && ctx.measureText(`${current}…`).width > maxWidth) {
      current = current.slice(0, -1)
    }
    current = `${current}…`
  }
  return { text: current, font: `${weight}${size}px${family}` }
}

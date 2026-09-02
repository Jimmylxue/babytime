/** 折线图绘制逻辑：屏幕渲染与分享海报共用 */
import { easeOutCubic, pathSmoothLine, roundRect } from '../../utils/canvasDraw'

export interface LineChartPoint {
  value: number
  /** x 轴文案，如 5/17 */
  label: string
  /** 是否为真实测量点（插值出来的点不画圆点） */
  measured?: boolean
}

export interface LineChartPaintData {
  points: LineChartPoint[]
  unit: string
  /** y 轴最小跨度：身高传 1（cm）、体重传 0.2（kg） */
  minSpan?: number
  color?: string
}

export const LINE_PAD = { top: 34, right: 16, bottom: 24, left: 38 }

export function paintLineChart(
  ctx: any,
  region: { x: number; y: number; w: number; h: number },
  data: LineChartPaintData,
  progress = 1,
) {
  const { points, unit, minSpan = 1, color = '#FF8FA9' } = data
  if (!points.length) return

  ctx.save()
  ctx.translate(region.x, region.y)
  const W = region.w
  const H = region.h

  const values = points.map(p => p.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max((maxValue - minValue) * 0.35, minSpan * 0.6, 0.1)
  const lowerBound = minValue - padding
  const upperBound = maxValue + padding
  const range = upperBound - lowerBound || 1

  const plotLeft = LINE_PAD.left
  const plotRight = W - LINE_PAD.right
  const plotTop = LINE_PAD.top
  const plotBottom = H - LINE_PAD.bottom
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  const toX = (index: number) =>
    points.length === 1
      ? (plotLeft + plotRight) / 2
      : plotLeft + (index / (points.length - 1)) * plotW
  const toY = (value: number) =>
    plotTop + (1 - (value - lowerBound) / range) * plotH

  const pts = points.map((p, index) => ({ x: toX(index), y: toY(p.value) }))

  // 图表均在白卡上，铺白色底避免海报导出时透明区域显示为黑色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // 虚线网格 + y 轴刻度
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#B8B5AC'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#F0EDE6'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ;[
    { v: lowerBound, y: plotBottom },
    { v: (lowerBound + upperBound) / 2, y: (plotTop + plotBottom) / 2 },
    { v: upperBound, y: plotTop },
  ].forEach(tick => {
    ctx.beginPath()
    ctx.moveTo(plotLeft, tick.y)
    ctx.lineTo(plotRight, tick.y)
    ctx.stroke()
    ctx.fillText(tick.v.toFixed(1), plotLeft - 8, tick.y)
  })
  ctx.setLineDash([])

  // x 轴日期：按步长选取 + 保证相邻标签间有最小像素间距，避免重叠
  ctx.fillStyle = '#B8B5AC'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const maxLabels = 7
  const step = Math.max(1, Math.ceil(points.length / 6))
  const minGap = 34
  const labelIndexes: number[] = []
  points.forEach((_, index) => {
    const forced =
      points.length <= maxLabels || index === 0 || index === points.length - 1
    const onStep = index % step === 0
    if (!forced && !onStep) return
    if (
      labelIndexes.length &&
      pts[index].x - pts[labelIndexes[labelIndexes.length - 1]].x < minGap
    ) {
      return
    }
    labelIndexes.push(index)
  })
  // 末点标签必须保留；与前一标签贴得太近时挤掉前者
  if (
    labelIndexes.length &&
    labelIndexes[labelIndexes.length - 1] !== points.length - 1 &&
    pts[points.length - 1].x - pts[labelIndexes[labelIndexes.length - 1]].x <
      minGap
  ) {
    labelIndexes.pop()
  }
  labelIndexes.push(points.length - 1)
  labelIndexes.forEach(index => {
    const x = Math.min(Math.max(pts[index].x, plotLeft + 14), plotRight - 14)
    ctx.fillText(points[index].label, x, plotBottom + 8)
  })

  // 曲线按进度从左向右生长
  ctx.save()
  ctx.beginPath()
  ctx.rect(plotLeft - 6, 0, (plotW + 12) * easeOutCubic(progress), H)
  ctx.clip()

  const gradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom)
  gradient.addColorStop(0, 'rgba(255, 143, 169, 0.28)')
  gradient.addColorStop(1, 'rgba(255, 143, 169, 0)')
  pathSmoothLine(ctx, pts)
  ctx.lineTo(pts[pts.length - 1].x, plotBottom)
  ctx.lineTo(pts[0].x, plotBottom)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  pathSmoothLine(ctx, pts)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  points.forEach((point, index) => {
    if (!point.measured) return
    ctx.beginPath()
    ctx.arc(pts[index].x, pts[index].y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
  })
  ctx.restore()

  // 末点数值气泡
  const fade = Math.max(0, Math.min(1, (progress - 0.75) / 0.25))
  if (fade > 0) {
    const last = points[points.length - 1]
    const lastPt = pts[pts.length - 1]
    const text = `${last.value.toFixed(1)}${unit}`
    ctx.globalAlpha = fade
    ctx.font = 'bold 11px sans-serif'
    const textW = ctx.measureText(text).width
    const badgeW = textW + 20
    const badgeH = 22
    const badgeX = Math.min(
      Math.max(lastPt.x - badgeW / 2, plotLeft - 6),
      W - badgeW - 2,
    )
    let badgeY = lastPt.y - 14 - badgeH
    if (badgeY < 4) badgeY = lastPt.y + 14

    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 11)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

/** WHO 成长曲线绘制逻辑：屏幕渲染与分享海报共用 */
import { easeOutCubic } from '../../utils/canvasDraw'
import { getWhoTable, WHO_INDEX } from '../../utils/whoGrowthStandards'

export interface GrowthCurvePoint {
  /** 测量时的月龄（支持小数） */
  ageMonths: number
  value: number
}

export interface GrowthCurvePaintData {
  metric: 'height' | 'weight'
  gender: 'male' | 'female'
  babyName?: string
  points: GrowthCurvePoint[]
  color?: string
  /** 屏幕上显示内嵌标题；海报中由海报统一绘制传 false */
  drawTitle?: boolean
}

const PERCENTILE_KEYS = ['p3', 'p10', 'p25', 'p50', 'p75', 'p90', 'p97'] as const
const PERCENTILE_LABELS = ['P3', 'P10', 'P25', 'P50', 'P75', 'P90', 'P97']
const AGE_MAX = 36
const AGE_TICKS = [0, 6, 12, 18, 24, 30, 36]

export function paintGrowthCurve(
  ctx: any,
  region: { x: number; y: number; w: number; h: number },
  data: GrowthCurvePaintData,
  progress = 1,
) {
  const {
    metric,
    gender,
    babyName,
    points,
    color = '#FF8FA9',
    drawTitle = true,
  } = data

  ctx.save()
  ctx.translate(region.x, region.y)
  const W = region.w
  const H = region.h

  const table = getWhoTable(metric, gender)
  const unit = metric === 'height' ? 'cm' : 'kg'
  const metricLabel = metric === 'height' ? '身高' : '体重'

  const pad = { top: drawTitle ? 48 : 16, right: 44, bottom: 28, left: 40 }
  const plotLeft = pad.left
  const plotRight = W - pad.right
  const plotTop = pad.top
  const plotBottom = H - pad.bottom
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  const allValues = table.flatMap(row => [
    row[WHO_INDEX.p3],
    row[WHO_INDEX.p97],
  ])
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)
  const yPad = (yMax - yMin) * 0.04
  const yLow = yMin - yPad
  const yHigh = yMax + yPad

  const toX = (month: number) => plotLeft + (month / AGE_MAX) * plotW
  const toY = (v: number) =>
    plotTop + (1 - (v - yLow) / (yHigh - yLow)) * plotH

  // 图表均在白卡上，铺白色底避免海报导出时透明区域显示为黑色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  if (drawTitle) {
    ctx.fillStyle = '#2D2A2E'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(
      `${babyName ? `${babyName}的` : ''}${metricLabel}成长曲线`,
      plotLeft - 2,
      12,
    )
    ctx.font = '9px sans-serif'
    ctx.fillStyle = '#B8B5AC'
    ctx.textAlign = 'right'
    ctx.fillText(`WHO标准 · 0-${AGE_MAX}月龄`, plotRight, 15)
  }

  // 虚线网格 + y 轴刻度
  ctx.font = '9px sans-serif'
  ctx.strokeStyle = '#F0EDE6'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  for (let i = 0; i <= 4; i++) {
    const y = plotBottom - (plotH * i) / 4
    const v = yLow + ((yHigh - yLow) * i) / 4
    ctx.beginPath()
    ctx.moveTo(plotLeft, y)
    ctx.lineTo(plotRight, y)
    ctx.stroke()
    ctx.fillStyle = '#B8B5AC'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(v.toFixed(metric === 'height' ? 0 : 1), plotLeft - 6, y)
  }
  ctx.setLineDash([])

  // x 轴月龄刻度
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  AGE_TICKS.forEach(month => {
    const x = toX(month)
    ctx.fillStyle = '#B8B5AC'
    ctx.fillText(month === AGE_MAX ? `${month}月` : `${month}`, x, plotBottom + 8)
  })

  // WHO 百分位参考曲线
  const labelRows = new Set(['p3', 'p50', 'p97'])
  PERCENTILE_KEYS.forEach((key, pi) => {
    ctx.beginPath()
    table.forEach((row, ri) => {
      const x = toX(row[WHO_INDEX.month])
      const y = toY(row[WHO_INDEX[key]])
      if (ri === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = key === 'p50' ? '#EBB3C0' : '#F3CBD4'
    ctx.lineWidth = key === 'p50' ? 1.4 : 1
    ctx.stroke()

    if (labelRows.has(key)) {
      const lastRow = table[table.length - 1]
      ctx.fillStyle = '#D9A2AF'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        PERCENTILE_LABELS[pi],
        toX(lastRow[WHO_INDEX.month]) + 5,
        toY(lastRow[WHO_INDEX[key]]),
      )
    }
  })

  // 宝宝实测点（带从左向右生长动画）
  const babyPoints = points
    .filter(p => p.ageMonths >= 0 && p.ageMonths <= AGE_MAX)
    .sort((a, b) => a.ageMonths - b.ageMonths)
  if (babyPoints.length > 0) {
    const pts = babyPoints.map(p => ({ x: toX(p.ageMonths), y: toY(p.value) }))

    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft - 6, 0, (plotW + 12) * easeOutCubic(progress), H)
    ctx.clip()

    ctx.beginPath()
    pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)))
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    pts.forEach(pt => {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
    ctx.restore()

    // 最新一点数值气泡
    const fade = Math.max(0, Math.min(1, (progress - 0.75) / 0.25))
    if (fade > 0) {
      const lastPt = pts[pts.length - 1]
      const lastValue = babyPoints[babyPoints.length - 1].value
      const text = `${lastValue.toFixed(1)}${unit}`
      ctx.globalAlpha = fade
      ctx.font = 'bold 11px sans-serif'
      const textW = ctx.measureText(text).width
      const bw = textW + 18
      const bh = 21
      const bx = Math.min(Math.max(lastPt.x - bw / 2, plotLeft - 4), W - bw - 2)
      let by = lastPt.y - 12 - bh
      if (by < plotTop - 10) by = lastPt.y + 12

      ctx.beginPath()
      ctx.moveTo(bx + 10, by)
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, 10)
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, 10)
      ctx.arcTo(bx, by + bh, bx, by, 10)
      ctx.arcTo(bx, by, bx + bw, by, 10)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5)
      ctx.globalAlpha = 1
    }
  }

  ctx.restore()
}

/** 柱状图绘制逻辑：屏幕渲染与分享海报共用 */
import { easeOutCubic, roundTopRect } from '../../utils/canvasDraw'

export interface BarChartPoint {
  /** 用于柱高的数值 */
  value: number
  /** 柱顶展示文案（已格式化） */
  display: string
  /** 底部标签（星期或日期） */
  label: string
}

export interface BarChartPaintData {
  points: BarChartPoint[]
  color?: string
  /** 海报模式：绘制 y 轴刻度与虚线网格 */
  showYAxis?: boolean
  /** 海报模式：y 轴单位（画在左上角） */
  unit?: string
  /** 柱宽，默认 12 */
  barWidth?: number
}

const PAD = { top: 26, bottom: 26 }
const BAR_WIDTH = 12

/** 把数值向上取整到「好看」的刻度（1/1.5/2/2.5/3/5 × 10^n） */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  for (const m of [1, 1.5, 2, 2.5, 3, 5, 10]) {
    if (v <= m * base) return m * base
  }
  return 10 * base
}

export function paintBarChart(
  ctx: any,
  region: { x: number; y: number; w: number; h: number },
  data: BarChartPaintData,
  progress = 1,
) {
  const {
    points,
    color = '#FF8FA9',
    showYAxis = false,
    unit,
    barWidth = BAR_WIDTH,
  } = data
  if (!points.length) return

  ctx.save()
  ctx.translate(region.x, region.y)
  const W = region.w
  const H = region.h

  const showUnitTop = showYAxis && !!unit
  const pad = {
    top: showUnitTop ? 34 : PAD.top,
    right: showYAxis ? 12 : 12,
    bottom: PAD.bottom,
    left: showYAxis ? 44 : 12,
  }
  const plotBottom = H - pad.bottom
  const plotTop = pad.top
  const plotH = plotBottom - plotTop
  const slotW = (W - pad.left - pad.right) / points.length
  const plotLeft = pad.left
  const maxValueRaw = Math.max(...points.map(p => p.value), 1)
  // 海报模式：y 轴从 0 开始、整数步长（如 0/2/4/6/8 或 0/150/.../900）
  let axisMax = maxValueRaw
  if (showYAxis) {
    const steps = maxValueRaw < 100 ? 4 : 6
    const rawStep = (maxValueRaw * 1.08) / steps
    const stepSize = maxValueRaw < 100 ? Math.ceil(rawStep) : niceCeil(rawStep)
    axisMax = stepSize * steps
  }

  // 图表均在白卡上，铺白色底避免海报导出时透明区域显示为黑色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // y 轴刻度 + 虚线网格（海报模式）
  if (showYAxis) {
    const steps = 6
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= steps; i++) {
      const v = (axisMax / steps) * i
      const y = plotBottom - (plotH * i) / steps
      ctx.strokeStyle = '#F5E9E4'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(W - pad.right, y)
      ctx.stroke()
      ctx.fillStyle = '#9A968D'
      ctx.fillText(String(Math.round(v)), plotLeft - 7, y)
    }
    ctx.setLineDash([])
    // 左上角单位
    if (unit) {
      ctx.fillStyle = '#9A968D'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(unit, plotLeft - 34, 4)
    }
  }

  // 基线
  ctx.strokeStyle = showYAxis ? '#E8E2DA' : '#F0EDE6'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(showYAxis ? plotLeft : 0, plotBottom + 0.5)
  ctx.lineTo(W - (showYAxis ? pad.right : 0), plotBottom + 0.5)
  ctx.stroke()

  points.forEach((point, index) => {
    const centerX = plotLeft + slotW * index + slotW / 2
    const x = centerX - barWidth / 2

    // 底部标签
    ctx.font = showYAxis ? '11px sans-serif' : '10px sans-serif'
    ctx.fillStyle = '#8E8B82'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(point.label, centerX, plotBottom + 9)

    if (!(point.value > 0)) return

    // 柱子从左到右依次长出
    const delay = (index / points.length) * 0.35
    const t = easeOutCubic(Math.max(0, Math.min(1, (progress - delay) / 0.65)))
    if (t <= 0) return

    const barH = Math.max((point.value / axisMax) * plotH, 6) * t
    const barY = plotBottom - barH
    const gradient = ctx.createLinearGradient(0, barY, 0, plotBottom)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'rgba(255, 214, 224, 0.35)')
    roundTopRect(ctx, x, barY, barWidth, barH, barWidth / 2)
    ctx.fillStyle = gradient
    ctx.fill()

    // 柱顶数值随柱子升高淡入
    if (t > 0.5) {
      ctx.globalAlpha = (t - 0.5) / 0.5
      ctx.font = showYAxis ? 'bold 12px sans-serif' : 'bold 11px sans-serif'
      ctx.fillStyle = showYAxis ? '#E86A8A' : color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(point.display, centerX, plotBottom - barH - 6)
      ctx.globalAlpha = 1
    }
  })

  ctx.restore()
}

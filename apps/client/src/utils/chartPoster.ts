/** 图表分享海报：宝宝信息 + 品牌头部 + 汇总数据 + 图表 + 本周小结 + 水印 */
import Taro from '@tarojs/taro'
import { drawSoftBlob, drawHeart, roundRect, fitText } from './canvasDraw'
import { paintLineChart, LineChartPaintData } from '../components/LineChart/painter'
import { paintBarChart, BarChartPaintData } from '../components/BarChart/painter'
import {
  paintGrowthCurve,
  GrowthCurvePoint,
} from '../components/GrowthCurveChart/painter'
import { loadCanvasImage } from './posterHelpers'

/** 海报逻辑尺寸（CSS 像素）；位图尺寸 = 逻辑尺寸 × dpr */
export const POSTER_W = 340
export const POSTER_H = 570
/** 专用隐藏海报画布 id（统计页 JSX 中挂载），与屏幕上的图表画布无关 */
export const POSTER_CANVAS_ID = 'chart-poster-canvas'

export interface ChartPosterOptions {
  kind: 'line' | 'bar' | 'growth'
  /** 图表标题（如「喂奶次数」「奶量 (ml)」「身高成长曲线」） */
  title: string
  babyName?: string
  avatarUrl?: string
  genderText?: string
  /** 统计周期（画在右上角日期胶囊里，如「8/27 – 9/2」） */
  rangeText?: string
  /** 元信息分段（如 ['近7天共 5055ml', '日均 722ml']），竖线分隔绘制 */
  metaTexts?: string[]
  /** 小结卡标题（如「本周小结」「成长小结」） */
  reviewTitle?: string
  /** 小结卡文案 */
  reviewText?: string
  color?: string
  /** 小程序码图片地址 */
  miniProgramCodeUrl?: string
  data: LineChartPaintData | BarChartPaintData | {
    metric: 'height' | 'weight'
    gender: 'male' | 'female'
    points: GrowthCurvePoint[]
  }
}

function drawCircleAvatar(
  ctx: any,
  avatar: any,
  x: number,
  y: number,
  d: number,
) {
  // 外圈淡粉光环
  ctx.beginPath()
  ctx.arc(x + d / 2, y + d / 2, d / 2 + 4, 0, Math.PI * 2)
  ctx.fillStyle = '#F9DCE2'
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    ctx.drawImage(avatar, x, y, d, d)
  } else {
    ctx.fillStyle = '#FFD3DC'
    ctx.fillRect(x, y, d, d)
    ctx.font = '22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('👶', x + d / 2, y + d / 2 + 2)
  }
  ctx.restore()
  // 白色描边
  ctx.beginPath()
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function drawTextWithHeart(
  ctx: any,
  text: string,
  x: number,
  y: number,
  font: string,
  textColor: string,
  heartSize: number,
  heartColor: string,
) {
  ctx.font = font
  ctx.fillStyle = textColor
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  const textW = ctx.measureText(text).width
  drawHeart(ctx, x + textW + 8, y, heartSize, heartColor)
}

export function renderChartPoster(opts: ChartPosterOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${POSTER_CANVAS_ID}`)
      .fields({ node: true })
      .exec(async res => {
        const r = (Array.isArray(res) ? res[0] : res) as { node?: any } | null
        if (!r || !r.node) {
          reject(new Error('海报画布未就绪'))
          return
        }
        const node = r.node
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2
        // 尺寸由常量决定，不依赖画布的 CSS 布局，避免被压缩
        node.width = POSTER_W * dpr
        node.height = POSTER_H * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        const avatar = await loadCanvasImage(node, opts.avatarUrl)
        const miniProgramCode = await loadCanvasImage(node, opts.miniProgramCodeUrl)
        drawPoster(ctx, POSTER_W, POSTER_H, opts, avatar, miniProgramCode)
        resolve()
      })
  })
}

function drawPoster(
  ctx: any,
  W: number,
  H: number,
  opts: ChartPosterOptions,
  avatar: any,
  miniProgramCode: any,
) {
  // 背景：淡粉渐变 + 柔光
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H)
  bgGradient.addColorStop(0, '#FEF7F8')
  bgGradient.addColorStop(1, '#FBE9ED')
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, W, H)
  drawSoftBlob(ctx, W - 16, 70, 120, '250, 205, 215')
  drawSoftBlob(ctx, 8, H - 100, 90, '252, 214, 222')

  // 头部：大头像 + 品牌双行 + 日期胶囊
  drawCircleAvatar(ctx, avatar, 22, 24, 50)
  drawTextWithHeart(ctx, '育娃手记', 88, 38, 'bold 19px sans-serif', '#33302E', 12, '#F8A5B8')
  drawTextWithHeart(ctx, '记录宝宝成长的每一天', 88, 62, '11px sans-serif', '#A8A59E', 9, '#F5BCC7')
  if (opts.rangeText) {
    ctx.font = 'bold 11px sans-serif'
    const rangeW = ctx.measureText(opts.rangeText).width
    const pillW = rangeW + 26
    const pillH = 22
    const pillX = W - 20 - pillW
    const pillY = 32
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fillStyle = '#F9DCE2'
    ctx.fill()
    ctx.fillStyle = '#C86E85'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(opts.rangeText, pillX + pillW / 2, pillY + pillH / 2 + 0.5)
  }

  // 大标题：宝宝名 + 图表名
  const title = `${opts.babyName ? `${opts.babyName}的` : ''}${opts.title}`
  ctx.font = 'bold 21px sans-serif'
  ctx.fillStyle = '#2D2A2E'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(title, 20, 96)

  // 元信息行：性别 | 分段 | 分段（竖线分隔）
  const segments = [opts.genderText, ...(opts.metaTexts || [])].filter(Boolean) as string[]
  if (segments.length) {
    let cursorX = 20
    const rowY = 134
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    // 性别前的小圆点图标
    ctx.beginPath()
    ctx.arc(cursorX + 4, rowY, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#F8C9D3'
    ctx.fill()
    cursorX += 12
    segments.forEach((seg, index) => {
      ctx.fillStyle = '#8A8681'
      ctx.fillText(seg, cursorX, rowY)
      cursorX += ctx.measureText(seg).width
      if (index < segments.length - 1) {
        ctx.strokeStyle = '#E3DDD6'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cursorX + 8, rowY - 7)
        ctx.lineTo(cursorX + 8, rowY + 7)
        ctx.stroke()
        cursorX += 16
      }
    })
  }

  // 白色图表卡片
  const cardX = 16
  const cardW = W - 32
  const cardY = 154
  const cardH = 268
  ctx.save()
  ctx.shadowColor = 'rgba(180, 120, 130, 0.10)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 4
  roundRect(ctx, cardX, cardY, cardW, cardH, 16)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()

  // 图表绘制在白卡内
  const chartRegion = {
    x: cardX + 6,
    y: cardY + 8,
    w: cardW - 12,
    h: cardH - 14,
  }
  if (opts.kind === 'line') {
    paintLineChart(ctx, chartRegion, opts.data as LineChartPaintData, 1)
  } else if (opts.kind === 'bar') {
    paintBarChart(ctx, chartRegion, opts.data as BarChartPaintData, 1)
  } else {
    const growthData = opts.data as {
      metric: 'height' | 'weight'
      gender: 'male' | 'female'
      points: GrowthCurvePoint[]
    }
    paintGrowthCurve(
      ctx,
      chartRegion,
      { ...growthData, babyName: undefined, drawTitle: false },
      1,
    )
  }

  // 本周小结卡片
  const reviewY = cardY + cardH + 14
  const reviewH = 66
  const reviewW = W - 32 - 78
  if (opts.reviewText) {
    roundRect(ctx, cardX, reviewY, reviewW, reviewH, 14)
    ctx.fillStyle = '#FBE0E7'
    ctx.fill()

    // 白色小图标块 + 文档线条
    const iconX = cardX + 14
    const iconY = reviewY + 12
    roundRect(ctx, iconX, iconY, 20, 20, 6)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = '#E89BB0'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(iconX + 5, iconY + 7)
    ctx.lineTo(iconX + 15, iconY + 7)
    ctx.moveTo(iconX + 5, iconY + 11)
    ctx.lineTo(iconX + 15, iconY + 11)
    ctx.moveTo(iconX + 5, iconY + 15)
    ctx.lineTo(iconX + 11, iconY + 15)
    ctx.stroke()

    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#C86E85'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(opts.reviewTitle || '本周小结', iconX + 28, iconY + 4)

    // 正文：放不下自动缩小字号，仍放不下截断加省略号
    const fitted = fitText(ctx, opts.reviewText, reviewW - 66, '11px sans-serif')
    ctx.font = fitted.font
    ctx.fillStyle = '#4A464B'
    ctx.fillText(fitted.text, cardX + 14, reviewY + 44)

    // 右侧双爱心装饰
    drawHeart(ctx, cardX + reviewW - 34, reviewY + 18, 14, '#F5A8B9')
    drawHeart(ctx, cardX + reviewW - 20, reviewY + 12, 9, '#F8C9D3')
  }

  // 右下角小程序码：使用白底并保持原图比例，便于从分享海报扫码进入。
  const codePanelX = cardX + reviewW + 8
  const codePanelY = reviewY
  const codePanelW = W - 16 - codePanelX
  const codePanelH = reviewH
  roundRect(ctx, codePanelX, codePanelY, codePanelW, codePanelH, 14)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  if (miniProgramCode) {
    const codeW = Math.min(codePanelW - 10, 46)
    const codeH = codeW * (294 / 258)
    const codeX = codePanelX + (codePanelW - codeW) / 2
    ctx.drawImage(miniProgramCode, codeX, codePanelY + 4, codeW, codeH)
  }
  ctx.font = '8px sans-serif'
  ctx.fillStyle = '#8E8B82'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('扫码打开', codePanelX + codePanelW / 2, codePanelY + codePanelH - 5)

  // 底部水印
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#C9B8BC'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('育娃手记 · 记录宝宝成长的每一天', 18, H - 18)
}

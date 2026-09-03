/** 宝宝日报海报：全天多指标汇总卡片（区别于单图表海报） */
import Taro from '@tarojs/taro'
import { drawSoftBlob, drawHeart, roundRect } from './canvasDraw'
import { loadCanvasImage } from './posterHelpers'

/** 日报逻辑尺寸（CSS 像素）；位图尺寸 = 逻辑尺寸 × dpr */
export const DAILY_POSTER_W = 340
export const DAILY_POSTER_H = 600
export const DAILY_POSTER_CANVAS_ID = 'daily-report-canvas'

export interface DailyMetric {
  /** 指标名（如「喂奶」「睡眠」） */
  label: string
  /** 主数值（如 5次 / 13小时30分） */
  value: string
  /** 图标底色（淡色圆底） */
  iconBg: string
  /** 表情图标 */
  emoji: string
  /** 底部虚线分隔的补充行（如喂奶卡的「共630ml」），有值则卡片加高 */
  subBelow?: string
}

export interface DailyPosterOptions {
  babyName?: string
  avatarUrl?: string
  genderText?: string
  /** 日期文案（如「9月2日 · 星期三」） */
  dateText: string
  /** 月龄文案（如「8个月 12天」） */
  ageText?: string
  metrics: DailyMetric[]
  /** 今日小结文案 */
  reviewText: string
  color?: string
  /** 小程序码图片地址 */
  miniProgramCodeUrl?: string
}

/** 卡哇伊云朵装饰（闭眼微笑 + 腮红） */
function drawCloud(ctx: any, x: number, y: number, s: number) {
  ctx.save()
  ctx.globalAlpha = 0.95
  // 云体：三团圆 + 底部圆角矩形
  ctx.fillStyle = '#FBDEE6'
  ctx.beginPath()
  ctx.arc(x, y, s * 0.34, 0, Math.PI * 2)
  ctx.arc(x + s * 0.42, y - s * 0.22, s * 0.44, 0, Math.PI * 2)
  ctx.arc(x + s * 0.86, y, s * 0.32, 0, Math.PI * 2)
  ctx.fill()
  roundRect(ctx, x - s * 0.28, y, s * 1.42, s * 0.42, s * 0.21)
  ctx.fill()

  // 闭眼（两条下弯短线）
  ctx.strokeStyle = '#E0A2B2'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  const eyeY = y + s * 0.1
  ctx.beginPath()
  ctx.moveTo(x + s * 0.18, eyeY)
  ctx.quadraticCurveTo(x + s * 0.26, eyeY + s * 0.08, x + s * 0.34, eyeY)
  ctx.moveTo(x + s * 0.58, eyeY)
  ctx.quadraticCurveTo(x + s * 0.66, eyeY + s * 0.08, x + s * 0.74, eyeY)
  ctx.stroke()
  // 微笑
  ctx.beginPath()
  ctx.moveTo(x + s * 0.4, eyeY + s * 0.14)
  ctx.quadraticCurveTo(x + s * 0.46, eyeY + s * 0.2, x + s * 0.52, eyeY + s * 0.14)
  ctx.stroke()
  // 腮红
  ctx.fillStyle = '#F8C9D3'
  ;[x + s * 0.1, x + s * 0.82].forEach(cx => {
    ctx.beginPath()
    ctx.ellipse(cx, eyeY + s * 0.06, s * 0.07, s * 0.045, 0, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

/** 四角星闪光 */
function drawSparkle(ctx: any, x: number, y: number, size: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.quadraticCurveTo(size * 0.18, -size * 0.18, size, 0)
  ctx.quadraticCurveTo(size * 0.18, size * 0.18, 0, size)
  ctx.quadraticCurveTo(-size * 0.18, size * 0.18, -size, 0)
  ctx.quadraticCurveTo(-size * 0.18, -size * 0.18, 0, -size)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 虚线水平分隔 */
function drawDashedLine(ctx: any, x1: number, x2: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

export function renderDailyPoster(opts: DailyPosterOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${DAILY_POSTER_CANVAS_ID}`)
      .fields({ node: true })
      .exec(async res => {
        const r = (Array.isArray(res) ? res[0] : res) as { node?: any } | null
        if (!r || !r.node) {
          reject(new Error('日报画布未就绪'))
          return
        }
        const node = r.node
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2
        node.width = DAILY_POSTER_W * dpr
        node.height = DAILY_POSTER_H * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        const avatar = await loadCanvasImage(node, opts.avatarUrl)
        const miniProgramCode = await loadCanvasImage(node, opts.miniProgramCodeUrl)
        drawDailyPoster(ctx, DAILY_POSTER_W, DAILY_POSTER_H, opts, avatar, miniProgramCode)
        resolve()
      })
  })
}

function drawDailyPoster(
  ctx: any,
  W: number,
  H: number,
  opts: DailyPosterOptions,
  avatar: any,
  miniProgramCode: any,
) {
  // 背景：淡粉渐变 + 柔光
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#FEFAFB')
  bg.addColorStop(1, '#FBE4EA')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  drawSoftBlob(ctx, 30, 60, 100, '250, 205, 215')
  drawSoftBlob(ctx, W - 40, H - 160, 110, '252, 214, 222')

  // 头部：大头像（右上角贴爱心）+ 品牌双行 + 日期胶囊
  const avatarX = 18
  const avatarY = 20
  const avatarD = 66
  ctx.beginPath()
  ctx.arc(avatarX + avatarD / 2, avatarY + avatarD / 2, avatarD / 2 + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(avatarX + avatarD / 2, avatarY + avatarD / 2, avatarD / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarD, avatarD)
  } else {
    ctx.fillStyle = '#FFD3DC'
    ctx.fillRect(avatarX, avatarY, avatarD, avatarD)
    ctx.font = '28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('👶', avatarX + avatarD / 2, avatarY + avatarD / 2 + 2)
  }
  ctx.restore()

  // 头像右上角爱心（悬在边缘外侧）
  ctx.save()
  ctx.translate(avatarX + avatarD - 3, avatarY + 1)
  ctx.rotate((-18 * Math.PI) / 180)
  drawHeart(ctx, 0, 0, 19, '#F898AC')
  ctx.restore()

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillStyle = '#33302E'
  ctx.fillText('宝宝日报', 96, avatarY + 20)
  drawHeart(ctx, 96 + ctx.measureText('宝宝日报').width + 8, avatarY + 20, 11, '#F5A8B9')
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#A8A59E'
  ctx.fillText('记录宝宝成长的每一天', 96, avatarY + 46)

  // 日期胶囊：渐变底 + 📅 + 白字（左右留白均衡）
  ctx.font = 'bold 11px sans-serif'
  const dateW = ctx.measureText(opts.dateText).width
  const pillW = dateW + 40
  const pillH = 26
  const pillX = W - 20 - pillW
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0)
  pillGrad.addColorStop(0, '#F9CBD7')
  pillGrad.addColorStop(1, '#F3AFC2')
  roundRect(ctx, pillX, 26, pillW, pillH, pillH / 2)
  ctx.fillStyle = pillGrad
  ctx.fill()
  ctx.font = '12px sans-serif'
  ctx.fillText('📅', pillX + 12, 26 + pillH / 2 + 1)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(opts.dateText, pillX + 28, 26 + pillH / 2 + 0.5)

  // 大标题 + ✨ 闪光
  ctx.font = 'bold 24px sans-serif'
  ctx.fillStyle = '#2D2A2E'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`${opts.babyName || '宝宝'}的一天`, 20, 108)
  const titleW = ctx.measureText(`${opts.babyName || '宝宝'}的一天`).width
  drawSparkle(ctx, 20 + titleW + 14, 114, 7, '#F5A8B9')
  drawSparkle(ctx, 20 + titleW + 26, 102, 5, '#F8C9D3')

  // 男宝 · 月龄
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#8A8681'
  ctx.fillText([opts.genderText, opts.ageText].filter(Boolean).join(' · '), 20, 142)

  // 云朵装饰（标题右下方）
  drawCloud(ctx, 236, 156, 78)

  // 指标卡 2 列 × 3 行；第一行（喂奶/睡眠）统一加高，保证底部对齐
  const cardX = 16
  const gap = 12
  const cardW = (W - 32 - gap) / 2
  const rowTops = [178, 286, 382]
  const rowHeights = [96, 84, 84]
  opts.metrics.forEach((metric, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const h = metric.subBelow ? 96 : rowHeights[row]
    const x = cardX + col * (cardW + gap)
    const rowTop = rowTops[row]

    // 卡片 + 淡阴影
    ctx.save()
    ctx.shadowColor = 'rgba(200, 120, 140, 0.08)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3
    roundRect(ctx, x, rowTop, cardW, h, 18)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.restore()

    // 圆形 emoji 图标
    const iconCx = x + 16 + 23
    const iconCy = rowTop + h / 2
    ctx.beginPath()
    ctx.arc(iconCx, iconCy, 23, 0, Math.PI * 2)
    ctx.fillStyle = metric.iconBg
    ctx.fill()
    ctx.font = '24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(metric.emoji, iconCx, iconCy + 1)

    // 标签 + 数值
    const textX = x + 16 + 46 + 12
    ctx.textAlign = 'left'
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#A8A59E'
    ctx.textBaseline = 'middle'
    if (metric.subBelow) {
      ctx.fillText(metric.label, textX, rowTop + 22)
      ctx.font = 'bold 20px sans-serif'
      ctx.fillStyle = '#2D2A2E'
      ctx.fillText(metric.value, textX, rowTop + 44)
      drawDashedLine(ctx, textX, x + cardW - 16, rowTop + 60, '#EED5DC')
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#8E8B82'
      ctx.fillText(metric.subBelow!, textX, rowTop + 78)
    } else {
      ctx.fillText(metric.label, textX, rowTop + h / 2 - 13)
      ctx.font = 'bold 20px sans-serif'
      ctx.fillStyle = '#2D2A2E'
      ctx.fillText(metric.value, textX, rowTop + h / 2 + 13)
    }
  })

  // 今日小结卡
  const reviewY = 178 + 96 + 12 + 84 + 12 + 84 + 18
  const reviewH = 86
  const reviewX = 16
  const reviewW = W - 32 - 78
  const reviewGrad = ctx.createLinearGradient(reviewX, reviewY, reviewX, reviewY + reviewH)
  reviewGrad.addColorStop(0, '#FBDCE5')
  reviewGrad.addColorStop(1, '#F8D0DC')
  roundRect(ctx, reviewX, reviewY, reviewW, reviewH, 16)
  ctx.fillStyle = reviewGrad
  ctx.fill()

  // 白色图标块 + 文档线条
  const iconX = reviewX + 16
  const iconY = reviewY + 14
  roundRect(ctx, iconX, iconY, 24, 24, 8)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.strokeStyle = '#E89BB0'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(iconX + 6, iconY + 8)
  ctx.lineTo(iconX + 18, iconY + 8)
  ctx.moveTo(iconX + 6, iconY + 12)
  ctx.lineTo(iconX + 18, iconY + 12)
  ctx.moveTo(iconX + 6, iconY + 16)
  ctx.lineTo(iconX + 13, iconY + 16)
  ctx.stroke()

  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#D4708A'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('今日小结', iconX + 34, iconY + 5)

  // 右上：爱心 + 虚线弧线
  drawHeart(ctx, reviewX + reviewW - 56, reviewY + 20, 16, '#F598AC')
  ctx.strokeStyle = '#F5A8B9'
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(reviewX + reviewW - 44, reviewY + 22)
  ctx.quadraticCurveTo(reviewX + reviewW - 24, reviewY + 18, reviewX + reviewW - 14, reviewY + 40)
  ctx.stroke()
  ctx.setLineDash([])

  // 小结正文（最多两行）
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#4A464B'
  ctx.textBaseline = 'top'
  const maxW = reviewW - 32
  let line = ''
  let lineY = reviewY + 52
  let lines = 0
  for (const ch of opts.reviewText) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, reviewX + 16, lineY)
      line = ch
      lineY += 17
      lines++
      if (lines >= 2) {
        line = ''
        break
      }
    } else {
      line += ch
    }
  }
  if (line) ctx.fillText(line, reviewX + 16, lineY)

  // 右下角小程序码：保持原图比例，白底提升识别率。
  const codePanelX = reviewX + reviewW + 8
  const codePanelY = reviewY
  const codePanelW = W - 16 - codePanelX
  const codePanelH = reviewH
  roundRect(ctx, codePanelX, codePanelY, codePanelW, codePanelH, 16)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  if (miniProgramCode) {
    const codeW = Math.min(codePanelW - 12, 56)
    const codeH = codeW * (294 / 258)
    const codeX = codePanelX + (codePanelW - codeW) / 2
    ctx.drawImage(miniProgramCode, codeX, codePanelY + 7, codeW, codeH)
  }
  ctx.font = '8px sans-serif'
  ctx.fillStyle = '#8E8B82'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('扫码打开', codePanelX + codePanelW / 2, codePanelY + codePanelH - 7)

  // 底部水印
  const wm = '育娃手记 · 记录宝宝成长的每一天'
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#C9B8BC'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(wm, 18, H - 20)
}

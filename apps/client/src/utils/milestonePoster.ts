/**
 * 里程碑纪念海报：一张「第一次」的拍立得式纪念卡（照片 + 名称 + 月龄 + 一句话）。
 *
 * 与纪念册同一套路：离屏专用画布、逻辑尺寸 × POSTER_RENDER_SCALE、
 * 画布高度随内容走（没有照片时不必留一片空白），先量高再重绘一次。
 */
import { roundRect, drawSoftBlob, drawHeart, fitText, wrapText } from './canvasDraw'
import { loadCanvasImage, queryPosterNode, POSTER_RENDER_SCALE } from './posterHelpers'

export const MILESTONE_CANVAS_ID = 'milestone-canvas'
export const MILESTONE_POSTER_W = 340
/** 标称高度：只作为首遍量高的初值与隐藏画布的 CSS 尺寸，真实高度由内容决定 */
export const MILESTONE_POSTER_H = 470
/** 内容再少也不低于这个高度，否则长得不像一张海报 */
const MIN_H = 380

const PAD = 22
const CARD_W = MILESTONE_POSTER_W - PAD * 2
const CARD_TOP = 86
/**
 * 竖照片的最高比例上限（高/宽）= 1.8：手机竖拍是 3:4（1.33）、16:9 直出是 1.78，
 * 这两类**完全不裁**；只有长截图这类更极端的图才裁上下——那种整张塞进纪念卡本来就没法看。
 * 打卡弹层用同一个值决定要不要提示用户，所以导出。
 */
export const MAX_PHOTO_RATIO = 1.8

export interface MilestonePosterOptions {
  babyName?: string
  avatarUrl?: string
  /** 里程碑名称（预置项来自共享清单，自定义项来自用户输入） */
  title: string
  emoji: string
  /** 打卡日期文案，如「2026年9月21日」 */
  dateText: string
  /** 当时的月龄文案，如「8个月12天」 */
  ageText?: string
  note?: string
  photoUrl?: string
  miniProgramCodeUrl?: string
}

export async function renderMilestonePoster(
  opts: MilestonePosterOptions,
): Promise<void> {
  const node = await queryPosterNode(MILESTONE_CANVAS_ID, '里程碑画布未就绪')
  const ctx = node.getContext('2d')
  // 照片 + 头像 + 小程序码并行加载：串行等 3 秒超时会被用户当成卡死
  const [photo, avatar, qr] = await Promise.all([
    loadCanvasImage(node, opts.photoUrl, 6000),
    loadCanvasImage(node, opts.avatarUrl),
    loadCanvasImage(node, opts.miniProgramCodeUrl),
  ])

  const paint = (h: number) => {
    node.width = MILESTONE_POSTER_W * POSTER_RENDER_SCALE
    node.height = h * POSTER_RENDER_SCALE
    // ⚠️ 改画布尺寸会重置绘制状态，必须重新缩放，否则第二遍坐标全是错的
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(POSTER_RENDER_SCALE, POSTER_RENDER_SCALE)
    ctx.clearRect(0, 0, MILESTONE_POSTER_W, h)
    return drawMilestonePoster(ctx, opts, h, photo, avatar, qr)
  }

  const measured = paint(MILESTONE_POSTER_H)
  const finalH = Math.max(Math.round(measured), MIN_H)
  if (finalH !== MILESTONE_POSTER_H) paint(finalH)
}

/** 折行并在被截断时补省略号：纪念卡上凭空少半句话比什么都难受 */
function wrapWithEllipsis(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrapText(ctx, text, maxWidth, maxLines)
  const covered = lines.join('').length
  if (lines.length && covered < text.length) {
    // 省略号本身也要放得下，先把行尾让出来再加符号
    const last = lines.length - 1
    let tail = lines[last]
    while (tail.length > 1 && ctx.measureText(`${tail}…`).width > maxWidth) {
      tail = tail.slice(0, -1)
    }
    lines[last] = `${tail}…`
  }
  return lines
}

/** 绘制整张海报，返回内容实际高度（含底部留白） */
function drawMilestonePoster(
  ctx: any,
  opts: MilestonePosterOptions,
  H: number,
  photo: any,
  avatar: any,
  qr: any,
): number {
  const W = MILESTONE_POSTER_W
  const innerX = PAD + 16
  const innerW = CARD_W - 32

  // ── 先量文字：白卡必须在内容之前画（否则白底和阴影会盖住已画好的东西），
  //    所以卡片高度得先定下来 ──
  ctx.font = 'bold 21px sans-serif'
  // 名称在表单侧限长 20 字，两行足够，不会出现「看着完整其实被截了」
  const titleLines = wrapWithEllipsis(ctx, opts.title, innerW, 2)
  ctx.font = '12px sans-serif'
  const noteLines = opts.note
    ? wrapWithEllipsis(ctx, opts.note, innerW - 8, 4)
    : []
  // 照片按**原始比例**铺满卡片内宽（纪念卡裁掉半边脸比留白难受得多），
  // 只有超过 MAX_PHOTO_RATIO 的长图才收上限、裁上下；
  // 拿不到尺寸（个别基础库 image 不报 width/height）时退回原来的 1.4:1 横框。
  const photoRatio =
    photo && photo.width > 0 && photo.height > 0
      ? Math.min(photo.height / photo.width, MAX_PHOTO_RATIO)
      : 0.72
  const photoH = photo ? Math.round(innerW * photoRatio) : 0
  const cardH =
    18 +
    (photoH ? photoH + 16 : 62 + 12) +
    titleLines.length * 28 +
    (opts.ageText ? 34 : 0) +
    noteLines.length * 18 +
    18

  // ── 背景：粉白渐变 + 两团柔光 ──
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#FFF4F6')
  bg.addColorStop(0.4, '#FFFAFB')
  bg.addColorStop(1, '#FDF6FF')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  drawSoftBlob(ctx, 36, 80, 110, '250, 205, 215')
  drawSoftBlob(ctx, W - 34, H - 150, 120, '232, 222, 255')

  // ── 页眉：头像 + 品牌 + 宝宝名 · 日期 ──
  const avD = 46
  const avY = 24
  ctx.beginPath()
  ctx.arc(PAD + avD / 2, avY + avD / 2, avD / 2 + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(PAD + avD / 2, avY + avD / 2, avD / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    ctx.drawImage(avatar, PAD, avY, avD, avD)
  } else {
    ctx.fillStyle = '#FFE3EC'
    ctx.fillRect(PAD, avY, avD, avD)
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('👶', PAD + avD / 2, avY + avD / 2 + 1)
  }
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 19px sans-serif'
  ctx.fillStyle = '#33272B'
  const brand = '成长里程碑'
  ctx.fillText(brand, PAD + avD + 14, avY + 15)
  drawHeart(ctx, PAD + avD + 14 + ctx.measureText(brand).width + 7, avY + 15, 11, '#F5A8B9')

  const headText = `${opts.babyName || '宝宝'} · ${opts.dateText}`
  const fittedHead = fitText(
    ctx,
    headText,
    W - PAD - (PAD + avD + 14) - 8,
    '11px sans-serif',
    9,
  )
  ctx.font = fittedHead.font
  ctx.fillStyle = '#B08A96'
  ctx.fillText(fittedHead.text, PAD + avD + 14, avY + 34)

  // ── 白卡（含阴影），后续内容都画在它上面 ──
  ctx.save()
  ctx.shadowColor = 'rgba(213, 146, 160, 0.12)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  roundRect(ctx, PAD, CARD_TOP, CARD_W, cardH, 18)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()

  let y = CARD_TOP + 18

  if (photo) {
    ctx.save()
    roundRect(ctx, innerX, y, innerW, photoH, 14)
    ctx.clip()
    // 裁剪量按「源比例 vs 目标比例」直接算，只在被上限收小时裁上下；
    // 之前是拿框的宽高比反推，photoH 一取整就白裁掉一两个像素（16:9 直出图也中招）
    const iw = photo.width || innerW
    const ih = photo.height || photoH
    const sh = ih / iw > photoRatio ? iw * photoRatio : ih
    ctx.drawImage(photo, 0, (ih - sh) / 2, iw, sh, innerX, y, innerW, photoH)
    ctx.restore()
    // 白描边做出相纸那一圈，也遮住裁剪圆角边缘
    roundRect(ctx, innerX, y, innerW, photoH, 14)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = 3
    ctx.stroke()
    y += photoH + 16
  } else {
    // 没照片时用一枚大 emoji 撑住视觉重心，卡片不至于空得像坏了
    const badge = 62
    ctx.beginPath()
    ctx.arc(W / 2, y + badge / 2, badge / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#FFE7EF'
    ctx.fill()
    ctx.font = '30px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(opts.emoji || '⭐', W / 2, y + badge / 2 + 1)
    y += badge + 12
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = 'bold 21px sans-serif'
  ctx.fillStyle = '#2D2A2E'
  titleLines.forEach(line => {
    ctx.fillText(line, W / 2, y)
    y += 28
  })

  if (opts.ageText) {
    ctx.font = 'bold 11px sans-serif'
    const meta = `${opts.ageText} 打卡`
    const pillW = ctx.measureText(meta).width + 28
    const pillX = (W - pillW) / 2
    const pillH = 24
    roundRect(ctx, pillX, y + 2, pillW, pillH, pillH / 2)
    const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0)
    pillGrad.addColorStop(0, '#F9CBD7')
    pillGrad.addColorStop(1, '#F3AFC2')
    ctx.fillStyle = pillGrad
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta, W / 2, y + 2 + pillH / 2 + 0.5)
    y += pillH + 12
  }

  if (noteLines.length) {
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#6B6568'
    ctx.textBaseline = 'top'
    noteLines.forEach(line => {
      ctx.fillText(line, W / 2, y)
      y += 18
    })
  }

  // ── 页脚：一句话 + 小程序码 ──
  const footY = CARD_TOP + cardH + 20
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillStyle = '#D4708A'
  ctx.fillText('每一个第一次', PAD + 2, footY + 4)
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#B08A96'
  ctx.fillText('都值得被好好记下来', PAD + 2, footY + 22)

  const qrSize = 54
  const qrX = W - PAD - qrSize
  if (qr) {
    ctx.save()
    roundRect(ctx, qrX - 6, footY - 6, qrSize + 12, qrSize + 12, 12)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.restore()
    ctx.drawImage(qr, qrX, footY, qrSize, qrSize)
  }

  ctx.font = '9px sans-serif'
  ctx.fillStyle = '#C9B8BC'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('育娃手记 · 记录宝宝成长的每一天', PAD + 2, footY + qrSize + 14)

  return footY + qrSize + 28
}

/**
 * 成长纪念册海报：把一段时间的记录 + 照片排成一张可保存/分享的长图。
 *
 * 复用现有海报管线的三个约定：
 *   1. 逻辑尺寸 × 固定倍数写进 node.width/height（避免 rpx 缩水）
 *   2. 专用离屏画布，绘制与 CSS 完全解耦
 *   3. 远程图片用 loadCanvasImage（超时返回 null，不阻塞）
 *
 * ⚠️ 照片必须**并行**加载。loadCanvasImage 每张最多等 3 秒，
 *    顺序加载最坏要十几秒，用户会以为卡死。
 *
 * ⚠️ 画布高度**不固定**：照片少时照片墙变矮，位图高度由内容决定
 *    （导出不传 width/height，走的就是整张位图）。
 */
import {
  roundRect,
  drawSoftBlob,
  drawHeart,
  pathSmoothLine,
  fitText,
} from './canvasDraw'
import { loadCanvasImage, queryPosterNode, POSTER_RENDER_SCALE } from './posterHelpers'
import type { AlbumData, AlbumPhoto } from './albumData'

export const ALBUM_CANVAS_ID = 'album-canvas'
/** 逻辑宽度（CSS 像素）；位图 = 逻辑 × POSTER_RENDER_SCALE */
export const ALBUM_W = 340
/**
 * 标称高度：只作为**首屏量高**用的初值，以及隐藏画布的 CSS 尺寸。
 * 真实位图高度由内容决定（照片少时照片墙会变矮），见 renderAlbumPoster 的两遍绘制。
 */
export const ALBUM_H = 1080
/** 内容再少也不低于这个高度，否则会长得不像一张海报 */
const MIN_ALBUM_H = 460
/** 页脚下方留白 */
const BOTTOM_PAD = 34

const PAD = 22
const CARD_W = ALBUM_W - PAD * 2
const CARD_R = 18

/**
 * 格式化数值，带兜底。
 *
 * 上游 `height` / `weight` 来自数据库的 decimal 列，接口透出的是字符串，
 * 一旦漏了转换，`"68.2".toFixed` 会抛 TypeError —— 而它发生在绘制循环里，
 * 会让**整张海报**渲染失败（用户只看到「生成失败」，没有任何线索）。
 * 所以这里不信任上游类型，拿不到合法数字就退化成 '—'。
 */
const fixed = (v: unknown, digits = 1): string => {
  // ⚠️ null / '' 必须单独挡掉：Number(null) 和 Number('') 都是 0，
  // 会安静地画出一个「0.0 cm」——比崩掉更难发现。
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

/**
 * 照片墙排布：按**实际张数**决定行列。
 *
 * 之前固定 3 列 × 2 行、不足就画虚线空框 —— 只有一两张照片时，
 * 整块看着像渲染失败（用户反馈「生成的瞬间只有一张照片」）。
 * 现在空位直接不画，每行按实际张数居中。
 */
function photoGrid(n: number) {
  const gap = 8
  const innerW = CARD_W - 18 * 2
  if (n <= 0) return { cols: 0, gap, cell: 0, cellH: 0, gridH: 0, innerW }
  if (n === 1) {
    // 单张：铺满一行做成主图，宽高比约 8:5
    const cellH = Math.round(innerW * 0.62)
    return { cols: 1, gap, cell: innerW, cellH, gridH: cellH, innerW }
  }
  // 2 张排一行两张；4 张排 2×2（比 3+1 好看）；其余按 3 列
  const cols = n === 2 || n === 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  const cell = (innerW - gap * (cols - 1)) / cols
  return {
    cols,
    gap,
    cell,
    cellH: cell,
    gridH: cell * rows + gap * (rows - 1),
    innerW,
  }
}

/**
 * 加载一张纪念册照片：**优先原图**，原图加载失败再退回缩略图。
 *
 * 之前写成「缩略图优先」是反的 —— 那是给列表小图用的，
 * 海报要清晰度，用缩略图等于把小图硬拉到几倍大，成片发糊、色彩发闷。
 * （本项目上传时其实不传 thumbnail，所以多数情况走的就是 url；
 * 但万一哪天补上了缩略图，这个顺序能避免画质倒退。）
 * 原图较大，把超时放宽到 6 秒；仍失败则跳过并打日志。
 */
async function loadAlbumPhoto(node: any, p: AlbumPhoto): Promise<any> {
  const primary = p.url
  const img = await loadCanvasImage(node, primary, 6000)
  if (img) return img
  const fallback = p.thumbnail
  if (fallback && fallback !== primary) {
    const retry = await loadCanvasImage(node, fallback, 6000)
    if (retry) return retry
  }
  console.warn('[album] 照片加载失败，已从照片墙跳过：', primary)
  return null
}

/** 按标点把长文案折成多行（Canvas 不会自动换行） */
function wrapText(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    const next = cur + ch
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur)
      cur = ch
      if (lines.length === maxLines) break
    } else {
      cur = next
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  return lines
}

function drawCard(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r = CARD_R,
) {
  ctx.save()
  ctx.shadowColor = 'rgba(213, 146, 160, 0.10)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()
}

export async function renderAlbumPoster(
  data: AlbumData,
  miniProgramCodeUrl?: string,
): Promise<void> {
  const node = await queryPosterNode(ALBUM_CANVAS_ID, '纪念册画布未就绪')
  const ctx = node.getContext('2d')

  // 头像 + 照片 + 小程序码，全部并行加载
  const [avatar, ...rest] = await Promise.all([
    loadCanvasImage(node, data.avatarUrl),
    ...data.photos.map(p => loadAlbumPhoto(node, p)),
    loadCanvasImage(node, miniProgramCodeUrl),
  ])
  const qr = rest[rest.length - 1]
  const photos = rest.slice(0, rest.length - 1).filter(Boolean)

  // 画布高度随内容走：照片少时照片墙变矮，沿用固定高度会在底部留一大片空白。
  // 做法是先按标称高度画一遍量出内容高度，再按实际高度重画一次。
  const paint = (h: number) => {
    node.width = ALBUM_W * POSTER_RENDER_SCALE
    node.height = h * POSTER_RENDER_SCALE
    // ⚠️ 改动画布尺寸会重置绘制状态，必须重新应用缩放，否则第二遍会是错位的
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(POSTER_RENDER_SCALE, POSTER_RENDER_SCALE)
    ctx.clearRect(0, 0, ALBUM_W, h)
    return drawAlbum(ctx, data, avatar, photos, qr, h)
  }

  const measured = paint(ALBUM_H)
  const finalH = Math.max(Math.round(measured), MIN_ALBUM_H)
  if (finalH !== ALBUM_H) paint(finalH)
}

/**
 * 绘制整张纪念册，返回内容实际高度（含底部留白）。
 * `H` 是当前画布高度，影响背景渐变与柔光的位置。
 */
function drawAlbum(
  ctx: any,
  d: AlbumData,
  avatar: any,
  photos: any[],
  qr: any,
  H: number,
): number {
  const W = ALBUM_W

  // ── 背景：粉白渐变 + 两团柔光 ──
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#FFF4F6')
  bg.addColorStop(0.35, '#FFF9FA')
  bg.addColorStop(1, '#FDF8FF')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  drawSoftBlob(ctx, 40, 90, 120, '250, 205, 215')
  drawSoftBlob(ctx, W - 30, H - 190, 130, '232, 222, 255')

  // ── 封面 ──
  const avD = 76
  const avX = (W - avD) / 2
  const avY = 32
  ctx.beginPath()
  ctx.arc(avX + avD / 2, avY + avD / 2, avD / 2 + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(avX + avD / 2, avY + avD / 2, avD / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    ctx.drawImage(avatar, avX, avY, avD, avD)
  } else {
    ctx.fillStyle = '#FFE3EC'
    ctx.fillRect(avX, avY, avD, avD)
    ctx.font = '34px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#D4537E'
    ctx.fillText('宝', avX + avD / 2, avY + avD / 2 + 1)
  }
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const name = fitText(ctx, d.babyName || '宝宝', CARD_W, 'bold 25px sans-serif', 16)
  ctx.font = name.font
  ctx.fillStyle = '#33272B'
  ctx.fillText(name.text, W / 2, 124)

  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#B08A96'
  ctx.fillText(
    [d.rangeTitle, d.ageText].filter(Boolean).join(' · '),
    W / 2,
    156,
  )

  // 「成长纪念册」胶囊
  ctx.font = 'bold 11px sans-serif'
  const badgeW = ctx.measureText('成长纪念册').width + 34
  const badgeX = (W - badgeW) / 2
  const badgeY = 180
  roundRect(ctx, badgeX, badgeY, badgeW, 24, 12)
  const badgeGrad = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0)
  badgeGrad.addColorStop(0, '#FFC2D1')
  badgeGrad.addColorStop(1, '#F9A9BE')
  ctx.fillStyle = badgeGrad
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText('成长纪念册', W / 2, badgeY + 7)

  // ── 主数字卡 ──
  let y = 222
  drawCard(ctx, PAD, y, CARD_W, 76)
  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#B5A9AD'
  ctx.fillText('这段时间', PAD + 18, y + 18)
  const main = `${d.babyName || '宝宝'}，你记录了 `
  ctx.font = 'bold 17px sans-serif'
  const mainW = ctx.measureText(main).width
  ctx.fillStyle = '#33272B'
  ctx.fillText(main, PAD + 18, y + 44)
  ctx.fillStyle = '#E0678C'
  ctx.fillText(`${d.activeDays}`, PAD + 18 + mainW, y + 44)
  ctx.font = 'bold 17px sans-serif'
  ctx.fillStyle = '#33272B'
  ctx.fillText(' 天', PAD + 18 + mainW + ctx.measureText(`${d.activeDays}`).width, y + 44)

  // ── 三宫格 ──
  y += 76 + 16
  const tiles: { k: string; v: string; u: string }[] = [
    { k: '喂奶', v: `${d.feeding.count}`, u: d.feeding.amount > 0 ? `共 ${Math.round(d.feeding.amount)} ml` : '次' },
    { k: '睡眠', v: d.sleep.hoursPerDay ? `${d.sleep.hoursPerDay}` : '—', u: '小时 / 天' },
    { k: '尿布', v: `${d.diaper.count}`, u: '次' },
  ]
  const gap = 10
  const tileW = (CARD_W - gap * 2) / 3
  const tileH = 104
  tiles.forEach((t, i) => {
    const x = PAD + i * (tileW + gap)
    drawCard(ctx, x, y, tileW, tileH, 14)
    ctx.textAlign = 'center'
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#B5A9AD'
    ctx.fillText(t.k, x + tileW / 2, y + 20)
    ctx.font = 'bold 22px sans-serif'
    ctx.fillStyle = '#E0678C'
    ctx.fillText(t.v, x + tileW / 2, y + 44)
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#B5A9AD'
    ctx.fillText(t.u, x + tileW / 2, y + 78)
  })

  // ── 身高曲线卡 ──
  y += tileH + 16
  const curveH = 146
  drawCard(ctx, PAD, y, CARD_W, curveH)

  const hFrom = d.height.from
  const hTo = d.height.to
  const hasCurve =
    hFrom != null &&
    hTo != null &&
    Number.isFinite(Number(hFrom)) &&
    Number.isFinite(Number(hTo)) &&
    Number(hTo) > Number(hFrom)
  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#B5A9AD'
  ctx.fillText(hFrom != null || hTo != null ? '身高变化' : '成长记录', PAD + 18, y + 16)

  if (hFrom != null && hTo != null) {
    ctx.font = 'bold 15px sans-serif'
    ctx.fillStyle = '#33272B'
    ctx.fillText(`${fixed(hFrom)} → ${fixed(hTo)} cm`, PAD + 18, y + 38)
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#5F9E7F'
    const delta = Number(hTo) - Number(hFrom)
    ctx.fillText(
      `${delta >= 0 ? '+' : ''}${fixed(delta)} cm`,
      PAD + CARD_W - 18,
      y + 38,
    )
    ctx.textAlign = 'left'
  } else {
    ctx.font = 'bold 15px sans-serif'
    ctx.fillStyle = '#B5A9AD'
    ctx.fillText('这段时间还没有身高记录', PAD + 18, y + 38)
  }

  if (hasCurve) {
    const cx0 = PAD + 18
    const cx1 = PAD + CARD_W - 18
    const cy0 = y + 64
    const cy1 = y + curveH - 16
    // 折线形状固定（数据只有首末两点），视觉上给一条平滑上行的成长线
    const pts = [0, 1, 2, 3, 4, 5].map(i => ({
      x: cx0 + ((cx1 - cx0) * i) / 5,
      y: cy1 - (cy1 - cy0) * (0.05 + 0.95 * Math.pow(i / 5, 1.35)),
    }))
    const fill = ctx.createLinearGradient(0, cy0, 0, cy1)
    fill.addColorStop(0, 'rgba(255, 179, 198, 0.42)')
    fill.addColorStop(1, 'rgba(255, 179, 198, 0)')
    pathSmoothLine(ctx, pts)
    ctx.lineTo(cx1, cy1)
    ctx.lineTo(cx0, cy1)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    pathSmoothLine(ctx, pts)
    ctx.strokeStyle = '#FF8FA9'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()

    const last = pts[pts.length - 1]
    ctx.beginPath()
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = '#FF8FA9'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // ── 照片墙（按实际张数排布，不留空占位框）──
  y += curveH + 16
  const photoPad = 18
  const n = photos.length
  const g = photoGrid(n)
  const photoCardH = 46 + (n === 0 ? 44 : g.gridH) + photoPad

  drawCard(ctx, PAD, y, CARD_W, photoCardH)
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillStyle = '#33272B'
  ctx.fillText('这些瞬间', PAD + photoPad, y + 18)
  ctx.textAlign = 'right'
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#B5A9AD'
  ctx.fillText(n ? `${n} 张` : '', PAD + CARD_W - photoPad, y + 22)

  if (n === 0) {
    ctx.textAlign = 'left'
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#C3B7BA'
    ctx.fillText('还没有照片，去相册添加吧', PAD + photoPad, y + 54)
  } else {
    const gridTop = y + 46
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / g.cols)
      const c = i % g.cols
      // 最后一行不足时按实际张数居中，避免右侧空出一截
      const inRow = Math.min(g.cols, n - r * g.cols)
      const rowW = inRow * g.cell + (inRow - 1) * g.gap
      const x = PAD + photoPad + (g.innerW - rowW) / 2 + c * (g.cell + g.gap)
      const yy = gridTop + r * (g.cellH + g.gap)
      const img = photos[i]
      ctx.save()
      roundRect(ctx, x, yy, g.cell, g.cellH, 10)
      ctx.clip()
      if (img) {
        // cover：按目标格子的宽高比居中裁剪，单张主图这种横长格子也不会被压扁
        const aspect = g.cell / g.cellH
        const iw = img.width
        const ih = img.height
        let sw = iw
        let sh = ih
        if (iw / ih > aspect) sw = ih * aspect
        else sh = iw / aspect
        ctx.drawImage(
          img,
          (iw - sw) / 2,
          (ih - sh) / 2,
          sw,
          sh,
          x,
          yy,
          g.cell,
          g.cellH,
        )
      } else {
        ctx.fillStyle = 'rgba(255, 240, 244, 0.9)'
        ctx.fillRect(x, yy, g.cell, g.cellH)
      }
      ctx.restore()
    }
  }

  // ── 结语 ──
  y += photoCardH + 16
  ctx.font = '13px sans-serif'
  const closLines = wrapText(ctx, d.reviewText, CARD_W - 36, 3)
  const closH = 32 + closLines.length * 22 + 30
  const closGrad = ctx.createLinearGradient(PAD, y, PAD + CARD_W, y + closH)
  closGrad.addColorStop(0, '#FFF3F6')
  closGrad.addColorStop(0.55, '#FFF8FB')
  closGrad.addColorStop(1, '#F6F2FF')
  roundRect(ctx, PAD, y, CARD_W, closH, CARD_R)
  ctx.fillStyle = closGrad
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#6B5560'
  closLines.forEach((line, i) => {
    ctx.fillText(line, PAD + 18, y + 30 + i * 22)
  })
  // 末尾爱心
  const lastLine = closLines[closLines.length - 1] || ''
  ctx.font = '13px sans-serif'
  drawHeart(
    ctx,
    PAD + 18 + ctx.measureText(lastLine).width + 12,
    y + 30 + (closLines.length - 1) * 22 + 6,
    11,
    '#E0678C',
  )
  y += closH

  // ── 页脚：品牌 + 小程序码（别人看到这张图能扫码进来）──
  y += 22
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillStyle = '#33272B'
  ctx.fillText('育娃手记', PAD + 2, y + 6)
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#B5A9AD'
  ctx.fillText('记录每一个瞬间', PAD + 2, y + 28)

  const qrSize = 52
  const qrX = PAD + CARD_W - qrSize
  const qrY = y - 4
  ctx.save()
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 10)
  ctx.clip()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(qrX, qrY, qrSize, qrSize)
  if (qr) ctx.drawImage(qr, qrX, qrY, qrSize, qrSize)
  ctx.restore()

  // 内容实际高度（页脚文字与二维码里更靠下的那个 + 底部留白）
  return Math.max(y + 28, qrY + qrSize) + BOTTOM_PAD
}

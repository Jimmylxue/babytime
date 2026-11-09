/** 成长周报海报：一周记录 + 成长变化 + 新里程碑 + 精选照片 */
import {
	roundRect,
	drawSoftBlob,
	drawHeart,
	fitText,
	wrapText,
} from './canvasDraw'
import { loadCanvasImage, queryPosterNode, POSTER_RENDER_SCALE } from './posterHelpers'
import type { WeeklyGrowthValue, WeeklyPhoto, WeeklyReportData } from './weeklyReportData'

export const WEEKLY_POSTER_CANVAS_ID = 'weekly-report-canvas'
export const WEEKLY_POSTER_W = 340
export const WEEKLY_POSTER_H = 900

const MIN_POSTER_H = 560
const BOTTOM_PAD = 34
const PAD = 22
const CARD_W = WEEKLY_POSTER_W - PAD * 2
const CARD_R = 18

const fixed = (v: number | null, digits = 1) =>
	v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

function drawCard(ctx: any, x: number, y: number, w: number, h: number, r = CARD_R) {
	ctx.save()
	ctx.shadowColor = 'rgba(213, 146, 160, 0.10)'
	ctx.shadowBlur = 10
	ctx.shadowOffsetY = 3
	roundRect(ctx, x, y, w, h, r)
	ctx.fillStyle = '#FFFFFF'
	ctx.fill()
	ctx.restore()
}

function photoGrid(n: number) {
	const gap = 8
	const innerW = CARD_W - 18 * 2
	if (n <= 0) return { cols: 0, gap, cell: 0, cellH: 0, gridH: 0, innerW }
	if (n === 1) {
		const cellH = Math.round(innerW * 0.62)
		return { cols: 1, gap, cell: innerW, cellH, gridH: cellH, innerW }
	}
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

async function loadPhoto(node: any, photo: WeeklyPhoto): Promise<any> {
	const primary = photo.url
	const image = await loadCanvasImage(node, primary, 6000)
	if (image) return image
	if (photo.thumbnail && photo.thumbnail !== primary) {
		return loadCanvasImage(node, photo.thumbnail, 6000)
	}
	return null
}

function growthText(growth: WeeklyGrowthValue, unit: string) {
	if (growth.latest == null) {
		return { value: '本周未测量', note: '' }
	}
	if (growth.first != null && growth.delta != null) {
		return {
			value: `${fixed(growth.first)} → ${fixed(growth.latest)} ${unit}`,
			note: `${growth.delta >= 0 ? '+' : ''}${fixed(growth.delta)} ${unit}`,
		}
	}
	return { value: `${fixed(growth.latest)} ${unit}`, note: '本周测量' }
}

export async function renderWeeklyPoster(
	data: WeeklyReportData,
	miniProgramCodeUrl?: string,
): Promise<void> {
	const node = await queryPosterNode(WEEKLY_POSTER_CANVAS_ID, '周报画布未就绪')
	const ctx = node.getContext('2d')

	const [avatar, ...rest] = await Promise.all([
		loadCanvasImage(node, data.avatarUrl),
		...data.photos.slice(0, 3).map(photo => loadPhoto(node, photo)),
		loadCanvasImage(node, miniProgramCodeUrl),
	])
	const qr = rest[rest.length - 1]
	const photos = rest.slice(0, rest.length - 1).filter(Boolean)

	const paint = (height: number) => {
		node.width = WEEKLY_POSTER_W * POSTER_RENDER_SCALE
		node.height = height * POSTER_RENDER_SCALE
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.scale(POSTER_RENDER_SCALE, POSTER_RENDER_SCALE)
		ctx.clearRect(0, 0, WEEKLY_POSTER_W, height)
		return drawWeekly(ctx, data, avatar, photos, qr, height)
	}

	const measured = paint(WEEKLY_POSTER_H)
	const finalHeight = Math.max(Math.round(measured), MIN_POSTER_H)
	if (finalHeight !== WEEKLY_POSTER_H) paint(finalHeight)
}

function drawWeekly(
	ctx: any,
	data: WeeklyReportData,
	avatar: any,
	photos: any[],
	qr: any,
	height: number,
): number {
	const W = WEEKLY_POSTER_W

	const bg = ctx.createLinearGradient(0, 0, 0, height)
	bg.addColorStop(0, '#FFF4F6')
	bg.addColorStop(0.35, '#FFF9FA')
	bg.addColorStop(1, '#FDF8FF')
	ctx.fillStyle = bg
	ctx.fillRect(0, 0, W, height)
	drawSoftBlob(ctx, 42, 94, 120, '250, 205, 215')
	drawSoftBlob(ctx, W - 30, height - 190, 130, '232, 222, 255')

	const avD = 72
	const avX = (W - avD) / 2
	const avY = 28
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
		ctx.font = '32px sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillStyle = '#D4537E'
		ctx.fillText((data.babyName || '宝').slice(0, 1), avX + avD / 2, avY + avD / 2 + 1)
	}
	ctx.restore()

	ctx.textAlign = 'center'
	ctx.textBaseline = 'top'
	const name = fitText(ctx, data.babyName || '宝宝', CARD_W, 'bold 24px sans-serif', 15)
	ctx.font = name.font
	ctx.fillStyle = '#33272B'
	ctx.fillText(name.text, W / 2, 116)

	ctx.font = '11px sans-serif'
	ctx.fillStyle = '#B08A96'
	ctx.fillText(
		[data.weekTitle, data.ageText].filter(Boolean).join(' · '),
		W / 2,
		148,
	)

	ctx.font = 'bold 11px sans-serif'
	const badgeW = ctx.measureText('成长周报').width + 34
	const badgeX = (W - badgeW) / 2
	const badgeY = 172
	roundRect(ctx, badgeX, badgeY, badgeW, 24, 12)
	const badgeGrad = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0)
	badgeGrad.addColorStop(0, '#FFC2D1')
	badgeGrad.addColorStop(1, '#F9A9BE')
	ctx.fillStyle = badgeGrad
	ctx.fill()
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText('成长周报', W / 2, badgeY + 7)

	let y = 214
	drawCard(ctx, PAD, y, CARD_W, 76)
	ctx.textAlign = 'left'
	ctx.font = '11px sans-serif'
	ctx.fillStyle = '#B5A9AD'
	ctx.fillText('上周记录', PAD + 18, y + 16)
	const main =
		data.activeDays > 0
			? `${data.babyName || '宝宝'}，你记录了 `
			: `${data.babyName || '宝宝'}，留下了新的成长印记`
	ctx.font = 'bold 16px sans-serif'
	ctx.fillStyle = '#33272B'
	ctx.fillText(main, PAD + 18, y + 40)
	if (data.activeDays > 0) {
		const mainW = ctx.measureText(main).width
		ctx.fillStyle = '#E0678C'
		ctx.fillText(`${data.activeDays}`, PAD + 18 + mainW, y + 40)
		ctx.fillStyle = '#33272B'
		ctx.fillText(
			' 天',
			PAD + 18 + mainW + ctx.measureText(`${data.activeDays}`).width,
			y + 40,
		)
	}

	y += 76 + 14
	const tiles = [
		{
			label: '喂奶',
			value: `${data.feeding.count}次`,
			sub: data.feeding.amount > 0 ? `共 ${Math.round(data.feeding.amount)}ml` : '本周记录',
		},
		{
			label: '睡眠',
			value: `${(data.sleep.totalMinutes / 60).toFixed(1)}h`,
			sub: data.sleep.perDayMinutes > 0 ? `日均 ${(data.sleep.perDayMinutes / 60).toFixed(1)}h` : '本周记录',
		},
		{ label: '尿布', value: `${data.diaper.count}次`, sub: '换尿布' },
	]
	const tileGap = 9
	const tileW = (CARD_W - tileGap * 2) / 3
	const tileH = 88
	tiles.forEach((tile, index) => {
		const x = PAD + index * (tileW + tileGap)
		drawCard(ctx, x, y, tileW, tileH, 14)
		ctx.textAlign = 'center'
		ctx.font = '11px sans-serif'
		ctx.fillStyle = '#B5A9AD'
		ctx.fillText(tile.label, x + tileW / 2, y + 13)
		ctx.font = 'bold 19px sans-serif'
		ctx.fillStyle = '#E0678C'
		ctx.fillText(tile.value, x + tileW / 2, y + 38)
		ctx.font = '9.5px sans-serif'
		ctx.fillStyle = '#B5A9AD'
		ctx.fillText(tile.sub, x + tileW / 2, y + 66)
	})
	y += tileH + 10

	ctx.textAlign = 'center'
	ctx.font = '10.5px sans-serif'
	ctx.fillStyle = '#B5A9AD'
	ctx.fillText(
		`辅食 ${data.food.count} 次 · 饮水 ${Math.round(data.water.amount)}ml · 新里程碑 ${data.milestones.length} 个`,
		W / 2,
		y + 6,
	)
	y += 30

	const growthH = 128
	drawCard(ctx, PAD, y, CARD_W, growthH)
	ctx.textAlign = 'left'
	ctx.font = 'bold 14px sans-serif'
	ctx.fillStyle = '#33272B'
	ctx.fillText('成长变化', PAD + 18, y + 16)

	const heightText = growthText(data.height, 'cm')
	const weightText = growthText(data.weight, 'kg')
	const rows = [
		{ label: '身高', ...heightText },
		{ label: '体重', ...weightText },
	]
	rows.forEach((row, index) => {
		const rowY = y + 42 + index * 40
		ctx.font = '11px sans-serif'
		ctx.fillStyle = '#B5A9AD'
		ctx.fillText(row.label, PAD + 18, rowY)
		ctx.font = 'bold 13px sans-serif'
		ctx.fillStyle = row.value === '本周未测量' ? '#C3B7BA' : '#33272B'
		ctx.fillText(row.value, PAD + 60, rowY - 1)
		if (row.note) {
			ctx.textAlign = 'right'
			ctx.font = 'bold 11px sans-serif'
			ctx.fillStyle = row.note.startsWith('+') ? '#5F9E7F' : '#B5A9AD'
			ctx.fillText(row.note, PAD + CARD_W - 18, rowY)
			ctx.textAlign = 'left'
		}
		if (index === 0) {
			ctx.strokeStyle = '#F6EDEF'
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.moveTo(PAD + 18, y + 62)
			ctx.lineTo(PAD + CARD_W - 18, y + 62)
			ctx.stroke()
		}
	})
	y += growthH + 14

	if (data.milestones.length > 0) {
		const shown = data.milestones.slice(0, 2)
		const more = data.milestones.length - shown.length
		const milestoneH = 42 + shown.length * 30 + (more > 0 ? 24 : 0) + 12
		drawCard(ctx, PAD, y, CARD_W, milestoneH)
		ctx.textAlign = 'left'
		ctx.font = 'bold 14px sans-serif'
		ctx.fillStyle = '#33272B'
		ctx.fillText('新里程碑', PAD + 18, y + 16)
		ctx.textAlign = 'right'
		ctx.font = '10px sans-serif'
		ctx.fillStyle = '#B5A9AD'
		ctx.fillText(`${data.milestones.length} 个`, PAD + CARD_W - 18, y + 19)
		shown.forEach((item, index) => {
			const rowY = y + 44 + index * 30
			ctx.textAlign = 'left'
			ctx.font = '15px sans-serif'
			ctx.fillText(item.emoji, PAD + 18, rowY)
			ctx.font = '12px sans-serif'
			ctx.fillStyle = '#4A3C42'
			const title = fitText(ctx, item.title, CARD_W - 150, '12px sans-serif', 10)
			ctx.font = title.font
			ctx.fillText(title.text, PAD + 42, rowY)
			ctx.textAlign = 'right'
			ctx.font = '10px sans-serif'
			ctx.fillStyle = '#B5A9AD'
			const [, month, day] = item.date.split('-')
			ctx.fillText(`${Number(month)}.${Number(day)}`, PAD + CARD_W - 18, rowY + 1)
		})
		if (more > 0) {
			ctx.textAlign = 'left'
			ctx.font = '10px sans-serif'
			ctx.fillStyle = '#B5A9AD'
			ctx.fillText(`还有 ${more} 个新里程碑`, PAD + 42, y + 44 + shown.length * 30)
		}
		y += milestoneH + 14
	}

	const posterPhotos = photos.slice(0, 3)
	if (posterPhotos.length > 0) {
		const grid = photoGrid(posterPhotos.length)
		const photoH = 46 + grid.gridH + 18
		drawCard(ctx, PAD, y, CARD_W, photoH)
		ctx.textAlign = 'left'
		ctx.font = 'bold 14px sans-serif'
		ctx.fillStyle = '#33272B'
		ctx.fillText('本周瞬间', PAD + 18, y + 16)
		ctx.textAlign = 'right'
		ctx.font = '10px sans-serif'
		ctx.fillStyle = '#B5A9AD'
		ctx.fillText(
			data.photoTotal > posterPhotos.length
				? `精选 ${posterPhotos.length} 张 / 共 ${data.photoTotal} 张`
				: `${data.photoTotal} 张`,
			PAD + CARD_W - 18,
			y + 19,
		)
		const gridTop = y + 42
		posterPhotos.forEach((image, index) => {
			const row = Math.floor(index / grid.cols)
			const col = index % grid.cols
			const inRow = Math.min(grid.cols, posterPhotos.length - row * grid.cols)
			const rowW = inRow * grid.cell + (inRow - 1) * grid.gap
			const x =
				PAD + 18 + (grid.innerW - rowW) / 2 + col * (grid.cell + grid.gap)
			const y2 = gridTop + row * (grid.cellH + grid.gap)
			ctx.save()
			roundRect(ctx, x, y2, grid.cell, grid.cellH, 10)
			ctx.clip()
			const aspect = grid.cell / grid.cellH
			const iw = image.width
			const ih = image.height
			let sw = iw
			let sh = ih
			if (iw / ih > aspect) sw = ih * aspect
			else sh = iw / aspect
			ctx.drawImage(
				image,
				(iw - sw) / 2,
				(ih - sh) / 2,
				sw,
				sh,
				x,
				y2,
				grid.cell,
				grid.cellH,
			)
			ctx.restore()
		})
		y += photoH + 14
	}

	ctx.font = '12.5px sans-serif'
	const reviewLines = wrapText(ctx, data.reviewText, CARD_W - 36, 4)
	const reviewH = 28 + reviewLines.length * 21 + 24
	const reviewGrad = ctx.createLinearGradient(PAD, y, PAD + CARD_W, y + reviewH)
	reviewGrad.addColorStop(0, '#FFF3F6')
	reviewGrad.addColorStop(0.55, '#FFF8FB')
	reviewGrad.addColorStop(1, '#F6F2FF')
	roundRect(ctx, PAD, y, CARD_W, reviewH, CARD_R)
	ctx.fillStyle = reviewGrad
	ctx.fill()

	ctx.textAlign = 'left'
	ctx.font = '12.5px sans-serif'
	ctx.fillStyle = '#6B5560'
	reviewLines.forEach((line, index) => {
		ctx.fillText(line, PAD + 18, y + 28 + index * 21)
	})
	const lastLine = reviewLines[reviewLines.length - 1] || ''
	drawHeart(
		ctx,
		PAD + 18 + ctx.measureText(lastLine).width + 12,
		y + 28 + (reviewLines.length - 1) * 21 + 6,
		11,
		'#E0678C',
	)
	y += reviewH

	y += 22
	ctx.textAlign = 'left'
	ctx.font = 'bold 15px sans-serif'
	ctx.fillStyle = '#33272B'
	ctx.fillText('育娃手记', PAD + 2, y + 6)
	ctx.font = '10px sans-serif'
	ctx.fillStyle = '#B5A9AD'
	ctx.fillText('记录每一周的成长', PAD + 2, y + 28)

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

	return Math.max(y + 28, qrY + qrSize) + BOTTOM_PAD
}

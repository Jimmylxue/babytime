import { View, Text, Image } from '@tarojs/components'
import growthBoyIllu from '../../../assets/growth-baby-boy.jpg'
import growthGirlIllu from '../../../assets/growth-baby-girl.jpg'
import scaleBabyBoyIllu from '../../../assets/scale-baby-boy.jpg'
import scaleBabyGirlIllu from '../../../assets/scale-baby-girl.jpg'
import pencilWhiteIcon from '../../../assets/icons/pencil-white.svg'

interface GrowthHeroCardProps {
	metric: 'height' | 'weight'
	gender?: 'male' | 'female'
	/** 最新测量值，已 toFixed(1)；无数据为 null */
	latestValue: string | null
	/** 记录日期 yyyy.MM.dd；无数据为 null */
	latestDate: string | null
	daysSince: number | null
	onRecord: () => void
}

// 英雄卡：身高=动态刻度尺，体重=动态仪表盘；插画固定+信息列共用
export default function GrowthHeroCard({
	metric,
	gender,
	latestValue,
	latestDate,
	daysSince,
	onRecord,
}: GrowthHeroCardProps) {
	const heroIllu = gender === 'male' ? growthBoyIllu : growthGirlIllu

	// 刻度尺联动（固定插画 + 动态尺子）：虚线永远贴宝宝头顶、插画恒定高度踩尺底，
	// 身高变化只动刻度尺——量程取整档（身高 20cm / 体重 4kg），尺高按 头顶高度×量程÷测量值 反推，
	// 使虚线落点的刻度读数正好等于测量值（全档位尺高稳定在 197~203pt，视觉无跳变）
	const growthNum = latestValue != null ? parseFloat(latestValue) : null
	const rulerStep = metric === 'height' ? 20 : 2
	const rulerMin = metric === 'height' ? 60 : 4
	// 量程收紧到测量值 1.25 倍左右（整档），头顶上方只留一档内呼吸感，卡片不虚高
	let rulerMax = metric === 'height' ? 100 : 16
	if (growthNum != null && growthNum > 0) {
		rulerMax = Math.max(
			rulerMin,
			Math.round((growthNum * 1.25) / rulerStep) * rulerStep,
		)
		// 保证头顶与尺顶至少 10% 余量，虚线不顶到尺顶数字
		if (rulerMax < growthNum * 1.1) {
			rulerMax += rulerStep
		}
	}
	const rulerTicks = Array.from(
		{ length: rulerMax / rulerStep + 1 },
		(_, i) => i * rulerStep,
	)
	// 插画固定 130×160pt（aspectFill 裁两侧装饰边）；素材头顶距图顶 5.9%/8.1%
	const illuHeadPct = gender === 'male' ? 0.059 : 0.081
	const illuWidthPt = 158
	const illuHeightPt = 160
	const markHeightPt = illuHeightPt * (1 - illuHeadPct)
	// 尺高反推：头顶(固定) ÷ (测量值/量程)；无数据用默认尺高 200pt
	const rulerHeightPt =
		growthNum != null && growthNum > 0
			? (markHeightPt * rulerMax) / growthNum
			: 200

	// ── 体重仪表盘（同「固定插画 + 动态刻度」思路：宝宝站秤不动，指针角度随体重）──
	// 量程 = 测量值 1.25 倍取偶数档，向下跨 4 档（8kg 跨度，贴 UI 稿 4-12kg：9.2 → 4-12）
	const gaugeStep = 2
	const gaugeMax =
		growthNum != null && growthNum > 0
			? Math.max(
					gaugeStep * 2,
					Math.round((growthNum * 1.25) / gaugeStep) * gaugeStep,
				)
			: 12
	const gaugeMin = Math.max(0, gaugeMax - gaugeStep * 4)
	// 角度系：0° = 正上、顺时针为正；弧从 -136°(min) 到 -21°(max)，与 UI 稿一致
	// 弧心 = 宝宝躯干位置：弧带围着宝宝，脚踩区域底
	const gaugeStartDeg = -136
	const gaugeSpanDeg = 115
	const gaugeCenterX = 100 // pt，左区坐标系
	const gaugeCenterY = 100
	const gaugeT =
		growthNum != null
			? Math.min(1, Math.max(0, (growthNum - gaugeMin) / (gaugeMax - gaugeMin)))
			: 0
	const gaugePointerDeg = gaugeStartDeg + gaugeT * gaugeSpanDeg
	// 极坐标 → 左区 pt 坐标
	const gaugePos = (deg: number, radius: number) => ({
		left: `${gaugeCenterX + radius * Math.sin((deg * Math.PI) / 180)}px`,
		top: `${gaugeCenterY - radius * Math.cos((deg * Math.PI) / 180)}px`,
	})
	// 弧带用 SVG data-URI 渲染（小程序 webview 对 conic-gradient+mask 支持不可靠）：
	// 轨道浅粉全程，进度深粉 min→当前值；viewBox 200×200 与左区 pt 坐标系 1:1
	const gaugeDeg2XY = (deg: number, radius: number) => [
		100 + radius * Math.sin((deg * Math.PI) / 180),
		100 - radius * Math.cos((deg * Math.PI) / 180),
	]
	const gaugeArcPath = (a1: number, a2: number) => {
		const [x1, y1] = gaugeDeg2XY(a1, 87.5)
		const [x2, y2] = gaugeDeg2XY(a2, 87.5)
		const large = a2 - a1 > 180 ? 1 : 0
		return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A 87.5 87.5 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
	}
	const gaugeProgressDeg = gaugeStartDeg + gaugeT * gaugeSpanDeg
	// 指针三角画进同一张 SVG（顶点朝外指向弧带），避免 CSS 三角旋转的歧义
	const gaugePointerSvg =
		growthNum != null && growthNum > 0
			? (() => {
					const [ax, ay] = gaugeDeg2XY(gaugePointerDeg, 76)
					const [b1x, b1y] = gaugeDeg2XY(gaugePointerDeg - 9, 58)
					const [b2x, b2y] = gaugeDeg2XY(gaugePointerDeg + 9, 58)
					return `<polygon points="${ax},${ay} ${b1x},${b1y} ${b2x},${b2y}" fill="#FD4670"/>`
				})()
			: ''
	// 进度起点 = 轨道起点（min 刻度）：轨道圆头帽处叠深粉圆填充，读数末端保持平头精确
	const [gaugeCapX, gaugeCapY] = gaugeDeg2XY(gaugeStartDeg, 87.5)
	const gaugeArcSrc =
		'data:image/svg+xml;charset=utf-8,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
				`<path d="${gaugeArcPath(gaugeStartDeg, gaugeStartDeg + gaugeSpanDeg)}" stroke="#FBC9D5" stroke-width="13" fill="none" stroke-linecap="round"/>` +
				(gaugeT > 0
					? `<path d="${gaugeArcPath(gaugeStartDeg, gaugeProgressDeg)}" stroke="#FD7FA0" stroke-width="13" fill="none" stroke-linecap="butt"/>` +
						`<circle cx="${gaugeCapX.toFixed(2)}" cy="${gaugeCapY.toFixed(2)}" r="6.5" fill="#FD7FA0"/>`
					: '') +
				gaugePointerSvg +
				`</svg>`,
		)
	// 刻度：主刻度在偶数档位，档间 3 个副刻度
	const gaugeTicks: { deg: number; major: boolean }[] = []
	const gaugeSegDeg = gaugeSpanDeg / ((gaugeMax - gaugeMin) / gaugeStep)
	for (let kg = gaugeMin; kg <= gaugeMax; kg += gaugeStep) {
		const deg =
			gaugeStartDeg + ((kg - gaugeMin) / (gaugeMax - gaugeMin)) * gaugeSpanDeg
		gaugeTicks.push({ deg, major: true })
		if (kg < gaugeMax) {
			for (let m = 1; m <= 3; m++) {
				gaugeTicks.push({
					deg: deg + (gaugeSegDeg * m) / 4,
					major: false,
				})
			}
		}
	}
	const gaugeLabels: { deg: number; label: number }[] = []
	for (let kg = gaugeMin; kg <= gaugeMax; kg += gaugeStep) {
		gaugeLabels.push({
			deg: gaugeStartDeg + ((kg - gaugeMin) / (gaugeMax - gaugeMin)) * gaugeSpanDeg,
			label: kg,
		})
	}
	const gaugeScaleBaby = gender === 'male' ? scaleBabyBoyIllu : scaleBabyGirlIllu

	return (
		<View className="growth-hero-card">
			{metric === 'height' ? (
				<View
					className="growth-hero-left"
					style={{ height: `${rulerHeightPt}px` }}
				>
					<View className="growth-hero-ruler">
						{rulerTicks.map(num => (
							<Text
								key={num}
								className={`growth-ruler-num ${
									num === rulerMax ? 'at-top' : num === 0 ? 'at-bottom' : ''
								}`}
								style={{ top: `${(1 - num / rulerMax) * 100}%` }}
							>
								{num}
							</Text>
						))}
						<View className="growth-ruler-ticks" />
						<View className="growth-ruler-line" />
					</View>
					{/* 数值刻度线：位置恒等于头顶（bottom 固定），身高变化由尺子刻度吸收 */}
					{growthNum != null && growthNum > 0 && (
						<View
							className="growth-hero-mark"
							style={{ bottom: `${markHeightPt}px` }}
						/>
					)}
					{/* 宝宝插画固定尺寸踩尺底，不随测量值缩放 */}
					<Image
						className="growth-hero-illu"
						style={{
							width: `${illuWidthPt}px`,
							height: `${illuHeightPt}px`,
						}}
						src={heroIllu}
						mode="aspectFill"
					/>
				</View>
			) : (
				/* 体重仪表盘：弧带进度(SVG) + 刻度数字 + 指针 + 数值气泡 + 站秤宝宝 */
				<View className="growth-gauge-region">
					{/* 弧带：SVG 轨道 + 进度（兼容性最稳的画法） */}
					<Image
						className="growth-gauge-arc"
						src={gaugeArcSrc}
					/>
					{gaugeTicks.map((tick, i) => (
						<View
							key={`t${i}`}
							className={`growth-gauge-tick ${
								tick.major ? 'major' : 'minor'
							}`}
							style={{
								...gaugePos(tick.deg, 92.5),
								transform: `translate(-50%,-50%) rotate(${tick.deg}deg)`,
							}}
						/>
					))}
					{gaugeLabels.map(({ deg, label }) => (
						<Text
							key={label}
							className="growth-gauge-num"
							style={gaugePos(deg, 99)}
						>
							{label}
						</Text>
					))}
					<Text className="growth-gauge-unit" style={gaugePos(-150, 99)}>
						kg
					</Text>
					{/* 数值气泡：浮在表盘内、指针旁（r=48 恒在区内） */}
					{latestValue && (
						<View
							className="growth-gauge-bubble"
							style={gaugePos(gaugePointerDeg, 48)}
						>
							<Text className="growth-gauge-bubble-text">
								{latestValue}
								kg
							</Text>
						</View>
					)}
					{/* 站秤宝宝：盒子宽度按素材比例显式给定（防 image 默认 320rpx 盒溢出盖住按钮点击区） */}
					<Image
						className="growth-gauge-baby"
						style={{
							height: '150px',
							width: `${gender === 'male' ? 90 : 92}px`,
						}}
						src={gaugeScaleBaby}
						mode="aspectFit"
					/>
				</View>
			)}
			<View className="growth-hero-info">
				<Text className="growth-hero-label">
					最新{metric === 'height' ? '身高' : '体重'}
				</Text>
				<View className="growth-hero-value-row">
					<Text className="growth-hero-value">
						{latestValue ?? '--'}
					</Text>
					<Text className="growth-hero-unit">
						{metric === 'height' ? 'cm' : 'kg'}
					</Text>
				</View>
				{latestDate && (
					<Text className="growth-hero-date">
						记录于 {latestDate}
					</Text>
				)}
				<View className="growth-hero-btn" onClick={onRecord}>
					<Image className="growth-hero-btn-icon" src={pencilWhiteIcon} />
					<Text className="growth-hero-btn-text">
						记录{metric === 'height' ? '身高' : '体重'}
					</Text>
				</View>
				{daysSince != null && (
					<Text className="growth-hero-last">
						距离上次记录 {daysSince} 天
					</Text>
				)}
			</View>
		</View>
	)
}

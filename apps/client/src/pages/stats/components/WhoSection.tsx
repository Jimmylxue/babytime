import { View, Text } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import GrowthCurveChart, {
	GrowthCurvePoint,
	CurveView,
} from '../../../components/GrowthCurveChart'
import {
	makeDefaultCurveView,
	zoomCurveView,
} from '../../../components/GrowthCurveChart/painter'
import { getWhoBand } from '../../../utils/whoGrowthStandards'
import { formatMeasurement } from '../../../utils/format'
import { HeightWeightTrendPoint } from '../../../stores/recordStore'
import { ChartPosterOptions } from '../../../utils/chartExport'
import ChartActions from './ChartActions'

const WHO_HELP_ITEMS = [
	{
		title: '横轴是月龄，纵轴是身高 / 体重',
		text: '7 条浅色线是 WHO 标准里同龄同性别孩子的 7 个百分位位置，从 P3 到 P97。',
	},
	{
		title: 'P50 不是及格线',
		text: '它只是「一半孩子比这高、一半比这低」的中点，不需要刻意追上去。',
	},
	{
		title: '看通道，不看单点',
		text: '只要宝宝的曲线大致平行于参考线，即使位置一直偏低，也是正常生长。',
	},
	{
		title: 'P3 ~ P97 覆盖约 94% 的健康孩子',
		text: '落在带子外面也不一定有问题，大约 6% 的健康孩子天生就在外面。',
	},
	{
		title: '这些情况才建议问医生',
		text: '短期内连续跨越两条线向下掉。单次波动不用紧张 —— 在家测量本身有 1~2cm 误差。',
	},
]

interface WhoSectionProps {
	babyId: string
	metric: 'height' | 'weight'
	gender: 'male' | 'female'
	birthday: string
	babyName: string
	avatarUrl?: string
	genderText?: string
	/** 全量身高体重历史（stats 接口无 days 上限） */
	trendPoints: HeightWeightTrendPoint[]
	/** 用于换宝宝/换指标/换时间范围后重置视窗 */
	days: number
	exportPoster: (opts: ChartPosterOptions, action: 'save' | 'share') => void
}

// WHO 成长曲线独立模块：恒定 0-36 月龄全量数据，不受时间范围筛选影响
export default function WhoSection({
	babyId,
	metric,
	gender,
	birthday,
	babyName,
	avatarUrl,
	genderText,
	trendPoints,
	days,
	exportPoster,
}: WhoSectionProps) {
	// 点按成长曲线选中的某次测量，以及「怎么看」说明弹层
	const [selected, setSelected] = useState<GrowthCurvePoint | null>(null)
	const [helpVisible, setHelpVisible] = useState(false)
	// 成长曲线横轴视窗；null 表示用默认的「最近 6 个月」
	const [viewOverride, setViewOverride] = useState<CurveView | null>(null)

	// 换宝宝、切换指标或时间范围后，重置成长视窗
	useEffect(() => {
		setViewOverride(null)
	}, [babyId, metric, days])

	// 成长曲线的实测点：全量历史中的真实测量值换算为月龄
	const babyCurvePoints = trendPoints
		.filter(point => point[metric] != null)
		.map(point => ({
			ageMonths:
				(new Date(point.date).getTime() - new Date(birthday).getTime()) /
				(30.4375 * 24 * 3600 * 1000),
			value: point[metric] as number,
		}))

	// 选中点的解读：按当时的月龄去 WHO 表插值，算出落在哪两条参考线之间
	const selectedBand = useMemo(() => {
		if (!selected) return null
		return getWhoBand(metric, gender, selected.ageMonths, selected.value)
	}, [selected, metric, gender])

	// 成长曲线默认视窗：以宝宝当前月龄为右边界，向前取 6 个月
	const defaultView = useMemo(() => {
		const months =
			(Date.now() - new Date(birthday).getTime()) /
			(30.4375 * 24 * 3600 * 1000)
		return makeDefaultCurveView(months)
	}, [birthday])

	const view = viewOverride || defaultView
	const viewLabel = `${view.xMin.toFixed(1)} ~ ${view.xMax.toFixed(1)} 月龄`

	const zoom = (factor: number) => {
		setViewOverride(prev => zoomCurveView(prev || defaultView, factor))
	}

	const posterOpts: ChartPosterOptions = {
		kind: 'growth',
		title: `${metric === 'height' ? '身高' : '体重'}成长曲线`,
		babyName,
		avatarUrl,
		genderText,
		rangeText: '0-36月龄',
		metaTexts: ['WHO 生长标准', `共 ${babyCurvePoints.length} 次测量`],
		reviewTitle: '成长小结',
		reviewText: '对照 WHO 生长标准，看见宝宝成长的每一步～',
		data: {
			metric,
			gender,
			points: babyCurvePoints,
		},
	}

	return (
		<View className="who-section">
			<View className="who-section-head">
				<View className="section-heading">
					<View className="section-heading-icon growth-heading-icon">
						<View className="who-icon-bar who-icon-bar-top" />
						<View className="who-icon-bar who-icon-bar-mid" />
						<View className="who-icon-bar who-icon-bar-bottom" />
					</View>
					<Text className="section-heading-title">WHO 成长曲线</Text>
				</View>
				<View className="who-scope">
					<Text className="who-scope-text">0-36 月龄</Text>
				</View>
			</View>
			<View className="who-hint-row">
				<Text className="who-section-hint">
					按出生月龄对照 WHO 生长标准，取全部历史记录，不随时间范围筛选变化
				</Text>
				<View className="who-help-entry" onClick={() => setHelpVisible(true)}>
					<Text className="who-help-entry-text">怎么看</Text>
				</View>
			</View>
			{babyCurvePoints.length > 0 ? (
				<View className="chart-card growth-chart-card">
					<View className="growth-chart-header">
						<Text className="chart-title">
							{metric === 'height' ? '身高' : '体重'}成长曲线
						</Text>
						<ChartActions
							onShare={() => exportPoster(posterOpts, 'share')}
							onSave={() => exportPoster(posterOpts, 'save')}
						/>
					</View>
					<GrowthCurveChart
						canvasId="growth-who-chart"
						metric={metric}
						gender={gender}
						babyName={babyName}
						points={babyCurvePoints}
						showTitle={false}
						view={view}
						onViewChange={setViewOverride}
						onSelectPoint={setSelected}
					/>
					<View className="who-zoom-bar">
						<Text className="who-zoom-hint">双指缩放 · 拖动平移</Text>
						<View className="who-zoom-actions">
							<View className="who-zoom-btn" onClick={() => zoom(1 / 1.5)}>
								<Text className="who-zoom-btn-text">−</Text>
							</View>
							<View
								className="who-zoom-range"
								onClick={() => setViewOverride(null)}
							>
								<Text className="who-zoom-range-text">{viewLabel}</Text>
							</View>
							<View className="who-zoom-btn" onClick={() => zoom(1.5)}>
								<Text className="who-zoom-btn-text">+</Text>
							</View>
						</View>
					</View>
					<View className="who-readout">
						{selected && selectedBand ? (
							<View className="who-readout-body">
								<Text className="who-readout-main">
									{`${selected.ageMonths.toFixed(1)} 月龄 · ${formatMeasurement(selected.value)}${metric === 'height' ? 'cm' : 'kg'}`}
								</Text>
								<Text className="who-readout-sub">
									{`落在 ${selectedBand.band} · ${
										selectedBand.diffFromP50 >= 0 ? '高于' : '低于'
									}中位数 ${Math.abs(selectedBand.diffFromP50).toFixed(1)}${metric === 'height' ? 'cm' : 'kg'}`}
								</Text>
							</View>
						) : (
							<Text className="who-readout-hint">
								点一下曲线上的点，看看当时在同龄人里的位置
							</Text>
						)}
					</View>
					<Text className="who-disclaimer">
						参考线为
						WHO《儿童生长标准》P3~P97，仅供日常参考，具体以儿保医生评估为准
					</Text>
				</View>
			) : (
				<View className="chart-card growth-empty">
					<Text>记录身高体重后，这里会画出宝宝的成长曲线</Text>
				</View>
			)}

			{/* 「怎么看」说明弹层 */}
			{helpVisible && (
				<View className="who-help-mask" onClick={() => setHelpVisible(false)}>
					<View className="who-help-card">
						<Text className="who-help-title">WHO 成长曲线怎么看</Text>
						{WHO_HELP_ITEMS.map(item => (
							<View className="who-help-item" key={item.title}>
								<Text className="who-help-item-title">{item.title}</Text>
								<Text className="who-help-item-text">{item.text}</Text>
							</View>
						))}
						<Text className="who-help-foot">
							本图仅供日常参考，不能替代医生的评估与诊断
						</Text>
						<View className="who-help-ok" onClick={() => setHelpVisible(false)}>
							<Text className="who-help-ok-text">我知道了</Text>
						</View>
					</View>
				</View>
			)}
		</View>
	)
}

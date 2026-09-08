import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { useBabyStore } from '../../../stores/babyStore'
import { stoolAnalysisApi, trackEvent } from '../../../utils/request'
import { chooseAndUploadImage } from '../../../utils/upload'
import { calculateAge } from '../../../utils/date'
import './index.scss'

type StoolAnalysis = {
	riskLevel: 'normal' | 'observe' | 'medical_attention' | 'urgent' | 'unknown'
	summary: string
	observedFeatures: {
		color: string
		consistency: string
		visibleFindings: string[]
	}
	concerns: string[]
	guidance: string[]
	redFlags: string[]
	disclaimer: string
}

const riskLabels: Record<StoolAnalysis['riskLevel'], string> = {
	normal: '未见明显风险',
	observe: '建议留意观察',
	medical_attention: '建议咨询儿科',
	urgent: '建议尽快就医',
	unknown: '暂时无法判断',
}

export default function StoolAiPage() {
	const { isLoggedIn } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [babiesLoaded, setBabiesLoaded] = useState(false)
	const [image, setImage] = useState('')
	const [analysis, setAnalysis] = useState<StoolAnalysis | null>(null)
	const [analyzing, setAnalyzing] = useState(false)

	useDidShow(() => {
		trackEvent('tool_view', { name: 'stool_ai' })
		if (isLoggedIn) {
			fetchBabies()
				.catch(() => undefined)
				.finally(() => setBabiesLoaded(true))
		}
	})

	useShareAppMessage(() => ({
		title: 'AI 帮你看宝宝便便 · 育娃手记',
		path: '/pages/tool/stool-ai/index',
	}))

	const babyAge = currentBaby?.birthday ? calculateAge(currentBaby.birthday) : null

	const handleChoose = async () => {
		const url = await chooseAndUploadImage()
		if (url) {
			setImage(url)
			setAnalysis(null)
		}
	}

	const handleAnalyze = async () => {
		if (!image) {
			Taro.showToast({ title: '请先上传便便照片', icon: 'none' })
			return
		}
		if (!currentBaby) {
			Taro.showToast({ title: '请先创建宝宝档案', icon: 'none' })
			return
		}
		const consent = await Taro.showModal({
			title: '发送图片进行观察',
			content:
				'图片会发送至智谱视觉模型进行分析，仅供健康记录和就医参考，不能替代医生诊断。',
			confirmText: '确认',
		})
		if (!consent.confirm) return

		trackEvent('stool_analyze_click')
		setAnalyzing(true)
		try {
			const res = await stoolAnalysisApi.analyze({
				babyId: currentBaby.id,
				imageUrl: image,
			})
			setAnalysis(res.data || null)
		} catch (error) {
			Taro.showToast({ title: '暂时无法分析，请稍后重试', icon: 'none' })
		} finally {
			setAnalyzing(false)
		}
	}

	const goLogin = () => {
		Taro.navigateTo({ url: '/pages/login/index' })
	}

	const goBabyEdit = () => {
		Taro.navigateTo({ url: '/pages/baby-edit/index' })
	}

	const goDiaperRecord = () => {
		if (!currentBaby) return
		Taro.navigateTo({
			url: `/pages/record/index?type=diaper&babyId=${currentBaby.id}`,
		})
	}

	// 门禁在页面自身处理（分享/搜一搜可能直接落到本页，不经过工具 hub）
	if (!isLoggedIn) {
		return (
			<View className="stoolai-page">
				<View className="stoolai-gate">
					<Text className="stoolai-gate-emoji">💩</Text>
					<Text className="stoolai-gate-title">登录后使用 AI 识别便便</Text>
					<Text className="stoolai-gate-sub">拍张照，AI 帮你解读宝宝便便的颜色和性状</Text>
					<View className="stoolai-gate-btn" onClick={goLogin}>
						<Text>立即登录</Text>
					</View>
				</View>
			</View>
		)
	}

	if (babiesLoaded && !currentBaby) {
		return (
			<View className="stoolai-page">
				<View className="stoolai-gate">
					<Text className="stoolai-gate-emoji">🍼</Text>
					<Text className="stoolai-gate-title">先创建宝宝档案</Text>
					<Text className="stoolai-gate-sub">识别会结合宝宝月龄判断，更准确</Text>
					<View className="stoolai-gate-btn" onClick={goBabyEdit}>
						<Text>去创建</Text>
					</View>
				</View>
			</View>
		)
	}

	return (
		<View className="stoolai-page">
			<View className="stoolai-header">
				<Text className="stoolai-title">AI 识别便便</Text>
				<Text className="stoolai-sub">
					{currentBaby && babyAge
						? `正在为「${currentBaby.name}」分析 · ${babyAge.months} 个月`
						: '拍张照，AI 帮你解读宝宝便便情况'}
				</Text>
			</View>

			<View className="stoolai-card">
				<View className="stool-photo-tips">
					<Text className="stool-photo-tips-title">拍摄建议</Text>
					<Text className="stool-photo-tips-content">
						自然光下拍摄，对焦便便区域并尽量完整入镜；避免强滤镜、反光和阴影，不拍入宝宝面部或私密部位。
					</Text>
				</View>
				{image ? (
					<View className="image-preview">
						<Image
							className="image-preview-img"
							src={image}
							mode="aspectFill"
							onClick={() => Taro.previewImage({ current: image, urls: [image] })}
						/>
						<View
							className="image-remove-badge"
							onClick={() => {
								setImage('')
								setAnalysis(null)
							}}
						>
							<Text>×</Text>
						</View>
					</View>
				) : (
					<View className="image-picker" onClick={handleChoose}>
						<Text className="image-picker-icon">📷</Text>
						<Text className="image-picker-text">上传照片</Text>
					</View>
				)}
				{image && (
					<View
						className={`stool-analyze-btn${analyzing ? ' disabled' : ''}`}
						onClick={analyzing ? undefined : handleAnalyze}
					>
						<Text>
							{analyzing ? '图片分析中...' : analysis ? '重新分析' : '识别便便情况'}
						</Text>
					</View>
				)}
				{analysis && (
					<View className={`stool-result ${analysis.riskLevel}`}>
						<Text className="stool-result-title">{riskLabels[analysis.riskLevel]}</Text>
						<Text className="stool-result-summary">{analysis.summary}</Text>
						<Text className="stool-result-feature">
							观察：{analysis.observedFeatures.color}；
							{analysis.observedFeatures.consistency}
						</Text>
						{analysis.guidance?.map((item, index) => (
							<Text key={index} className="stool-result-guidance">
								{item}
							</Text>
						))}
						<Text className="stool-result-disclaimer">{analysis.disclaimer}</Text>
					</View>
				)}
			</View>

			{analysis && (
				<View className="stoolai-record-cta" onClick={goDiaperRecord}>
					<Text className="stoolai-record-cta-text">顺手记一条尿布 ›</Text>
				</View>
			)}

			<Text className="stoolai-footer">
				图片观察结果仅供健康记录和就医参考，不能替代医生诊断
			</Text>
		</View>
	)
}

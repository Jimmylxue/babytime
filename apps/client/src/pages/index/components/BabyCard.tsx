import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Fragment } from 'react'
import babyIllustration from '../../../assets/baby-illustration.webp'
import babyIllustrationGirl from '../../../assets/baby-illustration-girl.webp'
import emptyBabyIllustration from '../../../assets/empty-baby.webp'
import plusCircleIcon from '../../../assets/icons/plus-circle-white.svg'
import editIcon from '../../../assets/icons/edit.svg'
import trendingUpIcon from '../../../assets/icons/trending-up.svg'
import familyIcon from '../../../assets/icons/family.svg'
import babyFacePink from '../../../assets/icons/baby-face-pink.svg'
import babyFaceBlue from '../../../assets/icons/baby-face-blue.svg'

interface DisplayBaby {
	name: string
	gender: 'male' | 'female'
	avatar?: string
}

interface BabyCardProps {
	isLoggedIn: boolean
	/** 首屏宝宝数据是否已回来（区分「加载中」与「真的没有档案」） */
	babyReady: boolean
	currentBaby: { id: string } | null
	displayBaby: DisplayBaby | null
	displayAge: { months: number; days: number } | null
	heightWeight: { height: number; weight: number } | null
	/** 24 小时内的体温读数，过期为 null */
	temperature: { temperature: number } | null
	tempFeverClass: string
	tempTimeText: string
	featuredTip: { category: string; content: string } | null
	onOpenTips: () => void
	onGhostRecord: (type: string, metric: string) => void
}

// 宝宝档案区：骨架屏 / 未建档空状态 / 宝宝卡 三分支
export default function BabyCard({
	isLoggedIn,
	babyReady,
	currentBaby,
	displayBaby,
	displayAge,
	heightWeight,
	temperature,
	tempFeverClass,
	tempTimeText,
	featuredTip,
	onOpenTips,
	onGhostRecord,
}: BabyCardProps) {
	// 首屏宝宝数据未回来时显示骨架屏（避免闪「还没有宝宝信息」）
	if (isLoggedIn && !babyReady) {
		return (
			<View className="baby-card baby-skeleton">
				<View className="baby-main">
					<View className="baby-avatar sk-avatar" />
					<View className="baby-info">
						<View className="sk-bar sk-bar-name" />
						<View className="sk-bar sk-bar-age" />
					</View>
				</View>
				<View className="baby-metrics">
					<View className="baby-metric sk-tile" />
					<View className="baby-metric sk-tile" />
				</View>
			</View>
		)
	}

	// 已登录未建档：专属空状态（按 UI 稿还原）
	if (isLoggedIn && !currentBaby) {
		return (
			<View className="empty-baby-state">
				<Image
					className="ebs-illustration"
					src={emptyBabyIllustration}
					mode="aspectFit"
				/>
				<Text className="ebs-title">还没有宝宝信息</Text>
				<View className="ebs-desc">
					<Text className="ebs-desc-line">
						创建宝宝信息，记录成长点滴，
					</Text>
					<Text className="ebs-desc-line">生成专属成长统计</Text>
				</View>
				<View
					className="ebs-cta"
					onClick={() => Taro.navigateTo({ url: '/pages/baby-edit/index' })}
				>
					<Image className="ebs-cta-icon" src={plusCircleIcon} />
					<Text className="ebs-cta-text">去创建宝宝</Text>
				</View>
				<View className="ebs-features">
					<View className="ebs-feature">
						<View className="ebs-feature-circle t-amber">
							<Image className="ebs-feature-icon" src={editIcon} />
						</View>
						<Text className="ebs-feature-name">快速记录</Text>
						<Text className="ebs-feature-desc">吃睡玩一键记</Text>
					</View>
					<View className="ebs-feature">
						<View className="ebs-feature-circle t-pink">
							<Image className="ebs-feature-icon" src={trendingUpIcon} />
						</View>
						<Text className="ebs-feature-name">成长统计</Text>
						<Text className="ebs-feature-desc">趋势一目了然</Text>
					</View>
					<View className="ebs-feature">
						<View className="ebs-feature-circle t-green">
							<Image className="ebs-feature-icon" src={familyIcon} />
						</View>
						<Text className="ebs-feature-name">家庭共享</Text>
						<Text className="ebs-feature-desc">全家一起看娃</Text>
					</View>
				</View>
			</View>
		)
	}

	return (
		<View className="baby-card">
			<View className="baby-deco baby-deco-a" />
			<View className="baby-deco baby-deco-b" />
			<Image
				className="baby-illustration"
				src={
					displayBaby?.gender === 'female'
						? babyIllustrationGirl
						: babyIllustration
				}
				mode="aspectFit"
			/>
			<View className="baby-main">
				<View className="baby-avatar">
					{displayBaby?.avatar ? (
						<Image
							className="avatar-img"
							src={displayBaby.avatar}
							mode="aspectFill"
						/>
					) : (
						<Image
							className="avatar-baby-icon"
							src={
								displayBaby?.gender === 'male' ? babyFaceBlue : babyFacePink
							}
						/>
					)}
				</View>
				<View className="baby-info">
					<View className="baby-name-row">
						<Text className="baby-name">
							{displayBaby?.name ||
								(isLoggedIn && !currentBaby
									? '为宝宝建立专属档案'
									: '未添加宝贝')}
						</Text>
						{!isLoggedIn && displayBaby && (
							<View className="baby-demo-badge">
								<Text className="baby-demo-badge-text">示例</Text>
							</View>
						)}
						{displayBaby && (
							<View className={`baby-gender ${displayBaby.gender}`}>
								<Text className="baby-gender-icon">
									{displayBaby.gender === 'male' ? '♂' : '♀'}
								</Text>
							</View>
						)}
					</View>
					<Text className="baby-age">
						{isLoggedIn && !currentBaby
							? '记录吃奶、睡觉、换尿布，解锁成长统计'
							: displayAge
								? `${displayAge.months}个月 ${displayAge.days}天`
								: '添加宝宝档案后开始记录'}
					</Text>
				</View>
				{isLoggedIn && !currentBaby && (
					<View className="baby-create-btn">
						<Text className="baby-create-btn-text">去创建</Text>
					</View>
				)}
			</View>

			{(heightWeight || temperature || isLoggedIn) && (
				<View className={`baby-metrics${temperature ? ' has-temp' : ''}`}>
					{heightWeight ? (
						<Fragment>
							<View className="baby-metric m-weight">
								<View className="baby-metric-icon">
									<Text>⚖️</Text>
								</View>
								<View className="baby-metric-copy">
									<Text className="baby-metric-label">体重</Text>
									<View className="baby-metric-value">
										<Text className="baby-metric-num">
											{heightWeight.weight}
										</Text>
										<Text className="baby-metric-unit">kg</Text>
									</View>
								</View>
							</View>
							<View className="baby-metric m-height">
								<View className="baby-metric-icon">
									<Text>📏</Text>
								</View>
								<View className="baby-metric-copy">
									<Text className="baby-metric-label">身高</Text>
									<View className="baby-metric-value">
										<Text className="baby-metric-num">
											{heightWeight.height}
										</Text>
										<Text className="baby-metric-unit">cm</Text>
									</View>
								</View>
							</View>
						</Fragment>
					) : (
						<Fragment>
							{/* 空状态：虚线幽灵卡引导记录第一笔身高体重 */}
							<View
								className="baby-metric ghost"
								onClick={() => onGhostRecord('height_weight', 'weight')}
							>
								<View className="baby-metric-icon">
									<Text>⚖️</Text>
								</View>
								<View className="baby-metric-copy">
									<Text className="baby-metric-label">体重</Text>
									<View className="baby-metric-value">
										<Text className="ghost-add">＋ 记录</Text>
									</View>
								</View>
							</View>
							<View
								className="baby-metric ghost"
								onClick={() => onGhostRecord('height_weight', 'height')}
							>
								<View className="baby-metric-icon">
									<Text>📏</Text>
								</View>
								<View className="baby-metric-copy">
									<Text className="baby-metric-label">身高</Text>
									<View className="baby-metric-value">
										<Text className="ghost-add">＋ 记录</Text>
									</View>
								</View>
							</View>
						</Fragment>
					)}
					{temperature && (
						<View className={`baby-metric m-temp${tempFeverClass}`}>
							<View className="baby-metric-icon">
								<Text>🌡️</Text>
							</View>
							<View className="baby-metric-copy">
								<View className="baby-metric-label-row">
									<Text className="baby-metric-label">体温</Text>
									<Text className="baby-metric-time">{tempTimeText}</Text>
								</View>
								<View className="baby-metric-value">
									<Text className="baby-metric-num">
										{temperature.temperature}
									</Text>
									<Text className="baby-metric-unit">°C</Text>
								</View>
							</View>
						</View>
					)}
				</View>
			)}

			{/* 本月关注：一行入口，完整内容通过底部面板查看 */}
			{featuredTip && (
				<View className="baby-tip" onClick={onOpenTips}>
					<View className="baby-tip-badge">
						<Text>✦</Text>
					</View>
					<View className="baby-tip-copy">
						<Text className="baby-tip-tag">
							本月关注 · {featuredTip.category}
						</Text>
						<Text className="baby-tip-content">{featuredTip.content}</Text>
					</View>
					<Text className="baby-tip-arrow">›</Text>
				</View>
			)}
		</View>
	)
}

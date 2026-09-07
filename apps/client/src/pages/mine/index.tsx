import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { userApi, notificationApi, trackEvent } from '../../utils/request'
import { chooseAndUploadImage } from '../../utils/upload'
import babySmileIcon from '../../assets/icons/baby-smile.svg'
import familyFilledIcon from '../../assets/icons/family-filled.svg'
import agreementFilledIcon from '../../assets/icons/agreement-filled.svg'
import privacyFilledIcon from '../../assets/icons/privacy-filled.svg'
import feedbackFilledIcon from '../../assets/icons/feedback-filled.svg'
import headsetPurpleIcon from '../../assets/icons/headset-purple.svg'
import logoutCoralIcon from '../../assets/icons/logout-coral.svg'
import heartPinkIcon from '../../assets/icons/heart-pink.svg'
import gridBlueIcon from '../../assets/icons/grid-blue.svg'
import cloudIcon from '../../assets/icons/cloud.svg'
import trendingUpIcon from '../../assets/icons/trending-up.svg'
import familyIcon from '../../assets/icons/family.svg'
import bellIcon from '../../assets/icons/bell.svg'
import parentIcon from '../../assets/icons/parent.svg'
import minePig from '../../assets/mine-pig.jpg'
import TabBar from '../../components/TabBar'
import './index.scss'

export default function MinePage() {
	const { isLoggedIn, userInfo, setUserInfo } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [showEditSheet, setShowEditSheet] = useState(false)
	const [editNickname, setEditNickname] = useState('')
	const [editAvatar, setEditAvatar] = useState('')
	const [editRole, setEditRole] = useState('')
	const [reviewTemplateId, setReviewTemplateId] = useState('')
	const [reviewSubscribed, setReviewSubscribed] = useState(false)

	useDidShow(() => {
		if (isLoggedIn) {
			fetchProfile()
			fetchBabies()
			notificationApi
				.getConfig()
				.then(res => {
					setReviewTemplateId(
						res.data?.reviewEnabled ? res.data.reviewTemplateId : '',
					)
				})
				.catch(() => {})
		}
	})

	// 晚间回顾订阅：从首页今日记录模块迁移至此
	const handleReviewSubscribe = async () => {
		if (!reviewTemplateId) return
		try {
			const result = await (Taro as any).requestSubscribeMessage({
				tmplIds: [reviewTemplateId],
			})
			const status = result?.[reviewTemplateId] || 'unknown'
			await notificationApi.saveSubscriptions({ [reviewTemplateId]: status })
			void trackEvent('subscription_prompt_result', {
				template: 'daily_review',
				status,
			})
			if (status === 'accept') {
				setReviewSubscribed(true)
				Taro.showToast({ title: '晚间回顾已开启', icon: 'success' })
			}
		} catch {
			void trackEvent('subscription_prompt_result', {
				template: 'daily_review',
				status: 'error',
			})
		}
	}

	const goLogin = () => {
		Taro.navigateTo({ url: '/pages/login/index' })
	}

	const fetchProfile = async () => {
		try {
			const res = await userApi.getProfile()
			if (res.data) {
				setUserInfo({
					id: res.data.id,
					nickname: res.data.nickname,
					avatar: res.data.avatar,
					role: res.data.role,
				})
			}
		} catch (error) {
			console.error('获取用户信息失败', error)
		}
	}

	const handleOpenEdit = () => {
		setEditNickname(userInfo?.nickname || '')
		setEditAvatar(userInfo?.avatar || '')
		setEditRole(userInfo?.role || '')
		setShowEditSheet(true)
	}

	const handleChooseAvatar = async () => {
		const imageUrl = await chooseAndUploadImage()
		if (imageUrl) {
			setEditAvatar(imageUrl)
		}
	}

	const handleSaveProfile = async () => {
		if (!editNickname.trim()) {
			Taro.showToast({ title: '请输入昵称', icon: 'none' })
			return
		}
		try {
			const res = await userApi.updateProfile({
				nickname: editNickname.trim(),
				avatar: editAvatar,
				role: editRole,
			})
			if (res.data) {
				setUserInfo({
					id: res.data.id,
					nickname: res.data.nickname,
					avatar: res.data.avatar,
					role: res.data.role,
				})
				setShowEditSheet(false)
				Taro.showToast({ title: '保存成功', icon: 'success' })
			}
		} catch (error) {
			Taro.showToast({ title: '保存失败', icon: 'none' })
		}
	}

	const handleLogout = () => {
		Taro.showModal({
			title: '确认退出',
			content: '确定要退出登录吗？',
			success: res => {
				if (res.confirm) {
					useAuthStore.getState().logout()
					Taro.redirectTo({ url: '/pages/login/index' })
				}
			},
		})
	}

	const getRoleText = (role?: string) => {
		switch (role) {
			case 'father':
				return '爸爸'
			case 'mother':
				return '妈妈'
			default:
				return ''
		}
	}

	if (!isLoggedIn) {
		return (
			<View className="mine-page">
				{/* 未登录：引导卡（同款资料卡皮肤 + 卖点 + 登录按钮） */}
				<View className="profile-card guest">
					<Image className="profile-pig" src={minePig} mode="aspectFit" />
					<View className="profile-user" onClick={goLogin}>
						<View className="profile-avatar">
							<Image className="profile-avatar-icon" src={parentIcon} />
						</View>
						<View className="profile-info">
							<Text className="profile-name">未登录</Text>
							<View className="profile-sub-row">
								<Text className="profile-sub">登录后开启记录之旅</Text>
								<Text className="profile-sub-arrow">›</Text>
							</View>
						</View>
					</View>

					{/* 卖点 */}
					<View className="mine-perks">
						<View className="perk">
							<Image className="perk-icon-img" src={cloudIcon} />
							<Text className="perk-text">云端记录</Text>
						</View>
						<View className="perk">
							<Image className="perk-icon-img" src={trendingUpIcon} />
							<Text className="perk-text">成长统计</Text>
						</View>
						<View className="perk">
							<Image className="perk-icon-img" src={familyIcon} />
							<Text className="perk-text">家庭共享</Text>
						</View>
					</View>

					<View className="mine-login-btn" onClick={goLogin}>
						<Text className="mine-login-btn-text">微信一键登录</Text>
					</View>
				</View>

				<View className="mine-footer">
					<Text className="mine-footer-text">育娃手记 v1.0</Text>
					<Text className="mine-footer-text">用爱记录，用心陪伴</Text>
				</View>

				<TabBar />
			</View>
		)
	}

	return (
		<View className="mine-page">
			{/* 资料卡：点击打开编辑，右侧小猪插画纯装饰 */}
			<View className="profile-card" onClick={handleOpenEdit}>
				<Image className="profile-pig" src={minePig} mode="aspectFit" />
				<View className="profile-user">
					<View className="profile-avatar">
						{userInfo?.avatar ? (
							<Image
								className="profile-avatar-img"
								src={userInfo.avatar}
								mode="aspectFill"
							/>
						) : (
							<Image className="profile-avatar-icon" src={parentIcon} />
						)}
					</View>
					<View className="profile-info">
						<View className="profile-name-row">
							<Text className="profile-name">
								{userInfo?.nickname || '点击设置昵称'}
							</Text>
							{userInfo?.role && (
								<Text className="profile-role">{getRoleText(userInfo.role)}</Text>
							)}
						</View>
						<View className="profile-sub-row">
							<Text className="profile-sub">记录宝宝成长的每一个珍贵瞬间</Text>
							<Text className="profile-sub-arrow">›</Text>
						</View>
					</View>
				</View>
			</View>

			{/* 宝贝与家庭 */}
			<View className="section-label">
				<Image className="section-label-icon" src={heartPinkIcon} />
				<Text className="section-label-text">宝贝与家庭</Text>
			</View>
			<View className="mine-card">
				<View
					className="mine-item"
					onClick={() => Taro.navigateTo({ url: '/pages/baby/index' })}
				>
					<View className="mi-icon mi-icon-1">
						<Image className="mi-icon-img" src={babySmileIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">宝贝信息</Text>
						<Text className="mi-sub">记录宝宝的成长信息</Text>
					</View>
					<View className="mi-right">
						{currentBaby && (
							<Text className="mi-badge">{currentBaby.name}</Text>
						)}
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
				<View
					className="mine-item"
					onClick={() => Taro.navigateTo({ url: '/pages/family/index' })}
				>
					<View className="mi-icon mi-icon-2">
						<Image className="mi-icon-img" src={familyFilledIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">家庭成员</Text>
						<Text className="mi-sub">管理家庭成员信息</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
			</View>

			{/* 提醒 */}
			{reviewTemplateId ? (
				<>
					<View className="section-label">
						<Image className="section-label-icon" src={bellIcon} />
						<Text className="section-label-text">提醒</Text>
					</View>
					<View className="mine-card">
						<View className="mine-item" onClick={handleReviewSubscribe}>
							<View className="mi-icon mi-icon-7">
								<Image className="mi-icon-img" src={bellIcon} />
							</View>
							<View className="mi-copy">
								<Text className="mi-title">晚间回顾提醒</Text>
							</View>
							<View className="mi-right">
								<Text className="mi-badge">
									{reviewSubscribed ? '已开启' : '开启提醒'}
								</Text>
							</View>
						</View>
					</View>
				</>
			) : null}

			{/* 通用 */}
			<View className="section-label">
				<Image className="section-label-icon" src={gridBlueIcon} />
				<Text className="section-label-text">通用</Text>
			</View>
			<View className="mine-card">
				<View
					className="mine-item"
					onClick={() => Taro.navigateTo({ url: '/pages/agreement/index' })}
				>
					<View className="mi-icon mi-icon-3">
						<Image className="mi-icon-img" src={agreementFilledIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">用户协议</Text>
						<Text className="mi-sub">查看用户协议内容</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
				<View
					className="mine-item"
					onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}
				>
					<View className="mi-icon mi-icon-4">
						<Image className="mi-icon-img" src={privacyFilledIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">隐私政策</Text>
						<Text className="mi-sub">了解隐私政策说明</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
			</View>

			{/* 帮助与反馈 */}
			<View className="section-label">
				<Image className="section-label-icon" src={headsetPurpleIcon} />
				<Text className="section-label-text">帮助与反馈</Text>
			</View>
			<View className="mine-card">
				<Button
					className="mine-item mi-native-btn"
					hoverClass="none"
					openType="feedback"
				>
					<View className="mi-icon mi-icon-5">
						<Image className="mi-icon-img" src={feedbackFilledIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">意见反馈</Text>
						<Text className="mi-sub">提出建议与意见</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</Button>
				<Button
					className="mine-item mi-native-btn"
					hoverClass="none"
					openType="contact"
				>
					<View className="mi-icon mi-icon-6">
						<Image className="mi-icon-img" src={headsetPurpleIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title">联系客服</Text>
						<Text className="mi-sub">获取帮助与支持</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</Button>
			</View>

			{/* 退出登录 */}
			<View className="mine-card logout-card">
				<View className="mine-item logout-item" onClick={handleLogout}>
					<View className="mi-icon mi-icon-danger">
						<Image className="mi-icon-img" src={logoutCoralIcon} />
					</View>
					<View className="mi-copy">
						<Text className="mi-title mi-title-danger">退出登录</Text>
					</View>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
			</View>

			{/* 页脚 */}
			<View className="mine-footer">
				<Text className="mine-footer-text">育娃手记 v1.0</Text>
				<Text className="mine-footer-text">用爱记录，用心陪伴</Text>
			</View>

			{/* 编辑个人信息弹窗 */}
			{showEditSheet && (
				<View className="sheet-overlay" onClick={() => setShowEditSheet(false)}>
					<View className="sheet-panel" onClick={e => e.stopPropagation()}>
						<View className="sheet-handle" />
						<View className="sheet-header">
							<Text className="sheet-title">编辑个人信息</Text>
						</View>
						<View className="sheet-body">
							{/* 头像 */}
							<View className="edit-avatar-row" onClick={handleChooseAvatar}>
								<Text className="edit-label">头像</Text>
								<View className="edit-avatar-right">
									{editAvatar ? (
										<Image
											className="edit-avatar-img"
											src={editAvatar}
											mode="aspectFill"
										/>
									) : (
										<View className="edit-avatar-placeholder">
											<Text>📷</Text>
										</View>
									)}
									<Text className="mi-arrow">›</Text>
								</View>
							</View>

							{/* 昵称 */}
							<View className="edit-field">
								<Text className="edit-label">昵称</Text>
								<Input
									className="edit-input"
									value={editNickname}
									onInput={e => setEditNickname(e.detail.value)}
									placeholder="请输入昵称"
									maxlength={20}
								/>
							</View>

							{/* 角色 */}
							<View className="edit-field">
								<Text className="edit-label">我是</Text>
								<View className="role-select">
									<View
										className={`role-option ${editRole === 'father' ? 'active' : ''}`}
										onClick={() => setEditRole('father')}
									>
										<Text>爸爸</Text>
									</View>
									<View
										className={`role-option ${editRole === 'mother' ? 'active' : ''}`}
										onClick={() => setEditRole('mother')}
									>
										<Text>妈妈</Text>
									</View>
									<View
										className={`role-option ${editRole === '' ? 'active' : ''}`}
										onClick={() => setEditRole('')}
									>
										<Text>其他</Text>
									</View>
								</View>
							</View>

							<View className="sheet-actions">
								<View
									className="sheet-btn sheet-btn-cancel"
									onClick={() => setShowEditSheet(false)}
								>
									<Text>取消</Text>
								</View>
								<View
									className="sheet-btn sheet-btn-confirm"
									onClick={handleSaveProfile}
								>
									<Text>保存</Text>
								</View>
							</View>
						</View>
					</View>
				</View>
			)}

			<TabBar />
		</View>
	)
}

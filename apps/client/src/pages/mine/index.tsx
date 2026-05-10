import { View, Text, Image, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { userApi } from '../../utils/request'
import { chooseAndUploadImage } from '../../utils/upload'
import TabBar from '../../components/TabBar'
import './index.scss'

export default function MinePage() {
	const { isLoggedIn, userInfo, setUserInfo } = useAuthStore()
	const { currentBaby, fetchBabies } = useBabyStore()
	const [showEditSheet, setShowEditSheet] = useState(false)
	const [editNickname, setEditNickname] = useState('')
	const [editAvatar, setEditAvatar] = useState('')
	const [editRole, setEditRole] = useState('')

	useDidShow(() => {
		fetchProfile()
		fetchBabies()
	})

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
			case 'father': return '爸爸'
			case 'mother': return '妈妈'
			default: return ''
		}
	}

	if (!isLoggedIn) {
		return (
			<View className="mine-page">
				{/* 未登录引导 */}
				<View className="mine-hd" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
					<View className="mine-avatar">
						<Text className="mine-avatar-emoji">👨‍🍼</Text>
					</View>
					<View className="mine-info">
						<Text className="mine-name">点击登录</Text>
						<Text className="mine-edit-tip">登录后享受完整功能 ›</Text>
					</View>
				</View>

				<View className="mine-card">
					<View className="mine-item" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
						<View className="mi-icon mi-icon-1">
							<Text>🔑</Text>
						</View>
						<Text className="mi-text">立即登录</Text>
						<View className="mi-right">
							<Text className="mi-arrow">›</Text>
						</View>
					</View>
				</View>

				<View className="mine-footer">
					<Text className="mine-footer-text">小宝贝日记 v1.0</Text>
					<Text className="mine-footer-text">用爱记录，用心陪伴</Text>
				</View>

				<TabBar />
			</View>
		)
	}

	return (
		<View className="mine-page">
			{/* 个人信息头部 - 点击打开编辑 */}
			<View className="mine-hd" onClick={handleOpenEdit}>
				<View className="mine-avatar">
					{userInfo?.avatar ? (
						<Image
							className="mine-avatar-img"
							src={userInfo.avatar}
							mode="aspectFill"
						/>
					) : (
						<Text className="mine-avatar-emoji">👨‍🍼</Text>
					)}
					<View className="mine-avatar-badge">
						<Text className="mine-avatar-badge-icon">📷</Text>
					</View>
				</View>
				<View className="mine-info">
					<Text className="mine-name">
						{userInfo?.nickname || '点击设置昵称'}
					</Text>
					{userInfo?.role && (
						<Text className="mine-role">{getRoleText(userInfo.role)}</Text>
					)}
					<Text className="mine-edit-tip">点击编辑个人信息 ›</Text>
				</View>
			</View>

			{/* 宝贝与家庭 */}
			<View className="mine-card">
				<View
					className="mine-item"
					onClick={() => Taro.navigateTo({ url: '/pages/baby/index' })}
				>
					<View className="mi-icon mi-icon-1">
						<Text>👶</Text>
					</View>
					<Text className="mi-text">宝贝信息</Text>
					<View className="mi-right">
						{currentBaby && (
							<Text className="mi-badge">{currentBaby.name}</Text>
						)}
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
				<View className="mine-item" onClick={() => Taro.navigateTo({ url: '/pages/family/index' })}>
					<View className="mi-icon mi-icon-2">
						<Text>👨‍👩‍👧</Text>
					</View>
					<Text className="mi-text">家庭成员</Text>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
			</View>

			{/* 其他 */}
			<View className="mine-card">
				<View className="mine-item" onClick={handleLogout}>
					<View className="mi-icon mi-icon-danger">
						<Text>🚪</Text>
					</View>
					<Text className="mi-text mi-text-danger">退出登录</Text>
					<View className="mi-right">
						<Text className="mi-arrow">›</Text>
					</View>
				</View>
			</View>

			{/* 页脚 */}
			<View className="mine-footer">
				<Text className="mine-footer-text">小宝贝日记 v1.0</Text>
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
										<Image className="edit-avatar-img" src={editAvatar} mode="aspectFill" />
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

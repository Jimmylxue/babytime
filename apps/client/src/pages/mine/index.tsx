import { View, Text, Image, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { userApi, familyApi } from '../../utils/request'
import { chooseAndUploadImage } from '../../utils/upload'
import TabBar from '../../components/TabBar'
import './index.scss'

export default function MinePage() {
	const { userInfo, setUserInfo } = useAuthStore()
	const { babies, currentBaby, fetchBabies } = useBabyStore()
	const [showEditSheet, setShowEditSheet] = useState(false)
	const [editNickname, setEditNickname] = useState('')
	const [editAvatar, setEditAvatar] = useState('')
	const [editRole, setEditRole] = useState('')
	const [showFamilySheet, setShowFamilySheet] = useState(false)
	const [inviteCode, setInviteCode] = useState('')
	const [inputInviteCode, setInputInviteCode] = useState('')
	const [familyMembers, setFamilyMembers] = useState<any[]>([])

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

	const handleOpenFamily = async () => {
		setShowFamilySheet(true)
		if (currentBaby) {
			try {
				const res = await familyApi.getMembers(currentBaby.id)
				setFamilyMembers(res.data || [])
			} catch (error) {
				console.error('获取家庭成员失败', error)
			}
		}
	}

	const handleCreateInvite = async () => {
		if (!currentBaby) {
			Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
			return
		}
		try {
			const res = await familyApi.createInvite(currentBaby.id)
			setInviteCode(res.data.inviteCode)
		} catch (error) {
			Taro.showToast({ title: '生成邀请码失败', icon: 'none' })
		}
	}

	const handleCopyInviteCode = () => {
		Taro.setClipboardData({
			data: inviteCode,
			success: () => {
				Taro.showToast({ title: '已复制', icon: 'success' })
			},
		})
	}

	const handleAcceptInvite = async () => {
		if (!inputInviteCode.trim()) {
			Taro.showToast({ title: '请输入邀请码', icon: 'none' })
			return
		}
		try {
			await familyApi.acceptInvite(inputInviteCode.trim())
			Taro.showToast({ title: '加入成功', icon: 'success' })
			setInputInviteCode('')
			setShowFamilySheet(false)
		} catch (error) {
			Taro.showToast({ title: '邀请码无效', icon: 'none' })
		}
	}

	const getRoleText = (role?: string) => {
		switch (role) {
			case 'father': return '爸爸'
			case 'mother': return '妈妈'
			default: return ''
		}
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
				<View className="mine-item" onClick={handleOpenFamily}>
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

			{/* 家庭成员弹窗 */}
			{showFamilySheet && (
				<View className="sheet-overlay" onClick={() => setShowFamilySheet(false)}>
					<View className="sheet-panel sheet-panel-large" onClick={e => e.stopPropagation()}>
						<View className="sheet-handle" />
						<View className="sheet-header">
							<Text className="sheet-title">家庭成员</Text>
						</View>
						<View className="sheet-body">
							{/* 当前成员 */}
							{familyMembers.length > 0 && (
								<View className="family-members">
									<Text className="family-label">当前成员</Text>
									{familyMembers.map((member: any) => (
										<View key={member.id} className="member-item">
											<View className="member-avatar">
												{member.user?.avatar ? (
													<Image src={member.user.avatar} mode="aspectFill" />
												) : (
													<Text>👤</Text>
												)}
											</View>
											<Text className="member-name">
												{member.user?.nickname || '未知用户'}
											</Text>
											<Text className="member-role-tag">
												{getRoleText(member.user?.role) || getRoleText(member.role) || '家人'}
											</Text>
										</View>
									))}
								</View>
							)}

							{/* 邀请家人 */}
							<View className="family-section">
								<Text className="family-label">邀请家人</Text>
								<Text className="family-desc">分享邀请码给家人，即可共同记录宝宝成长</Text>
								{inviteCode ? (
									<View className="invite-code-box">
										<Text className="invite-code-text">{inviteCode}</Text>
										<View className="invite-copy-btn" onClick={handleCopyInviteCode}>
											<Text>复制</Text>
										</View>
									</View>
								) : (
									<View className="invite-generate-btn" onClick={handleCreateInvite}>
										<Text>生成邀请码</Text>
									</View>
								)}
							</View>

							{/* 加入家庭 */}
							<View className="family-section">
								<Text className="family-label">加入家庭</Text>
								<Text className="family-desc">输入家人的邀请码，即可查看宝宝信息</Text>
								<View className="invite-input-row">
									<Input
										className="invite-input"
										value={inputInviteCode}
										onInput={e => setInputInviteCode(e.detail.value)}
										placeholder="请输入邀请码"
										maxlength={8}
									/>
									<View className="invite-join-btn" onClick={handleAcceptInvite}>
										<Text>加入</Text>
									</View>
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

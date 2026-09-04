import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { userApi } from '../../utils/request'
import appLogo from '../../assets/app-logo.png'
import editIcon from '../../assets/icons/edit.svg'
import trendingUpIcon from '../../assets/icons/trending-up.svg'
import familyIcon from '../../assets/icons/family.svg'
import messageCircleIcon from '../../assets/icons/message-circle.svg'
import './index.scss'

export default function LoginPage() {
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [agreed, setAgreed] = useState(false)

	const handleLogin = async () => {
		if (!agreed) {
			Taro.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' })
			return
		}
		setLoading(true)
		try {
			const loginRes = await Taro.login()
			const { code } = loginRes

			const res = await userApi.login(code)

			Taro.setStorageSync('token', res.data.token)
			Taro.setStorageSync('userInfo', res.data.user)

			useAuthStore.setState({
				token: res.data.token,
				userInfo: res.data.user,
				isLoggedIn: true,
			})

			Taro.showToast({ title: '登录成功', icon: 'success' })

			setTimeout(async () => {
				// 从邀请卡进入的：登录后直接回到加入家庭页
				if (router.params.redirect === 'family-join' && router.params.invite) {
					Taro.redirectTo({
						url: `/pages/family-join/index?invite=${router.params.invite}`,
					})
					return
				}
				// 新用户还没有宝宝档案时，先进引导页创建
				try {
					await useBabyStore.getState().fetchBabies()
					const hasBaby = useBabyStore.getState().babies.length > 0
					if (hasBaby) {
						Taro.switchTab({ url: '/pages/index/index' })
					} else {
						Taro.redirectTo({ url: '/pages/onboarding/index' })
					}
				} catch {
					Taro.switchTab({ url: '/pages/index/index' })
				}
			}, 1500)
		} catch (error) {
			Taro.showToast({ title: '登录失败', icon: 'none' })
		} finally {
			setLoading(false)
		}
	}

	const navigateToAgreement = () => {
		Taro.navigateTo({ url: '/pages/agreement/index' })
	}

	const navigateToPrivacy = () => {
		Taro.navigateTo({ url: '/pages/privacy/index' })
	}

	return (
		<View className="login-page">
			{/* 背景装饰 */}
			<View className="login-deco login-deco-a" />
			<View className="login-deco login-deco-b" />
			<View className="login-deco login-deco-c" />

			<View className="login-content">
				<View className="logo-section">
					<View className="logo-circle">
						<Image className="logo-icon-img" src={appLogo} />
					</View>
					<Text className="app-title">育娃手记</Text>
					<Text className="app-subtitle">记录宝宝成长的每一天</Text>
				</View>

				<View className="features">
					<View className="feature-card">
						<View className="feature-icon-wrap fi-1">
							<Image className="feature-icon-img" src={editIcon} />
						</View>
						<Text className="feature-text">快速记录</Text>
						<Text className="feature-desc">吃睡玩一键记</Text>
					</View>
					<View className="feature-card">
						<View className="feature-icon-wrap fi-2">
							<Image className="feature-icon-img" src={trendingUpIcon} />
						</View>
						<Text className="feature-text">成长统计</Text>
						<Text className="feature-desc">趋势一目了然</Text>
					</View>
					<View className="feature-card">
						<View className="feature-icon-wrap fi-3">
							<Image className="feature-icon-img" src={familyIcon} />
						</View>
						<Text className="feature-text">家庭共享</Text>
						<Text className="feature-desc">全家一起看娃</Text>
					</View>
				</View>

				<View
					className={`login-btn ${!agreed ? 'login-btn-disabled' : ''}`}
					onClick={handleLogin}
				>
					<Image className="login-btn-icon-img" src={messageCircleIcon} />
					<Text className="login-btn-text">
						{loading ? '登录中...' : '微信一键登录'}
					</Text>
				</View>

				<View className="agreement">
					<View
						className="agreement-checkbox"
						onClick={() => setAgreed(!agreed)}
					>
						<View className={`checkbox ${agreed ? 'checkbox-checked' : ''}`}>
							{agreed && <Text className="checkbox-icon">✓</Text>}
						</View>
					</View>
					<Text className="agreement-text">我已阅读并同意</Text>
					<Text className="agreement-link" onClick={navigateToAgreement}>
						《用户协议》
					</Text>
					<Text className="agreement-text">和</Text>
					<Text className="agreement-link" onClick={navigateToPrivacy}>
						《隐私政策》
					</Text>
				</View>
			</View>
		</View>
	)
}

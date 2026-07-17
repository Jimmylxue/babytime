import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { userApi } from '../../utils/request'
import './index.scss'

export default function LoginPage() {
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

			console.log(loginRes)
			const res = await userApi.login(code)

			Taro.setStorageSync('token', res.data.token)
			Taro.setStorageSync('userInfo', res.data.user)

			useAuthStore.setState({
				token: res.data.token,
				userInfo: res.data.user,
				isLoggedIn: true,
			})

			Taro.showToast({ title: '登录成功', icon: 'success' })

			setTimeout(() => {
				Taro.switchTab({ url: '/pages/index/index' })
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
			<View className="login-content">
				<View className="logo-section">
					<View className="logo-circle">
						<Text className="logo-icon">👶</Text>
					</View>
					<Text className="app-title">小宝贝日记</Text>
					<Text className="app-subtitle">记录宝宝成长的每一天</Text>
				</View>

				<View className="features">
					<View className="feature-item">
						<Text className="feature-icon">📝</Text>
						<Text className="feature-text">3秒快速记录</Text>
					</View>
					<View className="feature-item">
						<Text className="feature-icon">📈</Text>
						<Text className="feature-text">数据统计分析</Text>
					</View>
					<View className="feature-item">
						<Text className="feature-icon">👶</Text>
						<Text className="feature-text">支持多宝宝</Text>
					</View>
				</View>

				<View
					className={`login-btn ${!agreed ? 'login-btn-disabled' : ''}`}
					onClick={handleLogin}
				>
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

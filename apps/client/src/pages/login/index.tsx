import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { userApi } from '../../utils/request';
import './index.scss';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const loginRes = await Taro.login();
      const { code } = loginRes;

      const res = await userApi.login(code);

      Taro.setStorageSync('token', res.data.token);
      Taro.setStorageSync('userInfo', res.data.user);

      useAuthStore.setState({
        token: res.data.token,
        userInfo: res.data.user,
        isLoggedIn: true,
      });

      Taro.showToast({ title: '登录成功', icon: 'success' });

      setTimeout(() => {
        Taro.switchTab({ url: '/pages/index/index' });
      }, 1500);
    } catch (error) {
      Taro.showToast({ title: '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

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
            <Text className="feature-icon">📊</Text>
            <Text className="feature-text">数据统计分析</Text>
          </View>
          <View className="feature-item">
            <Text className="feature-icon">👶</Text>
            <Text className="feature-text">支持多宝宝</Text>
          </View>
        </View>

        <View className="login-btn" onClick={handleLogin}>
          <Text className="login-btn-text">
            {loading ? '登录中...' : '微信一键登录'}
          </Text>
        </View>

        <Text className="agreement">
          登录即同意《用户协议》和《隐私政策》
        </Text>
      </View>
    </View>
  );
}

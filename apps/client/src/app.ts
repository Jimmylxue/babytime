import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { useAuthStore } from './stores/authStore';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 检查是否已登录
    const { token } = useAuthStore.getState();
    if (!token) {
      // 未登录，跳转到登录页
      Taro.redirectTo({ url: '/pages/login/index' });
    }
  });

  return children;
}

export default App;

import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { captureLaunchScene } from './utils/attribution';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    // 捕获扫码来源（海报二维码的场景值），登录时上报做获客归因
    captureLaunchScene(options);
    // 未登录用户直接留在首页，展示 mock 数据体验功能
  });

  return children;
}

export default App;

import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 未登录用户直接留在首页，展示 mock 数据体验功能
  });

  return children;
}

export default App;

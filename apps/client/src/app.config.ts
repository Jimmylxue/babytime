export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/baby/index',
    'pages/stats/index',
    'pages/mine/index',
    'pages/login/index',
    'pages/record/index',
    'pages/photo/index',
    'pages/baby-edit/index',
  ],
  tabBar: {
    custom: true,
    color: '#999',
    selectedColor: '#5B6EF5',
    backgroundColor: '#fff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
      },
      {
        pagePath: 'pages/stats/index',
        text: '统计',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
      },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#5B6EF5',
    navigationBarTitleText: '小宝贝日记',
    navigationBarTextStyle: 'white',
  },
})

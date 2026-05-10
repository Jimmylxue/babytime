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
    'pages/family/index',
    'pages/agreement/index',
    'pages/privacy/index',
  ],
  tabBar: {
    custom: true,
    color: '#A8A59E',
    selectedColor: '#FFA5B4',
    backgroundColor: '#FFFDF9',
    borderStyle: 'white',
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
    navigationBarBackgroundColor: '#FFFDF9',
    navigationBarTitleText: '小宝贝日记',
    navigationBarTextStyle: 'black',
  },
})

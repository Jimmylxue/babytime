import Taro from '@tarojs/taro'

export async function needLogin(): Promise<boolean> {
  const res = await Taro.showModal({
    title: '需要登录',
    content: '该功能需要登录后使用，是否立即登录？',
    confirmText: '立即登录',
    cancelText: '暂不登录',
  })
  if (res.confirm) {
    Taro.navigateTo({ url: '/pages/login/index' })
    return true
  }
  return false
}

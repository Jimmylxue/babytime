/**
 * 获客归因：从扫码进入时的场景值里解析来源。
 *
 * 海报二维码是服务端生成的带场景值码（`src=album` 这类），
 * 微信会把它放在启动参数 `query.scene`（urlencode 过）里带进来。
 * 解析后存本地，登录时随 login 请求上报 —— **服务端只在新用户创建时落库**，
 * 所以这里只管「捕获最新一次」，去不去重是服务端的事。
 */
import Taro from '@tarojs/taro'

const STORAGE_KEY = 'acquisition_source'
/** 与服务端白名单保持一致（user.service / notification.service） */
const ALLOWED = new Set(['album', 'daily', 'chart', 'family'])

/** 在 app 启动钩子里调用；也兜底读一次同步启动参数 */
export function captureLaunchScene(options?: { query?: Record<string, unknown> }) {
  try {
    const query = (options?.query || Taro.getLaunchOptionsSync()?.query || {}) as Record<string, unknown>
    const raw = typeof query.scene === 'string' ? query.scene : ''
    if (!raw) return
    const decoded = decodeURIComponent(raw)
    // scene 格式约定为 `src=<来源>`（与 getPosterQrCode 的生成保持一致）
    const matched = decoded.match(/(?:^|&)src=([a-z]+)/i)
    const value = matched?.[1]?.toLowerCase()
    if (value && ALLOWED.has(value)) {
      Taro.setStorageSync(STORAGE_KEY, value)
    }
  } catch {
    // 归因失败不影响任何主流程
  }
}

/** 当前记录到的来源；没有则返回 null */
export function getAcquisitionSource(): string | null {
  try {
    const value = Taro.getStorageSync(STORAGE_KEY)
    return typeof value === 'string' && ALLOWED.has(value) ? value : null
  } catch {
    return null
  }
}

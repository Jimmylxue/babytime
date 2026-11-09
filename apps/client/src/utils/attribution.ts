/**
 * 获客归因：从启动参数里解析来源。
 *
 * 两种来源：
 * ① 海报/场景码扫码 → 微信放进 `query.scene`（urlencode 过的 `src=album` 这种）；
 * ② 直接转发的卡片 → `useShareAppMessage` 里自己拼的 `path` 带 `?src=handoff`，
 *    参数会原样出现在 `query` 上。交接班卡片走的是这一条。
 *
 * 解析后存本地，登录时随 login 请求上报 —— **服务端只在新用户创建时落库**，
 * 所以这里只管「捕获最新一次」，去不去重是服务端的事。
 */
import Taro from '@tarojs/taro'

const STORAGE_KEY = 'acquisition_source'
/** 与服务端白名单保持一致（user.service / notification.service / admin constants） */
const ALLOWED = new Set(['album', 'daily', 'chart', 'family', 'milestone', 'weekly', 'handoff'])

/** 在 app 启动钩子里调用；也兜底读一次同步启动参数 */
export function captureLaunchScene(options?: { query?: Record<string, unknown> }) {
  try {
    const query = (options?.query || Taro.getLaunchOptionsSync()?.query || {}) as Record<string, unknown>

    // ① 扫码场景值：约定 `src=<来源>`，微信会 urlencode 后塞进 scene
    const rawScene = typeof query.scene === 'string' ? query.scene : ''
    if (rawScene) {
      const decoded = decodeURIComponent(rawScene)
      const matched = decoded.match(/(?:^|&)src=([a-z]+)/i)
      const value = matched?.[1]?.toLowerCase()
      if (value && ALLOWED.has(value)) {
        Taro.setStorageSync(STORAGE_KEY, value)
        return
      }
    }

    // ② 转发卡片的直接参数：?src=handoff
    const direct = typeof query.src === 'string' ? query.src.toLowerCase() : ''
    if (direct && ALLOWED.has(direct)) {
      Taro.setStorageSync(STORAGE_KEY, direct)
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

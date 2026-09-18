/**
 * 海报用的小程序码：优先取服务端生成的**带场景值**码（扫码可归因来源），
 * 服务端没部署 / 微信接口失败时回退到打包在包里的静态码 —— 任何情况都能出图。
 *
 * 场景值约定：`src=<来源>`，来源白名单见 attribution.ts / 服务端。
 */
import Taro from '@tarojs/taro'
import { request } from './request'
import staticQrCode from '../assets/mini-program-code.jpg'

/** 同一场景只发一次请求（成功才缓存）；失败交给上一次的结果，不重复等待 */
const memoryCache = new Map<string, Promise<string>>()

export function fetchPosterQrCode(scene: string): Promise<string> {
  const cached = memoryCache.get(scene)
  if (cached) return cached

  const task = loadQrCode(scene).catch((error) => {
    console.warn(`[posterQr] 场景码获取失败，回退静态码（${scene}）:`, error?.message || error)
    // ⚠️ 失败不留在缓存里：服务端接口部署上线后，同一次会话里再生成一次就能用上场景码，
    // 不必等用户重启小程序
    memoryCache.delete(scene)
    return staticQrCode as unknown as string
  })
  memoryCache.set(scene, task)
  return task
}

async function loadQrCode(scene: string): Promise<string> {
  // silent：这是「有兜底、失败也无所谓」的调用，不能因为服务端还没部署就弹「请求失败」
  const res = await request<{ base64: string }>({
    url: `/notification/poster-qrcode?scene=${encodeURIComponent(scene)}`,
    silent: true,
  })
  const base64 = res?.data?.base64
  if (!base64) throw new Error('二维码数据为空')

  // 写成本地文件再交给画布：canvas createImage 对 base64 data URI 的支持在各端参差，
  // 本地路径是最稳的。文件名固定，writeFile 默认覆盖，天然缓存。
  const filePath = `${Taro.env.USER_DATA_PATH}/poster-qr-${scene}.jpg`
  await Taro.getFileSystemManager().writeFile({
    filePath,
    data: base64,
    encoding: 'base64',
  })
  return filePath
}

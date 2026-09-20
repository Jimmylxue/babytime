/**
 * 装饰插画的 CDN 地址（与用户照片同桶同域名）。
 *
 * ⚠️ 教训（2026-09-20）：打进小程序包内的 webp，iOS 和 Android 真机的
 * image 组件都不渲染（开发者工具模拟器正常）——装饰图一律走 CDN 的 PNG。
 *
 * 加图流程：sips 转 PNG → node apps/server/scripts/upload-assets.js <文件...>
 * → 在这里登记一行。
 */
const CDN_BASE = 'https://babyimg.jimmyxuexue.top/baby-time/assets'

export const CDN_ASSETS = {
  albumBaby: `${CDN_BASE}/album-baby.png`,
  appLogo: `${CDN_BASE}/app-logo.png`,
  avatarBoy: `${CDN_BASE}/avatar-boy.png`,
  avatarGirl: `${CDN_BASE}/avatar-girl.png`,
  babyBearHeart: `${CDN_BASE}/baby-bear-heart.png`,
  babyIllustration: `${CDN_BASE}/baby-illustration.png`,
  babyIllustrationGirl: `${CDN_BASE}/baby-illustration-girl.png`,
  diaperBaby: `${CDN_BASE}/diaper-baby.png`,
  editIllustration: `${CDN_BASE}/edit-illustration.png`,
  emptyBaby: `${CDN_BASE}/empty-baby.png`,
  familyIllustration: `${CDN_BASE}/family-illustration.png`,
  feedingBaby: `${CDN_BASE}/feeding-baby.png`,
  sleepBaby: `${CDN_BASE}/sleep-baby.png`,
  vaccineSafety: `${CDN_BASE}/vaccine-safety.png`,
} as const

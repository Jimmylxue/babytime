/**
 * 列表/网格小图的地址改写：用又拍云「原生图片处理」按 URL 后缀出缩略图。
 *
 * 语法是 `<图片地址>!<指令>`，例如
 *   https://babyimg.jimmyxuexue.top/baby-time/xxx.jpg!/fw/400/quality/80
 * 零存储成本、不改上传链路，**历史照片同样生效**（这是比上传时另存一份缩略图
 * 更划算的地方：photos.thumbnail 那列从来没被写过，补也补不齐存量）。
 *
 * 2026-09-23 线上实测：`!` 分隔符与 fw / quality / format / clip / rotate 可用；
 * `@` 分隔符未开（404），`/q/` 这类简写不是合法指令（400）。
 *
 * 只对确认开启了处理的域名追加指令。不认识的地址一律原样返回：
 *   - 本地开发（UPLOAD_DRIVER=local）由 Nest 静态目录服务，不认这套语法；
 *   - image.jimmyxuexue.top 是历史图床域名，根目录与现桶不同，无法确认已开启。
 * 追加在未开启的地址上会直接 404 变裂图，所以这里宁可放行不做优化。
 */

/** 已确认开启原生图片处理的图床 origin */
const PROCESSABLE_ORIGINS = ['https://babyimg.jimmyxuexue.top'];

/**
 * 宽度档位：按 3x 屏的实际显示像素取整，再宽就是白付流量。
 * SCSS 里的 px 会被 Taro 转成 rpx（750 设计宽度），显示 pt = px / 2。
 */
export const THUMB_W = {
  /** 相册三列网格（~226rpx）与首页横排（200rpx） */
  grid: 400,
  /**
   * 里程碑整宽照片（widthFix，显示 ~690rpx ≈ 359pt，3x 屏要 1076px）。
   * 没按满格取：竖图只显示 62% 宽，且列表位不该跟大图预览较真；
   * 900 是"看不出比原图软"的下限，再降就开始糊了。
   */
  wide: 900,
  /** 记录详情行内小方图（64rpx） */
  chip: 240,
} as const;

/** 按宽等比缩放 + 压一档质量；不改输出格式，避免真机 webp 兼容性坑 */
export function thumbUrl(
  url: string | null | undefined,
  width: number
): string {
  if (!url) return '';
  if (!PROCESSABLE_ORIGINS.some((origin) => url.startsWith(`${origin}/`))) {
    return url;
  }
  // 幂等 + 避开查询串：库里存过带指令/带 ? 的地址时，再追加就拼出坏 URL 了
  if (url.includes('!') || url.includes('?') || url.includes('#')) return url;
  return `${url}!/fw/${width}/quality/80`;
}

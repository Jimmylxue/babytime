import Taro from '@tarojs/taro';
import { uploadFile, trackEvent } from './request';
import { API_BASE } from '../config/env';

// 微信 chooseImage 单次最多选 9 张；上传并发压到 3，避免弱网下 9 个上传互相抢带宽
export const MAX_BATCH_COUNT = 9;
const UPLOAD_CONCURRENCY = 3;

const toAbsoluteUrl = (url: string) =>
  url.startsWith('http') ? url : `${API_BASE}${url}`;

type ImageSizeType = 'original' | 'compressed';

export interface UploadBatchResult {
  /** 按用户选择顺序排列的上传成功 URL */
  urls: string[];
  failed: number;
}

/**
 * 上传一组本地临时图片，返回成功 URL 与失败张数。
 * 单张失败不阻断整批，按选择顺序回填结果。
 * @param options.trackPhoto 为 true 时逐张上报上传成功/失败埋点（photo_upload）
 */
export const uploadLocalImages = async (
  tempFilePaths: string[],
  options: { trackPhoto?: boolean } = {}
): Promise<UploadBatchResult> => {
  const total = tempFilePaths.length;
  if (total === 0) return { urls: [], failed: 0 };

  const results: (string | null)[] = new Array(total).fill(null);
  let failed = 0;
  let finished = 0;
  let nextIndex = 0;

  const showProgress = () => {
    Taro.showLoading({
      title: total > 1 ? `上传中 ${finished}/${total}` : '上传中...',
      mask: true,
    });
  };
  showProgress();

  const worker = async () => {
    while (nextIndex < total) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const uploadRes = await uploadFile(tempFilePaths[index]);
        // 按选择顺序回填，避免并发上传的完成顺序影响后续入库顺序
        results[index] = toAbsoluteUrl(uploadRes.url);
        if (options.trackPhoto) void trackEvent('photo_upload', { success: true });
      } catch (error) {
        failed += 1;
        if (options.trackPhoto) void trackEvent('photo_upload', { success: false });
      } finally {
        finished += 1;
        showProgress();
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, () => worker())
  );
  Taro.hideLoading();

  return { urls: results.filter((url): url is string => !!url), failed };
};

/**
 * 选择图片（可多选）并上传到后端
 * @param options.count 最多可选张数，默认 9（微信上限）
 * @param options.sizeType 图片质量：['compressed'] 压缩（默认，头像等小图用）；
 *                         ['original', 'compressed'] 相册会出现「原图」勾选框（相册等看重大图的场景用）
 * @param options.trackPhoto 为 true 时逐张上报上传成功/失败埋点（photo_upload），用于相册指标
 * @returns 按选择顺序的成功 URL 与失败张数；用户取消返回 null
 */
export const chooseAndUploadImages = async (
  options: { sizeType?: ImageSizeType[]; trackPhoto?: boolean; count?: number } = {}
): Promise<UploadBatchResult | null> => {
  let tempFilePaths: string[] = [];
  try {
    const res = await Taro.chooseImage({
      count: options.count || MAX_BATCH_COUNT,
      sizeType: options.sizeType || ['compressed'],
      sourceType: ['album', 'camera'],
    });
    tempFilePaths = res.tempFilePaths || [];
  } catch (error) {
    // 用户取消拍照/选图（errMsg 含 cancel）不算失败，静默返回
    const errMsg = (error as { errMsg?: string } | undefined)?.errMsg || '';
    if (!errMsg.includes('cancel')) {
      Taro.showToast({ title: '选择图片失败', icon: 'none' });
    }
    return null;
  }

  if (tempFilePaths.length === 0) return null;

  return uploadLocalImages(tempFilePaths, { trackPhoto: options.trackPhoto });
};

/**
 * 选择一张图片并上传；用户取消或失败返回 null
 * @param options.sizeType 图片质量，同 chooseAndUploadImages
 * @param options.trackPhoto 是否上报 photo_upload 埋点
 */
export const chooseAndUploadImage = async (
  options: { sizeType?: ImageSizeType[]; trackPhoto?: boolean } = {}
): Promise<string | null> => {
  const result = await chooseAndUploadImages({ ...options, count: 1 });
  if (!result) return null;
  if (result.urls.length > 0) return result.urls[0];
  Taro.showToast({ title: '上传失败', icon: 'none' });
  return null;
};

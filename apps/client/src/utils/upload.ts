import Taro from '@tarojs/taro';
import { uploadFile, photoApi, trackEvent } from './request';
import { API_BASE } from '../config/env';

// 微信 chooseImage 单次最多选 9 张；上传并发压到 3，避免弱网下 9 个上传互相抢带宽
const MAX_BATCH_COUNT = 9;
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

  const total = tempFilePaths.length;
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

/**
 * 选择（可多选）照片并保存到宝宝相册
 * @param babyId 宝宝ID
 * @param options.goAlbum 保存成功后弹「去看看」引导跳转相册（首页等相册以外入口用）
 * @returns 成功保存的照片张数（用户取消或全部失败返回 0）
 */
export const takePhotoAndSave = async (
  babyId: string,
  options: { babyName?: string; goAlbum?: boolean } = {}
): Promise<number> => {
  const uploaded = await chooseAndUploadImages({ trackPhoto: true });
  if (!uploaded) return 0;
  if (uploaded.urls.length === 0) {
    Taro.showToast({ title: '上传失败', icon: 'none' });
    return 0;
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let saved = 0;
  for (const url of uploaded.urls) {
    try {
      await photoApi.create({
        babyId,
        url,
        photoDate: dateStr,
      });
      saved += 1;
    } catch (error) {
      // 单张入库失败不中断，其余照片继续保存，最后统一提示
    }
  }

  if (saved === 0) {
    Taro.showToast({ title: '保存失败', icon: 'none' });
    return 0;
  }

  const failed = uploaded.failed + (uploaded.urls.length - saved);
  const countText = saved > 1 ? `${saved} 张照片` : '照片';
  const failText = failed > 0 ? `，${failed} 张失败` : '';

  if (options.goAlbum) {
    const res = await Taro.showModal({
      title: '已存入相册',
      content: options.babyName
        ? `${countText}已存入 ${options.babyName} 的成长相册${failText}`
        : `${countText}已存入宝宝的成长相册${failText}`,
      cancelText: '好的',
      confirmText: '去看看',
    });
    if (res.confirm) {
      Taro.navigateTo({ url: `/pages/photo/index?babyId=${babyId}` });
    }
  } else if (failed > 0) {
    Taro.showToast({ title: `已保存 ${saved} 张，${failed} 张失败`, icon: 'none' });
  } else {
    Taro.showToast({
      title: saved > 1 ? `已保存 ${saved} 张` : '拍照成功',
      icon: 'success',
    });
  }
  return saved;
};

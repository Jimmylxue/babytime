import Taro from '@tarojs/taro';
import { uploadFile, photoApi } from './request';
import { API_BASE } from '../config/env';

/**
 * 选择图片并上传到后端
 * @returns 上传后的图片 URL
 */
export const chooseAndUploadImage = async (): Promise<string | null> => {
  try {
    const res = await Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    });

    if (res.tempFilePaths.length > 0) {
      Taro.showLoading({ title: '上传中...' });
      const uploadRes = await uploadFile(res.tempFilePaths[0]);
      const imageUrl = uploadRes.url.startsWith('http')
        ? uploadRes.url
        : `${API_BASE}${uploadRes.url}`;
      Taro.hideLoading();
      return imageUrl;
    }
    return null;
  } catch (error) {
    // 用户取消拍照/选图（errMsg 含 cancel）不算失败，静默返回
    const errMsg = (error as { errMsg?: string } | undefined)?.errMsg || '';
    if (errMsg.includes('cancel')) {
      return null;
    }
    Taro.hideLoading();
    Taro.showToast({ title: '上传失败', icon: 'none' });
    return null;
  }
};

/**
 * 拍照并保存到宝宝相册
 * @param babyId 宝宝ID
 * @param options.goAlbum 保存成功后弹「去看看」引导跳转相册（首页等相册以外入口用）
 */
export const takePhotoAndSave = async (
  babyId: string,
  options: { babyName?: string; goAlbum?: boolean } = {}
): Promise<boolean> => {
  try {
    const imageUrl = await chooseAndUploadImage();
    if (!imageUrl) return false;

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    await photoApi.create({
      babyId,
      url: imageUrl,
      photoDate: dateStr,
    });

    if (options.goAlbum) {
      const res = await Taro.showModal({
        title: '已存入相册',
        content: options.babyName
          ? `照片已存入 ${options.babyName} 的成长相册`
          : '照片已存入宝宝的成长相册',
        cancelText: '好的',
        confirmText: '去看看',
      });
      if (res.confirm) {
        Taro.navigateTo({ url: `/pages/photo/index?babyId=${babyId}` });
      }
    } else {
      Taro.showToast({ title: '拍照成功', icon: 'success' });
    }
    return true;
  } catch (error) {
    Taro.showToast({ title: '保存失败', icon: 'none' });
    return false;
  }
};

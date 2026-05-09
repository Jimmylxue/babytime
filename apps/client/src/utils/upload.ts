import Taro from '@tarojs/taro';
import { uploadFile, photoApi } from './request';

const BASE_URL = 'http://localhost:3000';

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
        : `${BASE_URL}${uploadRes.url}`;
      Taro.hideLoading();
      return imageUrl;
    }
    return null;
  } catch (error) {
    Taro.hideLoading();
    Taro.showToast({ title: '上传失败', icon: 'none' });
    return null;
  }
};

/**
 * 拍照并保存到宝宝相册
 * @param babyId 宝宝ID
 */
export const takePhotoAndSave = async (babyId: string): Promise<boolean> => {
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

    Taro.showToast({ title: '拍照成功', icon: 'success' });
    return true;
  } catch (error) {
    Taro.showToast({ title: '保存失败', icon: 'none' });
    return false;
  }
};

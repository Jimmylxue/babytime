import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useState } from 'react';
import { photoApi } from '../../utils/request';
import { takePhotoAndSave } from '../../utils/upload';
import './index.scss';

interface Photo {
  id: string;
  url: string;
  thumbnail?: string;
  photoDate: string;
  note?: string;
  createdAt: string;
}

interface TimelineItem {
  date: string;
  photos: Photo[];
}

export default function PhotoPage() {
  const router = useRouter();
  const { babyId } = router.params;
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);

  useDidShow(() => {
    if (babyId) {
      fetchTimeline();
    }
  });

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const res = await photoApi.getTimeline(babyId);
      setTimeline(res.data || []);
    } catch (error) {
      console.error('获取相册失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    const success = await takePhotoAndSave(babyId);
    if (success) {
      fetchTimeline();
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const res = await Taro.showModal({
      title: '确认删除',
      content: '确定要删除这张照片吗？',
    });
    if (res.confirm) {
      await photoApi.delete(photoId);
      Taro.showToast({ title: '删除成功', icon: 'success' });
      fetchTimeline();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[date.getDay()];
    return `${month}月${day}日 ${weekDay}`;
  };

  return (
    <View className="photo-page">
      {/* 上传按钮 */}
      <View className="upload-section" onClick={handleTakePhoto}>
        <View className="upload-btn">
          <Text className="upload-icon">📷</Text>
          <Text className="upload-text">拍照记录</Text>
        </View>
      </View>

      {/* 照片时间线 */}
      {loading ? (
        <View className="loading-state">
          <Text className="loading-text">加载中...</Text>
        </View>
      ) : timeline.length === 0 ? (
        <View className="empty-state">
          <Text className="empty-icon">📸</Text>
          <Text className="empty-text">还没有照片</Text>
          <Text className="empty-desc">点击上方按钮拍照记录宝宝成长</Text>
        </View>
      ) : (
        <View className="timeline">
          {timeline.map((item) => (
            <View key={item.date} className="timeline-item">
              <View className="timeline-date">
                <Text className="date-text">{formatDate(item.date)}</Text>
                <Text className="date-count">{item.photos.length}张</Text>
              </View>
              <View className="photo-grid">
                {item.photos.map((photo) => (
                  <View
                    key={photo.id}
                    className="photo-item"
                    onLongPress={() => handleDeletePhoto(photo.id)}
                  >
                    <Image
                      className="photo-img"
                      src={photo.url}
                      mode="aspectFill"
                    />
                    {photo.note && (
                      <Text className="photo-note">{photo.note}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

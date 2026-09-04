import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useRef, useState } from 'react';
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
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const previewingRef = useRef(false);

  useDidShow(() => {
    // previewImage 关闭时也会触发 onShow，这次不需要重新拉取列表
    if (previewingRef.current) {
      previewingRef.current = false;
      return;
    }
    if (babyId) {
      fetchTimeline();
    }
  });

  const fetchTimeline = async () => {
    // 已有数据时静默刷新，避免整页闪"加载中"
    if (timeline.length === 0) {
      setLoading(true);
    }
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

  const toggleManage = () => {
    setManageMode((m) => !m);
    setSelectedIds([]);
  };

  // 长按照片：快捷进入管理模式并选中该张
  const enterManageWith = (photoId: string) => {
    setManageMode(true);
    setSelectedIds([photoId]);
  };

  const toggleSelect = (photoId: string) => {
    setSelectedIds((ids) =>
      ids.includes(photoId) ? ids.filter((id) => id !== photoId) : [...ids, photoId]
    );
  };

  const allPhotos = timeline.flatMap((item) => item.photos);
  const allSelected = allPhotos.length > 0 && selectedIds.length === allPhotos.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : allPhotos.map((p) => p.id));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const res = await Taro.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedIds.length} 张照片吗？删除后无法恢复`,
    });
    if (!res.confirm) return;
    try {
      await photoApi.deleteBatch(selectedIds);
      Taro.showToast({ title: '删除成功', icon: 'success' });
      setManageMode(false);
      setSelectedIds([]);
      fetchTimeline();
    } catch (error) {
      Taro.showToast({ title: '删除失败', icon: 'none' });
    }
  };

  const handlePreview = (photo: Photo, itemPhotos: Photo[]) => {
    previewingRef.current = true;
    Taro.previewImage({
      current: photo.url,
      urls: itemPhotos.map((p) => p.url),
      fail: () => {
        previewingRef.current = false;
      },
    });
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
    <View className={`photo-page${manageMode ? ' manage-mode' : ''}`}>
      {/* 上传按钮：管理模式下隐藏，聚焦选择 */}
      {!manageMode && (
        <View className="upload-section" onClick={handleTakePhoto}>
          <View className="upload-btn">
            <Text className="upload-icon">📷</Text>
            <Text className="upload-text">拍照记录</Text>
          </View>
        </View>
      )}

      {/* 相册信息 + 管理入口 */}
      {timeline.length > 0 && (
        <View className="album-meta">
          <Text className="album-count">共 {allPhotos.length} 张</Text>
          <Text className="album-manage" onClick={toggleManage}>
            {manageMode ? '取消' : '管理'}
          </Text>
        </View>
      )}

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
                {item.photos.map((photo) => {
                  const selected = selectedIds.includes(photo.id);
                  return (
                    <View
                      key={photo.id}
                      className="photo-item"
                      onClick={() =>
                        manageMode
                          ? toggleSelect(photo.id)
                          : handlePreview(photo, item.photos)
                      }
                      onLongPress={() => {
                        if (!manageMode) enterManageWith(photo.id);
                      }}
                    >
                      <Image
                        className="photo-img"
                        src={photo.url}
                        mode="aspectFill"
                      />
                      {manageMode && (
                        <View
                          className={`photo-check${selected ? ' checked' : ''}`}
                        >
                          {selected && (
                            <Text className="photo-check-icon">✓</Text>
                          )}
                        </View>
                      )}
                      {photo.note && (
                        <Text className="photo-note">{photo.note}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 管理模式底部操作栏 */}
      {manageMode && (
        <View className="manage-bar">
          <View className="manage-select-all" onClick={toggleSelectAll}>
            <View className={`manage-circle${allSelected ? ' checked' : ''}`}>
              {allSelected && <Text className="manage-circle-icon">✓</Text>}
            </View>
            <Text>全选</Text>
          </View>
          <View
            className={`manage-delete${selectedIds.length > 0 ? '' : ' disabled'}`}
            onClick={handleBatchDelete}
          >
            <Text>
              删除{selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

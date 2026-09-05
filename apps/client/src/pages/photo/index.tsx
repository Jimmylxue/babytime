import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow, useReachBottom, useRouter } from '@tarojs/taro';
import { useRef, useState } from 'react';
import { photoApi, trackEvent, PhotoTimelineGroup } from '../../utils/request';
import { takePhotoAndSave } from '../../utils/upload';
import albumBaby from '../../assets/album-baby.png';
import cameraIcon from '../../assets/icons/camera-white.svg';
import albumPinkIcon from '../../assets/icons/album-pink.svg';
import heartIcon from '../../assets/icons/heart-pink.svg';
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

const PAGE_SIZE = 30;

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function PhotoPage() {
  const router = useRouter();
  const { babyId } = router.params;
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const previewingRef = useRef(false);
  // 微信胶囊矩形（pt）：返回按钮与其同带、左右对称放置
  const [menuBand] = useState(() => {
    let top = (Taro.getSystemInfoSync().statusBarHeight || 20) + 4;
    let height = 32;
    let leftInset = 10;
    try {
      const menu = Taro.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        const si = Taro.getSystemInfoSync();
        top = menu.top;
        height = menu.height;
        leftInset = Math.max(6, si.windowWidth - menu.right);
      }
    } catch (error) {
      // 取不到胶囊信息时用默认值
    }
    return { top, height, leftInset };
  });

  useDidShow(() => {
    // previewImage 关闭时也会触发 onShow，这次不需要重新拉取列表
    if (previewingRef.current) {
      previewingRef.current = false;
      return;
    }
    if (babyId) {
      fetchFirstPage();
    }
  });

  // 触底加载下一页
  useReachBottom(() => {
    if (babyId) {
      loadMore();
    }
  });

  const fetchFirstPage = async () => {
    // 已有数据时静默刷新，避免整页闪"加载中"
    if (timeline.length === 0) {
      setLoading(true);
    }
    try {
      const res = await photoApi.getTimeline(babyId, 1, PAGE_SIZE);
      setTimeline((res.data?.items as TimelineItem[]) || []);
      setTotal(res.data?.total || 0);
      setPage(1);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      console.error('获取相册失败', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await photoApi.getTimeline(babyId, nextPage, PAGE_SIZE);
      const items = ((res.data?.items as TimelineItem[]) || []).map((item) => ({
        date: item.date,
        photos: item.photos,
      }));
      setTimeline((prev) => {
        if (
          items.length > 0 &&
          prev.length > 0 &&
          prev[prev.length - 1].date === items[0].date
        ) {
          // 同一日期跨页：合并进已有分组
          const merged = [...prev];
          merged[merged.length - 1] = {
            date: prev[prev.length - 1].date,
            photos: [...prev[prev.length - 1].photos, ...items[0].photos],
          };
          return [...merged, ...items.slice(1)];
        }
        return [...prev, ...items];
      });
      setTotal(res.data?.total || 0);
      setPage(nextPage);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      console.error('加载更多失败', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTakePhoto = async () => {
    void trackEvent('photo_add_click', { from: 'album_page' });
    const success = await takePhotoAndSave(babyId);
    if (success) {
      fetchFirstPage();
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
      fetchFirstPage();
    } catch (error) {
      Taro.showToast({ title: '删除失败', icon: 'none' });
    }
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      // 从分享卡/扫码直接进入本页（无页面栈），回首页兜底
      Taro.switchTab({ url: '/pages/index/index' });
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

  const formatDateParts = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: `${date.getMonth() + 1}月${date.getDate()}日`,
      weekDay: weekDays[date.getDay()],
    };
  };

  return (
    <View className={`album-page${manageMode ? ' manage-mode' : ''}`}>
      {/* 返回按钮：自定义导航无系统返回，与微信胶囊同带对称、fixed 不随滚动 */}
      <View
        className="album-back"
        style={{
          top: `${menuBand.top}px`,
          left: `${menuBand.leftInset}px`,
          width: `${menuBand.height}px`,
          height: `${menuBand.height}px`,
        }}
        onClick={handleBack}
      >
        <Text className="album-back-icon">‹</Text>
      </View>

      {/* 顶部宝宝插画（装饰，不响应点击）：顶部锚定状态栏，位置见 SCSS */}
      <Image className="album-hero-art" src={albumBaby} mode="aspectFit" />

      {/* 自定义导航区：标题 + 副标题（顶部留白见 SCSS 的 safe-area 计算） */}
      <View className="album-nav">
        <View className="album-title-wrap">
          <Text className="album-title">育娃手记</Text>
          <Image className="album-title-heart" src={heartIcon} />
        </View>
        <Text className="album-subtitle">记录成长每一刻，留住美好回忆</Text>
      </View>

      {/* 拍照记录主按钮 */}
      {!manageMode && (
        <View className="album-cta" onClick={handleTakePhoto}>
          <Image className="album-cta-icon" src={cameraIcon} />
          <Text className="album-cta-text">拍照记录</Text>
        </View>
      )}

      {/* 成长相册标题行 */}
      {timeline.length > 0 && (
        <View className="album-section-head">
          <View className="album-section-left">
            <Image className="album-section-icon" src={albumPinkIcon} />
            <Text className="album-section-label">成长相册</Text>
          </View>
          <View className="album-section-right">
            <Text className="album-count">共 {total} 张</Text>
            <Text className="album-manage" onClick={toggleManage}>
              {manageMode ? '取消' : '管理'}
            </Text>
          </View>
        </View>
      )}

      {/* 内容区 */}
      {loading ? (
        <View className="album-state">
          <Text className="album-state-text">加载中...</Text>
        </View>
      ) : timeline.length === 0 ? (
        <View className="album-state album-state-empty">
          <Text className="album-state-icon">📸</Text>
          <Text className="album-state-title">还没有照片</Text>
          <Text className="album-state-desc">点击上方按钮，拍下宝宝的第一个瞬间</Text>
        </View>
      ) : (
        <View className="album-timeline">
          <View className="timeline-line" />
          {timeline.map((item, index) => {
            const { date, weekDay } = formatDateParts(item.date);
            return (
              <View key={item.date} className="timeline-item">
                <View className={`timeline-dot${index === 0 ? ' solid' : ''}`} />
                <View className="timeline-card">
                  <View className="card-head">
                    <View className="card-date-wrap">
                      <Text className="card-date">{date}</Text>
                      <Text className="card-weekday">{weekDay}</Text>
                    </View>
                    <Text className="card-count">{item.photos.length}张</Text>
                  </View>
                  <View className="card-grid">
                    {item.photos.map((photo) => {
                      const selected = selectedIds.includes(photo.id);
                      return (
                        <View
                          key={photo.id}
                          className="card-photo"
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
                            className="card-photo-img"
                            src={photo.thumbnail || photo.url}
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
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })}

          {/* 分页加载尾部状态 */}
          {loadingMore ? (
            <View className="timeline-footer">
              <Text className="timeline-footer-text">加载中...</Text>
            </View>
          ) : !hasMore && total > PAGE_SIZE ? (
            <View className="timeline-footer">
              <Text className="timeline-footer-text">— 已经到底啦 —</Text>
            </View>
          ) : null}
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

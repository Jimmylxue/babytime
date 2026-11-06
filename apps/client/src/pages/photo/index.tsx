import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow, useReachBottom, useRouter } from '@tarojs/taro';
import { useRef, useState } from 'react';
import { photoApi, trackEvent, MomentFeedItem } from '../../utils/request';
import { thumbUrl, THUMB_W } from '../../utils/imageThumb';
import { formatMomentTime } from '../../utils/momentTime';
import { CDN_ASSETS } from '../../config/assets';
const albumBaby = CDN_ASSETS.albumBaby;
import cameraIcon from '../../assets/icons/camera-white.svg';
import albumPinkIcon from '../../assets/icons/album-pink.svg';
import heartIcon from '../../assets/icons/heart-pink.svg';
import './index.scss';

const PAGE_SIZE = 20;

export default function PhotoPage() {
  const router = useRouter();
  const babyId = router.params.babyId || '';
  const [items, setItems] = useState<MomentFeedItem[]>([]);
  const [baby, setBaby] = useState<{
    id: string;
    name: string;
    avatar?: string | null;
  } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
    // previewImage 关闭时也会触发 onShow，这次不需要重新拉取列表；
    // 从发布页返回则照常刷新，新瞬间会出现在顶部
    if (previewingRef.current) {
      previewingRef.current = false;
      return;
    }
    if (babyId) {
      fetchFirstPage();
    }
  });

  useReachBottom(() => {
    if (babyId) {
      loadMore();
    }
  });

  const fetchFirstPage = async () => {
    // 已有数据时静默刷新，避免整页闪"加载中"
    if (items.length === 0) {
      setLoading(true);
    }
    try {
      const res = await photoApi.getMoments(babyId, 1, PAGE_SIZE);
      setItems(res.data?.items || []);
      setBaby(res.data?.baby || null);
      setTotal(res.data?.total || 0);
      setPage(1);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      console.error('获取瞬间失败', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await photoApi.getMoments(babyId, nextPage, PAGE_SIZE);
      setItems((prev) => [...prev, ...(res.data?.items || [])]);
      setTotal(res.data?.total || 0);
      setPage(nextPage);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      console.error('加载更多失败', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePublish = () => {
    void trackEvent('photo_add_click', { from: 'album_page' });
    Taro.navigateTo({ url: `/pages/photo-edit/index?babyId=${babyId}` });
  };

  const handleDelete = async (item: MomentFeedItem) => {
    const isMoment = item.kind === 'moment';
    const res = await Taro.showModal({
      title: isMoment ? '删除这条瞬间' : '删除照片',
      content: isMoment
        ? '删除后文案和照片都无法恢复，确定删除吗？'
        : '删除后无法恢复，确定删除吗？',
    });
    if (!res.confirm) return;
    try {
      if (isMoment) {
        await photoApi.deleteMoment(item.id);
      } else {
        await photoApi.delete(item.id);
      }
      Taro.showToast({ title: '已删除', icon: 'success' });
      fetchFirstPage();
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    }
  };

  const handleToggleVisibility = async (item: MomentFeedItem) => {
    if (item.kind !== 'moment' || !item.canToggleVisibility) return;
    const next = item.visibility === 'public' ? 'family' : 'public';
    if (next === 'public') {
      const res = await Taro.showModal({
        title: '分享到育娃圈？',
        content: '公开后所有用户可见，可随时设为私密',
        confirmText: '公开',
      });
      if (!res.confirm) return;
    }
    try {
      await photoApi.updateMomentVisibility(item.id, next);
      Taro.showToast({
        title: next === 'public' ? '已公开' : '已设为私密',
        icon: 'success',
      });
      fetchFirstPage();
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
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

  // 朋友圈行为：预览范围是这一条瞬间里的照片，不串到其它瞬间
  const handlePreview = (item: MomentFeedItem, currentUrl: string) => {
    previewingRef.current = true;
    Taro.previewImage({
      current: currentUrl,
      urls: item.photos.map((photo) => photo.url),
      fail: () => {
        previewingRef.current = false;
      },
    });
  };

  return (
    <View className="album-page">
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

      {/* 发布瞬间主按钮 */}
      <View className="album-cta" onClick={handlePublish}>
        <Image className="album-cta-icon" src={cameraIcon} />
        <Text className="album-cta-text">发布瞬间</Text>
      </View>

      {/* 成长瞬间标题行 */}
      {items.length > 0 && (
        <View className="album-section-head">
          <View className="album-section-left">
            <Image className="album-section-icon" src={albumPinkIcon} />
            <Text className="album-section-label">成长瞬间</Text>
          </View>
          <Text className="album-count">共 {total} 条</Text>
        </View>
      )}

      {/* 内容区 */}
      {loading ? (
        <View className="album-state">
          <Text className="album-state-text">加载中...</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="album-state album-state-empty" onClick={handlePublish}>
          <Text className="album-state-icon">📸</Text>
          <Text className="album-state-title">还没有瞬间</Text>
          <Text className="album-state-desc">
            发布第一条，记录宝宝的可爱时刻
          </Text>
        </View>
      ) : (
        <View className="moment-feed">
          {items.map((item) => {
            const photoCount = item.photos.length;
            return (
              <View key={`${item.kind}-${item.id}`} className="moment-card">
                <View className="moment-head">
                  {baby?.avatar ? (
                    <Image
                      className="moment-avatar"
                      src={thumbUrl(baby.avatar, THUMB_W.chip)}
                      mode="aspectFill"
                    />
                  ) : (
                    <View className="moment-avatar moment-avatar-fallback">
                      <Text className="moment-avatar-text">
                        {baby?.name?.slice(0, 1) || '宝'}
                      </Text>
                    </View>
                  )}
                  <View className="moment-head-main">
                    <Text className="moment-name">{baby?.name || '宝宝'}</Text>
                    <Text className="moment-time">
                      {formatMomentTime(item.createdAt)}
                    </Text>
                    {item.visibility === 'public' && (
                      <Text className="moment-public-tag">育娃圈公开</Text>
                    )}
                  </View>
                  {item.canToggleVisibility && (
                    <View
                      className="moment-visibility-action"
                      onClick={() => handleToggleVisibility(item)}
                    >
                      <Text className="moment-visibility-text">
                        {item.visibility === 'public' ? '设为私密' : '设为公开'}
                      </Text>
                    </View>
                  )}
                  <View
                    className="moment-delete"
                    onClick={() => handleDelete(item)}
                  >
                    <Text className="moment-delete-text">删除</Text>
                  </View>
                </View>

                {item.content && (
                  <Text className="moment-content">{item.content}</Text>
                )}

                {photoCount > 0 && (
                  <View
                    className={`moment-photos photos-${Math.min(photoCount, 9)}`}
                  >
                    {item.photos.map((photo) => (
                      <View
                        key={photo.id}
                        className="moment-photo-wrap"
                        onClick={() => handlePreview(item, photo.url)}
                      >
                        <Image
                          className="moment-photo"
                          src={thumbUrl(
                            photo.thumbnail || photo.url,
                            photoCount === 1 ? THUMB_W.wide : THUMB_W.grid
                          )}
                          mode="aspectFill"
                          lazyLoad
                        />
                      </View>
                    ))}
                  </View>
                )}
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
    </View>
  );
}

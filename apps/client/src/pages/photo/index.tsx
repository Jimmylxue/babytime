import { View, Text, Image, Input, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, useReachBottom, useRouter } from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import {
  photoApi,
  trackEvent,
  MomentFeedItem,
  MomentCommentItem,
} from '../../utils/request';
import { thumbUrl, THUMB_W } from '../../utils/imageThumb';
import { formatMomentTime } from '../../utils/momentTime';
import { getSystemConfig } from '../../utils/systemConfig';
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
  // 后台合规开关：关闭发布时不露发布入口，关闭育娃圈时不露公开标记
  const [momentPublishEnabled, setMomentPublishEnabled] = useState(false);
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const previewingRef = useRef(false);
  // 家庭互动：评论面板（openCommentItem 非空即展开）与在途标记，防止连点
  const [openCommentItem, setOpenCommentItem] = useState<MomentFeedItem | null>(null);
  const [commentList, setCommentList] = useState<MomentCommentItem[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const likeInflightRef = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    getSystemConfig().then((config) => {
      setMomentPublishEnabled(config.momentPublishEnabled);
      setCommunityEnabled(config.communityEnabled);
    });
  }, []);

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
    if (!momentPublishEnabled) return;
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

  // 点赞：先改本地（立即有反馈），失败回滚并提示
  const handleLike = async (item: MomentFeedItem) => {
    if (!item.canInteract) return;
    if (likeInflightRef.current.has(item.id)) return;
    likeInflightRef.current.add(item.id);
    const next = !item.likedByMe;
    const optimisticDelta = next ? 1 : -1;
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              likedByMe: next,
              likeCount: Math.max(0, (it.likeCount || 0) + optimisticDelta),
            }
          : it,
      ),
    );
    try {
      const res = await photoApi.setMomentLike(item.id, next);
      // 用服务端返回的真实计数校正（并发点赞时本地算的可能偏一点）
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, likedByMe: res.data?.liked ?? next, likeCount: res.data?.likeCount ?? it.likeCount }
            : it,
        ),
      );
    } catch (error) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                likedByMe: !next,
                likeCount: Math.max(0, (it.likeCount || 0) - optimisticDelta),
              }
            : it,
        ),
      );
    } finally {
      likeInflightRef.current.delete(item.id);
    }
  };

  const openComments = async (item: MomentFeedItem) => {
    if (!item.canInteract) return;
    setOpenCommentItem(item);
    setCommentInput('');
    setCommentList([]);
    setCommentLoading(true);
    try {
      const res = await photoApi.getMomentComments(item.id);
      setCommentList(res.data?.items || []);
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    } finally {
      setCommentLoading(false);
    }
  };

  const closeComments = () => {
    if (commentSending) return;
    setOpenCommentItem(null);
    setCommentInput('');
    setCommentList([]);
  };

  const handleSendComment = async () => {
    if (!openCommentItem || commentSending) return;
    const text = commentInput.trim();
    if (!text) {
      Taro.showToast({ title: '说点什么吧', icon: 'none' });
      return;
    }
    setCommentSending(true);
    try {
      const res = await photoApi.addMomentComment(openCommentItem.id, text);
      const created = res.data?.comment;
      if (created) {
        setCommentList((prev) => [...prev, created]);
      }
      setCommentInput('');
      // 同步卡片上的评论数
      setItems((prev) =>
        prev.map((it) =>
          it.id === openCommentItem.id
            ? { ...it, commentCount: res.data?.commentCount ?? (it.commentCount || 0) + 1 }
            : it,
        ),
      );
    } catch (error) {
      // 失败原因（含内容安全拦截）由全局拦截器统一 toast
    } finally {
      setCommentSending(false);
    }
  };

  const handleDeleteComment = async (comment: MomentCommentItem) => {
    if (!openCommentItem) return;
    const res = await Taro.showModal({
      title: '删除评论',
      content: '删除后无法恢复，确定删除吗？',
    });
    if (!res.confirm) return;
    try {
      await photoApi.deleteMomentComment(openCommentItem.id, comment.id);
      setCommentList((prev) => prev.filter((c) => c.id !== comment.id));
      setItems((prev) =>
        prev.map((it) =>
          it.id === openCommentItem.id
            ? { ...it, commentCount: Math.max(0, (it.commentCount || 0) - 1) }
            : it,
        ),
      );
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

      {/* 发布瞬间主按钮：后台关闭发布时整个入口不渲染 */}
      {momentPublishEnabled && (
        <View className="album-cta" onClick={handlePublish}>
          <Image className="album-cta-icon" src={cameraIcon} />
          <Text className="album-cta-text">发布瞬间</Text>
        </View>
      )}

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
        <View
          className="album-state album-state-empty"
          onClick={momentPublishEnabled ? handlePublish : undefined}
        >
          <Text className="album-state-icon">📸</Text>
          <Text className="album-state-title">还没有瞬间</Text>
          <Text className="album-state-desc">
            {momentPublishEnabled
              ? '发布第一条，记录宝宝的可爱时刻'
              : '暂时还没有照片'}
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
                    {item.visibility === 'public' && communityEnabled && (
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

                {/* 家庭互动栏：点赞 / 评论。旧版单张照片没有 moment 行，不显示 */}
                {item.canInteract && (
                  <View className="moment-actions">
                    <View
                      className={`moment-action${item.likedByMe ? ' active' : ''}`}
                      onClick={() => handleLike(item)}
                    >
                      <Text className="moment-action-icon">
                        {item.likedByMe ? '❤️' : '🤍'}
                      </Text>
                      <Text className="moment-action-text">
                        {item.likeCount ? item.likeCount : '赞'}
                      </Text>
                    </View>
                    <View
                      className="moment-action"
                      onClick={() => openComments(item)}
                    >
                      <Text className="moment-action-icon">💬</Text>
                      <Text className="moment-action-text">
                        {item.commentCount ? item.commentCount : '评论'}
                      </Text>
                    </View>
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

      {/* 评论面板 */}
      {openCommentItem && (
        <View className="sheet-overlay" onClick={closeComments}>
          <View className="sheet-panel" onClick={e => e.stopPropagation()}>
            <View className="sheet-handle" />
            <View className="sheet-header">
              <Text className="sheet-title">评论</Text>
              <Text className="sheet-subtitle">
                {commentList.length > 0
                  ? `共 ${commentList.length} 条`
                  : '还没有评论'}
              </Text>
            </View>
            <ScrollView className="comment-list" scrollY>
              {commentLoading ? (
                <Text className="comment-empty">加载中...</Text>
              ) : commentList.length === 0 ? (
                <Text className="comment-empty">说点什么吧，家人都会看到</Text>
              ) : (
                commentList.map(comment => (
                  <View key={comment.id} className="comment-item">
                    <View className="comment-avatar">
                      {comment.author.avatar ? (
                        <Image
                          className="comment-avatar-img"
                          src={thumbUrl(comment.author.avatar, THUMB_W.chip)}
                          mode="aspectFill"
                        />
                      ) : (
                        <Text className="comment-avatar-text">
                          {comment.author.nickname?.slice(0, 1) || '家'}
                        </Text>
                      )}
                    </View>
                    <View className="comment-body">
                      <Text className="comment-name">
                        {comment.author.nickname}
                      </Text>
                      <Text className="comment-content">{comment.content}</Text>
                    </View>
                    {comment.canDelete && (
                      <Text
                        className="comment-delete"
                        onClick={() => handleDeleteComment(comment)}
                      >
                        删除
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
            <View className="comment-input-row">
              <Input
                className="comment-input"
                value={commentInput}
                onInput={e => setCommentInput(e.detail.value)}
                placeholder="写点鼓励的话…"
                maxlength={200}
                confirmType="send"
                onConfirm={handleSendComment}
              />
              <View
                className={`comment-send${commentSending ? ' is-disabled' : ''}`}
                onClick={handleSendComment}
              >
                <Text className="comment-send-text">发送</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

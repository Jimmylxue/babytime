import { View, Text } from '@tarojs/components';
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro';
import { useRef, useState } from 'react';
import {
  communityApi,
  CommunityPhotoItem,
  CommunityPost,
} from '../../utils/request';
import CommunityPostCard from '../../components/CommunityPostCard';
import './index.scss';

const PAGE_SIZE = 10;

const REPORT_LABELS = ['垃圾广告', '不友善内容', '侵犯隐私', '其他'];
const REPORT_CODES = ['spam', 'abuse', 'privacy', 'other'] as const;

export default function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const previewingRef = useRef(false);

  useDidShow(() => {
    // 关闭图片预览会触发 onShow，不必重新拉列表；从详情页返回则刷新点赞/评论数
    if (previewingRef.current) {
      previewingRef.current = false;
      return;
    }
    fetchFirstPage();
  });

  useReachBottom(() => {
    loadMore();
  });

  const fetchFirstPage = async () => {
    if (posts.length === 0) setLoading(true);
    try {
      const res = await communityApi.getFeed(1, PAGE_SIZE);
      setPosts(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setPage(1);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await communityApi.getFeed(nextPage, PAGE_SIZE);
      setPosts((prev) => [...prev, ...(res.data?.items || [])]);
      setTotal(res.data?.total || 0);
      setPage(nextPage);
      setHasMore(!!res.data?.hasMore);
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePreview = (post: CommunityPost, photo: CommunityPhotoItem) => {
    previewingRef.current = true;
    Taro.previewImage({
      current: photo.url,
      urls: post.photos.map((item) => item.url),
      fail: () => {
        previewingRef.current = false;
      },
    });
  };

  const handleLike = async (post: CommunityPost) => {
    try {
      const res = post.likedByMe
        ? await communityApi.unlike(post.id)
        : await communityApi.like(post.id);
      const data = res.data;
      if (!data) return;
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? { ...item, likedByMe: data.liked, likeCount: data.likeCount }
            : item
        )
      );
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    }
  };

  const handleReport = async (
    targetType: 'moment' | 'comment',
    targetId: string
  ) => {
    try {
      const res = await Taro.showActionSheet({ itemList: REPORT_LABELS });
      const reason = REPORT_CODES[res.tapIndex];
      if (!reason) return;
      await communityApi.report({ targetType, targetId, reason });
      Taro.showToast({ title: '已提交举报', icon: 'success' });
    } catch (error) {
      // 取消由 errMsg 识别；其他失败全局拦截器已提示
    }
  };

  const openDetail = (post: CommunityPost) => {
    Taro.navigateTo({ url: `/pages/community/detail/index?id=${post.id}` });
  };

  return (
    <View className="community-page">
      <Text className="community-note">
        公开瞬间由宝宝创建者主动分享，请尊重每个家庭的隐私
      </Text>

      {loading ? (
        <View className="community-state">
          <Text className="community-state-text">加载中...</Text>
        </View>
      ) : posts.length === 0 ? (
        <View className="community-state">
          <Text className="community-state-title">还没有公开的瞬间</Text>
          <Text className="community-state-desc">
            等更多家长分享宝宝的成长时刻
          </Text>
        </View>
      ) : (
        <View className="community-feed">
          {posts.map((post) => (
            <CommunityPostCard
              key={post.id}
              post={post}
              onLike={() => handleLike(post)}
              onPreview={(photo) => handlePreview(post, photo)}
              onReport={() => handleReport('moment', post.id)}
              onComment={() => openDetail(post)}
              onOpen={() => openDetail(post)}
            />
          ))}

          {loadingMore ? (
            <View className="community-footer">
              <Text className="community-footer-text">加载中...</Text>
            </View>
          ) : !hasMore && total > PAGE_SIZE ? (
            <View className="community-footer">
              <Text className="community-footer-text">— 已经到底啦 —</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

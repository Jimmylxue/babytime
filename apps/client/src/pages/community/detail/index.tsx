import { View, Text, Image, Input } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useState } from 'react';
import {
  communityApi,
  CommunityComment,
  CommunityPhotoItem,
  CommunityPost,
} from '../../../utils/request';
import { thumbUrl, THUMB_W } from '../../../utils/imageThumb';
import { formatMomentTime } from '../../../utils/momentTime';
import CommunityPostCard from '../../../components/CommunityPostCard';
import './index.scss';

const REPORT_LABELS = ['垃圾广告', '不友善内容', '侵犯隐私', '其他'];
const REPORT_CODES = ['spam', 'abuse', 'privacy', 'other'] as const;

interface ReplyTarget {
  rootId: string;
  commentId: string;
  nickname: string;
}

export default function CommunityDetailPage() {
  const router = useRouter();
  const id = router.params.id || '';
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [input, setInput] = useState('');
  const [inputFocus, setInputFocus] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const load = async () => {
    if (!id) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    try {
      const res = await communityApi.getPost(id);
      setPost(res.data?.post || null);
      setComments(res.data?.comments || []);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleLike = async () => {
    if (!post) return;
    try {
      const res = post.likedByMe
        ? await communityApi.unlike(post.id)
        : await communityApi.like(post.id);
      const data = res.data;
      if (!data) return;
      setPost((prev) =>
        prev
          ? { ...prev, likedByMe: data.liked, likeCount: data.likeCount }
          : prev
      );
    } catch (err) {
      // 错误提示由全局拦截器统一 toast
    }
  };

  const handlePreview = (photo: CommunityPhotoItem) => {
    if (!post) return;
    Taro.previewImage({
      current: photo.url,
      urls: post.photos.map((item) => item.url),
    });
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
    } catch (err) {
      // 取消由 errMsg 识别；其他失败全局拦截器已提示
    }
  };

  const startReply = (comment: CommunityComment) => {
    setReplyTarget({
      rootId: comment.parentId || comment.id,
      commentId: comment.id,
      nickname: comment.author.nickname,
    });
    setInputFocus(true);
  };

  const sendComment = async () => {
    if (!post || sending) return;
    const content = input.trim();
    if (!content) {
      Taro.showToast({ title: '说点什么再发送吧', icon: 'none' });
      return;
    }
    setSending(true);
    try {
      const res = await communityApi.addComment(
        post.id,
        content,
        replyTarget
          ? {
              parentId: replyTarget.rootId,
              replyToCommentId: replyTarget.commentId,
            }
          : {}
      );
      const comment = res.data?.comment;
      if (comment) {
        if (comment.parentId) {
          setComments((prev) =>
            prev.map((root) =>
              root.id === comment.parentId
                ? {
                    ...root,
                    replies: [...(root.replies || []), comment],
                  }
                : root
            )
          );
        } else {
          setComments((prev) => [...prev, comment]);
        }
        setPost((prev) =>
          prev
            ? {
                ...prev,
                commentCount:
                  res.data?.commentCount ?? prev.commentCount + 1,
              }
            : prev
        );
        setInput('');
        setReplyTarget(null);
        setInputFocus(false);
        Taro.hideKeyboard();
      }
    } catch (err) {
      // 错误提示由全局拦截器统一 toast
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (comment: CommunityComment) => {
    const res = await Taro.showModal({
      title: '删除这条评论？',
      content: comment.parentId ? '删除后无法恢复' : '这条评论下的回复也会一起删除',
      confirmText: '删除',
    });
    if (!res.confirm) return;
    try {
      const result = await communityApi.deleteComment(comment.id);
      setComments((prev) =>
        prev
          .filter((root) => root.id !== comment.id)
          .map((root) => ({
            ...root,
            replies: (root.replies || []).filter(
              (reply) => reply.id !== comment.id
            ),
          }))
      );
      setPost((prev) =>
        prev
          ? {
              ...prev,
              commentCount:
                result.data?.commentCount ?? Math.max(0, prev.commentCount - 1),
            }
          : prev
      );
      if (
        replyTarget &&
        (replyTarget.commentId === comment.id ||
          replyTarget.rootId === comment.id)
      ) {
        setReplyTarget(null);
      }
      Taro.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      // 错误提示由全局拦截器统一 toast
    }
  };

  const renderAvatar = (comment: CommunityComment, small = false) => {
    const className = small ? 'cd-reply-avatar' : 'cd-comment-avatar';
    if (comment.author.avatar) {
      return (
        <Image
          className={className}
          src={thumbUrl(comment.author.avatar, THUMB_W.chip)}
          mode="aspectFill"
        />
      );
    }
    return (
      <View className={`${className} cd-comment-avatar-fallback`}>
        <Text className="cd-comment-avatar-text">
          {comment.author.nickname?.slice(0, 1) || '宝'}
        </Text>
      </View>
    );
  };

  const renderActions = (comment: CommunityComment, isReply = false) => (
    <View className={isReply ? 'cd-reply-actions' : 'cd-comment-actions'}>
      <Text
        className={isReply ? 'cd-reply-action reply' : 'cd-comment-reply'}
        onClick={() => startReply(comment)}
      >
        回复
      </Text>
      {comment.canDelete ? (
        <Text
          className={isReply ? 'cd-reply-action' : 'cd-comment-delete'}
          onClick={() => deleteComment(comment)}
        >
          删除
        </Text>
      ) : (
        <Text
          className={isReply ? 'cd-reply-action' : 'cd-comment-report'}
          onClick={() => handleReport('comment', comment.id)}
        >
          举报
        </Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View className="cd-page">
        <View className="cd-state">
          <Text className="cd-state-text">加载中...</Text>
        </View>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View className="cd-page">
        <View className="cd-state">
          <Text className="cd-state-title">这条瞬间看不到啦</Text>
          <Text className="cd-state-desc">可能已被删除或设为私密</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="cd-page">
      <CommunityPostCard
        post={post}
        onLike={handleLike}
        onPreview={handlePreview}
        onReport={() => handleReport('moment', post.id)}
        onComment={() => {
          setReplyTarget(null);
          setInputFocus(true);
        }}
      />

      <View className="cd-comments-card">
        <Text className="cd-comments-title">评论 {post.commentCount}</Text>
        {comments.length === 0 ? (
          <Text className="cd-comments-empty">还没有评论，来说两句吧</Text>
        ) : (
          comments.map((comment, index) => (
            <View
              key={comment.id}
              className={`cd-comment${index === 0 ? ' first' : ''}`}
            >
              {renderAvatar(comment)}
              <View className="cd-comment-main">
                <View className="cd-comment-head">
                  <Text className="cd-comment-name">
                    {comment.author.nickname}
                  </Text>
                  <Text className="cd-comment-time">
                    {formatMomentTime(comment.createdAt)}
                  </Text>
                </View>
                <Text className="cd-comment-content">{comment.content}</Text>
                {renderActions(comment)}

                {(comment.replies || []).length > 0 && (
                  <View className="cd-replies">
                    {(comment.replies || []).map((reply) => (
                      <View key={reply.id} className="cd-reply">
                        {renderAvatar(reply, true)}
                        <View className="cd-reply-main">
                          <Text className="cd-reply-content">
                            <Text className="cd-reply-name">
                              {reply.author.nickname}
                            </Text>
                            {reply.replyToNickname && (
                              <Text className="cd-reply-to">
                                {' '}
                                回复 @{reply.replyToNickname}
                              </Text>
                            )}
                            <Text>：{reply.content}</Text>
                          </Text>
                          {renderActions(reply, true)}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <View className="cd-comment-bar">
        {replyTarget && (
          <View className="cd-reply-tip">
            <Text className="cd-reply-tip-text">
              回复 @{replyTarget.nickname}
            </Text>
            <Text
              className="cd-reply-tip-cancel"
              onClick={() => setReplyTarget(null)}
            >
              取消
            </Text>
          </View>
        )}
        <View className="cd-input-row">
          <Input
            className="cd-comment-input"
            value={input}
            onInput={(event) => setInput(event.detail.value)}
            placeholder={
              replyTarget ? `回复 @${replyTarget.nickname}` : '说点什么...'
            }
            confirmType="send"
            onConfirm={sendComment}
            focus={inputFocus}
            onBlur={() => setInputFocus(false)}
            maxlength={200}
            cursorSpacing={20}
          />
          <View
            className={`cd-send${input.trim() && !sending ? '' : ' disabled'}`}
            onClick={sendComment}
          >
            <Text className="cd-send-text">{sending ? '发送中' : '发送'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

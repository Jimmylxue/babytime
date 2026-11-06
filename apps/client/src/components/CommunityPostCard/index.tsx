import { View, Text, Image } from '@tarojs/components';
import { formatMomentTime } from '../../utils/momentTime';
import CommunityPhotos from '../CommunityPhotos';
import type { CommunityPhotoItem, CommunityPost } from '../../utils/request';
import heartIcon from '../../assets/icons/heart-pink.svg';
import heartOutlineIcon from '../../assets/icons/heart-outline-gray.svg';
import commentIcon from '../../assets/icons/comment-gray.svg';
import './index.scss';

interface CommunityPostCardProps {
  post: CommunityPost;
  onLike: () => void;
  onPreview: (photo: CommunityPhotoItem) => void;
  onReport: () => void;
  onComment: () => void;
  /** 传入后整张卡片可点，点击空白区域进入详情 */
  onOpen?: () => void;
}

export default function CommunityPostCard({
  post,
  onLike,
  onPreview,
  onReport,
  onComment,
  onOpen,
}: CommunityPostCardProps) {
  return (
    <View className="community-card" onClick={onOpen}>
      <View className="community-head">
        {post.author.avatar ? (
          <Image
            className="community-avatar"
            src={post.author.avatar}
            mode="aspectFill"
          />
        ) : (
          <View className="community-avatar community-avatar-fallback">
            <Text className="community-avatar-text">
              {post.author.nickname?.slice(0, 1) || '宝'}
            </Text>
          </View>
        )}
        <View className="community-head-main">
          <Text className="community-name">{post.author.nickname}</Text>
          <Text className="community-time">
            {formatMomentTime(post.createdAt)}
          </Text>
        </View>
        <Text
          className="community-report"
          onClick={(event) => {
            event.stopPropagation();
            onReport();
          }}
        >
          举报
        </Text>
      </View>

      {post.content && (
        <Text className="community-content">{post.content}</Text>
      )}

      <CommunityPhotos photos={post.photos} onPreview={onPreview} />

      <View className="community-actions">
        <View
          className={`community-action${post.likedByMe ? ' is-liked' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onLike();
          }}
        >
          <Image
            className="community-action-icon"
            src={post.likedByMe ? heartIcon : heartOutlineIcon}
          />
          <Text className="community-action-text">
            {post.likedByMe
              ? `${post.likeCount} 已赞`
              : `${post.likeCount} 赞`}
          </Text>
        </View>
        <View
          className="community-action"
          onClick={(event) => {
            event.stopPropagation();
            onComment();
          }}
        >
          <Image className="community-action-icon" src={commentIcon} />
          <Text className="community-action-text">
            {post.commentCount} 评论
          </Text>
        </View>
      </View>
    </View>
  );
}

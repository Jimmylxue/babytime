import { View, Image } from '@tarojs/components';
import { thumbUrl, THUMB_W } from '../../utils/imageThumb';
import type { CommunityPhotoItem } from '../../utils/request';
import './index.scss';

interface CommunityPhotosProps {
  photos: CommunityPhotoItem[];
  onPreview: (photo: CommunityPhotoItem) => void;
}

export default function CommunityPhotos({
  photos,
  onPreview,
}: CommunityPhotosProps) {
  if (photos.length === 0) return null;
  return (
    <View
      className={`community-photos photos-${Math.min(photos.length, 9)}`}
    >
      {photos.map((photo) => (
        <View
          key={photo.id}
          className="community-photo-wrap"
          onClick={(event) => {
            event.stopPropagation();
            onPreview(photo);
          }}
        >
          <Image
            className="community-photo"
            src={thumbUrl(photo.thumbnail || photo.url, THUMB_W.grid)}
            mode="aspectFill"
            lazyLoad
          />
        </View>
      ))}
    </View>
  );
}

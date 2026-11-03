import { View, Text, Image, Textarea } from '@tarojs/components';
import type { BaseEventOrig, ITouchEvent } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { photoApi } from '../../utils/request';
import { MAX_BATCH_COUNT, uploadLocalImages } from '../../utils/upload';
import './index.scss';

const CONTENT_MAX = 500;

interface DraftPhoto {
  id: string;
  path: string;
}

const makePhotoId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const todayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(today.getDate()).padStart(2, '0')}`;
};

export default function PhotoEditPage() {
  const router = useRouter();
  const babyId = router.params.babyId || '';
  const [images, setImages] = useState<DraftPhoto[]>([]);
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragSize, setDragSize] = useState(0);

  const touchStartRef = useRef<{ id: string; x: number; y: number } | null>(
    null
  );
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragRectsRef = useRef<
    Array<{ left: number; right: number; top: number; bottom: number }>
  >([]);
  const lastTargetRef = useRef(-1);
  const suppressClickRef = useRef(false);

  // 微信胶囊矩形（pt）：与相册页保持同一套自定义导航排布
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

  const addImages = async () => {
    const remain = MAX_BATCH_COUNT - images.length;
    if (remain <= 0) return;
    try {
      const res = await Taro.chooseImage({
        count: remain,
        sizeType: ['original', 'compressed'],
        sourceType: ['album', 'camera'],
      });
      const paths = (res.tempFilePaths || []).filter(Boolean);
      if (paths.length > 0) {
        setImages((prev) =>
          [
            ...prev,
            ...paths.map((path) => ({ id: makePhotoId(), path })),
          ].slice(0, MAX_BATCH_COUNT)
        );
      }
    } catch (error) {
      const errMsg = (error as { errMsg?: string } | undefined)?.errMsg || '';
      if (!errMsg.includes('cancel')) {
        Taro.showToast({ title: '选择图片失败', icon: 'none' });
      }
    }
  };

  const removeImage = (index: number) => {
    if (dragIdRef.current || suppressClickRef.current) return;
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const previewImages = (index: number) => {
    if (suppressClickRef.current || dragIdRef.current) return;
    Taro.previewImage({
      current: images[index].path,
      urls: images.map((photo) => photo.path),
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    []
  );

  const handlePhotoTouchStart = (event: BaseEventOrig<any>, id: string) => {
    if (dragIdRef.current) return;
    const touch = (event as ITouchEvent).touches?.[0];
    if (!touch) return;
    touchStartRef.current = { id, x: touch.clientX, y: touch.clientY };
    clearLongPressTimer();
    // 自己计时而不是用原生 longpress：原生事件在部分基础库上要抬手才触发，
    // 拖动需要在手指还按着的时候就开始
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      startDrag(id);
    }, 320);
  };

  // 长按进入排序：先量一次所有格子位置，之后按手指离哪个格子中心最近算目标位
  const startDrag = (photoId: string) => {
    if (publishing || images.length < 2) return;
    const photoIndex = images.findIndex((photo) => photo.id === photoId);
    if (photoIndex < 0) return;

    const touchStart = touchStartRef.current;
    dragIdRef.current = photoId;
    lastTargetRef.current = photoIndex;
    suppressClickRef.current = true;
    setDragId(photoId);
    if (touchStart && touchStart.id === photoId) {
      setDragPos({ x: touchStart.x, y: touchStart.y });
    }

    Taro.createSelectorQuery()
      .selectAll('.publish-photo-item')
      .boundingClientRect()
      .exec((res) => {
        const rects = (res?.[0] || []) as Array<{
          left: number;
          right: number;
          top: number;
          bottom: number;
        }>;
        dragRectsRef.current = rects;
        if (rects[0]) setDragSize(rects[0].right - rects[0].left);
      });
  };

  const handleGridTouchMove = (event: BaseEventOrig<any>) => {
    const touch = (event as ITouchEvent).touches?.[0];
    if (!touch) return;

    // 还没进入拖动：手指移开超过阈值就当成页面滚动，取消长按
    if (!dragIdRef.current) {
      const start = touchStartRef.current;
      if (start && longPressTimerRef.current) {
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (dx * dx + dy * dy > 100) clearLongPressTimer();
      }
      return;
    }

    event.preventDefault();
    setDragPos({ x: touch.clientX, y: touch.clientY });

    const rects = dragRectsRef.current;
    if (rects.length === 0) return;

    let target = lastTargetRef.current;
    let bestDistance = Number.POSITIVE_INFINITY;
    rects.forEach((rect, index) => {
      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const distance =
        (touch.clientX - centerX) ** 2 + (touch.clientY - centerY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        target = index;
      }
    });
    target = Math.max(0, Math.min(images.length - 1, target));
    if (target === lastTargetRef.current) return;
    lastTargetRef.current = target;

    setImages((prev) => {
      const from = prev.findIndex((photo) => photo.id === dragIdRef.current);
      if (from < 0 || from === target) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const finishDrag = () => {
    clearLongPressTimer();
    touchStartRef.current = null;
    if (!dragIdRef.current) return;
    dragIdRef.current = null;
    dragRectsRef.current = [];
    lastTargetRef.current = -1;
    setDragId(null);
    setDragPos({ x: 0, y: 0 });
    // 拖拽结束后手指抬起可能再补一个 tap，短暂屏蔽预览
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 250);
  };

  const handleBack = async () => {
    if (publishing) return;
    if (content.trim() || images.length > 0) {
      const res = await Taro.showModal({
        title: '放弃这次编辑？',
        content: '已选的图片和文案不会保存',
        confirmText: '放弃',
        cancelText: '继续编辑',
      });
      if (!res.confirm) return;
    }
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.redirectTo({ url: `/pages/photo/index?babyId=${babyId}` });
    }
  };

  const backToAlbum = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.redirectTo({ url: `/pages/photo/index?babyId=${babyId}` });
    }
  };

  const handlePublish = async () => {
    if (publishing) return;
    const text = content.trim();
    if (!text && images.length === 0) {
      Taro.showToast({ title: '写点文案或选张照片吧', icon: 'none' });
      return;
    }

    setPublishing(true);
    try {
      let urls: string[] = [];
      let failed = 0;
      if (images.length > 0) {
        const uploaded = await uploadLocalImages(
          images.map((photo) => photo.path),
          { trackPhoto: true }
        );
        if (uploaded.urls.length === 0) {
          Taro.showToast({ title: '图片上传失败，请重试', icon: 'none' });
          return;
        }
        urls = uploaded.urls;
        failed = uploaded.failed;
      }

      Taro.showLoading({ title: '发布中...', mask: true });
      try {
        await photoApi.createMoment({
          babyId,
          content: text || undefined,
          photoDate: todayStr(),
          photos: urls.map((url) => ({ url })),
        });
      } finally {
        Taro.hideLoading();
      }

      if (failed > 0) {
        await Taro.showModal({
          title: '已发布',
          content: `${failed} 张图片上传失败，已发布其余内容`,
          showCancel: false,
          confirmText: '好的',
        });
      } else {
        Taro.showToast({ title: '发布成功', icon: 'success' });
        // 留一点时间让 toast 可见，再回相册刷新
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      backToAlbum();
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = content.trim().length > 0 || images.length > 0;
  const canAdd = images.length < MAX_BATCH_COUNT;
  const dragPhoto = dragId
    ? images.find((photo) => photo.id === dragId)
    : undefined;

  return (
    <View className="publish-page">
      <View
        className="publish-nav"
        style={{ paddingTop: `${menuBand.top}px` }}
      >
        <View
          className="publish-nav-row"
          style={{ height: `${menuBand.height}px` }}
        >
          <View
            className="publish-back"
            style={{
              width: `${menuBand.height}px`,
              height: `${menuBand.height}px`,
              marginLeft: `${menuBand.leftInset}px`,
            }}
            onClick={handleBack}
          >
            <Text className="publish-back-icon">‹</Text>
          </View>
          <Text className="publish-title">发布瞬间</Text>
          <View
            className="publish-nav-spacer"
            style={{ width: `${menuBand.height}px` }}
          />
        </View>
      </View>

      <View className="publish-body">
        <View className="publish-card">
          <Textarea
            className="publish-textarea"
            value={content}
            onInput={(e) => setContent(e.detail.value)}
            placeholder="这一刻想记录点什么…"
            placeholderClass="publish-placeholder"
            maxlength={CONTENT_MAX}
            autoHeight
            showConfirmBar={false}
            disableDefaultPadding
          />
          <Text className="publish-counter">
            {content.length}/{CONTENT_MAX}
          </Text>

          <View
            id="publish-photo-grid"
            className="publish-grid"
            // 多图时常驻拦截页面滚动：若等长按后再切换，节点类型变化可能中断正在进行的手势
            catchMove={images.length > 1}
            onTouchMove={handleGridTouchMove}
            onTouchEnd={finishDrag}
            onTouchCancel={finishDrag}
          >
            {images.map((photo, index) => (
              <View
                key={photo.id}
                className={`publish-photo-wrap publish-photo-item${
                  dragId === photo.id ? ' dragging' : ''
                }`}
                onTouchStart={(event) => handlePhotoTouchStart(event, photo.id)}
              >
                <View className="publish-photo-frame">
                  <Image
                    className="publish-photo"
                    src={photo.path}
                    mode="aspectFill"
                    onClick={() => previewImages(index)}
                  />
                </View>
                <View
                  className="publish-photo-remove"
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={() => removeImage(index)}
                >
                  <Text className="publish-photo-remove-icon">×</Text>
                </View>
              </View>
            ))}
            {canAdd && (
              <View className="publish-photo-wrap publish-add" onClick={addImages}>
                <View className="publish-add-inner">
                  <Text className="publish-add-plus">+</Text>
                  <Text className="publish-add-text">
                    {images.length}/{MAX_BATCH_COUNT}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <Text className="publish-hint">
            {images.length > 1
              ? '长按图片可拖动调整顺序，最多 9 张'
              : `最多 ${MAX_BATCH_COUNT} 张照片，可添加文案一起发布`}
          </Text>
        </View>
      </View>

      {dragPhoto && (
        <View
          className="publish-drag-ghost"
          style={{
            left: `${dragPos.x - dragSize / 2}px`,
            top: `${dragPos.y - dragSize / 2}px`,
            width: `${dragSize}px`,
            height: `${dragSize}px`,
          }}
        >
          <Image
            className="publish-drag-ghost-img"
            src={dragPhoto.path}
            mode="aspectFill"
          />
        </View>
      )}

      <View className="publish-bar">
        <View
          className={`publish-btn${canPublish && !publishing ? '' : ' disabled'}`}
          onClick={handlePublish}
        >
          <Text className="publish-btn-text">
            {publishing ? '发布中...' : '发布'}
          </Text>
        </View>
        <View className="publish-safe-area" />
      </View>
    </View>
  );
}

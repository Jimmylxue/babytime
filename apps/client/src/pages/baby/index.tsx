import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { useBabyStore, Baby } from '../../stores/babyStore';
import { calculateAge, formatDate } from '../../utils/date';
import babyFacePink from '../../assets/icons/baby-face-pink.svg';
import babyFaceBlue from '../../assets/icons/baby-face-blue.svg';
import bearHeart from '../../assets/baby-bear-heart.jpg';
import heartDeco from '../../assets/icons/heart-deco.svg';
import plusWhite from '../../assets/icons/plus-white.svg';
import crownGold from '../../assets/icons/crown-gold.svg';
import chevronGray from '../../assets/icons/chevron-gray.svg';
import chevronDark from '../../assets/icons/chevron-dark.svg';
import pencilCoral from '../../assets/icons/pencil-coral.svg';
import cameraPeriwinkle from '../../assets/icons/camera-periwinkle.svg';
import './index.scss';

export default function BabyPage() {
  const { babies, fetchBabies, deleteBaby, setCurrentBaby } = useBabyStore();
  // 微信胶囊矩形（pt）：返回按钮与其同带，导航标题与其垂直同轴
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
    fetchBabies();
  });

  const handleBack = () => {
    Taro.navigateBack();
  };

  const handleDelete = async (baby: Baby) => {
    const res = await Taro.showModal({
      title: '确认删除',
      content: `确定要删除 ${baby.name} 吗？`,
    });
    if (res.confirm) {
      await deleteBaby(baby.id);
      Taro.showToast({ title: '删除成功', icon: 'success' });
    }
  };

  const handleSelectBaby = (baby: Baby) => {
    setCurrentBaby(baby);
    Taro.switchTab({ url: '/pages/index/index' });
  };

  const handleEdit = (babyId: string) => {
    Taro.navigateTo({ url: `/pages/baby-edit/index?babyId=${babyId}` });
  };

  const handleAdd = () => {
    Taro.navigateTo({ url: '/pages/baby-edit/index' });
  };

  const handleViewPhotos = (babyId: string) => {
    Taro.navigateTo({ url: `/pages/photo/index?babyId=${babyId}` });
  };

  return (
    <View className="baby-page">
      {/* 返回按钮：裸箭头（按 UI 稿），与微信胶囊同带、fixed 不随滚动 */}
      <View
        className="baby-back"
        style={{
          top: `${menuBand.top}px`,
          left: `${menuBand.leftInset}px`,
          width: `${menuBand.height}px`,
          height: `${menuBand.height}px`,
        }}
        onClick={handleBack}
      >
        <Image className="baby-back-icon" src={chevronDark} />
      </View>

      {/* 导航行：居中标题，与胶囊垂直同轴（padding/height 由 JS 按胶囊注入） */}
      <View
        className="baby-navbar"
        style={{ paddingTop: `${menuBand.top}px`, height: `${menuBand.height}px` }}
      >
        <Text className="baby-navbar-title">育娃手记</Text>
      </View>

      {/* 头部：大标题 + 爱心装饰 + 副标题 + 添加宝贝胶囊按钮 */}
      <View className="baby-header">
        <View className="baby-header-copy">
          <View className="baby-title-wrap">
            <Text className="baby-title">宝贝管理</Text>
            <Image className="baby-title-heart" src={heartDeco} />
          </View>
          <Text className="baby-subtitle">记录宝贝成长，珍藏美好时光</Text>
        </View>
        <View className="add-btn" onClick={handleAdd}>
          <Image className="add-plus" src={plusWhite} />
          <Text className="add-text">添加宝贝</Text>
        </View>
      </View>

      <View className="baby-list">
        {babies.length === 0 ? (
          <View className="empty-state">
            <Image className="empty-icon-img" src={babyFacePink} />
            <Text className="empty-text">还没有添加宝贝</Text>
            <Text className="empty-desc">点击右上角「添加宝贝」</Text>
          </View>
        ) : (
          babies.map((baby) => {
            const age = calculateAge(baby.birthday);
            return (
              <View key={baby.id} className="baby-card">
                {/* 右上小熊插画 + 双箭头（纯装饰，不响应点击） */}
                <Image className="baby-illu" src={bearHeart} mode="aspectFit" />
                <Image className="illu-chevron illu-chevron-top" src={chevronGray} />
                <Image className="illu-chevron illu-chevron-bottom" src={chevronGray} />

                {/* 主体：点击切换当前宝贝，长按删除（删除入口收进长按，保持卡片双栏 1:1） */}
                <View
                  className="baby-main"
                  onClick={() => handleSelectBaby(baby)}
                  onLongPress={baby.isOwner !== false ? () => handleDelete(baby) : undefined}
                >
                  <View className={`baby-avatar ${baby.gender}`}>
                    <View className="avatar-clip">
                      {baby.avatar ? (
                        <Image className="avatar-img" src={baby.avatar} mode="aspectFill" />
                      ) : (
                        <Image
                          className="avatar-baby-icon"
                          src={baby.gender === 'male' ? babyFaceBlue : babyFacePink}
                        />
                      )}
                    </View>
                    <Image className="avatar-crown" src={crownGold} />
                  </View>
                  <View className="baby-detail">
                    <View className="baby-name-row">
                      <Text className="baby-name">{baby.name}</Text>
                      <Text className="baby-tag">小宝贝</Text>
                    </View>
                    <Text className="baby-age">
                      {age.months}个月{age.days}天
                    </Text>
                    <Text className="baby-birthday">{formatDate(baby.birthday)} 出生</Text>
                  </View>
                </View>

                {/* 双栏操作区：编辑信息 / 成长相册 */}
                <View className="baby-actions">
                  <View
                    className="action-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(baby.id);
                    }}
                  >
                    <View className="action-icon-bg pink">
                      <Image className="action-icon-img" src={pencilCoral} />
                    </View>
                    <View className="action-copy">
                      <Text className="action-title">编辑信息</Text>
                      <Text className="action-sub">修改宝贝资料</Text>
                    </View>
                  </View>
                  <View className="action-divider" />
                  <View
                    className="action-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewPhotos(baby.id);
                    }}
                  >
                    <View className="action-icon-bg periwinkle">
                      <Image className="action-icon-img" src={cameraPeriwinkle} />
                    </View>
                    <View className="action-copy">
                      <Text className="action-title">成长相册</Text>
                      <Text className="action-sub">记录美好瞬间</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

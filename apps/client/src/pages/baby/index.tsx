import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useBabyStore, Baby } from '../../stores/babyStore';
import { calculateAge, formatDate } from '../../utils/date';
import './index.scss';

definePageConfig({
  navigationBarTitleText: '宝贝管理',
});

export default function BabyPage() {
  const { babies, fetchBabies, deleteBaby, setCurrentBaby } = useBabyStore();

  useDidShow(() => {
    fetchBabies();
  });

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
      <View className="page-header">
        <Text className="page-title">宝贝管理</Text>
        <View className="add-btn" onClick={handleAdd}>
          <Text className="add-icon">+</Text>
        </View>
      </View>

      <View className="baby-list">
        {babies.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">👶</Text>
            <Text className="empty-text">还没有添加宝贝</Text>
            <Text className="empty-desc">点击右上角 + 号添加</Text>
          </View>
        ) : (
          babies.map((baby) => {
            const age = calculateAge(baby.birthday);
            return (
              <View key={baby.id} className="baby-card">
                <View className="baby-main" onClick={() => handleSelectBaby(baby)}>
                  <View className={`baby-avatar ${baby.gender}`}>
                    {baby.avatar ? (
                      <Image className="avatar-img" src={baby.avatar} mode="aspectFill" />
                    ) : (
                      <Text>{baby.gender === 'male' ? '👦' : '👧'}</Text>
                    )}
                  </View>
                  <View className="baby-detail">
                    <Text className="baby-name">{baby.name}</Text>
                    <Text className="baby-age">
                      {age.months}个月{age.days}天
                    </Text>
                    <Text className="baby-birthday">{formatDate(baby.birthday)}</Text>
                  </View>
                </View>

                <View className="baby-actions">
                  <View
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(baby.id);
                    }}
                  >
                    <Text className="action-icon">✏️</Text>
                    <Text className="action-text">编辑</Text>
                  </View>
                  <View
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewPhotos(baby.id);
                    }}
                  >
                    <Text className="action-icon">📸</Text>
                    <Text className="action-text">相册</Text>
                  </View>
                  <View
                    className="action-btn delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(baby);
                    }}
                  >
                    <Text className="action-icon">🗑️</Text>
                    <Text className="action-text">删除</Text>
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

import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useBabyStore } from '../../stores/babyStore';
import { useRecordStore } from '../../stores/recordStore';
import { calculateAge } from '../../utils/date';
import { takePhotoAndSave } from '../../utils/upload';
import TabBar from '../../components/TabBar';
import './index.scss';

const quickActions = [
  { type: 'feeding', icon: '🍼', label: '喂奶' },
  { type: 'diaper', icon: '💩', label: '换尿布' },
  { type: 'sleep', icon: '😴', label: '睡觉' },
  { type: 'photo', icon: '📷', label: '拍照' },
];

const moreActions = [
  { type: 'food', icon: '🍚', label: '辅食' },
  { type: 'water', icon: '💧', label: '喝水' },
  { type: 'bath', icon: '🛁', label: '洗澡' },
  { type: 'temperature', icon: '🌡️', label: '体温' },
  { type: 'height_weight', icon: '📏', label: '身高体重' },
  { type: 'medicine', icon: '💊', label: '用药' },
  { type: 'vaccine', icon: '💉', label: '疫苗' },
  { type: 'outdoor', icon: '🌳', label: '户外活动' },
];

const feedingMethodLabel: Record<string, string> = {
  breast_left: '左侧母乳',
  breast_right: '右侧母乳',
  breast_both: '双侧母乳',
  formula: '奶粉',
};

export default function Index() {
  const { isLoggedIn } = useAuthStore();
  const { currentBaby, fetchBabies } = useBabyStore();
  const { summary, records, fetchSummary, fetchStats, latestHeightWeight, latestTemperature } = useRecordStore();
  const [showMore, setShowMore] = useState(false);

  useDidShow(() => {
    if (isLoggedIn) {
      fetchBabies().then(() => {
        const baby = useBabyStore.getState().currentBaby;
        if (baby) {
          fetchSummary(baby.id);
          fetchStats(baby.id);
        }
      });
    }
  });

  const age = currentBaby ? calculateAge(currentBaby.birthday) : null;

  const formatSleepTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
  };

  // 从记录中提取辅助信息
  const todayRecords = records || [];
  const feedingRecords = todayRecords.filter((r) => r.type === 'feeding');
  const diaperRecords = todayRecords.filter((r) => r.type === 'diaper');
  const sleepRecords = todayRecords.filter((r) => r.type === 'sleep');
  const foodRecords = todayRecords.filter((r) => r.type === 'food');

  // 最近一次喂奶方式
  const lastFeedingMethod = feedingRecords.length > 0 ? feedingRecords[0].feedingMethod : null;

  // 尿布类型统计
  const diaperBreakdown = diaperRecords.reduce(
    (acc, r) => {
      if (r.diaperStatus === 'wet') acc.wet++;
      else if (r.diaperStatus === 'dirty') acc.dirty++;
      else if (r.diaperStatus === 'both') acc.both++;
      return acc;
    },
    { wet: 0, dirty: 0, both: 0 },
  );
  const diaperDetailParts: string[] = [];
  if (diaperBreakdown.wet > 0) diaperDetailParts.push(`尿${diaperBreakdown.wet}`);
  if (diaperBreakdown.dirty > 0) diaperDetailParts.push(`拉${diaperBreakdown.dirty}`);
  if (diaperBreakdown.both > 0) diaperDetailParts.push(`都有${diaperBreakdown.both}`);

  // 最近一次辅食
  const lastFoodName = foodRecords.length > 0 ? foodRecords[0].foodName : null;

  // 最近一次睡眠时长
  const lastSleepDuration = sleepRecords.length > 0 ? sleepRecords[0].duration : null;

  const navigateToRecord = (type: string) => {
    if (!currentBaby) {
      Taro.showToast({ title: '请先添加宝贝', icon: 'none' });
      return;
    }
    if (type === 'photo') {
      takePhotoAndSave(currentBaby.id);
      return;
    }
    Taro.navigateTo({
      url: `/pages/record/index?type=${type}&babyId=${currentBaby.id}`,
    });
    setShowMore(false);
  };

  if (!isLoggedIn) {
    return (
      <View className="page">
        <View className="login-tip">
          <Text className="tip-icon">👶</Text>
          <Text className="tip-text">欢迎使用小宝贝日记</Text>
          <Text className="tip-desc">记录宝宝成长的每一天</Text>
          <View
            className="btn btn-primary"
            onClick={() => Taro.redirectTo({ url: '/pages/login/index' })}
          >
            <Text>立即登录</Text>
          </View>
        </View>
        <TabBar />
      </View>
    );
  }

  return (
    <View className="page">
      {/* 宝宝信息卡片 */}
      <View className="baby-card">
        <View className="baby-header">
          <View className="baby-avatar">
            {currentBaby?.avatar ? (
              <Image className="avatar-img" src={currentBaby.avatar} mode="aspectFill" />
            ) : (
              <Text>{currentBaby?.gender === 'male' ? '👦' : '👧'}</Text>
            )}
          </View>
          <View className="baby-info">
            <Text className="baby-name">{currentBaby?.name || '未添加宝贝'}</Text>
            {age && (
              <Text className="baby-age">
                {age.months}个月{age.days}天
              </Text>
            )}
          </View>
        </View>
        {currentBaby && (
          <Text className="baby-birthday">
            {currentBaby.birthday} 出生
          </Text>
        )}
      </View>

      {/* 今日统计 */}
      {summary && (
        <View className="stats-section">
          <Text className="section-title">今日记录</Text>
          <View className="stats-grid">
            <View className="stat-card">
              <Text className="stat-icon">🍼</Text>
              <Text className="stat-value">{summary.feedingCount}<Text className="stat-unit">次</Text></Text>
              <Text className="stat-label">喂奶</Text>
              {summary.totalMilk > 0 && (
                <Text className="stat-detail">共{summary.totalMilk}ml</Text>
              )}
              {lastFeedingMethod && (
                <Text className="stat-sub">{feedingMethodLabel[lastFeedingMethod] || lastFeedingMethod}</Text>
              )}
            </View>
            <View className="stat-card">
              <Text className="stat-icon">💩</Text>
              <Text className="stat-value">{summary.diaperCount}<Text className="stat-unit">次</Text></Text>
              <Text className="stat-label">换尿布</Text>
              {diaperDetailParts.length > 0 && (
                <Text className="stat-detail">{diaperDetailParts.join(' ')}</Text>
              )}
            </View>
            <View className="stat-card">
              <Text className="stat-icon">😴</Text>
              <Text className="stat-value">{summary.sleepCount}<Text className="stat-unit">次</Text></Text>
              <Text className="stat-label">睡觉</Text>
              {summary.sleepTotal > 0 && (
                <Text className="stat-detail">共{formatSleepTime(summary.sleepTotal)}</Text>
              )}
              {lastSleepDuration != null && lastSleepDuration > 0 && (
                <Text className="stat-sub">最近{formatSleepTime(lastSleepDuration)}</Text>
              )}
            </View>
            <View className="stat-card">
              <Text className="stat-icon">🍚</Text>
              <Text className="stat-value">{summary.foodCount}<Text className="stat-unit">次</Text></Text>
              <Text className="stat-label">辅食</Text>
              {lastFoodName && (
                <Text className="stat-detail">{lastFoodName}</Text>
              )}
            </View>
          </View>
          {(latestHeightWeight || latestTemperature) && (
            <View className="vital-signs">
              {latestHeightWeight && (
                <View className="vital-item">
                  <Text className="vital-icon">📏</Text>
                  <Text className="vital-text">
                    {latestHeightWeight.weight}kg / {latestHeightWeight.height}cm
                  </Text>
                </View>
              )}
              {latestTemperature && (
                <View className="vital-item">
                  <Text className="vital-icon">🌡️</Text>
                  <Text className="vital-text">{latestTemperature.temperature}°C</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* 快速记录 */}
      {currentBaby && (
        <View className="quick-section">
          <Text className="section-title">快速记录</Text>
          <View className="action-grid">
            {quickActions.map((action) => (
              <View
                key={action.type}
                className="action-item"
                onClick={() => navigateToRecord(action.type)}
              >
                <View className={`action-icon ${action.type}`}>
                  <Text>{action.icon}</Text>
                </View>
                <Text className="action-text">{action.label}</Text>
              </View>
            ))}
            <View
              className="action-item"
              onClick={() => setShowMore(true)}
            >
              <View className="action-icon more">
                <Text>···</Text>
              </View>
              <Text className="action-text">更多</Text>
            </View>
          </View>
        </View>
      )}

      {/* 更多记录 - 底部弹窗 */}
      {showMore && (
        <View className="sheet-overlay" onClick={() => setShowMore(false)}>
          <View className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <View className="sheet-handle" />
            <View className="sheet-header">
              <Text className="sheet-title">📝 更多记录</Text>
            </View>
            <View className="sheet-body">
              <View className="sheet-grid">
                {moreActions.map((action) => (
                  <View
                    key={action.type}
                    className="sheet-item"
                    onClick={() => navigateToRecord(action.type)}
                  >
                    <View className="sheet-item-icon">
                      <Text>{action.icon}</Text>
                    </View>
                    <Text className="sheet-item-label">{action.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      <TabBar />
    </View>
  );
}
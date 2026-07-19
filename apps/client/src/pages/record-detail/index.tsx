import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { useRecordStore, DetailRecord } from '../../stores/recordStore';
import { formatDate, formatDurationLong, formatHM } from '../../utils/date';
import { detailTypeTabs, getRecordMainText, getIntervalShortText } from '../../utils/recordDisplay';
import { MOCK_DETAIL } from '../../utils/mock';
import './index.scss';

export default function RecordDetailPage() {
  const router = useRouter();
  const { babyId, type = 'feeding' } = router.params;
  const { detailItems, detailSummary, fetchDetail, deleteRecord } = useRecordStore();
  const [days, setDays] = useState(7);

  const typeInfo = detailTypeTabs.find((t) => t.type === type) || detailTypeTabs[0];

  useEffect(() => {
    if (babyId) {
      fetchDetail(babyId, type, { days });
    }
  }, [babyId, type, days]);

  // 点击一行记录，弹出编辑/删除操作面板
  const handleRowClick = (item: DetailRecord) => {
    Taro.showActionSheet({ itemList: ['编辑', '删除'] }).then((res) => {
      if (res.tapIndex === 0) {
        Taro.navigateTo({ url: `/pages/record/index?type=${type}&babyId=${babyId}&id=${item.id}` });
      } else if (res.tapIndex === 1) {
        handleDelete(item.id);
      }
    });
  };

  const handleDelete = async (recordId: string) => {
    const res = await Taro.showModal({
      title: '删除记录',
      content: '确定要删除这条记录吗？',
    });
    if (!res.confirm) return;
    try {
      await deleteRecord(recordId);
      Taro.showToast({ title: '已删除', icon: 'success' });
      if (babyId) fetchDetail(babyId, type, { days });
    } catch (error) {
      Taro.showToast({ title: '删除失败', icon: 'none' });
    }
  };

  // 无 babyId 时（例如直接预览）展示 mock 数据兜底
  const items = babyId ? detailItems : MOCK_DETAIL[type]?.items || [];
  const summary = babyId ? detailSummary : MOCK_DETAIL[type]?.summary || null;

  const avgIntervalText = summary?.avgIntervalMinutes != null ? getIntervalShortText(summary.avgIntervalMinutes) : '-';

  return (
    <View className="detail-page">
      <View className="detail-header">
        <Text className="detail-header-icon">{typeInfo.icon}</Text>
        <Text className="detail-header-title">{typeInfo.label}明细</Text>
      </View>

      <View className="time-range">
        {[7, 14, 30].map((d) => (
          <View key={d} className={`range-item ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
            <Text>{d}天</Text>
          </View>
        ))}
      </View>

      <View className="summary-bar">
        <View className="summary-bar-item">
          <Text className="summary-bar-value">{summary?.count ?? 0}</Text>
          <Text className="summary-bar-label">总次数</Text>
        </View>
        {type === 'feeding' && (
          <View className="summary-bar-item">
            <Text className="summary-bar-value">{summary?.totalAmount ?? 0}ml</Text>
            <Text className="summary-bar-label">总奶量</Text>
          </View>
        )}
        {type === 'sleep' && (
          <View className="summary-bar-item">
            <Text className="summary-bar-value">{formatDurationLong(summary?.totalDuration ?? 0)}</Text>
            <Text className="summary-bar-label">总时长</Text>
          </View>
        )}
        {type === 'height_weight' && summary?.latestHeight != null && (
          <>
            <View className="summary-bar-item">
              <Text className="summary-bar-value">{summary.latestHeight}cm</Text>
              <Text className="summary-bar-label">最新身高</Text>
            </View>
            <View className="summary-bar-item">
              <Text className="summary-bar-value">{summary.latestWeight ?? '-'}kg</Text>
              <Text className="summary-bar-label">最新体重</Text>
            </View>
          </>
        )}
        {type === 'temperature' && summary?.latestTemperature != null && (
          <View className="summary-bar-item">
            <Text className="summary-bar-value">{summary.latestTemperature}°C</Text>
            <Text className="summary-bar-label">最新体温</Text>
          </View>
        )}
        <View className="summary-bar-item">
          <Text className="summary-bar-value">{avgIntervalText}</Text>
          <Text className="summary-bar-label">平均间隔</Text>
        </View>
      </View>

      {items.length > 0 ? (
        <View className="table-card">
          <View className="table-row table-head">
            <Text className="table-cell cell-time">时间</Text>
            <Text className="table-cell cell-detail">明细</Text>
            <Text className="table-cell cell-interval">间隔</Text>
          </View>
          <ScrollView scrollY className="table-body">
            {items
              .slice()
              .reverse()
              .map((item) => (
                <View key={item.id} className="table-row" onClick={() => handleRowClick(item)}>
                  <View className="table-cell cell-time">
                    <Text className="cell-date">{formatDate(item.startTime).slice(5)}</Text>
                    <Text className="cell-hm">{formatHM(item.startTime)}</Text>
                  </View>
                  <View className="table-cell cell-detail">
                    <Text>{getRecordMainText(type, item)}</Text>
                    {type === 'diaper' && item.diaperImage && (
                      <Image
                        className="cell-thumb"
                        src={item.diaperImage}
                        mode="aspectFill"
                        onClick={(e) => {
                          e.stopPropagation();
                          Taro.previewImage({ current: item.diaperImage, urls: [item.diaperImage] });
                        }}
                      />
                    )}
                  </View>
                  <Text className="table-cell cell-interval">{getIntervalShortText(item.intervalMinutes)}</Text>
                </View>
              ))}
          </ScrollView>
        </View>
      ) : (
        <View className="table-empty">
          <Text>这段时间还没有记录</Text>
        </View>
      )}
    </View>
  );
}

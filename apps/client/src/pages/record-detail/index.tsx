import { View, Text, ScrollView } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { useRecordStore } from '../../stores/recordStore';
import { formatDate, formatDurationLong, formatHM } from '../../utils/date';
import { detailTypeTabs, getRecordMainText, getIntervalShortText } from '../../utils/recordDisplay';
import { MOCK_DETAIL } from '../../utils/mock';
import './index.scss';

export default function RecordDetailPage() {
  const router = useRouter();
  const { babyId, type = 'feeding' } = router.params;
  const { detailItems, detailSummary, fetchDetail } = useRecordStore();
  const [days, setDays] = useState(7);

  const typeInfo = detailTypeTabs.find((t) => t.type === type) || detailTypeTabs[0];

  useEffect(() => {
    if (babyId) {
      fetchDetail(babyId, type, { days });
    }
  }, [babyId, type, days]);

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
                <View key={item.id} className="table-row">
                  <View className="table-cell cell-time">
                    <Text className="cell-date">{formatDate(item.startTime).slice(5)}</Text>
                    <Text className="cell-hm">{formatHM(item.startTime)}</Text>
                  </View>
                  <Text className="table-cell cell-detail">{getRecordMainText(type, item)}</Text>
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

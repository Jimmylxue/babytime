import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useState } from 'react';
import { useRecordStore, DetailRecord } from '../../stores/recordStore';
import { formatDate, formatDurationLong, formatHM } from '../../utils/date';
import { detailTypeTabs, getRecordMainText, getIntervalShortText } from '../../utils/recordDisplay';
import { MOCK_DETAIL } from '../../utils/mock';
import { recordApi } from '../../utils/request';
import './index.scss';

export default function RecordDetailPage() {
  const router = useRouter();
  const { babyId, type = 'feeding', metric } = router.params;
  // 身高/体重独立入口，metric 决定当前展示哪项指标
  const growthMetric = metric === 'weight' ? 'weight' : metric === 'height' ? 'height' : null;
  const { detailItems, detailSummary, detailPagination, detailLoading, fetchDetail, fetchDetailSummary, deleteRecord } = useRecordStore();
  const [days, setDays] = useState(7);

  const typeInfo =
    detailTypeTabs.find(
      (t) => t.type === type && (t.metric ?? null) === growthMetric,
    ) || detailTypeTabs.find((t) => t.type === type) || detailTypeTabs[0];

  const loadFirstPage = (selectedDays = days) => {
    if (babyId) {
      fetchDetail(babyId, type, { days: selectedDays, page: 1, pageSize: 20, metric: growthMetric || undefined });
      fetchDetailSummary(babyId, type, { days: selectedDays, metric: growthMetric || undefined });
    }
  };

  // 从编辑页返回时重新加载，确保明细立即反映最新内容。
  useDidShow(() => {
    loadFirstPage();
  });

  const handleDaysChange = (selectedDays: number) => {
    setDays(selectedDays);
    loadFirstPage(selectedDays);
  };

  const loadMore = () => {
    if (!babyId || detailLoading || !detailPagination || detailPagination.page >= detailPagination.totalPages) return;
    fetchDetail(babyId, type, { days, page: detailPagination.page + 1, pageSize: detailPagination.pageSize, metric: growthMetric || undefined });
  };

  // 点击一行记录，弹出编辑/再来一条/删除操作面板
  const handleRowClick = (item: DetailRecord) => {
    // 睡眠时间段、身高体重、疫苗不适合一键重复
    const repeatable = ['feeding', 'diaper', 'food', 'water', 'temperature', 'medicine'].includes(type);
    const itemList = repeatable ? ['编辑', '再来一条', '删除'] : ['编辑', '删除'];
    Taro.showActionSheet({ itemList }).then((res) => {
      if (!repeatable) {
        if (res.tapIndex === 0) {
          openEdit(item);
        } else if (res.tapIndex === 1) {
          handleDelete(item.id);
        }
        return;
      }
      if (res.tapIndex === 0) {
        openEdit(item);
      } else if (res.tapIndex === 1) {
        handleRepeat(item);
      } else if (res.tapIndex === 2) {
        handleDelete(item.id);
      }
    });
  };

  const openEdit = (item: DetailRecord) => {
    const metricParam = growthMetric ? `&metric=${growthMetric}` : '';
    Taro.navigateTo({ url: `/pages/record/index?type=${type}&babyId=${babyId}&id=${item.id}${metricParam}` });
  };

  // 「再来一条」：以这条记录为模板新建，时间取现在
  const handleRepeat = async (item: DetailRecord) => {
    if (!babyId) return;
    try {
      const data: any = {
        babyId,
        type,
        startTime: new Date().toISOString(),
      };
      if (type === 'feeding') {
        if (item.feedingMethod) data.feedingMethod = item.feedingMethod;
        if (item.amount != null) data.amount = item.amount;
        if (item.breastAmount != null) data.breastAmount = item.breastAmount;
        if (item.formulaAmount != null) data.formulaAmount = item.formulaAmount;
        if (item.duration != null) data.duration = item.duration;
      } else if (type === 'diaper') {
        data.diaperStatus = item.diaperStatus || 'wet';
      } else if (type === 'food') {
        data.foodName = item.foodName;
      } else if (type === 'water') {
        if (item.amount != null) data.amount = item.amount;
      } else if (type === 'temperature') {
        if (item.temperature != null) data.temperature = item.temperature;
      } else if (type === 'medicine') {
        data.medicineName = item.medicineName;
        data.medicineDose = item.medicineDose;
      }
      await recordApi.create(data);
      Taro.showToast({ title: '已按该记录新增一条', icon: 'success' });
      loadFirstPage();
    } catch (error) {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
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
      loadFirstPage();
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
          <View key={d} className={`range-item ${days === d ? 'active' : ''}`} onClick={() => handleDaysChange(d)}>
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
        {type === 'height_weight' &&
          growthMetric !== 'weight' &&
          summary?.latestHeight != null && (
            <View className="summary-bar-item">
              <Text className="summary-bar-value">{summary.latestHeight}cm</Text>
              <Text className="summary-bar-label">最新身高</Text>
            </View>
          )}
        {type === 'height_weight' &&
          growthMetric !== 'height' &&
          summary?.latestWeight != null && (
            <View className="summary-bar-item">
              <Text className="summary-bar-value">{summary.latestWeight}kg</Text>
              <Text className="summary-bar-label">最新体重</Text>
            </View>
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
          <ScrollView scrollY className="table-body" lowerThreshold={80} onScrollToLower={loadMore}>
            {items.map((item) => (
                <View key={item.id} className="table-row" onClick={() => handleRowClick(item)}>
                  <View className="table-cell cell-time">
                    <Text className="cell-date">{formatDate(item.startTime).slice(5)}</Text>
                    <Text className="cell-hm">{formatHM(item.startTime)}</Text>
                  </View>
                  <View className="table-cell cell-detail">
                    <View className="cell-detail-content">
                      <Text>{getRecordMainText(type, item, growthMetric)}</Text>
                      {type === 'diaper' && item.diaperAnalysis?.summary && (
                        <Text className={`cell-analysis ${item.diaperAnalysis.riskLevel || 'unknown'}`}>
                          {item.diaperAnalysis.summary}
                        </Text>
                      )}
                      {item.note && <Text className="cell-note">备注：{item.note}</Text>}
                    </View>
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
            {babyId && detailPagination && detailPagination.page < detailPagination.totalPages && (
              <View className="table-load-more"><Text>{detailLoading ? '加载中...' : '上拉加载更多'}</Text></View>
            )}
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

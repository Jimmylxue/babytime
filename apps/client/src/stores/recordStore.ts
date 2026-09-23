import { create } from 'zustand';
import { recordApi } from '../utils/request';

export interface Record {
  id: string;
  babyId: string;
  type: string;
  startTime: string;
  endTime?: string;
  feedingMethod?: string;
  amount?: number;
  breastAmount?: number;
  formulaAmount?: number;
  duration?: number;
  diaperStatus?: string;
  diaperImage?: string;
  diaperAnalysis?: {
    riskLevel?: 'normal' | 'observe' | 'medical_attention' | 'urgent' | 'unknown';
    summary?: string;
    disclaimer?: string;
  };
  foodName?: string;
  temperature?: number;
  height?: number;
  weight?: number;
  medicineName?: string;
  medicineDose?: string;
  vaccineName?: string;
  vaccineHospital?: string;
  vaccineCode?: string;
  vaccineDose?: number;
  vaccineScheduleItemId?: string;
  vaccineScheduleVersion?: string;
  isCustomVaccine?: boolean;
  outdoorLocation?: string;
  note?: string;
  createdAt: string;
}

export interface TodaySummary {
  feedingCount: number;
  totalMilk: number;
  diaperCount: number;
  sleepTotal: number;
  sleepCount: number;
  foodCount: number;
  waterTotal: number;
  bathCount: number;
  outdoorCount: number;
  lastFeedingAt?: string | null;
  lastSleepAt?: string | null;
  lastSleepEndAt?: string | null;
}

export interface DailyStat {
  date: string;
  feedingCount: number;
  totalMilk: number;
  diaperCount: number;
  sleepTotal: number;
  sleepCount: number;
  foodCount: number;
  waterTotal: number;
}

export interface HeightWeightTrendPoint {
  date: string;
  height: number | null;
  weight: number | null;
}

export interface TemperatureTrendPoint {
  date: string;
  temperature: number;
}

// 明细记录：在 Record 基础上附带与上一条同类型记录的间隔分钟数
export interface DetailRecord extends Record {
  intervalMinutes: number | null;
}

export interface DetailSummary {
  count: number;
  totalAmount?: number;
  totalDuration?: number;
  avgIntervalMinutes: number | null;
  latestHeight?: number | null;
  latestWeight?: number | null;
  latestTemperature?: number | null;
}

export interface DetailPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface RecordState {
  records: Record[];
  summary: TodaySummary | null;
  dailyStats: DailyStat[];
  heightWeightTrend: HeightWeightTrendPoint[];
  temperatureTrend: TemperatureTrendPoint[];
  latestHeightWeight: { height: number; weight: number; date: string } | null;
  latestTemperature: { temperature: number; date: string } | null;
  detailItems: DetailRecord[];
  detailSummary: DetailSummary | null;
  detailPagination: DetailPagination | null;
  detailLoading: boolean;
  loading: boolean;
  fetchRecords: (babyId: string, date?: string) => Promise<void>;
  fetchSummary: (babyId: string) => Promise<void>;
  fetchStats: (babyId: string, days?: number) => Promise<void>;
  // fetchDetail / fetchDetailSummary 除了写 store，还把本次取到的值 return 出来：
  // 统计页要同时取「当日」和「前一日」两份汇总，只读 store 那个单值槽位就只能串行取。
  fetchDetail: (babyId: string, type: string, params: { date?: string; days?: number; page?: number; pageSize?: number; metric?: 'height' | 'weight' }) => Promise<DetailRecord[]>;
  fetchDetailSummary: (babyId: string, type: string, params: { date?: string; days?: number; metric?: 'height' | 'weight' }) => Promise<DetailSummary | null>;
  addRecord: (data: any) => Promise<void>;
  updateRecord: (id: string, data: any) => Promise<void>;
  // babyId 由调用方给：明细页删记录时 store 的 records 里没有那条，反查不到就没法刷新
  deleteRecord: (id: string, babyId?: string) => Promise<void>;
}

export const useRecordStore = create<RecordState>((set, get) => ({
  records: [],
  summary: null,
  dailyStats: [],
  heightWeightTrend: [],
  temperatureTrend: [],
  latestHeightWeight: null,
  latestTemperature: null,
  detailItems: [],
  detailSummary: null,
  detailPagination: null,
  detailLoading: false,
  loading: false,

  fetchRecords: async (babyId: string, date?: string) => {
    set({ loading: true });
    try {
      const res = await recordApi.getByBaby(babyId, date);
      set({ records: res.data || [], loading: false });
    } catch (error) {
      set({ loading: false });
    }
  },

  fetchSummary: async (babyId: string) => {
    try {
      const res = await recordApi.getSummary(babyId);
      // latestHeightWeight / latestTemperature 原本只有 /record/stats 返回，
      // 现在 summary 也带（同一个接口的同一份算法），首页就不用再打那个重接口
      set({
        records: res.data?.records || [],
        summary: res.data?.summary || null,
        latestHeightWeight: res.data?.latestHeightWeight || null,
        latestTemperature: res.data?.latestTemperature || null,
      });
    } catch (error) {
      console.error('获取统计失败', error);
    }
  },

  fetchStats: async (babyId: string, days?: number) => {
    try {
      const res = await recordApi.getStats(babyId, days);
      set({
        dailyStats: res.data?.dailyStats || [],
        heightWeightTrend: res.data?.heightWeightTrend || [],
        temperatureTrend: res.data?.temperatureTrend || [],
        latestHeightWeight: res.data?.latestHeightWeight || null,
        latestTemperature: res.data?.latestTemperature || null,
      });
    } catch (error) {
      console.error('获取统计数据失败', error);
    }
  },

  fetchDetail: async (babyId: string, type: string, params: { date?: string; days?: number; page?: number; pageSize?: number; metric?: 'height' | 'weight' }) => {
    const page = params.page || 1;
    set({ detailLoading: true });
    try {
      const res = await recordApi.getDetail(babyId, type, params);
      const items = (res.data?.items || []) as DetailRecord[];
      set({
        detailItems: page > 1 ? [...get().detailItems, ...items] : items,
        detailPagination: res.data ? {
          page: res.data.page,
          pageSize: res.data.pageSize,
          total: res.data.total,
          totalPages: res.data.totalPages,
        } : null,
        detailLoading: false,
      });
      return items;
    } catch (error) {
      set({ detailLoading: false });
      console.error('获取明细数据失败', error);
      return [];
    }
  },

  fetchDetailSummary: async (babyId: string, type: string, params: { date?: string; days?: number; metric?: 'height' | 'weight' }) => {
    try {
      const res = await recordApi.getDetailSummary(babyId, type, params);
      const summary = (res.data || null) as DetailSummary | null;
      set({ detailSummary: summary });
      return summary;
    } catch (error) {
      console.error('获取明细汇总失败', error);
      return null;
    }
  },

  // 写完记录后的两个刷新请求互不依赖，并行取；串行等于给「记一条」多加一个往返
  addRecord: async (data: any) => {
    await recordApi.create(data);
    const { fetchSummary, fetchStats } = get();
    await Promise.all([fetchSummary(data.babyId), fetchStats(data.babyId)]);
  },

  updateRecord: async (id: string, data: any) => {
    const res = await recordApi.update(id, data);
    const { fetchSummary, fetchStats } = get();
    const babyId = res.data?.babyId;
    if (babyId) {
      await Promise.all([fetchSummary(babyId), fetchStats(babyId)]);
    }
  },

  deleteRecord: async (id: string, babyId?: string) => {
    await recordApi.delete(id);
    if (!babyId) return;
    const { fetchSummary, fetchStats } = get();
    await Promise.all([fetchSummary(babyId), fetchStats(babyId)]);
  },
}));

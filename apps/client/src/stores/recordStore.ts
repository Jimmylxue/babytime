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
  duration?: number;
  diaperStatus?: string;
  foodName?: string;
  temperature?: number;
  height?: number;
  weight?: number;
  medicineName?: string;
  medicineDose?: string;
  vaccineName?: string;
  vaccineHospital?: string;
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

interface RecordState {
  records: Record[];
  summary: TodaySummary | null;
  dailyStats: DailyStat[];
  latestHeightWeight: { height: number; weight: number; date: string } | null;
  latestTemperature: { temperature: number; date: string } | null;
  loading: boolean;
  fetchRecords: (babyId: string, date?: string) => Promise<void>;
  fetchSummary: (babyId: string) => Promise<void>;
  fetchStats: (babyId: string, days?: number) => Promise<void>;
  addRecord: (data: any) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}

export const useRecordStore = create<RecordState>((set, get) => ({
  records: [],
  summary: null,
  dailyStats: [],
  latestHeightWeight: null,
  latestTemperature: null,
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
      set({
        records: res.data?.records || [],
        summary: res.data?.summary || null,
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
        latestHeightWeight: res.data?.latestHeightWeight || null,
        latestTemperature: res.data?.latestTemperature || null,
      });
    } catch (error) {
      console.error('获取统计数据失败', error);
    }
  },

  addRecord: async (data: any) => {
    await recordApi.create(data);
    const { fetchSummary, fetchStats } = get();
    await fetchSummary(data.babyId);
    await fetchStats(data.babyId);
  },

  deleteRecord: async (id: string) => {
    const record = get().records.find((r) => r.id === id);
    await recordApi.delete(id);
    if (record) {
      const { fetchSummary, fetchStats } = get();
      await fetchSummary(record.babyId);
      await fetchStats(record.babyId);
    }
  },
}));
